# Stripe Local Development Guide

This guide covers everything needed to run Stripe subscription payments locally.

## Required Environment Variables

Set these in your Replit Secrets panel (or a local `.env` file):

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...` for test mode) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret from `stripe listen` output |
| `STRIPE_PRICE_ID` | Monthly price ID (`price_...`) printed by the setup script |
| `DATABASE_URL` | PostgreSQL connection string |

## One-Time Setup

### 1. Get your Stripe keys

Go to [dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys) and copy your **test secret key** (`sk_test_...`).

### 2. Set STRIPE_SECRET_KEY

Add `STRIPE_SECRET_KEY=sk_test_...` to your Replit Secrets.

### 3. Run the setup script

```bash
pnpm tsx scripts/stripe-setup.ts
```

This creates the **AnkiGen Pro** product and a `$9.99/month` price in your Stripe test account.
To use a different price, set `SUBSCRIPTION_PRICE_USD` (in cents) before running:

```bash
SUBSCRIPTION_PRICE_USD=1499 pnpm tsx scripts/stripe-setup.ts  # $14.99/month
```

### 4. Set STRIPE_PRICE_ID

Copy the `price_...` ID printed by the script and add it to Replit Secrets as `STRIPE_PRICE_ID`.

## Local Webhook Forwarding

Stripe webhooks are how the server learns about successful payments and subscription changes.
In local dev you need the Stripe CLI to forward events to your server.

### Install the Stripe CLI

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Linux
curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg
echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-stretch stable main" | sudo tee -a /etc/apt/sources.list.d/stripe.list
sudo apt update && sudo apt install stripe
```

### Forward events to your local server

```bash
stripe listen --forward-to http://localhost:8080/api/webhooks/stripe
```

The CLI prints a webhook signing secret like `whsec_...`. Add it to Replit Secrets as `STRIPE_WEBHOOK_SECRET`.

## Testing a Checkout

### Via the pricing page (recommended)

Open the frontend at `http://localhost:23060/pricing` and click **Get Pro**. The page calls the API, creates a Checkout session, and redirects you to Stripe automatically.

### Via curl

```bash
# POST to start a checkout session (requires an authenticated session cookie)
curl -X POST http://localhost:8080/api/subscription/checkout \
  -H "Content-Type: application/json" \
  -d '{"priceId":"$STRIPE_PRICE_ID"}'
```

The response contains a `url` — open it in your browser to complete the checkout.
After a successful payment you will be redirected to `http://localhost:8080/pricing?success=1`.

## Test Cards

| Scenario | Card number | Expiry | CVC |
|---|---|---|---|
| Successful payment | `4242 4242 4242 4242` | Any future | Any |
| Requires 3D Secure | `4000 0027 6000 3184` | Any future | Any |
| Declined | `4000 0000 0000 0002` | Any future | Any |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/subscription/status` | Returns `{ isPro, subscription }` for the logged-in user |
| `GET` | `/api/subscription/products` | Lists active Stripe products with prices |
| `POST` | `/api/subscription/checkout` | Creates a Stripe Checkout session — body: `{ priceId?, origin? }` |
| `POST` | `/api/subscription/portal` | Opens the Stripe billing portal — body: `{ origin? }` |
| `POST` | `/api/webhooks/stripe` | Stripe webhook receiver (raw body required) |

## Free Tier Limits

| Feature | Free | Pro |
|---|---|---|
| Cards per deck | 20 max | Unlimited |
| Decks | 2 max | Unlimited |
| .apkg exports | 1/day | Unlimited |
| Visual cards (images) | Locked | Unlocked |
| Question Bank (MCQs) | Locked | Unlocked |
| AI explanations | Locked | Unlocked |
| Mind maps | Locked | Unlocked |

## Changing the Price

To update the subscription price, run the setup script with the new amount (in cents):

```bash
SUBSCRIPTION_PRICE_USD=1999 pnpm tsx scripts/stripe-setup.ts  # $19.99/month
```

Then update `STRIPE_PRICE_ID` in Replit Secrets to the new `price_...` ID printed by the script.
Old subscribers keep their existing price until they re-subscribe.
