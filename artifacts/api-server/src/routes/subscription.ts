import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getUncachableStripeClient } from "../stripeClient";
import { logger } from "../lib/logger";
import { getDevOverrideForRequest } from "../lib/dev-overrides";
import { checkIsPro } from "../lib/free-tier-limits";

const router: IRouter = Router();

function resolveBaseUrl(): string {
  if (process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`;
  }
  if (process.env.NODE_ENV === 'development') {
    return `http://localhost:${process.env.PORT ?? '8080'}`;
  }
  throw new Error(
    'Cannot resolve base URL for Stripe redirects: set REPLIT_DOMAINS (production) ' +
    'or run with NODE_ENV=development (local dev).'
  );
}

async function getActiveSubscription(userId: string) {
  const result = await db.execute(
    sql`
      SELECT s.id, s.status, s.current_period_end, s.cancel_at_period_end
      FROM stripe.subscriptions s
      JOIN public.users u ON u.stripe_customer_id = s.customer
      WHERE u.id = ${userId}
        AND s.status = 'active'
      LIMIT 1
    `
  );
  return result.rows[0] ?? null;
}

router.get("/subscription/stripe-configured", async (_req, res): Promise<void> => {
  const hasDirectKey = !!process.env.STRIPE_SECRET_KEY;
  const hasConnector = !!(process.env.REPLIT_CONNECTORS_HOSTNAME &&
    (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL));
  res.json({ configured: hasDirectKey || hasConnector });
});

router.get("/subscription/status", async (req, res, next): Promise<void> => {
  try {
    res.set("Cache-Control", "no-store");
    if (process.env.NODE_ENV !== "production") {
      const devEntry = getDevOverrideForRequest(req);
      if (devEntry !== undefined) {
        res.json({
          isPro: devEntry.isPro,
          subscription: devEntry.isPro
            ? { id: "dev-override", status: devEntry.simulated ? "simulated" : "dev-forced", currentPeriodEnd: null, cancelAtPeriodEnd: false }
            : null,
          devOverride: true,
          simulated: devEntry.simulated,
        });
        return;
      }
    }

    if (!req.isAuthenticated()) {
      res.json({ isPro: false, subscription: null, reason: "unauthenticated" });
      return;
    }

    const userId = req.user!.id;
    const isPro = await checkIsPro(userId);
    const sub = await getActiveSubscription(userId);

    res.json({
      isPro,
      subscription: sub ? {
        id: sub.id as string,
        status: sub.status as string,
        currentPeriodEnd: sub.current_period_end as string | null,
        cancelAtPeriodEnd: sub.cancel_at_period_end as boolean,
      } : null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to get subscription status");
    res.json({ isPro: false, subscription: null, reason: "error" });
  }
});

router.get("/subscription/products", async (_req, res, next): Promise<void> => {
  try {
    const result = await db.execute(
      sql`
        SELECT
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring
        FROM stripe.products p
        JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
          AND p.metadata->>'tier' = 'pro'
        ORDER BY pr.unit_amount ASC
      `
    );

    const products: Record<string, { id: string; name: string; description: string; prices: any[] }> = {};
    for (const row of result.rows as any[]) {
      if (!products[row.product_id]) {
        products[row.product_id] = {
          id: row.product_id,
          name: row.product_name,
          description: row.product_description,
          prices: [],
        };
      }
      products[row.product_id].prices.push({
        id: row.price_id,
        unitAmount: row.unit_amount,
        currency: row.currency,
        recurring: row.recurring,
      });
    }

    res.json({ data: Object.values(products) });
  } catch (err) {
    logger.warn({ err }, "Failed to fetch products from stripe schema — Stripe may not be initialized yet");
    res.json({ data: [] });
  }
});

router.post("/subscription/checkout", async (req, res, next): Promise<void> => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Authentication required to subscribe" });
      return;
    }

    const { priceId } = req.body as { priceId?: string };

    const effectivePriceId = process.env.STRIPE_PRICE_ID || priceId;
    if (!effectivePriceId) {
      res.status(400).json({ error: "priceId is required (or set STRIPE_PRICE_ID env var)" });
      return;
    }

    const userId = req.user!.id;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const stripe = await getUncachableStripeClient();

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
        metadata: { userId },
      });
      await db.update(usersTable)
        .set({ stripeCustomerId: customer.id })
        .where(eq(usersTable.id, userId));
      customerId = customer.id;
    }

    const baseUrl = resolveBaseUrl();
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: effectivePriceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${baseUrl}/pricing?success=1`,
      cancel_url: `${baseUrl}/pricing?canceled=1`,
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

router.get("/subscription/usage", async (req, res, next): Promise<void> => {
  try {
    const devEntry = process.env.NODE_ENV !== "production" ? getDevOverrideForRequest(req) : undefined;
    if (!req.isAuthenticated() && !devEntry) {
      res.json({ decks: 0, deckLimit: 2, exports: 0, exportLimit: 1 });
      return;
    }
    const userId = req.isAuthenticated() ? req.user!.id : null;
    const isPro = userId
      ? await checkIsPro(userId)
      : devEntry?.isPro ?? false;

    const deckResult = userId
      ? await db.execute(sql`SELECT cast(count(*) as int) AS cnt FROM decks WHERE user_id = ${userId}`)
      : { rows: [{ cnt: 0 }] };
    const deckCount = (deckResult.rows[0] as { cnt?: number } | undefined)?.cnt ?? 0;

    const today = new Date().toISOString().slice(0, 10);
    const exportKey = userId ?? (req.cookies?.["dev-sid"] as string | undefined) ?? "anon";
    const exportResult = await db.execute(
      sql`SELECT count FROM quota_usage WHERE key = ${exportKey} AND metric = 'apkg_export' AND period = ${today}`
    );
    const exportCount = typeof (exportResult.rows[0] as { count?: unknown } | undefined)?.count === 'number'
      ? (exportResult.rows[0] as { count: number }).count
      : parseInt(String((exportResult.rows[0] as { count?: unknown } | undefined)?.count ?? '0'), 10);

    res.json({
      decks: deckCount,
      deckLimit: isPro ? null : 2,
      exports: exportCount,
      exportLimit: isPro ? null : 1,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get usage');
    res.json({ decks: 0, deckLimit: 2, exports: 0, exportLimit: 1 });
  }
});

router.post("/subscription/portal", async (req, res, next): Promise<void> => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const userId = req.user!.id;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

    if (!user?.stripeCustomerId) {
      res.status(400).json({ error: "No billing account found" });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const baseUrl = resolveBaseUrl();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${baseUrl}/pricing`,
    });

    res.json({ url: portalSession.url });
  } catch (err) {
    next(err);
  }
});

export default router;
