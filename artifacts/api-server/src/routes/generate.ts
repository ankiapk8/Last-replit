import { Router, type IRouter, type Request, type Response } from "express";
import { db, decksTable, cardsTable, qbanksTable, questionsTable } from "@workspace/db";
import { FREE_TEXT_MODEL, VISUAL_DETECTION_MODEL } from "../lib/models";
import { getEffectiveIsPro, sendLimitError } from "../lib/free-tier-limits";
import { createRateLimiter } from "../lib/rate-limiter";

const router: IRouter = Router();

const generateRateLimiter = createRateLimiter(10, 60_000);

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function setupSSEHeaders(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof (res as unknown as { flushHeaders?: () => void }).flushHeaders === "function") {
    (res as unknown as { flushHeaders: () => void }).flushHeaders();
  }
}

function sendSSE(res: Response, event: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
  if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
    (res as unknown as { flush: () => void }).flush();
  }
}

function startHeartbeat(res: Response, intervalMs = 15000): ReturnType<typeof setInterval> {
  return setInterval(() => {
    res.write(": heartbeat\n\n");
    if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
      (res as unknown as { flush: () => void }).flush();
    }
  }, intervalMs);
}

function isDailyLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("free-models-per-day");
}

// ─── Text chunking ────────────────────────────────────────────────────────────

const CHUNK_SIZE = 6000;
const CHUNK_OVERLAP = 300;

function splitIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text.trim()].filter(Boolean);
  const chunks: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(pos + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const ws = text.lastIndexOf(" ", end);
      if (ws > pos + CHUNK_SIZE / 2) end = ws;
    }
    const chunk = text.slice(pos, end).trim();
    if (chunk.length > 50) chunks.push(chunk);
    pos = end - CHUNK_OVERLAP;
    if (pos >= text.length) break;
  }
  return chunks;
}

// ─── AI client ────────────────────────────────────────────────────────────────

async function getAIClient() {
  if (
    !process.env.OLLAMA_BASE_URL &&
    !process.env.OPENROUTER_API_KEY &&
    !process.env.OPENAI_API_KEY1 &&
    !process.env.OPENAI_API_KEY &&
    !process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  ) {
    throw new Error(
      "AI is not configured. Set OLLAMA_BASE_URL=http://localhost:11434/v1 in your .env file for local Ollama, or set OPENROUTER_API_KEY.",
    );
  }
  const { openai, getFallbackOpenAI, FALLBACK_MODEL } = await import(
    "@workspace/integrations-openai-ai-server"
  );
  return { openai, getFallbackOpenAI, FALLBACK_MODEL };
}

// ─── Card types ───────────────────────────────────────────────────────────────

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

interface ImageRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildTextCardPrompt(
  chunk: string,
  targetCount: number,
  customPrompt?: string,
): { system: string; user: string } {
  const custom = customPrompt?.trim()
    ? `\n\nAdditional instructions from user: ${customPrompt.trim()}`
    : "";
  return {
    system: `You are an expert medical educator and Anki flashcard creator.${custom}

Return ONLY a valid JSON array — no markdown fences, no explanation:
[
  {
    "front": "Concise question or term (max 200 chars)",
    "back": "Answer with key details (max 500 chars)",
    "tags": "optional,comma,tags",
    "cardType": "basic",
    "pageNumber": null
  }
]

RULES:
- Generate exactly ${targetCount} cards (or fewer if content is insufficient)
- Each card must cover one atomic fact, mechanism, or concept
- cardType: "basic" for most; "mcq" for multiple-choice
- For MCQ add: "choices": ["A","B","C","D"], "correctIndex": 0 (0-based)
- Focus on high-yield clinical facts, mechanisms, definitions, and exam pearls
- Do not repeat the same concept in multiple cards`,
    user: `Generate ${targetCount} high-yield flashcards from this text:\n\n${chunk}`,
  };
}

function buildQBankPrompt(
  chunk: string,
  targetCount: number,
  customPrompt?: string,
): { system: string; user: string } {
  const custom = customPrompt?.trim()
    ? `\n\nAdditional instructions: ${customPrompt.trim()}`
    : "";
  return {
    system: `You are an expert medical educator creating high-quality MCQs.${custom}

Return ONLY a valid JSON array — no markdown fences, no explanation:
[
  {
    "front": "Clinical vignette or direct question",
    "back": "Explanation of correct answer and why distractors are wrong",
    "choices": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "tags": "optional,tags",
    "pageNumber": null
  }
]

RULES:
- Generate exactly ${targetCount} MCQs (or fewer if insufficient content)
- front: realistic clinical vignette or direct exam question
- back: thorough explanation of the correct AND incorrect answers
- choices: exactly 4 options with plausible distractors
- correctIndex: 0-based index of the correct answer
- USMLE/professional exam style`,
    user: `Generate ${targetCount} MCQs from this text:\n\n${chunk}`,
  };
}

// ─── Parse AI JSON response ───────────────────────────────────────────────────

function parseCardsFromAI(raw: string, pageNumber?: number | null): RawCard[] {
  try {
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
        card.pageNumber =
          typeof c.pageNumber === "number" ? c.pageNumber : (pageNumber ?? null);
        return card;
      })
      .filter((c): c is RawCard => c !== null);
  } catch {
    return [];
  }
}

// ─── Text card generation ─────────────────────────────────────────────────────

async function generateTextCards(
  text: string,
  totalTarget: number,
  pageTexts: string[],
  customPrompt: string | undefined,
  onProgress: (pct: number, msg: string, count: number) => void,
): Promise<RawCard[]> {
  const { openai, getFallbackOpenAI, FALLBACK_MODEL } = await getAIClient();

  const sourceChunks: { text: string; pageNumber: number | null }[] = [];

  if (pageTexts.length > 0) {
    pageTexts.forEach((pt, i) => {
      if (pt.trim().length > 50) {
        sourceChunks.push({ text: pt, pageNumber: i + 1 });
      }
    });
  }
  if (sourceChunks.length === 0) {
    splitIntoChunks(text).forEach(c => sourceChunks.push({ text: c, pageNumber: null }));
  }

  const cardsPerChunk = Math.max(1, Math.ceil(totalTarget / sourceChunks.length));
  const allCards: RawCard[] = [];

  for (let i = 0; i < sourceChunks.length; i++) {
    const chunk = sourceChunks[i];
    const pct = Math.round((i / sourceChunks.length) * 85);
    const label = chunk.pageNumber != null ? `page ${chunk.pageNumber}` : `section ${i + 1}`;
    onProgress(pct, `Generating cards from ${label} of ${sourceChunks.length}…`, allCards.length);

    const { system, user } = buildTextCardPrompt(chunk.text, cardsPerChunk, customPrompt);
    try {
      let completion;
      try {
        completion = await openai.chat.completions.create({
          model: FREE_TEXT_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_tokens: 4000,
          temperature: 0.3,
        });
      } catch (err) {
        const fb = isDailyLimitError(err) ? getFallbackOpenAI() : null;
        if (fb) {
          completion = await fb.chat.completions.create({
            model: FALLBACK_MODEL,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            max_tokens: 4000,
            temperature: 0.3,
          });
        } else {
          throw err;
        }
      }
      const raw = completion.choices[0]?.message?.content ?? "";
      // Strip reasoning block (e.g. <think>...</think>) from reasoning models
      const stripped = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      const cards = parseCardsFromAI(stripped, chunk.pageNumber);
      allCards.push(...cards);
    } catch (err) {
      // Propagate auth/credential errors immediately — don't silently skip
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (/user not found|invalid.*key|unauthorized/i.test(msg)) throw err;
      console.error(
        `[generate] Chunk ${i + 1} failed (skipping):`,
        err instanceof Error ? err.message : err,
      );
    }

    if (i < sourceChunks.length - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return allCards.slice(0, totalTarget * 2);
}

// ─── Visual card generation ───────────────────────────────────────────────────

async function generateVisualCards(
  pageImages: string[],
  _pageImageRegions: ImageRegion[][],
  visualCardCount: number,
  customPrompt: string | undefined,
  onProgress: (pct: number, msg: string, count: number) => void,
): Promise<StagedCard[]> {
  if (pageImages.length === 0) return [];

  const { openai, getFallbackOpenAI, FALLBACK_MODEL } = await getAIClient();
  const allCards: StagedCard[] = [];
  const maxPerPage = Math.max(1, Math.ceil(visualCardCount / pageImages.length));

  for (let i = 0; i < pageImages.length; i++) {
    const pct = 20 + Math.round((i / pageImages.length) * 60);
    onProgress(pct, `Analysing page ${i + 1} of ${pageImages.length} for visual elements…`, allCards.length);

    const base64 = pageImages[i];
    if (!base64 || base64.length < 100) continue;

    const custom = customPrompt?.trim() ? `\n\nAdditional instructions: ${customPrompt.trim()}` : "";
    const system = `You are a medical visual flashcard expert. Identify distinct visual elements (diagrams, charts, tables, anatomical illustrations, flowcharts, graphs) in this page image.${custom}

For each visual element return a card with:
- "front": Clinical or educational question about the figure
- "back": Detailed answer with key teaching points
- "bbox": [x, y, width, height] normalised 0-1, tight around the figure. Max 0.7 × 0.7.
- "pageNumber": ${i + 1}

Return ONLY valid JSON array (no markdown, no explanation):
[{"front":"...","back":"...","bbox":[x,y,w,h],"pageNumber":${i + 1}}]

Maximum ${maxPerPage} cards. Skip pages that are pure text.`;

    try {
      const dataUrl = base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`;
      let completion;
      // Ollama options to limit memory usage for vision models
      const ollamaOptions = {
        num_ctx: 4096,      // Reduce context window to save memory
        num_predict: 1024,  // Limit output tokens
        temperature: 0.2,
      };
      try {
        completion = await openai.chat.completions.create({
          model: VISUAL_DETECTION_MODEL,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: system },
                { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
              ],
            },
          ],
          max_tokens: 1024,
          temperature: 0.2,
          options: ollamaOptions,
        } as any);
      } catch (err) {
        const fb = isDailyLimitError(err) ? getFallbackOpenAI() : null;
        if (fb) {
          completion = await fb.chat.completions.create({
            model: FALLBACK_MODEL,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: system },
                  { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
                ],
              },
            ],
            max_tokens: 1024,
            temperature: 0.2,
            options: ollamaOptions,
          } as any);
        } else {
          throw err;
        }
      }

      const rawText = completion.choices[0]?.message?.content ?? "";
      const match = rawText.match(/\[[\s\S]*\]/);
      if (!match) continue;

      const parsed = JSON.parse(match[0]) as Array<{
        front?: string;
        back?: string;
        bbox?: number[];
        pageNumber?: number;
      }>;

      for (const item of parsed) {
        if (!item.front?.trim() || !item.back?.trim()) continue;
        const bbox = Array.isArray(item.bbox) && item.bbox.length === 4 ? item.bbox : null;
        // Server-side filter: reject bboxes that are too large (likely the whole page)
        if (bbox && (bbox[2] > 0.7 || bbox[3] > 0.7)) continue;

        const card: StagedCard = {
          front: String(item.front).trim(),
          back: String(item.back).trim(),
          cardType: "basic",
          pageNumber: i + 1,
          sourceImage: dataUrl,
        };
        if (bbox) card.bbox = JSON.stringify(bbox);
        allCards.push(card);
      }
    } catch (err) {
      console.error(
        `[generate] Visual page ${i + 1} failed:`,
        err instanceof Error ? err.message : err,
      );
    }

    if (i < pageImages.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return allCards.slice(0, visualCardCount);
}

// ─── Save deck + cards to DB ──────────────────────────────────────────────────

async function saveDeckAndCards(
  deckName: string,
  parentId: number | null,
  userId: string | null,
  cards: StagedCard[],
): Promise<{ deckId: number; cardCount: number }> {
  const [deck] = await db
    .insert(decksTable)
    .values({
      name: deckName.trim() || "Generated Deck",
      parentId: parentId ?? undefined,
      userId: userId ?? undefined,
      kind: "deck",
    })
    .returning();

  if (cards.length > 0) {
    await db.insert(cardsTable).values(
      cards.map(c => ({
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
      })),
    );
  }

  return { deckId: deck.id, cardCount: cards.length };
}

// ─── POST /api/generate/stream ────────────────────────────────────────────────

router.post("/generate/stream", async (req: Request, res: Response): Promise<void> => {
  const ip = req.ip ?? "unknown";
  if (!generateRateLimiter(ip)) {
    res.status(429).json({ error: "Too many requests. Please wait a moment." });
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
    pageTexts = [],
    pageImageRegions = [],
    preview = false,
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
    pageImageRegions?: ImageRegion[][];
    preview?: boolean;
  };

  if (!text.trim() && pageImages.length === 0) {
    res.status(400).json({ error: "text or pageImages are required" });
    return;
  }

  const userId = req.isAuthenticated() ? req.user!.id : null;
  const resolvedParentId = typeof parentId === "number" ? parentId : null;
  const targetCards = typeof cardCount === "number" && cardCount > 0 ? cardCount : 20;
  const targetVisual =
    typeof visualCardCount === "number" && visualCardCount > 0
      ? visualCardCount
      : Math.min(pageImages.length * 2, 30);

  setupSSEHeaders(res);
  const heartbeat = startHeartbeat(res);

  const cleanUp = () => clearInterval(heartbeat);
  req.on("close", cleanUp);

  const sendProgress = (
    pct: number,
    message: string,
    cardsCreated = 0,
    stage = "generating",
  ) => {
    sendSSE(res, { type: "progress", percent: pct, message, cardsCreated, stage });
  };

  try {
    const allCards: StagedCard[] = [];

    // Text card generation
    if ((deckType === "text" || deckType === "both") && text.trim()) {
      sendProgress(0, "Starting text card generation…", 0, "generating");
      const textCards = await generateTextCards(
        text,
        targetCards,
        pageTexts,
        customPrompt,
        (pct, msg, count) =>
          sendProgress(Math.round(pct * 0.7), msg, count, "generating"),
      );
      allCards.push(...textCards);
      sendProgress(70, `Generated ${textCards.length} text cards`, allCards.length, "saving");
    }

    // Visual card generation
    if ((deckType === "visual" || deckType === "both") && pageImages.length > 0) {
      sendProgress(70, "Analysing pages for visual elements…", allCards.length, "visual");
      const visualCards = await generateVisualCards(
        pageImages,
        pageImageRegions,
        targetVisual,
        customPrompt,
        (pct, msg, count) =>
          sendProgress(70 + Math.round(pct * 0.25), msg, allCards.length + count, "visual"),
      );
      allCards.push(...visualCards);
      sendProgress(95, `Found ${visualCards.length} visual cards`, allCards.length, "saving");
    }

    sendProgress(97, "Saving your deck…", allCards.length, "saving");

    if (preview) {
      sendSSE(res, {
        type: "done",
        generatedCount: allCards.length,
        cards: allCards,
      });
    } else {
      const { deckId, cardCount: savedCount } = await saveDeckAndCards(
        deckName,
        resolvedParentId,
        userId,
        allCards,
      );
      sendProgress(100, "Done!", savedCount, "done");
      sendSSE(res, {
        type: "done",
        generatedCount: savedCount,
        deck: { id: deckId },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    const status = (err as { status?: number }).status;
    const friendly = status === 401 || /user not found|invalid.*key|unauthorized/i.test(message)
      ? "Ollama authentication failed. Check your OLLAMA_BASE_URL in .env."
      : status === 404
      ? `AI model '${FREE_TEXT_MODEL}' not found in Ollama. Pull it with: ollama pull ${FREE_TEXT_MODEL}`
      : /quota|rate.?limit|insufficient|payment|billing/i.test(message)
      ? "AI provider quota exceeded. Check your Ollama server."
      : /context length|maximum context|too many tokens/i.test(message)
      ? "Content is too long for this AI model. Try shorter text or fewer pages."
      : /not configured|api key/i.test(message)
      ? message
      : /ECONNREFUSED|connect|connection|network|fetch failed/i.test(message)
      ? "Cannot connect to Ollama. Make sure Ollama is running (ollama serve) and OLLAMA_BASE_URL is correct in .env."
      : `Generation failed: ${message}`;
    sendSSE(res, { type: "error", message: friendly });
  } finally {
    cleanUp();
    res.end();
  }
});

// ─── POST /api/generate/commit ────────────────────────────────────────────────

router.post(
  "/generate/commit",
  async (req: Request, res: Response, next): Promise<void> => {
    try {
      const { deckName, parentId, cards } = req.body as {
        deckName?: string;
        parentId?: number | null;
        cards?: StagedCard[];
      };

      if (!deckName?.trim()) {
        res.status(400).json({ error: "deckName is required" });
        return;
      }
      if (!Array.isArray(cards) || cards.length === 0) {
        res.status(400).json({ error: "cards must be a non-empty array" });
        return;
      }

      const userId = req.isAuthenticated() ? req.user!.id : null;
      const resolvedParentId = typeof parentId === "number" ? parentId : null;

      const { deckId, cardCount } = await saveDeckAndCards(
        deckName,
        resolvedParentId,
        userId,
        cards,
      );
      res.status(201).json({ deck: { id: deckId }, cardCount });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/generate-qbank/stream ─────────────────────────────────────────

router.post(
  "/generate-qbank/stream",
  async (req: Request, res: Response): Promise<void> => {
    const ip = req.ip ?? "unknown";
    if (!generateRateLimiter(ip)) {
      res.status(429).json({ error: "Too many requests. Please wait a moment." });
      return;
    }

    const userId = req.isAuthenticated() ? req.user!.id : null;
    const isPro = await getEffectiveIsPro(req, userId);
    if (!isPro) {
      sendLimitError(
        res,
        "qbank",
        "QBank generation is a Pro feature. Upgrade to Pro to unlock question banks.",
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
      res.status(400).json({ error: "text is required" });
      return;
    }

    const resolvedParentId = typeof parentId === "number" ? parentId : null;
    const targetQuestions =
      typeof questionCount === "number" && questionCount > 0 ? questionCount : 20;

    setupSSEHeaders(res);
    const heartbeat = startHeartbeat(res);

    const cleanUp = () => clearInterval(heartbeat);
    req.on("close", cleanUp);

    const sendProgress = (pct: number, message: string) => {
      sendSSE(res, { type: "progress", percent: pct, message });
    };

    try {
      const { openai, getFallbackOpenAI, FALLBACK_MODEL } = await getAIClient();
      const chunks = splitIntoChunks(text);
      const questionsPerChunk = Math.max(1, Math.ceil(targetQuestions / chunks.length));
      const allQuestions: RawCard[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const pct = Math.round((i / chunks.length) * 85);
        sendProgress(pct, `Generating questions from section ${i + 1} of ${chunks.length}…`);

        const { system, user } = buildQBankPrompt(chunks[i], questionsPerChunk, customPrompt);
        try {
          let completion;
          try {
            completion = await openai.chat.completions.create({
              model: FREE_TEXT_MODEL,
              messages: [
                { role: "system", content: system },
                { role: "user", content: user },
              ],
              max_tokens: 4000,
              temperature: 0.3,
            });
          } catch (err) {
            const fb = isDailyLimitError(err) ? getFallbackOpenAI() : null;
            if (fb) {
              completion = await fb.chat.completions.create({
                model: FALLBACK_MODEL,
                messages: [
                  { role: "system", content: system },
                  { role: "user", content: user },
                ],
                max_tokens: 4000,
                temperature: 0.3,
              });
            } else {
              throw err;
            }
          }
          const parsed = parseCardsFromAI(
            completion.choices[0]?.message?.content ?? "",
            null,
          );
          allQuestions.push(...parsed);
        } catch (err) {
          console.error(
            `[generate-qbank] Chunk ${i + 1} failed:`,
            err instanceof Error ? err.message : err,
          );
        }

        if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 200));
      }

      sendProgress(90, "Saving question bank…");

      const [qbank] = await db
        .insert(qbanksTable)
        .values({
          name: deckName.trim() || "Generated Question Bank",
          parentId: resolvedParentId ?? undefined,
          userId: userId ?? undefined,
        })
        .returning();

      const capped = allQuestions.slice(0, targetQuestions * 2);
      if (capped.length > 0) {
        await db.insert(questionsTable).values(
          capped.map(q => ({
            qbankId: qbank.id,
            front: q.front,
            back: q.back,
            choices: q.choices ? JSON.stringify(q.choices) : null,
            correctIndex: q.correctIndex ?? null,
            tags: q.tags ?? null,
            pageNumber: q.pageNumber ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        );
      }

      sendProgress(100, "Done!");
      sendSSE(res, {
        type: "done",
        generatedCount: capped.length,
        qbank: { id: qbank.id },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      const status = (err as { status?: number }).status;
      const friendly = status === 401 || /user not found|invalid.*key|unauthorized/i.test(message)
        ? "Ollama authentication failed. Check your OLLAMA_BASE_URL in .env."
        : status === 404
        ? `AI model '${FREE_TEXT_MODEL}' not found in Ollama. Pull it with: ollama pull ${FREE_TEXT_MODEL}`
        : /quota|rate.?limit|insufficient|payment|billing/i.test(message)
        ? "AI provider quota exceeded. Check your Ollama server."
        : /not configured|api key/i.test(message)
        ? message
        : /ECONNREFUSED|connect|connection|network|fetch failed/i.test(message)
        ? "Cannot connect to Ollama. Make sure Ollama is running (ollama serve) and OLLAMA_BASE_URL is correct in .env."
        : `Question bank generation failed: ${message}`;
      sendSSE(res, { type: "error", message: friendly });
    } finally {
      cleanUp();
      res.end();
    }
  },
);

export default router;
