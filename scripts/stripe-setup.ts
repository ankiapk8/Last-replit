#!/usr/bin/env tsx
/**
 * One-time Stripe setup script.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... pnpm tsx scripts/stripe-setup.ts
 *
 * What it does:
 *   1. Creates (or retrieves) the "AnkiGen Pro" product in Stripe
 *   2. Creates a monthly recurring price using SUBSCRIPTION_PRICE_USD cents (default 999 = $9.99)
 *   3. Prints the STRIPE_PRICE_ID you must set as an environment variable
 *   4. Prints the Stripe CLI webhook forwarding command for local dev
 */

import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error('ERROR: STRIPE_SECRET_KEY environment variable is required.');
  console.error('Run: STRIPE_SECRET_KEY=sk_test_... pnpm tsx scripts/stripe-setup.ts');
  process.exit(1);
}

const stripe = new Stripe(secretKey);

const PRODUCT_METADATA_KEY = 'tier';
const PRODUCT_METADATA_VALUE = 'pro';
const PRODUCT_NAME = 'AnkiGen Pro';

const priceUsd = parseInt(process.env.SUBSCRIPTION_PRICE_USD ?? '999', 10);
if (isNaN(priceUsd) || priceUsd <= 0) {
  console.error('ERROR: SUBSCRIPTION_PRICE_USD must be a positive integer (cents). E.g. 999 = $9.99');
  process.exit(1);
}

async function run() {
  console.log(`\nAnkiGen — Stripe Setup`);
  console.log(`======================`);
  console.log(`Price: ${priceUsd} cents ($${(priceUsd / 100).toFixed(2)}/month)\n`);

  let product: Stripe.Product | null = null;

  const existingProducts = await stripe.products.list({ limit: 100, active: true });
  for (const p of existingProducts.data) {
    if (p.metadata[PRODUCT_METADATA_KEY] === PRODUCT_METADATA_VALUE) {
      product = p;
      console.log(`Found existing product: ${p.name} (${p.id})`);
      break;
    }
  }

  if (!product) {
    product = await stripe.products.create({
      name: PRODUCT_NAME,
      metadata: { [PRODUCT_METADATA_KEY]: PRODUCT_METADATA_VALUE },
      description: 'Full access to AnkiGen: unlimited cards, QBanks, visual cards, AI explanations, mind maps, and .apkg export.',
    });
    console.log(`Created product: ${product.name} (${product.id})`);
  }

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: priceUsd,
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { created_by: 'stripe-setup-script' },
  });

  console.log(`Created price: ${price.id} ($${(priceUsd / 100).toFixed(2)}/month)\n`);

  console.log(`======================`);
  console.log(`NEXT STEPS`);
  console.log(`======================\n`);
  console.log(`1. Set this environment variable in your Replit Secrets (or .env):\n`);
  console.log(`   export STRIPE_PRICE_ID=${price.id}\n`);
  console.log(`2. For local webhook forwarding, run in a separate terminal:\n`);
  console.log(`   stripe listen --forward-to http://localhost:8080/api/webhooks/stripe\n`);
  console.log(`   Then set the printed webhook signing secret as:\n`);
  console.log(`   STRIPE_WEBHOOK_SECRET=whsec_...\n`);
  console.log(`3. Test card: 4242 4242 4242 4242, any future expiry, any CVC\n`);
  console.log(`See STRIPE_LOCAL.md for the complete local dev guide.\n`);
}

run().catch((err) => {
  console.error('Setup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
