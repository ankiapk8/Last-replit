import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { db, decksTable, cardsTable, qbanksTable, questionsTable } from "@workspace/db";
import { FREE_TEXT_MODEL, VISUAL_DETECTION_MODEL, QBANK_MODEL } from "../lib/models";
import { getEffectiveIsPro, sendLimitError } from "../lib/free-tier-limits";
import { createRateLimiter } from "../lib/rate-limiter";
import { generationCache, ResponseCache } from "../lib/response-cache";
import {
  startGeneration,
  completeGeneration,
  failGeneration,
  logError,
  logAiCall,
} from "../lib/monitor";

// In-memory generation status map for polling fallback
interface GenerationStatus {
  status: "running" | "completed" | "failed";
  deckId?: number;
  error?: string;
  startedAt: number;
}
const generationStatusMap = new Map<string, GenerationStatus>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 3_600_000; // 1 hour
  for (const [id, entry] of generationStatusMap) {
    if (entry.startedAt < cutoff) generationStatusMap.delete(id);
  }
}, 300_000).unref?.();

const router: IRouter = Router();

const generateRateLimiter = createRateLimiter(10, 60_000);

// ─── Context limit guard ──────────────────────────────────────────────────────
// ~90K chars ≈ ~30K tokens with safety margin for most models.
// For PDFs exceeding this, we sample beginning/middle/end to stay within limits.
const MAX_CONTEXT_CHARS = 90_000;

function prepareText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_CONTEXT_CHARS) return { text, truncated: false };
  // Sample: first 30%, middle 30%, last 40% — captures intro, key content, conclusion
  const firstLen = Math.floor(MAX_CONTEXT_CHARS * 0.3);
  const midLen = Math.floor(MAX_CONTEXT_CHARS * 0.3);
  const lastLen = Math.floor(MAX_CONTEXT_CHARS * 0.4);
  const midStart = Math.floor(text.length / 2) - Math.floor(midLen / 2);
  return {
    text: `[BEGINNING]\n${text.slice(0, firstLen)}\n\n[MIDDLE]\n${text.slice(midStart, midStart + midLen)}\n\n[END]\n${text.slice(-lastLen)}`,
    truncated: true,
  };
}

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

/** Determine whether a primary model error should trigger fallback to Ollama Cloud */
function shouldFallback(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number }).status;
  if (msg.includes("free-models-per-day")) return true;
  if (status === 429) return true;
  if (status && status >= 500) return true;
  if (/ECONNREFUSED|connect|connection|network|fetch failed|timeout/i.test(msg)) return true;
  return false;
}

// ─── AI client ────────────────────────────────────────────────────────────────

// Module-level cache for AI client to avoid re-initializing on every request
let cachedAIClient: {
  openai: Awaited<ReturnType<typeof getAIClient>>["openai"];
  getFallbackOpenAI: Awaited<ReturnType<typeof getAIClient>>["getFallbackOpenAI"];
  FALLBACK_MODEL: string;
} | null = null;

async function getAIClient() {
  if (
    !process.env.OPENROUTER_API_KEY &&
    !process.env.OLLAMA_CLOUD_API_KEY &&
    !process.env.OPENAI_API_KEY1 &&
    !process.env.OPENAI_API_KEY &&
    !process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  ) {
    throw new Error(
      "AI is not configured. Set OPENROUTER_API_KEY for OpenRouter, or set OLLAMA_CLOUD_API_KEY."
    );
  }
  const { openai, getFallbackOpenAI, FALLBACK_MODEL } =
    await import("@workspace/integrations-openai-ai-server");

  // Log which AI provider is active
  const orKey = process.env.OPENROUTER_API_KEY?.trim();
  const provider = orKey
    ? "openrouter"
    : process.env.OLLAMA_CLOUD_API_KEY
      ? "ollama-cloud"
      : "openai/replit";
  const baseURL = orKey
    ? process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"
    : process.env.OLLAMA_CLOUD_BASE_URL || "https://cloud.ollama.com/v1";
  console.log(`[AI] Provider: ${provider}, BaseURL: ${baseURL}`);
  console.log(
    `[AI] Models — text="${FREE_TEXT_MODEL}" vision="${VISUAL_DETECTION_MODEL}" qbank="${QBANK_MODEL}" mindmap="${process.env.AI_MINDMAP_MODEL || "tencent/hy3-preview:free"}" explain="${process.env.AI_TEXT_MODEL || "openai/gpt-oss-120b:free"}"`
  );
  console.log(
    `[AI] Fallback: ${FALLBACK_MODEL}, Fallback available: ${getFallbackOpenAI() !== null}`
  );

  return { openai, getFallbackOpenAI, FALLBACK_MODEL };
}

/** Get cached AI client (initialized once, reused across requests) */
async function getCachedAIClient() {
  if (!cachedAIClient) {
    cachedAIClient = await getAIClient();
  }
  return cachedAIClient;
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

// ─── Unified prompt builders (single call per PDF) ────────────────────────────

function buildUnifiedCardPrompt(
  fullText: string,
  targetCount: number,
  customPrompt?: string
): { system: string; user: string } {
  const custom = customPrompt?.trim()
    ? `\n\nAdditional instructions from user: ${customPrompt.trim()}`
    : "";
  const mcqCount = Math.max(1, Math.ceil(targetCount / 4));
  return {
    system: `You are an expert medical educator and Anki flashcard creator.${custom}

Return ONLY a valid JSON object — no markdown fences, no explanation:
{
  "cards": [
    {
      "front": "Concise question or term (max 200 chars)",
      "back": "Answer with key details (max 500 chars)",
      "tags": "optional,comma,tags",
      "cardType": "basic"
    }
  ],
  "mcqs": [
    {
      "front": "Clinical vignette or direct question",
      "back": "Explanation of correct answer and why distractors are wrong",
      "choices": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "tags": "optional,tags"
    }
  ]
}

RULES:
- Generate exactly ${targetCount} flashcards in the "cards" array
- Generate exactly ${mcqCount} MCQs in the "mcqs" array
- Each card/MCQ must cover one atomic fact, mechanism, or concept
- Distribute cards across the ENTIRE source material — don't cluster on one section
- MCQs must be USMLE/professional exam style with clinical vignettes
- Focus on high-yield clinical facts, mechanisms, definitions, and exam pearls
- Do not repeat the same concept across cards`,
    user: `Generate ${targetCount} flashcards and ${mcqCount} MCQs from this medical text:\n\n${fullText}`,
  };
}

function buildUnifiedQBankPrompt(
  fullText: string,
  targetCount: number,
  customPrompt?: string
): { system: string; user: string } {
  const custom = customPrompt?.trim() ? `\n\nAdditional instructions: ${customPrompt.trim()}` : "";
  return {
    system: `You are an expert medical educator creating high-quality MCQs.${custom}

Return ONLY a valid JSON array — no markdown fences, no explanation:
[
  {
    "front": "Clinical vignette or direct question",
    "back": "Explanation of correct answer and why distractors are wrong",
    "choices": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "tags": "optional,tags"
  }
]

RULES:
- Generate exactly ${targetCount} MCQs (or fewer if insufficient content)
- front: realistic clinical vignette or direct exam question
- back: thorough explanation of the correct AND incorrect answers
- choices: exactly 4 options with plausible distractors
- correctIndex: 0-based index of the correct answer
- USMLE/professional exam style
- Distribute MCQs across the ENTIRE source material — don't cluster on one section`,
    user: `Generate ${targetCount} MCQs from this medical text:\n\n${fullText}`,
  };
}

// ─── Parse AI JSON response ───────────────────────────────────────────────────

/** Parse cards from the old flat array format (for backwards compat) */
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
        card.pageNumber = typeof c.pageNumber === "number" ? c.pageNumber : (pageNumber ?? null);
        return card;
      })
      .filter((c): c is RawCard => c !== null);
  } catch {
    return [];
  }
}

/** Parse cards from the new unified { cards, mcqs } format */
function parseUnifiedCardsFromAI(raw: string): RawCard[] {
  try {
    // Try unified format first: { "cards": [...], "mcqs": [...] }
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
    // Fallback to flat array format
    return parseCardsFromAI(raw);
  } catch {
    return [];
  }
}

// ─── Unified text card generation (SINGLE AI call) ────────────────────────────

async function generateTextCardsUnified(
  openai: Awaited<ReturnType<typeof getAIClient>>["openai"],
  getFallbackOpenAI: Awaited<ReturnType<typeof getAIClient>>["getFallbackOpenAI"],
  FALLBACK_MODEL: string,
  text: string,
  totalTarget: number,
  customPrompt: string | undefined,
  onProgress: (pct: number, msg: string, count: number, stage?: string) => void
): Promise<RawCard[]> {
  const { text: preparedText, truncated } = prepareText(text);
  if (truncated) {
    console.log(
      `[generate] Text truncated from ${text.length} to ${preparedText.length} chars for context limit`
    );
  }

  const { system, user } = buildUnifiedCardPrompt(preparedText, totalTarget, customPrompt);

  // Check cache first
  const cacheKey = ResponseCache.hash(`${FREE_TEXT_MODEL}:${system}:${user}`);
  const cached = generationCache.get(cacheKey);
  if (cached) {
    console.log(`[generate] Unified text generation: cache hit`);
    onProgress(50, "Generating cards…", 0, "generating");
    const cards = parseUnifiedCardsFromAI(cached);
    onProgress(85, `Generated ${cards.length} cards`, cards.length, "generating");
    return cards.slice(0, totalTarget * 2);
  }

  onProgress(10, "Generating all cards from your document…", 0, "generating");

  let completion;
  try {
    console.log(
      `[generate] Unified text generation: calling model="${FREE_TEXT_MODEL}" with ~${preparedText.length} chars`
    );
    completion = await openai.chat.completions.create(
      {
        model: FREE_TEXT_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 8000,
        temperature: 0.3,
      },
      { signal: AbortSignal.timeout(120_000) }
    );
    console.log(
      `[generate] Unified text generation: response received, content length=${completion.choices[0]?.message?.content?.length ?? 0}`
    );
    const rawContent = completion.choices[0]?.message?.content ?? "";
    generationCache.set(cacheKey, rawContent);
  } catch (err) {
    const status = (err as { status?: number }).status;
    console.error(
      `[generate] Unified text generation: PRIMARY model error (status=${status}):`,
      err instanceof Error ? err.message : err
    );
    const fb = shouldFallback(err) ? getFallbackOpenAI() : null;
    if (fb) {
      console.log(
        `[generate] Unified text generation: OpenRouter failed, falling back to Ollama Cloud model="${FALLBACK_MODEL}"`
      );
      completion = await fb.chat.completions.create(
        {
          model: FALLBACK_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_tokens: 8000,
          temperature: 0.3,
        },
        { signal: AbortSignal.timeout(120_000) }
      );
    } else {
      throw err;
    }
  }

  const raw = completion.choices[0]?.message?.content ?? "";
  const stripped = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const cards = parseUnifiedCardsFromAI(stripped);
  console.log(`[generate] Unified text generation: parsed ${cards.length} cards`);

  onProgress(85, `Generated ${cards.length} cards`, cards.length, "generating");
  return cards.slice(0, totalTarget * 2);
}

// ─── Unified visual card generation (SINGLE AI call for all pages) ────────────

async function generateVisualCardsUnified(
  openai: Awaited<ReturnType<typeof getAIClient>>["openai"],
  getFallbackOpenAI: Awaited<ReturnType<typeof getAIClient>>["getFallbackOpenAI"],
  FALLBACK_MODEL: string,
  pageImages: string[],
  _pageImageRegions: ImageRegion[][],
  visualCardCount: number,
  customPrompt: string | undefined,
  onProgress: (pct: number, msg: string, count: number, stage?: string) => void
): Promise<StagedCard[]> {
  if (pageImages.length === 0) return [];

  const custom = customPrompt?.trim() ? `\n\nAdditional instructions: ${customPrompt.trim()}` : "";
  const system = `You are a medical visual flashcard expert. Review ALL page images and identify distinct visual elements (diagrams, charts, tables, anatomical illustrations, flowcharts, graphs).${custom}

For each visual element return a card with:
- "front": Clinical or educational question about the figure
- "back": Detailed answer with key teaching points
- "bbox": [x, y, width, height] normalised 0-1, tight around the figure. Max 0.7 × 0.7.
- "pageNumber": <1-based page number>

Return ONLY a valid JSON array (no markdown, no explanation):
[{"front":"...","back":"...","bbox":[x,y,w,h],"pageNumber":N}]

Rules:
- Maximum 2 cards per page (only for pages with actual visual content)
- Skip pages that are pure text
- Total cards should not exceed ${visualCardCount}`;

  onProgress(70, "Analysing all pages for visual elements…", 0, "visual");

  // Build a single multimodal message with ALL page images
  const content = [
    { type: "text" as const, text: system },
    ...pageImages
      .filter((b) => b && b.length >= 100)
      .map((base64) => {
        const dataUrl = base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`;
        return { type: "image_url" as const, image_url: { url: dataUrl, detail: "low" as const } };
      }),
  ];

  if (content.length <= 1) {
    // No valid images
    return [];
  }

  try {
    let completion;
    try {
      console.log(
        `[generate] Unified visual generation: calling model="${VISUAL_DETECTION_MODEL}" with ${content.length - 1} images`
      );
      completion = await openai.chat.completions.create(
        {
          model: VISUAL_DETECTION_MODEL,
          messages: [{ role: "user", content }],
          max_tokens: 4000,
          temperature: 0.2,
        },
        { signal: AbortSignal.timeout(120_000) }
      );
      console.log(
        `[generate] Unified visual generation: response received, content length=${completion.choices[0]?.message?.content?.length ?? 0}`
      );
    } catch (err) {
      const status = (err as { status?: number }).status;
      console.error(
        `[generate] Unified visual generation: PRIMARY model error (status=${status}):`,
        err instanceof Error ? err.message : err
      );
      const fb = shouldFallback(err) ? getFallbackOpenAI() : null;
      if (fb) {
        console.log(
          `[generate] Unified visual generation: OpenRouter failed, falling back to Ollama Cloud model="${FALLBACK_MODEL}"`
        );
        completion = await fb.chat.completions.create(
          {
            model: FALLBACK_MODEL,
            messages: [{ role: "user", content }],
            max_tokens: 4000,
            temperature: 0.2,
          },
          { signal: AbortSignal.timeout(120_000) }
        );
      } else {
        throw err;
      }
    }

    const rawText = completion.choices[0]?.message?.content ?? "";
    const match = rawText.match(/\[[\s\S]*\]/);
    if (!match) {
      console.log(`[generate] Unified visual generation: no JSON array found in response`);
      onProgress(95, "No visual elements found", 0, "visual");
      return [];
    }

    const parsed = JSON.parse(match[0]) as Array<{
      front?: string;
      back?: string;
      bbox?: number[];
      pageNumber?: number;
    }>;

    const allCards: StagedCard[] = [];
    for (const item of parsed) {
      if (!item.front?.trim() || !item.back?.trim()) continue;
      const bbox = Array.isArray(item.bbox) && item.bbox.length === 4 ? item.bbox : null;
      if (bbox && (bbox[2] > 0.7 || bbox[3] > 0.7)) continue;

      const pageIdx = (item.pageNumber ?? 1) - 1;
      const base64 = pageImages[pageIdx];
      const dataUrl = base64?.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`;

      const card: StagedCard = {
        front: String(item.front).trim(),
        back: String(item.back).trim(),
        cardType: "basic",
        pageNumber: item.pageNumber ?? 1,
        sourceImage: dataUrl,
      };
      if (bbox) card.bbox = JSON.stringify(bbox);
      allCards.push(card);
    }

    onProgress(95, `Found ${allCards.length} visual cards`, allCards.length, "visual");
    return allCards.slice(0, visualCardCount);
  } catch (err) {
    console.error(
      `[generate] Unified visual generation failed:`,
      err instanceof Error ? err.message : err
    );
    onProgress(95, "Visual analysis failed, continuing…", 0, "visual");
    return [];
  }
}

// ─── Save deck + cards to DB ──────────────────────────────────────────────────

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

  // Generate a unique ID for this generation (for polling fallback + status tracking)
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
    // Initialize AI client once (cached across requests), pass to all generation functions
    const { openai, getFallbackOpenAI, FALLBACK_MODEL } = await getCachedAIClient();

    const allCards: StagedCard[] = [];

    // Send generation ID as first event so client can poll if SSE drops
    sendSSE(res, { type: "init", generationId });

    // Text card generation (SINGLE AI call for all cards)
    if ((deckType === "text" || deckType === "both") && text.trim()) {
      const textCards = await generateTextCardsUnified(
        openai,
        getFallbackOpenAI,
        FALLBACK_MODEL,
        text,
        targetCards,
        customPrompt,
        sendProgress
      );
      allCards.push(...textCards);
      sendProgress(70, `Generated ${textCards.length} text cards`, allCards.length, "saving");
    }

    // Visual card generation (SINGLE AI call for all pages)
    if ((deckType === "visual" || deckType === "both") && pageImages.length > 0) {
      const visualCards = await generateVisualCardsUnified(
        openai,
        getFallbackOpenAI,
        FALLBACK_MODEL,
        pageImages,
        pageImageRegions,
        targetVisual,
        customPrompt,
        sendProgress
      );
      allCards.push(...visualCards);
      sendProgress(95, `Found ${visualCards.length} visual cards`, allCards.length, "saving");
    }

    sendProgress(97, "Saving your deck…", allCards.length, "saving");

    // Always save to DB (no more preview mode)
    const { deckId, cardCount: savedCount } = await saveDeckAndCards(
      deckName,
      resolvedParentId,
      userId,
      allCards
    );

    // Track success status in memory for polling fallback
    completeGeneration(generationId, deckId);
    generationStatusMap.set(generationId, { status: "completed", deckId, startedAt });

    sendProgress(100, "Done!", savedCount, "done");
    sendSSE(res, {
      type: "done",
      generatedCount: savedCount,
      deck: { id: deckId },
      generationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    const status = (err as { status?: number }).status;
    const friendly =
      status === 401 || /user not found|invalid.*key|unauthorized/i.test(message)
        ? "AI authentication failed. Check your OPENROUTER_API_KEY or OLLAMA_CLOUD_API_KEY in .env."
        : status === 404
          ? `AI model '${FREE_TEXT_MODEL}' not found. Check your model name in .env.`
          : /quota|rate.?limit|insufficient|payment|billing/i.test(message)
            ? "AI provider quota exceeded. Check your OpenRouter or Ollama Cloud account."
            : /context length|maximum context|too many tokens/i.test(message)
              ? "Content is too long for this AI model. Try shorter text or fewer pages."
              : /not configured|api key/i.test(message)
                ? message
                : /ECONNREFUSED|connect|connection|network|fetch failed/i.test(message)
                  ? "Cannot connect to AI provider. Check your internet connection and OPENROUTER_BASE_URL."
                  : `Generation failed: ${message}`;

    // Track error status in memory for polling fallback
    failGeneration(generationId, friendly);
    generationStatusMap.set(generationId, {
      status: "failed",
      error: friendly,
      startedAt,
    });

    sendSSE(res, { type: "error", message: friendly, generationId });
  } finally {
    cleanUp();
    res.end();
  }
});

// ─── GET /api/generate/status/:id ─────────────────────────────────────────────
// Polling endpoint for SSE fallback — returns generation status by UUID

router.get("/generate/status/:id", async (req: Request, res: Response): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const status = generationStatusMap.get(id);

  if (!status) {
    res.status(404).json({ error: "Generation not found" });
    return;
  }

  res.json({
    status: status.status,
    deckId: status.deckId,
    error: status.error,
  });
});

// ─── POST /api/generate-qbank/stream ─────────────────────────────────────────

router.post("/generate-qbank/stream", async (req: Request, res: Response): Promise<void> => {
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
    res.status(400).json({ error: "text is required" });
    return;
  }

  const resolvedParentId = typeof parentId === "number" ? parentId : null;
  const targetQuestions =
    typeof questionCount === "number" && questionCount > 0 ? questionCount : 20;

  // Generate a unique ID for this generation (for polling fallback)
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
    const { openai, getFallbackOpenAI, FALLBACK_MODEL } = await getCachedAIClient();

    // Send generation ID as first event so client can poll if SSE drops
    sendSSE(res, { type: "init", generationId });
    const { text: preparedText, truncated } = prepareText(text);
    if (truncated) {
      console.log(
        `[generate-qbank] Text truncated from ${text.length} to ${preparedText.length} chars`
      );
    }

    const { system, user } = buildUnifiedQBankPrompt(preparedText, targetQuestions, customPrompt);

    // Check cache first
    const qbankCacheKey = ResponseCache.hash(`${QBANK_MODEL}:${system}:${user}`);
    const qbankCached = generationCache.get(qbankCacheKey);
    let allQuestions: RawCard[];

    if (qbankCached) {
      console.log(`[generate-qbank] Cache hit`);
      sendProgress(30, "Generating questions…");
      allQuestions = parseCardsFromAI(qbankCached, null);
    } else {
      sendProgress(10, "Generating all questions from your document…");

      let completion;
      try {
        console.log(
          `[generate-qbank] Calling model="${QBANK_MODEL}" with ~${preparedText.length} chars`
        );
        completion = await openai.chat.completions.create(
          {
            model: QBANK_MODEL,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            max_tokens: 8000,
            temperature: 0.3,
          },
          { signal: AbortSignal.timeout(120_000) }
        );
        console.log(
          `[generate-qbank] Response received, content length=${completion.choices[0]?.message?.content?.length ?? 0}`
        );
        const rawContent = completion.choices[0]?.message?.content ?? "";
        generationCache.set(qbankCacheKey, rawContent);
      } catch (err) {
        const status = (err as { status?: number }).status;
        console.error(
          `[generate-qbank] PRIMARY model error (status=${status}):`,
          err instanceof Error ? err.message : err
        );
        const fb = shouldFallback(err) ? getFallbackOpenAI() : null;
        if (fb) {
          console.log(
            `[generate-qbank] OpenRouter failed, falling back to Ollama Cloud model="${FALLBACK_MODEL}"`
          );
          completion = await fb.chat.completions.create(
            {
              model: FALLBACK_MODEL,
              messages: [
                { role: "system", content: system },
                { role: "user", content: user },
              ],
              max_tokens: 8000,
              temperature: 0.3,
            },
            { signal: AbortSignal.timeout(120_000) }
          );
        } else {
          throw err;
        }
      }

      const raw = completion.choices[0]?.message?.content ?? "";
      const stripped = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      allQuestions = parseCardsFromAI(stripped, null);
      console.log(`[generate-qbank] Parsed ${allQuestions.length} questions`);
    }

    sendProgress(85, `Generated ${allQuestions.length} questions`);

    sendProgress(90, "Saving question bank…");

    // Wrap qbank + questions in a transaction for atomicity
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

    // Track success status in memory for polling fallback
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
    const message = err instanceof Error ? err.message : "Generation failed";
    const status = (err as { status?: number }).status;
    const friendly =
      status === 401 || /user not found|invalid.*key|unauthorized/i.test(message)
        ? "AI authentication failed. Check your OPENROUTER_API_KEY or OLLAMA_CLOUD_API_KEY in .env."
        : status === 404
          ? `AI model '${QBANK_MODEL}' not found. Check your model name in .env.`
          : /quota|rate.?limit|insufficient|payment|billing/i.test(message)
            ? "AI provider quota exceeded. Check your OpenRouter or Ollama Cloud account."
            : /not configured|api key/i.test(message)
              ? message
              : /ECONNREFUSED|connect|connection|network|fetch failed/i.test(message)
                ? "Cannot connect to AI provider. Check your internet connection and OPENROUTER_BASE_URL."
                : `Question bank generation failed: ${message}`;

    // Track error status in memory for polling fallback
    failGeneration(generationId, friendly);
    generationStatusMap.set(generationId, {
      status: "failed",
      error: friendly,
      startedAt,
    });

    sendSSE(res, { type: "error", message: friendly, generationId });
  } finally {
    cleanUp();
    res.end();
  }
});

export default router;
