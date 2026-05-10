# Deploying to Render

This project ships with a `Dockerfile` and `render.yaml` Blueprint that deploy
AnkiGen (frontend + API + database) as a single web service on Render.com.

## What gets deployed

- **Web service** (`anki-generator`) — Docker container running the new Express API
  server (`api-new-server`) and the built React frontend on a single port (8080).
- **Postgres database** (`anki-generator-db`) — Managed Postgres 16. The
  connection string is injected into the web service automatically as
  `DATABASE_URL`.

## Architecture

The new API server (`api-new-server/`) is a clean rebuild with:

- **Database-backed logging** — All logs saved to PostgreSQL `server_logs` table.
  Logs persist across restarts and are queryable via `GET /api/logs` (admin only).
- **File-based log fallback** — When DB is unavailable, logs write to local files.
- **Consistent error responses** — Every endpoint returns standardized
  `{ error: { code, message, details, request_id } }` format.
- **Request correlation** — Every request gets a unique `X-Request-Id` header
  for tracing through logs.
- **DB-backed rate limiting & caching** — Survives restarts, works across instances.
- **Unified AI client** — All AI calls centralized with automatic OpenRouter → Ollama fallback.
- **Zero frontend changes** — All existing API endpoints preserved exactly.

## Step-by-step

### 1. Push to GitHub

```bash
git add .
git commit -m "rebuild api server with db-backed logging"
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

When prompted, fill in these secret values:

| Key | Value |
|-----|-------|
| `OPENROUTER_API_KEY` | Your OpenRouter key — get one free at [openrouter.ai/keys](https://openrouter.ai/keys) |
| `OLLAMA_CLOUD_API_KEY` | Your Ollama Cloud key — get one at [ollama.com](https://ollama.com) |

Everything else (`DATABASE_URL`, `PORT`, `STATIC_DIR`, `NODE_ENV`, logging config)
is pre-configured in `render.yaml`.

### 4. Wait for the first build

The first build takes **5–10 minutes** because Docker has to compile the
`canvas` native module from source. Subsequent deploys are faster due to
layer caching.

---

## Required environment variables

| Variable | Source | Notes |
|---|---|---|
| `DATABASE_URL` | Render Postgres (auto-injected) | Wired by `render.yaml` |
| `OPENROUTER_API_KEY` | **You provide at deploy time** | Real OpenRouter key (`sk-or-...`) |
| `OLLAMA_CLOUD_API_KEY` | **You provide at deploy time** | Ollama Cloud key for cross-provider fallback |
| `PORT` | Set in `render.yaml` | `8080` — do not change |
| `STATIC_DIR` | Set in `render.yaml` | `/app/public` — do not change |
| `NODE_ENV` | Set in `render.yaml` | `production` |
| `LOG_LEVEL` | Set in `render.yaml` | `info` — controls minimum log level |
| `LOG_TO_FILE` | Set in `render.yaml` | `true` — enables file-based log fallback |
| `LOG_RETENTION_DAYS` | Set in `render.yaml` | `30` — auto-delete logs older than N days |

---

## Health check

Render polls `GET /api/healthz` every 30 seconds. The endpoint checks:
- PostgreSQL connectivity
- AI provider key presence

If both pass, it returns `200 {"status":"ok"}`. A `503` causes Render to
restart the instance.

---

## Viewing logs

### In the database (recommended for production)

The new API server saves all logs to the `server_logs` table. Admins can query:

```
GET /api/logs?level=error&limit=50&since=24h
```

This requires admin/moderator authentication.

### In Render dashboard

Standard stdout/stderr logs are available in the Render dashboard under
**Logs** for the web service.

### Log file fallback

When the database is unavailable, logs are written to local files at
`/app/api-new-server/logs/server.log` (rotating, max 10MB per file).

---

## Local Docker test before pushing

```bash
# Build the image locally
docker build -t ankigen .

# Run with your real keys
docker run --rm -p 8080:8080 \
  -e DATABASE_URL="postgres://user:pw@host:5432/db" \
  -e OPENROUTER_API_KEY="sk-or-..." \
  ankigen

# Or use docker-compose (spins up Postgres for you)
cp .env.example .env   # then set OPENROUTER_API_KEY in .env
docker compose up --build
```

Open http://localhost:8080 to confirm everything works before pushing to GitHub.

---

## Notes

- Database migrations run automatically on every startup via
  `ensureDatabaseSchema()` — no separate migration step needed. The new
  `server_logs` and `generation_status` tables are created automatically.
- The app is stateless except for the database; you can scale horizontally
  by adding more Render instances pointing at the same `DATABASE_URL`.
- The new API server is fully compatible with the existing frontend — zero
  frontend code changes required.
