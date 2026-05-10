/**
 * NEW: Log query endpoint for admin debugging.
 * GET /api/logs?level=error&endpoint=/api/generate&limit=50&since=24h
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { queryLogs } from "../lib/db-logger";
import { logger } from "../lib/logger";

const router: IRouter = Router();

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return false;
  }
  const userId = req.user!.id;
  const rows = await db.execute(sql`SELECT role FROM public.users WHERE id = ${userId} LIMIT 1`);
  const role = (rows.rows[0] as { role?: string } | undefined)?.role;
  if (role !== "admin" && role !== "moderator") {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Admin access required" } });
    return false;
  }
  return true;
}

router.get("/logs", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1, 200);
    const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
    const result = await queryLogs({
      level: req.query.level as string | undefined,
      endpoint: req.query.endpoint as string | undefined,
      userId: req.query.userId as string | undefined,
      requestId: req.query.requestId as string | undefined,
      since: req.query.since as string | undefined,
      limit,
      offset,
    });
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to query logs");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to query logs" } });
  }
});

export default router;
