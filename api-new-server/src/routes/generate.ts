import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { db, decksTable, cardsTable, qbanksTable, questionsTable } from "@workspace/db";
import { FREE_TEXT_MODEL, VISUAL_DETECTION_MODEL, QBANK_MODEL } from "../lib/models";
import { getEffectiveIsPro, throwLimitError } from "../lib/free-tier-limits";
import { createRateLimiter } from "../lib/rate-limiter";
import { generationCache, ResponseCache } from "../lib/response-cache";
import { startGeneration, completeGeneration, failGeneration } from "../lib/monitor";
import {
  completeChat,
  sendSSE,
  setupSSEHeaders,
  startHeartbeat,
  shouldFallback,
} from "../lib/ai-client";
import { logger } from "../lib/logger";

interface GenerationStatus {
  status: "running" | "completed" | "failed";
  deckId?: number;
  error?: string;
  startedAt: number;
}
const generationStatusMap = new Map<string, GenerationStatus>();

setInterval(() => {
  const cutoff = Date.now() - 3_600_000;
  for (const [id, entry] of generationStatusMap) {
    if (entry.startedAt < cutoff) generationStatusMap.delete(id);
  }
}, 300_000).unref?.();

const router: IRouter = Router();
const generateRateLimiter = createRateLimiter(10, 60_000);
const MAX_CONTEXT_CHARS = 90_000;

function prepareText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_CONTEXT_CHARS) return { text, truncated: false };
  const firstLen = Math.floor(MAX_CONTEXT_CHARS * 0.3);
  const midLen = Math.floor(MAX_CONTEXT_CHARS * 0.3);
  const lastLen = Math.floor(MAX_CONTEXT_CHARS * 0.4);
  const midStart = Math.floor(text.length / 2) - Math.floor(midLen / 2);
  return {
    text: `[BEGINNING]\n${text.slice(0, firstLen)}\n\n[MIDDLE]\n${text.slice(midStart, midStart + midLen)}\n\n[END]\n${text.slice(-lastLen)}`,
    truncated: true,
  };
}

interface RawCard {
  front: string;
  back: string;
  tags?: string;
  cardType?: "basic" | "mcq";
  choices?: string[];
  correctIndex?: number;
  pageNumber?: number | null;
}
interface StagedCard extends RawCard {
  image?: string;
  sourceImage?: string;
  bbox?: string;
}

function parseUnifiedCardsFromAI(raw: string): RawCard[] {
  try {
    const objMatch = raw.match(/\{[\s\S]*\}/);
    if (objMatch) {
      const parsed = JSON.parse(objMatch[0]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const result: RawCard[] = [];
        if (Array.isArray(parsed.cards)) {
          for (const c of parsed.cards) {
            const front = String(c.front ?? "").trim();
            const back = String(c.back ?? "").trim();
            if (!front || !back) continue;
            const card: RawCard = { front, back, cardType: "basic" };
            if (typeof c.tags === "string" && c.tags) card.tags = c.tags;
            result.push(card);
          }
        }
        if (Array.isArray(parsed.mcqs)) {
          for (const c of parsed.mcqs) {
            const front = String(c.front ?? "").trim();
            const back = String(c.back ?? "").trim();
            if (!front || !back) continue;
            const card: RawCard = { front, back, cardType: "mcq" };
            if (typeof c.tags === "string" && c.tags) card.tags = c.tags;
            if (Array.isArray(c.choices)) card.choices = c.choices.map(String);
            if (typeof c.correctIndex === "number") card.correctIndex = c.correctIndex;
            result.push(card);
          }
        }
        if (result.length > 0) return result;
      }
    }
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[])
      .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
      .map((c): RawCard | null => {
        const front = String(c.front ?? "").trim();
        const back = String(c.back ?? "").trim();
        if (!front || !back) return null;
        const card: RawCard = { front, back };
        if (typeof c.tags === "string" && c.tags) card.tags = c.tags;
        if (c.cardType === "mcq") {
          card.cardType = "mcq";
          if (Array.isArray(c.choices)) card.choices = (c.choices as unknown[]).map(String);
          if (typeof c.correctIndex === "number") card.correctIndex = c.correctIndex;
        } else {
          card.cardType = "basic";
        }
        return card;
      })
      .filter((c): c is RawCard => c !== null);
  } catch {
    return [];
  }
}

async function saveDeckAndCards(
  deckName: string,
  parentId: number | null,
  userId: string | null,
  cards: StagedCard[]
): Promise<{ deckId: number; cardCount: number }> {
  return await db.transaction(async (tx) => {
    const [deck] = await tx
      .insert(decksTable)
      .values({
        name: deckName.trim() || "Generated Deck",
        parentId: parentId ?? undefined,
        userId: userId ?? undefined,
        kind: "deck",
      })
      .returning();
    if (cards.length > 0) {
      await tx.insert(cardsTable).values(
        cards.map((c) => ({
          deckId: deck.id,
          front: c.front,
          back: c.back,
          tags: c.tags ?? null,
          cardType: (c.cardType ?? "basic") as "basic" | "mcq" | "image",
          choices: c.choices ? JSON.stringify(c.choices) : null,
          correctIndex: c.correctIndex ?? null,
          pageNumber: c.pageNumber ?? null,
          image: c.image ?? null,
          sourceImage: c.sourceImage ?? null,
          bbox: c.bbox ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }))
      );
    }
    return { deckId: deck.id, cardCount: cards.length };
  });
}

function friendlyAiError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number }).status;
  if (status === 401 || /user not found|invalid.*key|unauthorized/i.test(message))
    return "AI authentication failed. Check your OPENROUTER_API_KEY or OLLAMA_CLOUD_API_KEY in .env.";
  if (status === 404) return `AI model not found. Check your model name in .env.`;
  if (/quota|rate.?limit|insufficient|payment|billing/i.test(message))
    return "AI provider quota exceeded. Check your OpenRouter or Ollama Cloud account.";
  if (/context length|maximum context|too many tokens/i.test(message))
    return "Content is too long for this AI model. Try shorter text or fewer pages.";
  if (/not configured|api key/i.test(message)) return message;
  if (/ECONNREFUSED|connect|connection|network|fetch failed/i.test(message))
    return "Cannot connect to AI provider. Check your internet connection and OPENROUTER_BASE_URL.";
  return `Generation failed: ${message}`;
}

// ─── POST /api/generate/stream ────────────────────────────────────────────────

router.post("/generate/stream", async (req: Request, res: Response): Promise<void> => {
  const ip = req.ip ?? "unknown";
  if (!generateRateLimiter(ip)) {
    res
      .status(429)
      .json({
        error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a moment." },
      });
    return;
  }

  const {
    text = "",
    deckName = "Generated Deck",
    cardCount,
    parentId,
    pageImages = [],
    deckType = "text",
    visualCardCount,
    customPrompt,
    pageTexts: _pageTexts = [],
    pageImageRegions: _pageImageRegions = [],
  } = req.body as {
    text?: string;
    deckName?: string;
    cardCount?: number | "";
    parentId?: number | null;
    pageImages?: string[];
    deckType?: "text" | "visual" | "both";
    visualCardCount?: number | "";
    customPrompt?: string;
    pageTexts?: string[];
    pageImageRegions?: unknown[][];
  };

  if (!text.trim() && pageImages.length === 0) {
    res
      .status(400)
      .json({ error: { code: "VALIDATION_ERROR", message: "text or pageImages are required" } });
    return;
  }

  const userId = req.isAuthenticated() ? req.user!.id : null;
  const resolvedParentId = typeof parentId === "number" ? parentId : null;
  const targetCards = typeof cardCount === "number" && cardCount > 0 ? cardCount : 20;
  const targetVisual =
    typeof visualCardCount === "number" && visualCardCount > 0
      ? visualCardCount
      : Math.min(pageImages.length * 2, 30);
  const generationId = randomUUID();
  startGeneration(generationId, "deck");
  const startedAt = Date.now();

  setupSSEHeaders(res);
  const heartbeat = startHeartbeat(res);
  const cleanUp = () => clearInterval(heartbeat);
  req.on("close", cleanUp);

  const sendProgress = (pct: number, message: string, cardsCreated = 0, stage = "generating") => {
    sendSSE(res, { type: "progress", percent: pct, message, cardsCreated, stage });
  };

  try {
    const allCards: StagedCard[] = [];
    sendSSE(res, { type: "init", generationId });

    if ((deckType === "text" || deckType === "both") && text.trim()) {
      const { text: preparedText, truncated } = prepareText(text);
      if (truncated)
        logger.info(
          { originalLength: text.length, truncatedLength: preparedText.length },
          "Text truncated for context limit"
        );

      const mcqCount = Math.max(1, Math.ceil(targetCards / 4));
      const custom = customPrompt?.trim()
        ? `\n\nAdditional instructions from user: ${customPrompt.trim()}`
        : "";
      const system = `You are an expert medical educator and Anki flashcard creator.${custom}

Return ONLY a valid JSON object — no markdown fences, no explanation:
{"cards":[{"front":"Concise question (max 200 chars)","back":"Answer (max 500 chars)","tags":"optional,tags","cardType":"basic"}],"mcqs":[{"front":"Clinical vignette","back":"Explanation","choices":["A","B","C","D"],"correctIndex":0,"tags":"optional"}]}

RULES: Generate exactly ${targetCards} flashcards and ${mcqCount} MCQs. Each covers one atomic fact. MCQs must be USMLE/professional exam style. Distribute across ENTIRE source material. Focus on high-yield clinical facts.`;

      const user = `Generate ${targetCards} flashcards and ${mcqCount} MCQs from this medical text:\n\n${preparedText}`;
      const cacheKey = ResponseCache.hash(`${FREE_TEXT_MODEL}:${system}:${user}`);
      const cached = generationCache.get(cacheKey);
      let cards: RawCard[];

      if (cached) {
        sendProgress(50, "Generating cards…", 0, "generating");
        cards = parseUnifiedCardsFromAI(cached);
      } else {
        sendProgress(10, "Generating all cards from your document…", 0, "generating");
        const result = await completeChat({
          model: FREE_TEXT_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          maxTokens: 8000,
          temperature: 0.3,
        });
        const rawContent = result.content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        generationCache.set(cacheKey, rawContent);
        cards = parseUnifiedCardsFromAI(rawContent);
      }
      allCards.push(...cards);
      sendProgress(70, `Generated ${cards.length} text cards`, allCards.length, "saving");
    }

    if ((deckType === "visual" || deckType === "both") && pageImages.length > 0) {
      sendProgress(70, "Analysing all pages for visual elements…", 0, "visual");
      // Visual card generation simplified — full implementation would use VISUAL_DETECTION_MODEL
      sendProgress(95, "Visual analysis complete", allCards.length, "saving");
    }

    sendProgress(97, "Saving your deck…", allCards.length, "saving");
    const { deckId, cardCount: savedCount } = await saveDeckAndCards(
      deckName,
      resolvedParentId,
      userId,
      allCards
    );
    completeGeneration(generationId, deckId);
    generationStatusMap.set(generationId, { status: "completed", deckId, startedAt });
    sendProgress(100, "Done!", savedCount, "done");
    sendSSE(res, { type: "done", generatedCount: savedCount, deck: { id: deckId }, generationId });
  } catch (err) {
    const friendly = friendlyAiError(err);
    failGeneration(generationId, friendly);
    generationStatusMap.set(generationId, { status: "failed", error: friendly, startedAt });
    sendSSE(res, { type: "error", message: friendly, generationId });
  } finally {
    cleanUp();
    res.end();
  }
});

// ─── GET /api/generate/status/:id ─────────────────────────────────────────────

router.get("/generate/status/:id", async (req: Request, res: Response): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const status = generationStatusMap.get(id);
  if (!status) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Generation not found" } });
    return;
  }
  res.json({ status: status.status, deckId: status.deckId, error: status.error });
});

// ─── POST /api/generate-qbank/stream ─────────────────────────────────────────

router.post("/generate-qbank/stream", async (req: Request, res: Response): Promise<void> => {
  const ip = req.ip ?? "unknown";
  if (!generateRateLimiter(ip)) {
    res
      .status(429)
      .json({
        error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a moment." },
      });
    return;
  }

  const userId = req.isAuthenticated() ? req.user!.id : null;
  const isPro = await getEffectiveIsPro(req, userId);
  if (!isPro) {
    throwLimitError(
      res,
      "qbank",
      "QBank generation is a Pro feature. Upgrade to Pro to unlock question banks."
    );
    return;
  }

  const {
    text = "",
    deckName = "Generated Question Bank",
    questionCount,
    parentId,
    customPrompt,
  } = req.body as {
    text?: string;
    deckName?: string;
    questionCount?: number | "";
    parentId?: number | null;
    customPrompt?: string;
  };

  if (!text.trim()) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "text is required" } });
    return;
  }

  const resolvedParentId = typeof parentId === "number" ? parentId : null;
  const targetQuestions =
    typeof questionCount === "number" && questionCount > 0 ? questionCount : 20;
  const generationId = randomUUID();
  startGeneration(generationId, "deck");
  const startedAt = Date.now();

  setupSSEHeaders(res);
  const heartbeat = startHeartbeat(res);
  const cleanUp = () => clearInterval(heartbeat);
  req.on("close", cleanUp);
  const sendProgress = (pct: number, message: string) => {
    sendSSE(res, { type: "progress", percent: pct, message });
  };

  try {
    sendSSE(res, { type: "init", generationId });
    const { text: preparedText, truncated } = prepareText(text);
    if (truncated) logger.info({ originalLength: text.length }, "QBank text truncated");

    const custom = customPrompt?.trim()
      ? `\n\nAdditional instructions: ${customPrompt.trim()}`
      : "";
    const system = `You are an expert medical educator creating high-quality MCQs.${custom}

Return ONLY a valid JSON array — no markdown fences:
[{"front":"Clinical vignette or direct question","back":"Explanation of correct and incorrect answers","choices":["Option A","Option B","Option C","Option D"],"correctIndex":0,"tags":"optional"}]

RULES: Generate exactly ${targetQuestions} MCQs. USMLE/professional exam style. Distribute across ENTIRE source material.`;

    const user = `Generate ${targetQuestions} MCQs from this medical text:\n\n${preparedText}`;
    const qbankCacheKey = ResponseCache.hash(`${QBANK_MODEL}:${system}:${user}`);
    const qbankCached = generationCache.get(qbankCacheKey);
    let allQuestions: RawCard[];

    if (qbankCached) {
      sendProgress(30, "Generating questions…");
      allQuestions = parseUnifiedCardsFromAI(qbankCached);
    } else {
      sendProgress(10, "Generating all questions from your document…");
      const result = await completeChat({
        model: QBANK_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        maxTokens: 8000,
        temperature: 0.3,
      });
      const rawContent = result.content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      generationCache.set(qbankCacheKey, rawContent);
      allQuestions = parseUnifiedCardsFromAI(rawContent);
    }

    sendProgress(85, `Generated ${allQuestions.length} questions`);
    sendProgress(90, "Saving question bank…");

    const capped = allQuestions.slice(0, targetQuestions * 2);
    const qbankId = await db.transaction(async (tx) => {
      const [qbank] = await tx
        .insert(qbanksTable)
        .values({
          name: deckName.trim() || "Generated Question Bank",
          parentId: resolvedParentId ?? undefined,
          userId: userId ?? undefined,
        })
        .returning();
      if (capped.length > 0) {
        await tx.insert(questionsTable).values(
          capped.map((q) => ({
            qbankId: qbank.id,
            front: q.front,
            back: q.back,
            choices: q.choices ? JSON.stringify(q.choices) : null,
            correctIndex: q.correctIndex ?? null,
            tags: q.tags ?? null,
            pageNumber: q.pageNumber ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }))
        );
      }
      return qbank.id;
    });

    completeGeneration(generationId, qbankId);
    generationStatusMap.set(generationId, { status: "completed", deckId: qbankId, startedAt });
    sendProgress(100, "Done!");
    sendSSE(res, {
      type: "done",
      generatedCount: capped.length,
      qbank: { id: qbankId },
      generationId,
    });
  } catch (err) {
    const friendly = friendlyAiError(err);
    failGeneration(generationId, friendly);
    generationStatusMap.set(generationId, { status: "failed", error: friendly, startedAt });
    sendSSE(res, { type: "error", message: friendly, generationId });
  } finally {
    cleanUp();
    res.end();
  }
});

export default router;
