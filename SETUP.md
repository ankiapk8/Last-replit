# AnkiGen — Developer Setup Guide

## Overview

AnkiGen is a pnpm monorepo with two main services:

| Service | Path | Default port |
|---|---|---|
| **API server** (Express + PostgreSQL) | `artifacts/api-server` | `3001` |
| **Frontend** (React + Vite) | `artifacts/anki-generator` | `5173` |

In development the Vite dev server automatically proxies all `/api/*` requests to the local API server — no CORS configuration needed.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 22 or 24 LTS | https://nodejs.org |
| pnpm | 10+ | `npm i -g pnpm@latest` |
| Docker + Compose | any recent | https://docs.docker.com/get-docker/ |
| Git | any | https://git-scm.com |

> **VS Code extensions (recommended):** ESLint, Prettier, Tailwind CSS IntelliSense, Prisma/Drizzle Studio

---

## Local Development

### 1. Clone and install

```bash
git clone <your-repo-url>
cd ankigen
pnpm install
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```env
# Required — get a free key at https://openrouter.ai/keys
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxxxxxxxxxx

# Database — local Postgres started by Docker Compose
DATABASE_URL=postgres://ankigen:ankigen@localhost:5432/ankigen

# API server port
PORT=3001
```

All other variables have sensible defaults for local dev.

### 3. Start the database

```bash
pnpm db:up
```

This starts a Postgres 16 container and waits until it is healthy. Data persists in a Docker volume between restarts.

### 4. Start the API server

Open a terminal and run:

```bash
pnpm api:dev
```

This starts the API server with `tsx watch` — the process automatically restarts whenever you change a source file. First start will also run `ensureDatabaseSchema()` to create all tables.

You should see:

```
{"level":"info","port":3001,"msg":"Server listening"}
```

### 5. Start the frontend

Open a **second** terminal and run:

```bash
pnpm web:dev
```

This starts Vite on port 5173. All `/api/*` requests are proxied to `http://localhost:3001` automatically.

Open **http://localhost:5173** in your browser.

### 6. (Optional) Open both in VS Code

Add a `.vscode/tasks.json` to launch both services with one keystroke — see the "VS Code Tasks" section below.

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENROUTER_API_KEY` | ✅ | — | AI API key (openrouter.ai) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | ✅ | `https://openrouter.ai/api/v1` | OpenAI-compatible base URL |
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `PORT` | API only | `3001` | Port for the Express API server |
| `AI_TEXT_MODEL` | — | `google/gemini-2.0-flash-001` | Override text model |
| `AI_VISION_MODEL` | — | `google/gemini-2.0-flash-001` | Override vision model |
| `API_PORT` | Frontend only | `3001` | Port to proxy `/api` calls to in dev |
| `NODE_ENV` | — | `development` | Set to `production` for prod builds |
| `STATIC_DIR` | Production | — | Path to pre-built frontend files |
| `BASE_PATH` | Production | `/` | Base URL path (always `/` on Render) |

---

## VS Code Tasks (optional)

Create `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "API server",
      "type": "shell",
      "command": "pnpm api:dev",
      "group": "build",
      "presentation": { "panel": "dedicated", "group": "dev" },
      "isBackground": true
    },
    {
      "label": "Frontend",
      "type": "shell",
      "command": "pnpm web:dev",
      "group": "build",
      "presentation": { "panel": "dedicated", "group": "dev" },
      "isBackground": true
    },
    {
      "label": "Start all (dev)",
      "dependsOn": ["API server", "Frontend"],
      "group": { "kind": "build", "isDefault": true }
    }
  ]
}
```

Press **Ctrl+Shift+B** (or **Cmd+Shift+B** on Mac) to start both services.

---

## Production Build (Docker)

To test the exact production build locally:

```bash
# Build the Docker image
docker build -t ankigen .

# Run it (needs Postgres — use docker-compose)
docker compose up
```

The app is served at **http://localhost:8080** (frontend + API on the same port — the API serves the built frontend as static files).

---

## Deploy to Render.com

The repository includes a `render.yaml` blueprint that provisions everything automatically.

### Steps

1. **Push your code to GitHub** (or GitLab/Bitbucket).

2. **Create a Render account** at https://render.com if you don't have one.

3. **New Blueprint** → connect your repository → Render detects `render.yaml` automatically.

4. **Set the secret environment variable** when prompted:
   - `OPENROUTER_API_KEY` → paste your key from https://openrouter.ai/keys

5. **Click Deploy**. Render will:
   - Provision a managed PostgreSQL 16 database (`anki-generator-db`)
   - Build the Docker image (Dockerfile in the repo root)
   - Wire `DATABASE_URL` from the database to the web service automatically
   - Run the app on a public `.onrender.com` URL

### What `render.yaml` provisions

| Resource | Type | Plan |
|---|---|---|
| `anki-generator` | Web service (Docker) | Starter |
| `anki-generator-db` | PostgreSQL 16 | Basic 256 MB |

### First deploy time

The Docker build takes **5–10 minutes** on first deploy because it compiles native dependencies (`canvas`, `tesseract.js`). Subsequent deploys are faster thanks to Docker layer caching.

### Health check

Render pings `/api/healthz` every 30 seconds. If it fails 3 times the service is restarted.

### Environment variables on Render

| Variable | Source |
|---|---|
| `DATABASE_URL` | Auto-linked from `anki-generator-db` |
| `PORT` | Set to `8080` in `render.yaml` |
| `NODE_ENV` | Set to `production` in `render.yaml` |
| `STATIC_DIR` | Set to `/app/public` in `render.yaml` |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Set to OpenRouter URL in `render.yaml` |
| `OPENROUTER_API_KEY` | **You must set this** (marked `sync: false`) |

To add or edit env vars after deploy: Render Dashboard → your web service → **Environment**.

---

## Local Subscription Testing

AnkiGen has a built-in dev-only subscription control panel (no Stripe required) and an optional path for real Stripe test-mode checkout.

### Option A — Dev override panel (no Stripe key needed)

When running in development (`NODE_ENV=development`), a **Dev Mode** panel appears in the bottom-left corner of the app. It lets you instantly switch between Free and Pro plans:

1. Log in with Replit auth (visit `http://localhost:5173` and click the login link in the header).
2. Open the **Dev Mode** panel in the bottom-left corner.
3. Click **"Simulate Subscribe"** — this calls `POST /api/dev/simulate-subscribe` and marks your session as Pro without touching Stripe.
4. The app immediately unlocks all Pro features (visual cards, Q-bank, mind maps, unlimited exports).
5. Click **"Cancel Simulated Sub"** to revert to Free.
6. The override **persists across page refreshes** (stored in `localStorage`).

The override badge **DEV PRO** / **DEV FREE** also appears in the top navigation bar so you always know which mode is active.

> Dev override routes are never registered in `NODE_ENV=production` — they are compiled-out and not reachable in deployed builds.

---

### Option B — Real Stripe test-mode checkout

Use this when you want to test the actual Stripe checkout flow end-to-end.

#### 1. Create a Stripe test product

1. Sign up at https://stripe.com and enable **Test mode** (toggle in the dashboard).
2. Go to **Products** → **+ Add product**.
3. Name it (e.g. "AnkiGen Pro"), add a **recurring monthly price** (e.g. $9.99/month).
4. Copy the **Price ID** — it looks like `price_1Abc...`.

#### 2. Set environment variables

Add these to your `.env`:

```env
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxx
STRIPE_PRICE_ID=price_1AbcXxxxxxxxxxx
```

#### 3. Forward webhooks with the Stripe CLI

Install the Stripe CLI: https://stripe.com/docs/stripe-cli

```bash
stripe listen --forward-to localhost:3001/api/stripe/webhook
```

Copy the **webhook signing secret** printed by the CLI (starts with `whsec_`) and add it to `.env`:

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxx
```

Restart the API server to pick up the new variables.

#### 4. Test the checkout flow

1. Open the app, go to **/pricing**.
2. Click **Upgrade to Pro** → you'll be redirected to Stripe's hosted checkout page.
3. Use test card `4242 4242 4242 4242`, any future date, any CVC.
4. After success you'll be redirected back and the app shows Pro status.

#### 5. Test subscription cancellation

In the Stripe test dashboard: **Customers** → find the test customer → **Subscriptions** → cancel. The webhook updates the DB and the app reverts to Free on next status check.

---

## Database Schema

The schema is applied automatically on startup via `ensureDatabaseSchema()` — no manual migration needed. Tables created:

- `decks`, `cards` — flashcard decks
- `qbanks`, `questions` — question banks
- `generations` — AI generation history
- `mind_maps` — AI-generated mind maps
- `sessions`, `users` — auth sessions
- `user_topics` — study planner data
- `feedback` — user feedback

---

## Useful Commands

```bash
# Install / update dependencies
pnpm install

# Type-check everything
pnpm typecheck

# Start local Postgres
pnpm db:up

# Stop local Postgres
pnpm db:down

# Start API server (with file watching)
pnpm api:dev

# Start Vite frontend (port 5173)
pnpm web:dev

# Full production build (all packages)
pnpm build

# Docker Compose (full stack locally)
docker compose up --build
```
