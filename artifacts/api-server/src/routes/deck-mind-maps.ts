import { Router, type IRouter } from "express";
import { db, mindMapsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/decks/:id/mind-maps", async (req, res): Promise<void> => {
  const deckId = Number(req.params.id);
  if (!Number.isFinite(deckId)) { res.status(400).json({ error: "Invalid deck id" }); return; }
  const maps = await db
    .select()
    .from(mindMapsTable)
    .where(eq(mindMapsTable.deckId, deckId))
    .orderBy(mindMapsTable.createdAt);
  res.json(maps);
});

router.post("/decks/:id/mind-maps", async (req, res): Promise<void> => {
  const deckId = Number(req.params.id);
  if (!Number.isFinite(deckId)) { res.status(400).json({ error: "Invalid deck id" }); return; }
  const { title, data, cardCount } = req.body as { title?: string; data?: unknown; cardCount?: number };
  if (!title || !data) { res.status(400).json({ error: "title and data are required" }); return; }
  const [map] = await db
    .insert(mindMapsTable)
    .values({ deckId, title: String(title), data: JSON.stringify(data), cardCount: cardCount ?? 0 })
    .returning();
  res.json(map);
});

router.delete("/decks/:id/mind-maps/:mapId", async (req, res): Promise<void> => {
  const deckId = Number(req.params.id);
  const mapId  = Number(req.params.mapId);
  if (!Number.isFinite(deckId) || !Number.isFinite(mapId)) {
    res.status(400).json({ error: "Invalid id" }); return;
  }
  await db.delete(mindMapsTable).where(and(eq(mindMapsTable.id, mapId), eq(mindMapsTable.deckId, deckId)));
  res.json({ success: true });
});

export default router;
