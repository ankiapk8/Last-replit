import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import {
  setDevProOverride,
  clearDevProOverride,
  getDevOverrideEntry,
  loadDevOverridesFromDB,
  getDevSidFromRequest,
  DEV_SID_COOKIE,
} from "../lib/dev-overrides";
import { countAllDecksByUser, FREE_TIER } from "../lib/free-tier-limits";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

function getOrSetDevSid(req: Request, res: Response): string {
  const existing = getDevSidFromRequest(req);
  if (existing && existing.length > 0) return existing;
  const sid = "dev-" + crypto.randomBytes(16).toString("hex");
  res.cookie(DEV_SID_COOKIE, sid, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
  return sid;
}

function getOverrideKey(req: Request, res: Response): string {
  if (req.isAuthenticated()) return req.user!.id;
  return getOrSetDevSid(req, res);
}

if (process.env.NODE_ENV !== "production") {
  let loaded = false;
  async function ensureLoaded(): Promise<void> {
    if (!loaded) {
      loaded = true;
      await loadDevOverridesFromDB();
    }
  }

  router.post("/dev/set-pro", async (req, res): Promise<void> => {
    await ensureLoaded();
    const key = getOverrideKey(req, res);
    const { isPro } = req.body as { isPro?: boolean };
    if (typeof isPro !== "boolean") {
      res.status(400).json({ error: "isPro must be a boolean" });
      return;
    }
    await setDevProOverride(key, isPro);
    res.json({ ok: true, devIsPro: isPro });
  });

  router.delete("/dev/set-pro", async (req, res): Promise<void> => {
    await ensureLoaded();
    const key = getOverrideKey(req, res);
    await clearDevProOverride(key);
    res.json({ ok: true, devIsPro: null });
  });

  router.get("/dev/status", async (req, res): Promise<void> => {
    await ensureLoaded();
    res.set("Cache-Control", "no-store");
    const key = getOverrideKey(req, res);
    const entry = getDevOverrideEntry(key);
    res.json({
      authenticated: req.isAuthenticated(),
      userId: req.isAuthenticated() ? req.user!.id : null,
      devIsPro: entry?.isPro ?? null,
      simulated: entry?.simulated ?? false,
    });
  });

  router.post("/dev/simulate-subscribe", async (req, res): Promise<void> => {
    await ensureLoaded();
    const key = getOverrideKey(req, res);
    await setDevProOverride(key, true, true);
    res.json({ ok: true, isPro: true, simulated: true });
  });

  router.delete("/dev/simulate-subscribe", async (req, res): Promise<void> => {
    await ensureLoaded();
    const key = getOverrideKey(req, res);
    await setDevProOverride(key, false, false);
    res.json({ ok: true, isPro: false, simulated: false });
  });

  router.get("/dev/usage", async (req, res): Promise<void> => {
    await ensureLoaded();
    res.set("Cache-Control", "no-store");
    const userId = req.isAuthenticated() ? req.user!.id : null;
    const today = new Date().toISOString().slice(0, 10);
    const key = userId ?? (req.cookies?.[DEV_SID_COOKIE] as string | undefined) ?? "anon";

    const [deckCount, exportRow] = await Promise.all([
      userId ? countAllDecksByUser(userId) : Promise.resolve(0),
      db.execute(
        sql`SELECT count FROM quota_usage WHERE key = ${key} AND metric = 'apkg_export' AND period = ${today}`,
      ),
    ]);

    const exportCount = (() => {
      const row = exportRow.rows[0] as { count?: unknown } | undefined;
      if (!row) return 0;
      return typeof row.count === "number" ? row.count : parseInt(String(row.count ?? "0"), 10);
    })();

    res.json({
      decks: { count: deckCount, max: FREE_TIER.MAX_DECKS },
      exportsToday: { count: exportCount, max: FREE_TIER.MAX_APKG_EXPORTS_PER_DAY },
    });
  });

  router.post("/dev/reset-quota", async (req, res): Promise<void> => {
    const userId = req.isAuthenticated() ? req.user!.id : null;
    const key = userId ?? (req.cookies?.[DEV_SID_COOKIE] as string | undefined) ?? "anon";
    const today = new Date().toISOString().slice(0, 10);
    await db.execute(
      sql`DELETE FROM quota_usage WHERE key = ${key} AND metric = 'apkg_export' AND period = ${today}`,
    );
    res.json({ ok: true, message: "Daily export quota reset to 0" });
  });
}

export default router;
