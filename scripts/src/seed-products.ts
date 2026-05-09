import Stripe from 'stripe';

async function getStripeClient(): Promise<Stripe> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  return new Stripe(secretKey);
}

async function createProducts() {
  try {
    const stripe = await getStripeClient();

    console.log('Checking for existing AnkiGen Pro product...');

    const existing = await stripe.products.search({
      query: "name:'AnkiGen Pro' AND active:'true'"
    });

    if (existing.data.length > 0) {
      console.log('AnkiGen Pro product already exists:', existing.data[0].id);
      const prices = await stripe.prices.list({ product: existing.data[0].id, active: true });
      prices.data.forEach((p: Stripe.Price) => {
        console.log(`  Price: ${p.id} — $${((p.unit_amount ?? 0) / 100).toFixed(2)}/${(p.recurring?.interval ?? 'one-time')}`);
      });
      return;
    }

    console.log('Creating AnkiGen Pro product...');
    const product = await stripe.products.create({
      name: 'AnkiGen Pro',
      description: 'Unlimited flashcard generation, QBank creation, AI explanations, mind maps, and more.',
      metadata: {
        tier: 'pro',
      },
    });
    console.log(`Created product: ${product.name} (${product.id})`);

    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 999,
      currency: 'usd',
      recurring: { interval: 'month' },
    });
    console.log(`Created monthly price: $9.99/month (${monthlyPrice.id})`);

    const yearlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 7999,
      currency: 'usd',
      recurring: { interval: 'year' },
    });
    console.log(`Created yearly price: $79.99/year (${yearlyPrice.id})`);

    console.log('\n✓ Products and prices created successfully!');
  } catch (error: unknown) {
    console.error('Error creating products:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

createProducts();
