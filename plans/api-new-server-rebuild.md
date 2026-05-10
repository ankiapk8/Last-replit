# API New Server — Complete Rebuild Plan

## Goal

Rebuild the API server from scratch at `api-new-server/` with:
1. **Proper frontend responses** — consistent error format, correct HTTP status codes, CORS, no silent failures
2. **Database-backed logging** — all logs saved to PostgreSQL so they persist across restarts and are accessible in production (Render, Railway, etc.)
3. **File-based log fallback** — when DB is unavailable, logs write to local files (works everywhere: local dev, Docker, any hosting)
4. **Structured error tracking** — every error captured with context (endpoint, user, request ID, stack trace)
5. **Clean architecture** — separated concerns, reusable middleware, no duplicated code

---

## Architecture Overview

```
api-new-server/
├── package.json
├── tsconfig.json
├── build.mjs
├── src/
│   ├── index.ts                    # Entry point — starts server
│   ├── app.ts                      # Express app setup (middleware, routes, error handler)
│   ├── config.ts                   # Centralized env config with validation
│   │
│   ├── lib/
│   │   ├── logger.ts               # Dual logging: DB + file fallback (pino)
│   │   ├── db-logger.ts            # Database log writer (writes to logs table)
│   │   ├── file-logger.ts          # File log writer (rotating files)
│   │   ├── db.ts                   # Database connection (reuse @workspace/db)
│   │   ├── auth.ts                 # OIDC session management
│   │   ├── auth-types.ts           # Zod auth schemas
│   │   ├── models.ts               # AI model configuration
│   │   ├── ai-client.ts            # Unified AI client (OpenRouter + Ollama fallback)
│   │   ├── rate-limiter.ts         # DB-backed rate limiter (survives restarts)
│   │   ├── response-cache.ts       # DB-backed response cache
│   │   ├── monitor.ts              # Server health monitor (DB-persisted metrics)
│   │   ├── free-tier-limits.ts     # Quota checking
│   │   ├── dev-overrides.ts        # Dev mode Pro overrides
│   │   ├── serialize-card.ts       # Card serialization
│   │   ├── error-handler.ts        # Centralized error formatting
│   │   └── request-context.ts      # Request ID + timing middleware
│   │
│   ├── middlewares/
│   │   ├── authMiddleware.ts       # OIDC session auth
│   │   ├── corsMiddleware.ts       # Proper CORS for all origins
│   │   ├── errorMiddleware.ts      # Global error handler
│   │   ├── requestLogMiddleware.ts # Logs every request/response to DB
│   │   └── validateBody.ts         # Zod body validation helper
│   │
│   ├── routes/
│   │   ├── index.ts                # Route aggregator
│   │   ├── health.ts               # /healthz, /model-info, /test-model, /monitor
│   │   ├── auth.ts                 # /login, /callback, /logout, /auth/user, mobile-auth
│   │   ├── decks.ts               # CRUD decks, merge, export, list
│   │   ├── cards.ts               # CRUD cards, regenerate-batch
│   │   ├── generate.ts            # /generate/stream, /generate/status/:id, /generate-qbank/stream
│   │   ├── extract-pdf.ts         # PDF text extraction + OCR + visual detection
│   │   ├── extract-office.ts      # PPTX/DOCX text extraction
│   │   ├── explain.ts             # /explain (streaming), /explain/batch
│   │   ├── mind-map.ts            # Mind map generation
│   │   ├── qbanks.ts              # QBank CRUD + questions CRUD
│   │   ├── deck-mind-maps.ts      # Deck-scoped mind map storage
│   │   ├── feedback.ts            # Feedback submission + listing
│   │   ├── topics.ts              # User study topics
│   │   ├── generations.ts         # Generation history
│   │   ├── transfer.ts            # Export/import JSON decks
│   │   ├── subscription.ts        # Stripe subscription management
│   │   ├── admin.ts               # Admin user management
│   │   ├── dev.ts                 # Dev-only endpoints (non-production)
│   │   └── logs.ts                # NEW: Query logs (admin only)
│   │
│   └── stripeClient.ts            # Stripe client factory
```

---

## Key Improvements Over Old Server

### 1. Database-Backed Logging (NEW)

**Problem:** Old server uses pino console output only. Logs are lost on restart and invisible in production.

**Solution:** Dual-write logger that saves to both database AND local files.

```sql
-- New table: server_logs
CREATE TABLE IF NOT EXISTS server_logs (
  id bigserial PRIMARY KEY,
  level text NOT NULL DEFAULT 'info',     -- debug, info, warn, error, fatal
  message text NOT NULL,
  endpoint text,                           -- e.g. "POST /api/generate/stream"
  method text,                             -- GET, POST, etc.
  user_id text,                            -- authenticated user or null
  request_id text,                         -- unique per-request UUID
  ip text,                                 -- client IP
  status_code integer,                     -- HTTP response status
  duration_ms integer,                     -- request duration
  metadata jsonb,                          -- arbitrary structured data
  stack text,                              -- error stack trace
  source text NOT NULL DEFAULT 'db',       -- 'db' or 'file' (where log was written)
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Index for fast queries
CREATE INDEX idx_server_logs_level ON server_logs (level);
CREATE INDEX idx_server_logs_endpoint ON server_logs (endpoint);
CREATE INDEX idx_server_logs_created_at ON server_logs (created_at);
CREATE INDEX idx_server_logs_request_id ON server_logs (request_id);
CREATE INDEX idx_server_logs_user_id ON server_logs (user_id);
```

**Logger behavior:**
- **Primary:** Write to `server_logs` table via INSERT
- **Fallback:** If DB write fails, write to local file via pino rotating file transport
- **Dev mode:** Also write to console via pino-pretty
- **Configurable:** `LOG_LEVEL` env var controls minimum level
- **Auto-cleanup:** Logs older than 30 days are pruned (configurable via `LOG_RETENTION_DAYS`)

### 2. Consistent Error Responses (NEW)

**Problem:** Old server returns inconsistent error formats — sometimes `{ error: "string" }`, sometimes raw strings, sometimes no error body.

**Solution:** Standardized error response format across ALL endpoints.

```typescript
// Every error response follows this shape:
{
  "error": {
    "code": "VALIDATION_ERROR",     // machine-readable error code
    "message": "text is required",  // human-readable message
    "details": { ... },             // optional: validation details, etc.
    "request_id": "uuid"            // for log correlation
  }
}
```

**Error codes:**
| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `VALIDATION_ERROR` | 400 | Invalid request body/params |
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | No permission / quota exceeded |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMITED` | 429 | Too many requests |
| `AI_ERROR` | 502 | AI provider error |
| `AI_TIMEOUT` | 504 | AI provider timeout |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | DB or AI not configured |

### 3. Request Context Tracking (NEW)

**Problem:** Old server has no request correlation — can't trace a single request through logs.

**Solution:** Every request gets a unique ID, propagated through all logs.

```typescript
// Middleware assigns: req.requestId = uuid()
// Logger includes: { requestId, method, url, ip, userId }
// Response header: X-Request-Id: <uuid>
```

### 4. Database-Backed Rate Limiter (IMPROVED)

**Problem:** Old server uses in-memory Map — resets on restart, doesn't work with multiple instances.

**Solution:** Rate limit counters stored in PostgreSQL with automatic expiry.

```sql
-- New table: rate_limit_entries
CREATE TABLE IF NOT EXISTS rate_limit_entries (
  key text NOT NULL,              -- IP or user ID
  window_start timestamp NOT NULL,-- start of rate limit window
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
```

### 5. Database-Backed Response Cache (IMPROVED)

**Problem:** Old server uses in-memory LRU cache — lost on restart, not shared across instances.

**Solution:** Cache entries stored in PostgreSQL with TTL.

```sql
-- New table: response_cache
CREATE TABLE IF NOT EXISTS response_cache (
  cache_key text PRIMARY KEY,
  response text NOT NULL,
  expires_at timestamp NOT NULL,
  created_at timestamp DEFAULT now()
);
```

### 6. Unified AI Client (IMPROVED)

**Problem:** Old server duplicates AI client initialization, fallback logic, and error handling in every route file.

**Solution:** Single `ai-client.ts` module used by all routes.

```typescript
// ai-client.ts provides:
// - getAIClient() — cached singleton
// - streamChat() — streaming with fallback
// - completeChat() — non-streaming with fallback
// - All retry, timeout, and fallback logic in ONE place
```

### 7. Database Schema Additions

All new tables are added to `lib/db/src/index.ts` `ensureDatabaseSchema()`:

```sql
-- Server logs (see above)
-- Rate limit entries (see above)
-- Response cache (see above)

-- Generation status (replaces in-memory map)
CREATE TABLE IF NOT EXISTS generation_status (
  id text PRIMARY KEY,              -- UUID
  type text NOT NULL,               -- 'deck' | 'qbank'
  status text NOT NULL DEFAULT 'running', -- 'running' | 'completed' | 'failed'
  user_id text,
  deck_id integer,
  error_message text,
  started_at timestamp DEFAULT now(),
  completed_at timestamp
);

-- Request metrics (replaces in-memory counters)
CREATE TABLE IF NOT EXISTS request_metrics (
  id bigserial PRIMARY KEY,
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code integer NOT NULL,
  duration_ms integer NOT NULL,
  user_id text,
  ip text,
  request_id text,
  created_at timestamp DEFAULT now()
);

-- AI call metrics
CREATE TABLE IF NOT EXISTS ai_call_metrics (
  id bigserial PRIMARY KEY,
  model text NOT NULL,
  endpoint text NOT NULL,
  duration_ms integer NOT NULL,
  success boolean NOT NULL,
  error text,
  created_at timestamp DEFAULT now()
);
```

---

## Route-by-Route Rebuild Checklist

### Health & Monitoring
- [ ] `GET /api/healthz` — DB + AI health checks
- [ ] `GET /api/model-info` — active AI models
- [ ] `POST /api/test-model` — smoke test a model
- [ ] `GET /api/monitor` — comprehensive dashboard (from DB metrics)
- [ ] `GET /api/logs` — NEW: query server logs (admin only)

### Auth
- [ ] `GET /api/auth/user` — current user
- [ ] `GET /api/login` — OIDC login redirect
- [ ] `GET /api/callback` — OIDC callback
- [ ] `GET /api/logout` — logout + session clear
- [ ] `POST /api/mobile-auth/token-exchange` — mobile auth
- [ ] `POST /api/mobile-auth/logout` — mobile logout

### Decks
- [ ] `GET /api/decks` — list decks (with card count)
- [ ] `POST /api/decks` — create deck (with quota check)
- [ ] `GET /api/decks/:id` — get deck + sub-decks
- [ ] `PATCH /api/decks/:id` — update deck
- [ ] `DELETE /api/decks/:id` — delete deck + descendants
- [ ] `GET /api/decks/:id/cards` — list cards (incl. sub-decks)
- [ ] `GET /api/decks/:id/export` — export as CSV
- [ ] `POST /api/decks/merge` — merge multiple decks

### Cards
- [ ] `POST /api/cards` — create card
- [ ] `PATCH /api/cards/:id` — update card
- [ ] `DELETE /api/cards/:id` — delete card
- [ ] `POST /api/cards/regenerate-batch` — batch regenerate

### Generation
- [ ] `POST /api/generate/stream` — SSE card generation (text + visual)
- [ ] `GET /api/generate/status/:id` — polling fallback
- [ ] `POST /api/generate-qbank/stream` — SSE QBank generation

### Extraction
- [ ] `POST /api/extract-pdf` — PDF text + visual detection
- [ ] `POST /api/extract-office` — PPTX/DOCX text extraction

### AI Features
- [ ] `POST /api/explain` — streaming explanation (6 modes)
- [ ] `POST /api/explain/batch` — batch explanation
- [ ] `POST /api/mind-map` — mind map generation

### QBank
- [ ] `GET /api/qbanks` — list QBanks
- [ ] `POST /api/qbanks` — create QBank (Pro only)
- [ ] `GET /api/qbanks/:id` — get QBank + sub-QBanks
- [ ] `PATCH /api/qbanks/:id` — update QBank
- [ ] `DELETE /api/qbanks/:id` — delete QBank
- [ ] `GET /api/qbanks/:id/questions` — list questions
- [ ] `PATCH /api/questions/:id` — update question
- [ ] `DELETE /api/questions/:id` — delete question

### Deck Mind Maps
- [ ] `GET /api/decks/:id/mind-maps` — list mind maps
- [ ] `POST /api/decks/:id/mind-maps` — save mind map
- [ ] `DELETE /api/decks/:id/mind-maps/:mapId` — delete mind map

### Feedback
- [ ] `POST /api/feedback` — submit feedback
- [ ] `GET /api/feedback` — list feedback (admin)

### Topics
- [ ] `GET /api/topics` — get user topics
- [ ] `PUT /api/topics/:storageKey` — upsert topics

### Transfer
- [ ] `GET /api/export-all-json` — export all decks as JSON
- [ ] `GET /api/decks/:id/export-json` — export single deck
- [ ] `POST /api/import-deck-json` — import deck JSON

### Subscription
- [ ] `GET /api/subscription/stripe-configured`
- [ ] `GET /api/subscription/status`
- [ ] `GET /api/subscription/products`
- [ ] `POST /api/subscription/checkout`
- [ ] `GET /api/subscription/usage`
- [ ] `POST /api/subscription/portal`
- [ ] `POST /api/stripe/webhook` — Stripe webhook

### Generations
- [ ] `GET /api/generations` — generation history
- [ ] `DELETE /api/generations` — clear history

### Admin
- [ ] `GET /api/admin/users` — list users (paginated, search)
- [ ] `PATCH /api/admin/users/:id` — update user role/Pro status

### Dev (non-production only)
- [ ] `POST /api/dev/set-pro`
- [ ] `DELETE /api/dev/set-pro`
- [ ] `GET /api/dev/status`
- [ ] `POST /api/dev/simulate-subscribe`
- [ ] `DELETE /api/dev/simulate-subscribe`
- [ ] `GET /api/dev/usage`
- [ ] `POST /api/dev/reset-quota`

---

## Implementation Order

### Phase 1: Foundation
1. Create `api-new-server/` directory structure
2. Set up `package.json`, `tsconfig.json`, `build.mjs`
3. Create `src/config.ts` — env validation
4. Create `src/lib/logger.ts` — dual DB+file logger
5. Create `src/lib/error-handler.ts` — standardized errors
6. Create `src/lib/request-context.ts` — request ID middleware
7. Create `src/middlewares/` — auth, cors, error, request logging
8. Create `src/lib/ai-client.ts` — unified AI client
9. Update `lib/db/src/index.ts` — add new tables to schema

### Phase 2: Core Routes
10. `src/routes/health.ts`
11. `src/routes/auth.ts`
12. `src/routes/decks.ts`
13. `src/routes/cards.ts`
14. `src/routes/feedback.ts`
15. `src/routes/topics.ts`

### Phase 3: AI Routes
16. `src/routes/generate.ts`
17. `src/routes/extract-pdf.ts`
18. `src/routes/extract-office.ts`
19. `src/routes/explain.ts`
20. `src/routes/mind-map.ts`

### Phase 4: QBank & Data
21. `src/routes/qbanks.ts`
22. `src/routes/deck-mind-maps.ts`
23. `src/routes/generations.ts`
24. `src/routes/transfer.ts`

### Phase 5: Billing & Admin
25. `src/routes/subscription.ts`
26. `src/routes/admin.ts`
27. `src/routes/dev.ts`
28. `src/routes/logs.ts` (NEW)

### Phase 6: Integration
29. Wire up `src/app.ts` — all middleware + routes
30. Wire up `src/index.ts` — startup sequence
31. Update `pnpm-workspace.yaml` — add `api-new-server` to workspace
32. Test build
33. Test all endpoints against frontend

---

## Log Query API (NEW)

```
GET /api/logs?level=error&endpoint=/api/generate&limit=50&since=24h
```

Returns paginated logs for admin debugging. Only accessible to users with `admin` or `moderator` role.

---

## Environment Variables

All existing env vars are preserved. New ones:

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Minimum log level |
| `LOG_RETENTION_DAYS` | `30` | Auto-delete logs older than N days |
| `LOG_TO_FILE` | `true` | Enable file-based log fallback |
| `LOG_FILE_PATH` | `./logs/server.log` | Log file path |
| `LOG_MAX_FILE_SIZE` | `10m` | Max log file size before rotation |
| `LOG_CLEANUP_CRON` | `0 0 * * *` | Cron for log cleanup (daily midnight) |

---

## Frontend Compatibility

ALL existing API endpoints, request bodies, and response shapes are preserved exactly. The frontend requires zero changes. The only additions are:
- `X-Request-Id` response header (for debugging)
- Consistent error response shape (frontend should already handle `{ error: ... }`)
- New `GET /api/logs` endpoint (admin panel)
