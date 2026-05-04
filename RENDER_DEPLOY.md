# Deploying to Render

This project ships with a `Dockerfile` and `render.yaml` Blueprint that deploy
AnkiGen (frontend + API + database) as a single web service on Render.com.

## What gets deployed

- **Web service** (`anki-generator`) — Docker container running the Express API
  and the built React frontend on a single port (8080).
- **Postgres database** (`anki-generator-db`) — Managed Postgres 16. The
  connection string is injected into the web service automatically as
  `DATABASE_URL`.

## Step-by-step

### 1. Push to GitHub

```bash
git add .
git commit -m "initial deploy"
git push origin main
```

### 2. Create the Blueprint on Render

1. Log in to [dashboard.render.com](https://dashboard.render.com)
2. Click **New → Blueprint**
3. Connect your GitHub account and select this repository
4. Render reads `render.yaml` and proposes the `anki-generator` web service +
   `anki-generator-db` Postgres database
5. Click **Apply**

### 3. Set secrets

When prompted, fill in the one secret value:

| Key | Value |
|-----|-------|
| `OPENROUTER_API_KEY` | Your OpenRouter key — get one free at [openrouter.ai/keys](https://openrouter.ai/keys) |

Everything else (`DATABASE_URL`, `PORT`, `STATIC_DIR`, `NODE_ENV`,
`AI_INTEGRATIONS_OPENAI_BASE_URL`) is pre-configured in `render.yaml`.

### 4. Wait for the first build

The first build takes **5–10 minutes** because Docker has to compile the
`canvas` native module from source. Subsequent deploys are faster due to
layer caching.

Once the build completes, your app will be live at
`https://anki-generator.onrender.com` (or a custom domain if configured).

---

## Required environment variables

| Variable | Source | Notes |
|---|---|---|
| `DATABASE_URL` | Render Postgres (auto-injected) | Wired by `render.yaml` |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Set in `render.yaml` | `https://openrouter.ai/api/v1` |
| `OPENROUTER_API_KEY` | **You provide at deploy time** | Real OpenRouter key (`sk-or-...`) |
| `PORT` | Set in `render.yaml` | `8080` — do not change |
| `STATIC_DIR` | Set in `render.yaml` | `/app/public` — do not change |
| `NODE_ENV` | Set in `render.yaml` | `production` |

---

## Automatic deploys

`render.yaml` sets `autoDeploy: true`. Every push to your default branch
triggers a new build and rolling deploy with zero downtime.

To disable: set `autoDeploy: false` in `render.yaml` or toggle it in the
Render dashboard under **Settings → Deploy**.

---

## Updating environment variables after deploy

1. Go to your service in the Render dashboard
2. **Environment** tab → add or edit variables
3. Click **Save changes** — Render redeploys automatically

---

## Health check

Render polls `GET /api/healthz` every 30 seconds. The endpoint checks:
- PostgreSQL connectivity
- AI provider key presence

If both pass, it returns `200 {"status":"ok"}`. A `503` causes Render to
restart the instance.

---

## Local Docker test before pushing

```bash
# Build the image locally
docker build -t ankigen .

# Run with your real keys
docker run --rm -p 8080:8080 \
  -e DATABASE_URL="postgres://user:pw@host:5432/db" \
  -e AI_INTEGRATIONS_OPENAI_BASE_URL="https://openrouter.ai/api/v1" \
  -e OPENROUTER_API_KEY="sk-or-..." \
  ankigen

# Or use docker-compose (spins up Postgres for you)
cp .env.example .env   # then set OPENROUTER_API_KEY in .env
docker compose up --build
```

Open http://localhost:8080 to confirm everything works before pushing to GitHub.

---

## Notes

- The Android APK builder requires the Android SDK at `/home/runner/android-sdk`
  and only works in the Replit dev environment. On Render, it logs a warning
  and the rest of the app is unaffected.
- Database migrations run automatically on every startup via
  `ensureDatabaseSchema()` — no separate migration step needed.
- The app is stateless except for the database; you can scale horizontally
  by adding more Render instances pointing at the same `DATABASE_URL`.
