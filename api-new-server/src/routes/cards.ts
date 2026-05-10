import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, cardsTable } from "@workspace/db";
import { UpdateCardParams, UpdateCardBody, DeleteCardParams } from "@workspace/api-zod";
import { serializeCard } from "../lib/serialize-card";
import { z } from "zod";
import { FREE_TEXT_MODEL } from "../lib/models";
import { generationCache, ResponseCache } from "../lib/response-cache";
import { createRateLimiter } from "../lib/rate-limiter";
import { completeChat, shouldFallback } from "../lib/ai-client";

const CreateCardBody = z.object({
  deckId: z.number().int().positive(),
  front: z.string().min(1),
  back: z.string().min(1),
  cardType: z.string().optional(),
});

const router: IRouter = Router();
const regenerateRateLimiter = createRateLimiter(10, 60_000);

router.post("/cards", async (req, res, next): Promise<void> => {
  const parsed = CreateCardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.message } });
    return;
  }
  try {
    const [card] = await db
      .insert(cardsTable)
      .values({
        deckId: parsed.data.deckId,
        front: parsed.data.front,
        back: parsed.data.back,
        cardType: (parsed.data.cardType ?? "basic") as "basic" | "mcq" | "image",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    res.status(201).json(serializeCard(card));
  } catch (err) {
    next(err);
  }
});

router.patch("/cards/:id", async (req, res, next): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateCardParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: params.error.message } });
    return;
  }
  const parsed = UpdateCardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.message } });
    return;
  }
  try {
    const [card] = await db
      .update(cardsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(cardsTable.id, params.data.id))
      .returning();
    if (!card) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Card not found" } });
      return;
    }
    res.json(serializeCard(card));
  } catch (err) {
    next(err);
  }
});

router.delete("/cards/:id", async (req, res, next): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteCardParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: params.error.message } });
    return;
  }
  try {
    const [deleted] = await db
      .delete(cardsTable)
      .where(eq(cardsTable.id, params.data.id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Card not found" } });
      return;
    }
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.post("/cards/regenerate-batch", async (req, res, next): Promise<void> => {
  try {
    const { cardIds } = req.body as { cardIds?: number[] };
    if (!Array.isArray(cardIds) || cardIds.length === 0) {
      res
        .status(400)
        .json({
          error: { code: "VALIDATION_ERROR", message: "cardIds must be a non-empty array" },
        });
      return;
    }
    const MAX_BATCH = 10;
    const ids = cardIds.slice(0, MAX_BATCH);
    const cardsToRegenerate = await db.select().from(cardsTable).where(inArray(cardsTable.id, ids));
    if (cardsToRegenerate.length === 0) {
      res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "No cards found for the given IDs" } });
      return;
    }

    const system = `You are an expert medical Anki card writer. Below are existing flashcards that need improvement.
For each card, generate a better, clearer version. Return a JSON array of improved cards:
[{"front":"...","back":"...","tags":"optional,tags"}]

Rules:
- Generate exactly ${cardsToRegenerate.length} improved cards in the same order
- Make questions more specific and clinically focused
- Keep answers concise but complete
- Each card should test one atomic fact`;

    const user = cardsToRegenerate
      .map((c, i) => `Card ${i + 1} (current):\nQ: ${c.front}\nA: ${c.back}`)
      .join("\n\n");
    const cacheKey = ResponseCache.hash(`regen-batch:${FREE_TEXT_MODEL}:${system}:${user}`);
    const cached = generationCache.get(cacheKey);
    let improvedCards: Array<{ front: string; back: string; tags?: string }>;

    if (cached) {
      try {
        const parsed = JSON.parse(cached.match(/\[[\s\S]*\]/)?.[0] ?? "[]");
        improvedCards = Array.isArray(parsed) ? parsed : [];
      } catch {
        improvedCards = [];
      }
    } else {
      const result = await completeChat({
        model: FREE_TEXT_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        maxTokens: 4000,
        temperature: 0.3,
      });
      const stripped = result.content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      generationCache.set(cacheKey, stripped);
      try {
        const parsed = JSON.parse(stripped.match(/\[[\s\S]*\]/)?.[0] ?? "[]");
        improvedCards = Array.isArray(parsed) ? parsed : [];
      } catch {
        improvedCards = [];
      }
    }

    let updatedCount = 0;
    for (let i = 0; i < improvedCards.length && i < cardsToRegenerate.length; i++) {
      const imp = improvedCards[i];
      if (!imp.front?.trim() || !imp.back?.trim()) continue;
      await db
        .update(cardsTable)
        .set({
          front: imp.front.trim(),
          back: imp.back.trim(),
          tags: imp.tags?.trim() ?? null,
          updatedAt: new Date(),
        })
        .where(eq(cardsTable.id, cardsToRegenerate[i].id));
      updatedCount++;
    }
    const updatedCards = await db.select().from(cardsTable).where(inArray(cardsTable.id, ids));
    res.json({ regeneratedCount: updatedCount, cards: updatedCards.map(serializeCard) });
  } catch (err) {
    next(err);
  }
});

export default router;
