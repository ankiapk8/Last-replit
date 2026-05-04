import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { Request } from "express";

interface OverrideEntry {
  isPro: boolean;
  simulated: boolean;
}

const devProOverrides = new Map<string, OverrideEntry>();

export const DEV_SID_COOKIE = "dev-sid";

const METRIC_PRO = "dev_override_pro";
const METRIC_SIM = "dev_override_sim";
const PERIOD = "persistent";

export async function loadDevOverridesFromDB(): Promise<void> {
  try {
    const rows = await db.execute(
      sql`SELECT key, metric, count FROM quota_usage WHERE metric IN (${METRIC_PRO}, ${METRIC_SIM})`,
    );
    const map = new Map<string, Partial<OverrideEntry>>();
    for (const row of rows.rows as { key: string; metric: string; count: number }[]) {
      if (!map.has(row.key)) map.set(row.key, {});
      const e = map.get(row.key)!;
      if (row.metric === METRIC_PRO) e.isPro = row.count === 1;
      if (row.metric === METRIC_SIM) e.simulated = row.count === 1;
    }
    for (const [key, entry] of map) {
      devProOverrides.set(key, { isPro: entry.isPro ?? false, simulated: entry.simulated ?? false });
    }
  } catch {
    // Non-fatal — in-memory fallback still works
  }
}

async function persistOverride(key: string, isPro: boolean, simulated: boolean): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO quota_usage (key, metric, period, count)
      VALUES (${key}, ${METRIC_PRO}, ${PERIOD}, ${isPro ? 1 : 0})
      ON CONFLICT (key, metric, period) DO UPDATE SET count = ${isPro ? 1 : 0}
    `);
    await db.execute(sql`
      INSERT INTO quota_usage (key, metric, period, count)
      VALUES (${key}, ${METRIC_SIM}, ${PERIOD}, ${simulated ? 1 : 0})
      ON CONFLICT (key, metric, period) DO UPDATE SET count = ${simulated ? 1 : 0}
    `);
  } catch {
    // Non-fatal
  }
}

async function clearPersistedOverride(key: string): Promise<void> {
  try {
    await db.execute(
      sql`DELETE FROM quota_usage WHERE key = ${key} AND metric IN (${METRIC_PRO}, ${METRIC_SIM})`,
    );
  } catch {
    // Non-fatal
  }
}

export async function setDevProOverride(key: string, isPro: boolean, simulated = false): Promise<void> {
  devProOverrides.set(key, { isPro, simulated });
  await persistOverride(key, isPro, simulated);
}

export function getDevProOverride(key: string): boolean | undefined {
  return devProOverrides.get(key)?.isPro;
}

export function getDevOverrideEntry(key: string): OverrideEntry | undefined {
  return devProOverrides.get(key);
}

export async function clearDevProOverride(key: string): Promise<void> {
  devProOverrides.delete(key);
  await clearPersistedOverride(key);
}

export function getDevSidFromRequest(req: Request): string | undefined {
  const header = req.headers["x-dev-sid"] as string | undefined;
  if (header && header.length > 0) return header;
  return req.cookies?.[DEV_SID_COOKIE] as string | undefined;
}

const DEV_DEFAULT: OverrideEntry = { isPro: true, simulated: false };

export function getDevOverrideForRequest(req: Request): OverrideEntry | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  const userId = (req as any).user?.id as string | undefined;
  if (userId) {
    const entry = devProOverrides.get(userId);
    if (entry !== undefined) return entry;
  }
  const devSid = getDevSidFromRequest(req);
  if (devSid) {
    const entry = devProOverrides.get(devSid);
    if (entry !== undefined) return entry;
  }
  // Default to Pro in dev mode when no explicit override has been set
  return DEV_DEFAULT;
}
