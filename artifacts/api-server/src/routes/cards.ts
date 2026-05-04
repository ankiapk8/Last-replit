import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, cardsTable } from "@workspace/db";
import {
  UpdateCardParams,
  UpdateCardBody,
  DeleteCardParams,
} from "@workspace/api-zod";
import { serializeCard } from "../lib/serialize-card";
import { z } from "zod";

const CreateCardBody = z.object({
  deckId: z.number().int().positive(),
  front: z.string().min(1),
  back: z.string().min(1),
  cardType: z.string().optional(),
});

const router: IRouter = Router();

router.post("/cards", async (req, res, next): Promise<void> => {
  const parsed = CreateCardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [card] = await db
      .update(cardsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(cardsTable.id, params.data.id))
      .returning();

    if (!card) {
      res.status(404).json({ error: "Card not found" });
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
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    const [deleted] = await db
      .delete(cardsTable)
      .where(eq(cardsTable.id, params.data.id))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;
