import { type Request, type Response } from "express";
import { db, decksTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { getDevProOverride, getDevOverrideForRequest } from "./dev-overrides";

export const FREE_TIER = {
  MAX_CARDS_PER_DECK: 500,
  MAX_DECKS: 100,
  MAX_APKG_EXPORTS_PER_DAY: 50,
} as const;

export interface LimitError {
  limitReached: true;
  feature: string;
  requiredPlan: "pro";
  message: string;
}

export function sendLimitError(
  res: Response,
  feature: string,
  message: string,
): void {
  const body: LimitError = {
    limitReached: true,
    feature,
    requiredPlan: "pro",
    message,
  };
  res.status(403).json(body);
}

export async function checkIsPro(userId: string): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") {
    const override = getDevProOverride(userId);
    if (typeof override === "boolean") return override;
  }
  try {
    // Primary check: stripe.subscriptions schema (populated by stripe-replit-sync)
    const result = await db.execute(
      sql`
        SELECT 1
        FROM stripe.subscriptions s
        JOIN public.users u ON u.stripe_customer_id = s.customer
        WHERE u.id = ${userId}
          AND s.status = 'active'
        LIMIT 1
      `,
    );
    if (result.rows.length > 0) return true;
  } catch {
    // stripe schema not available — fall through to column-based check
  }
  try {
    // Fallback: check stripe_subscription_id OR manual_pro columns on the user row
    const userRow = await db.execute(
      sql`SELECT stripe_subscription_id, manual_pro FROM public.users WHERE id = ${userId} LIMIT 1`,
    );
    const row = userRow.rows[0] as { stripe_subscription_id?: string | null; manual_pro?: string | null } | undefined;
    if (row?.manual_pro === "true") return true;
    return typeof row?.stripe_subscription_id === "string" && row.stripe_subscription_id.length > 0;
  } catch {
    return false;
  }
}

export async function getEffectiveIsPro(req: Request, userId: string | null): Promise<boolean> {
  if (userId) return checkIsPro(userId);
  if (process.env.NODE_ENV !== "production") {
    const entry = getDevOverrideForRequest(req);
    if (entry !== undefined) return entry.isPro;
  }
  return false;
}

export async function countAllDecksByUser(userId: string): Promise<number> {
  const result = await db
    .select({ cnt: sql<number>`cast(count(*) as int)` })
    .from(decksTable)
    .where(eq(decksTable.userId, userId));
  return result[0]?.cnt ?? 0;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getQuotaCount(
  key: string,
  metric: string,
  period: string,
): Promise<number> {
  const result = await db.execute(
    sql`SELECT count FROM quota_usage WHERE key = ${key} AND metric = ${metric} AND period = ${period}`,
  );
  const row = result.rows[0] as { count?: unknown } | undefined;
  if (!row) return 0;
  return typeof row.count === "number"
    ? row.count
    : parseInt(String(row.count ?? "0"), 10);
}

async function incrementQuota(
  key: string,
  metric: string,
  period: string,
): Promise<number> {
  const result = await db.execute(
    sql`
      INSERT INTO quota_usage (key, metric, period, count)
      VALUES (${key}, ${metric}, ${period}, 1)
      ON CONFLICT (key, metric, period) DO UPDATE SET count = quota_usage.count + 1
      RETURNING count
    `,
  );
  const row = result.rows[0] as { count?: unknown } | undefined;
  return typeof row?.count === "number"
    ? row.count
    : parseInt(String(row?.count ?? "1"), 10);
}

export async function checkDeckQuota(
  key: string,
  userId: string | null,
): Promise<{ allowed: boolean; currentCount: number }> {
  if (userId) {
    const dbCount = await countAllDecksByUser(userId);
    return { allowed: dbCount < FREE_TIER.MAX_DECKS, currentCount: dbCount };
  }
  const count = await getQuotaCount(key, "deck_create", "all");
  return { allowed: count < FREE_TIER.MAX_DECKS, currentCount: count };
}

export async function recordDeckCreation(key: string): Promise<void> {
  await incrementQuota(key, "deck_create", "all");
}

export async function checkExportQuota(
  key: string,
): Promise<{ allowed: boolean }> {
  const today = todayUtc();
  const count = await getQuotaCount(key, "apkg_export", today);
  return { allowed: count < FREE_TIER.MAX_APKG_EXPORTS_PER_DAY };
}

export async function recordExport(key: string): Promise<void> {
  const today = todayUtc();
  await incrementQuota(key, "apkg_export", today);
}
