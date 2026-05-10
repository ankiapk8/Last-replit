import Stripe from "stripe";

export async function getUncachableStripeClient(): Promise<Stripe> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY as an environment variable.");
  }
  return new Stripe(secretKey);
}
