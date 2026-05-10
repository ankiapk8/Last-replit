import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getUncachableStripeClient } from "../stripeClient";
import { logger } from "../lib/logger";
import { getDevOverrideForRequest } from "../lib/dev-overrides";
import { checkIsPro } from "../lib/free-tier-limits";

const router: IRouter = Router();

function resolveBaseUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  if (process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    return `https://${process.env.CODESPACE_NAME}-5000.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`;
  }
  return `http://localhost:${process.env.FRONTEND_PORT ?? "5000"}`;
}

async function getActiveSubscription(userId: string) {
  const result = await db.execute(sql`SELECT stripe_subscription_id, stripe_customer_id FROM public.users WHERE id = ${userId} AND stripe_subscription_id IS NOT NULL LIMIT 1`);
  const row = result.rows[0] as { stripe_subscription_id?: string; stripe_customer_id?: string } | undefined;
  if (!row?.stripe_subscription_id) return null;
  return { id: row.stripe_subscription_id, status: "active", current_period_end: null, cancel_at_period_end: false };
}

router.get("/subscription/stripe-configured", async (_req, res): Promise<void> => {
  res.json({ configured: !!process.env.STRIPE_SECRET_KEY });
});

router.get("/subscription/status", async (req, res, next): Promise<void> => {
  try {
    res.set("Cache-Control", "no-store");
    if (process.env.NODE_ENV !== "production") {
      const devEntry = getDevOverrideForRequest(req);
      if (devEntry !== undefined) {
        res.json({ isPro: devEntry.isPro, subscription: devEntry.isPro ? { id: "dev-override", status: devEntry.simulated ? "simulated" : "dev-forced", currentPeriodEnd: null, cancelAtPeriodEnd: false } : null, devOverride: true, simulated: devEntry.simulated });
        return;
      }
    }
    if (!req.isAuthenticated()) { res.json({ isPro: false, subscription: null, reason: "unauthenticated" }); return; }
    const userId = req.user!.id;
    const isPro = await checkIsPro(userId);
    const sub = await getActiveSubscription(userId);
    res.json({ isPro, subscription: sub ? { id: sub.id as string, status: sub.status as string, currentPeriodEnd: sub.current_period_end as string | null, cancelAtPeriodEnd: sub.cancel_at_period_end as boolean } : null });
  } catch (err) {
    logger.error({ err }, "Failed to get subscription status");
    res.json({ isPro: false, subscription: null, reason: "error" });
  }
});

router.get("/subscription/products", async (_req, res, next): Promise<void> => {
  try {
    const stripe = await getUncachableStripeClient();
    const [products, prices] = await Promise.all([stripe.products.list({ active: true }), stripe.prices.list({ active: true })]);
    const productList: Record<string, { id: string; name: string; description: string; prices: unknown[] }> = {};
    for (const p of products.data) { if (p.metadata?.tier === "pro") { productList[p.id] = { id: p.id, name: p.name, description: p.description ?? "", prices: [] }; } }
    for (const pr of prices.data) { const productId = typeof pr.product === "string" ? pr.product : pr.product.id; if (productList[productId]) { productList[productId].prices.push({ id: pr.id, unitAmount: pr.unit_amount, currency: pr.currency, recurring: pr.recurring }); } }
    res.json({ data: Object.values(productList) });
  } catch (err) {
    logger.warn({ err }, "Failed to fetch products from Stripe API");
    res.json({ data: [] });
  }
});

router.post("/subscription/checkout", async (req, res, next): Promise<void> => {
  try {
    if (!req.isAuthenticated()) { res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required to subscribe" } }); return; }
    const { priceId } = req.body as { priceId?: string };
    const effectivePriceId = process.env.STRIPE_PRICE_ID || priceId;
    if (!effectivePriceId) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "priceId is required" } }); return; }
    const userId = req.user!.id;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) { res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } }); return; }
    const stripe = await getUncachableStripeClient();
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email ?? undefined, name: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined, metadata: { userId } });
      await db.update(usersTable).set({ stripeCustomerId: customer.id }).where(eq(usersTable.id, userId));
      customerId = customer.id;
    }
    const baseUrl = resolveBaseUrl();
    const session = await stripe.checkout.sessions.create({
      customer: customerId, payment_method_types: ["card"], line_items: [{ price: effectivePriceId, quantity: 1 }], mode: "subscription",
      success_url: `${baseUrl}/pricing?success=1`, cancel_url: `${baseUrl}/pricing?canceled=1`,
    });
    res.json({ url: session.url });
  } catch (err) { next(err); }
});

router.get("/subscription/usage", async (req, res, next): Promise<void> => {
  try {
    const devEntry = process.env.NODE_ENV !== "production" ? getDevOverrideForRequest(req) : undefined;
    if (!req.isAuthenticated() && !devEntry) { res.json({ decks: 0, deckLimit: 2, exports: 0, exportLimit: 1 }); return; }
    const userId = req.isAuthenticated() ? req.user!.id : null;
    const isPro = userId ? await checkIsPro(userId) : (devEntry?.isPro ?? false);
    const deckResult = userId ? await db.execute(sql`SELECT cast(count(*) as int) AS cnt FROM decks WHERE user_id = ${userId}`) : { rows: [{ cnt: 0 }] };
    const deckCount = (deckResult.rows[0] as { cnt?: number } | undefined)?.cnt ?? 0;
    const today = new Date().toISOString().slice(0, 10);
    const exportKey = userId ?? (req.cookies?.["dev-sid"] as string | undefined) ?? "anon";
    const exportResult = await db.execute(sql`SELECT count FROM quota_usage WHERE key = ${exportKey} AND metric = 'apkg_export' AND period = ${today}`);
    const exportCount = typeof (exportResult.rows[0] as { count?: unknown } | undefined)?.count === "number" ? (exportResult.rows[0] as { count: number }).count : parseInt(String((exportResult.rows[0] as { count?: unknown } | undefined)?.count ?? "0"), 10);
    res.json({ decks: deckCount, deckLimit: isPro ? null : 2, exports: exportCount, exportLimit: isPro ? null : 1 });
  } catch (err) {
    logger.error({ err }, "Failed to get usage");
    res.json({ decks: 0, deckLimit: 2, exports: 0, exportLimit: 1 });
  }
});

router.post("/subscription/portal", async (req, res, next): Promise<void> => {
  try {
    if (!req.isAuthenticated()) { res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }); return; }
    const userId = req.user!.id;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user?.stripeCustomerId) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "No billing account found" } }); return; }
    const stripe = await getUncachableStripeClient();
    const baseUrl = resolveBaseUrl();
    const portalSession = await stripe.billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: `${baseUrl}/pricing` });
    res.json({ url: portalSession.url });
  } catch (err) { next(err); }
});

export default router;
