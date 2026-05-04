import { Router, type IRouter } from "express";
import { db, generationsTable } from "@workspace/db";
import { desc, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/generations", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "100"), 10) || 100, 1), 500);
    const rows = await db
      .select()
      .from(generationsTable)
      .orderBy(desc(generationsTable.startedAt))
      .limit(limit);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.delete("/generations", async (_req, res, next) => {
  try {
    await db.execute(sql`DELETE FROM generations`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
