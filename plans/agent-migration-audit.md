# Agent Migration Audit & Plan

## Phase 1 — Codebase Audit

### 1.1 Framework & Runtime

- **Runtime**: Node.js 24 (Docker base: `node:24-bookworm-slim`)
- **Language**: TypeScript 5.9 (`strict` mode via tsconfig)
- **Framework**: Express 5 (ESM, `"type": "module"`)
- **Build**: esbuild via custom `build.mjs`
- **Package manager**: pnpm 10.26.1 (monorepo via `pnpm-workspace.yaml`)
- **Process manager**: Direct `node` (no PM2/forever)

### 1.2 Dependency Graph

**Workspace packages** (pnpm monorepo):
```
@workspace/api-new-server      → Main API server (Express)
@workspace/db                   → Drizzle ORM + PostgreSQL schema
@workspace/api-zod              → Zod validation schemas (generated from OpenAPI)
@workspace/api-client-react     → React API client (generated from OpenAPI)
@workspace/api-spec             → OpenAPI spec + orval code generation
@workspace/integrations-openai-ai-server  → OpenAI SDK wrapper (multi-provider)
@workspace/integrations-openai-ai-react  → React audio hooks
artifacts/anki-generator        → Frontend (React + Vite + Capacitor for Android)
artifacts/mockup-sandbox        → UI component mockups
scripts                         → Dev scripts
```

**Key runtime dependencies**:
| Package | Purpose |
|---------|---------|
| `express@5` | HTTP server |
| `drizzle-orm` | PostgreSQL ORM |
| `pino@9` | Structured logging |
| `pino-http` | HTTP request logging |
| `pino-roll` | Log file rotation |
| `zod` | Runtime validation |
| `openid-client` | OIDC authentication (Replit) |
| `stripe@22` | Payments |
| `pdfjs-dist@5` | PDF text extraction |
| `tesseract.js@7` | OCR for scanned PDFs |
| `canvas@3` | Server-side canvas rendering (for pdfjs + OCR) |
| `jszip` | ZIP processing (Office file extraction) |
| `fast-xml-parser` | XML parsing (Office files) |
| `multer@2` | File upload handling |
| `helmet@8` | Security headers |
| `compression` | Response compression |
| `cors@2` | CORS handling |
| `cookie-parser` | Cookie parsing |
| `anki-apkg-export` | Anki .apkg file generation |

### 1.3 API Routes (Complete Inventory)

All routes mounted under `/api` via [`api-new-server/src/routes/index.ts`](api-new-server/src/routes/index.ts:1):

| Method | Path | Auth | File | Purpose |
|--------|------|------|------|---------|
| GET | `/api/healthz` | Public | `routes/health.ts` | Health check + dependency status |
| GET | `/api/model-info` | Public | `routes/health.ts` | AI model configuration info |
| POST | `/api/test-model` | Admin | `routes/health.ts` | Test AI model connectivity |
| GET | `/api/monitor` | Admin | `routes/health.ts` | Server metrics snapshot |
| GET | `/api/auth/user` | Public | `routes/auth.ts` | Get current user |
| GET | `/api/login` | Public | `routes/auth.ts` | OIDC login redirect |
| GET | `/api/callback` | Public | `routes/auth.ts` | OIDC callback |
| GET | `/api/logout` | Public | `routes/auth.ts` | Logout |
| POST | `/api/mobile-auth/token-exchange` | Public | `routes/auth.ts` | Mobile auth token exchange |
| POST | `/api/mobile-auth/logout` | Public | `routes/auth.ts` | Mobile logout |
| GET | `/api/subscription/stripe-configured` | Public | `routes/subscription.ts` | Check Stripe config |
| GET | `/api/subscription/status` | Public | `routes/subscription.ts` | Get subscription status |
| GET | `/api/subscription/products` | Public | `routes/subscription.ts` | List Stripe products |
| POST | `/api/subscription/checkout` | Auth | `routes/subscription.ts` | Create checkout session |
| GET | `/api/subscription/usage` | Public | `routes/subscription.ts` | Get usage quotas |
| POST | `/api/subscription/portal` | Auth | `routes/subscription.ts` | Stripe billing portal |
| GET | `/api/decks` | Auth | `routes/decks.ts` | List decks |
| POST | `/api/decks` | Auth | `routes/decks.ts` | Create deck |
| GET | `/api/decks/:id` | Auth | `routes/decks.ts` | Get deck + sub-decks |
| PATCH | `/api/decks/:id` | Auth | `routes/decks.ts` | Update deck |
| DELETE | `/api/decks/:id` | Auth | `routes/decks.ts` | Delete deck (recursive) |
| POST | `/api/decks/merge` | Auth | `routes/decks.ts` | Merge multiple decks |
| GET | `/api/decks/:id/cards` | Auth | `routes/decks.ts` | List deck cards |
| GET | `/api/decks/:id/export` | Auth | `routes/decks.ts` | Export deck as CSV |
| GET | `/api/decks/:id/mind-maps` | Auth | `routes/deck-mind-maps.ts` | List mind maps |
| POST | `/api/decks/:id/mind-maps` | Auth | `routes/deck-mind-maps.ts` | Create mind map |
| DELETE | `/api/decks/:id/mind-maps/:mapId` | Auth | `routes/deck-mind-maps.ts` | Delete mind map |
| POST | `/api/cards` | Auth | `routes/cards.ts` | Create card |
| PATCH | `/api/cards/:id` | Auth | `routes/cards.ts` | Update card |
| DELETE | `/api/cards/:id` | Auth | `routes/cards.ts` | Delete card |
| POST | `/api/cards/regenerate-batch` | Auth | `routes/cards.ts` | Batch regenerate cards |
| POST | `/api/generate/stream` | Auth+Rate | `routes/generate.ts` | SSE card generation |
| GET | `/api/generate/status/:id` | Auth | `routes/generate.ts` | Generation status |
| POST | `/api/generate-qbank/stream` | Auth+Rate | `routes/generate.ts` | SSE QBank generation |
| POST | `/api/extract-pdf` | Auth | `routes/extract-pdf.ts` | PDF text extraction |
| POST | `/api/extract-office` | Auth | `routes/extract-office.ts` | Office file extraction |
| POST | `/api/explain` | Auth+Rate | `routes/explain.ts` | AI explanation (streaming) |
| POST | `/api/explain/batch` | Auth+Rate | `routes/explain.ts` | Batch explanations |
| POST | `/api/mind-map` | Auth+Rate | `routes/mind-map.ts` | Generate mind map |
| GET | `/api/qbanks` | Auth | `routes/qbanks.ts` | List QBanks |
| POST | `/api/qbanks` | Auth | `routes/qbanks.ts` | Create QBank |
| GET | `/api/qbanks/:id` | Auth | `routes/qbanks.ts` | Get QBank |
| PATCH | `/api/qbanks/:id` | Auth | `routes/qbanks.ts` | Update QBank |
| DELETE | `/api/qbanks/:id` | Auth | `routes/qbanks.ts` | Delete QBank |
| GET | `/api/qbanks/:id/questions` | Auth | `routes/qbanks.ts` | List questions |
| PATCH | `/api/questions/:id` | Auth | `routes/qbanks.ts` | Update question |
| DELETE | `/api/questions/:id` | Auth | `routes/qbanks.ts` | Delete question |
| POST | `/api/feedback` | Public | `routes/feedback.ts` | Submit feedback |
| GET | `/api/feedback` | Public | `routes/feedback.ts` | List feedback |
| GET | `/api/topics` | Auth | `routes/topics.ts` | Get user topics |
| PUT | `/api/topics/:storageKey` | Auth | `routes/topics.ts` | Upsert topics |
| GET | `/api/generations` | Auth | `routes/generations.ts` | List generation history |
| DELETE | `/api/generations` | Auth | `routes/generations.ts` | Clear generation history |
| GET | `/api/export-all-json` | Auth | `routes/transfer.ts` | Export all decks as JSON |
| GET | `/api/decks/:id/export-json` | Auth | `routes/transfer.ts` | Export single deck as JSON |
| POST | `/api/import-deck-json` | Auth | `routes/transfer.ts` | Import deck from JSON |
| GET | `/api/logs` | Admin | `routes/logs.ts` | Query server logs |
| GET | `/api/admin/users` | Mod | `routes/admin.ts` | List users (paginated) |
| PATCH | `/api/admin/users/:id` | Mod | `routes/admin.ts` | Update user role/pro |
| POST | `/api/dev/set-pro` | Dev | `routes/dev.ts` | Set dev pro override |
| DELETE | `/api/dev/set-pro` | Dev | `routes/dev.ts` | Clear dev pro override |
| GET | `/api/dev/status` | Dev | `routes/dev.ts` | Dev status |
| POST | `/api/dev/simulate-subscribe` | Dev | `routes/dev.ts` | Simulate subscription |
| DELETE | `/api/dev/simulate-subscribe` | Dev | `routes/dev.ts` | Clear subscription |
| GET | `/api/dev/usage` | Dev | `routes/dev.ts` | Dev usage stats |
| POST | `/api/dev/reset-quota` | Dev | `routes/dev.ts` | Reset quota |
| POST | `/api/stripe/webhook` | Public | `app.ts` | Stripe webhook (raw body) |

**Total: 58 endpoints across 18 route files**

### 1.4 Auth Flow

**Primary**: OpenID Connect (OIDC) via Replit
- Uses `openid-client` library with PKCE flow
- Session stored in PostgreSQL `sessions` table (JSONB)
- Session cookie: `sid` (httpOnly, secure, sameSite=lax, 7-day TTL)
- Token refresh via `refreshTokenGrant`
- Mobile auth: separate token exchange endpoint

**Anonymous access**: Most endpoints work without auth but with stricter rate limits and quota enforcement via IP-based tracking

**Authorization levels**:
1. **Public** — no auth required (health, model-info)
2. **Authenticated** — any logged-in user
3. **Admin/Moderator** — role-based (`users.role` column: `user`, `moderator`, `admin`)
4. **Pro** — subscription-based feature gating

### 1.5 Database Models (PostgreSQL via Drizzle ORM)

**9 tables**:

| Table | File | Key Fields | Relationships |
|-------|------|------------|---------------|
| `users` | `schema/auth.ts` | id, email, firstName, lastName, profileImageUrl, stripeCustomerId, stripeSubscriptionId, role, manualPro | Parent of decks, qbanks, sessions, topics |
| `sessions` | `schema/auth.ts` | sid (PK), sess (JSONB), expire | — |
| `decks` | `schema/decks.ts` | id (serial), name, description, parentId (self-ref), kind, userId | Parent of cards, mind_maps; self-referential tree |
| `cards` | `schema/cards.ts` | id (serial), deckId (FK→decks), front, back, tags, image, sourceImage, bbox, cardType, choices, correctIndex, pageNumber | Child of decks |
| `generations` | `schema/generations.ts` | id (serial), deckName, deckType, status, cardsGenerated, pageCount, durationMs, customPrompt, errorMessage, startedAt, completedAt | — |
| `qbanks` | `schema/qbanks.ts` | id (serial), name, description, parentId (self-ref), userId | Parent of questions; self-referential tree |
| `questions` | `schema/questions.ts` | id (serial), qbankId (FK→qbanks), front, back, choices, correctIndex, tags, pageNumber | Child of qbanks |
| `mind_maps` | `schema/mind-maps.ts` | id (serial), deckId (FK→decks), title, data (JSON text), cardCount | Child of decks |
| `feedback` | `schema/feedback.ts` | id (serial), type, rating, message, email, userId, page | — |
| `quota_usage` | `schema/quota-usage.ts` | key, metric, period (composite PK), count | — |
| `user_topics` | `schema/user-topics.ts` | userId, storageKey (composite PK), topics (JSONB) | Child of users |

### 1.6 Background Jobs

**None currently implemented.** All operations are synchronous within the HTTP request lifecycle. The server uses:
- `setInterval` for log cleanup (daily) and generation status cleanup (every 5 min)
- In-memory `setInterval` for rate limiter cleanup (every 60s)
- In-memory `setInterval` for response cache cleanup (every 60s)

### 1.7 WebSocket Usage

**None.** The server uses SSE (Server-Sent Events) for streaming AI responses, not WebSocket. SSE endpoints:
- `POST /api/generate/stream` — card generation with progress events
- `POST /api/generate-qbank/stream` — QBank generation with progress events
- `POST /api/explain` — streaming text explanations

### 1.8 Caching

**In-memory LRU cache** (`lib/response-cache.ts`):
- SHA-256 keyed, 24-hour TTL, 200 entries, 50MB max
- Singleton `generationCache` shared across all AI response caching
- Used by: generate, explain, mind-map endpoints
- No Redis/external cache

**No HTTP caching** for API responses (except static assets with 1-year immutable cache)

### 1.9 File Processing

**PDF extraction** (`routes/extract-pdf.ts`):
- `pdfjs-dist` for embedded text extraction
- `tesseract.js` for OCR fallback on scanned PDFs
- `canvas` for server-side page rendering
- Visual detection via operator list analysis (grid-based cluster detection)
- Max file size: 200MB

**Office file extraction** (`routes/extract-office.ts`):
- `jszip` for ZIP-based formats (DOCX, PPTX, XLSX)
- `fast-xml-parser` for XML parsing

**File upload**: `multer` with memory storage

### 1.10 Current AI Integrations

**Provider abstraction** (`lib/integrations-openai-ai-server/src/client.ts`):
- Uses OpenAI SDK with configurable `baseURL` for multi-provider support
- Provider priority: Groq → OpenRouter → Ollama Cloud → OpenAI → Replit injected key
- Single primary client + lazy fallback client
- Cross-provider fallback on 429/5xx errors

**AI client wrapper** (`api-new-server/src/lib/ai-client.ts`):
- Wraps the integrations library
- Global concurrency limiter (max 4 concurrent requests)
- Exponential backoff retry (3 retries, 2s base delay)
- SSE streaming support with heartbeat
- Model selection per feature (text, vision, qbank, mindmap, explain)

**Models configured** (via env vars, defaults to :free tier):
- `AI_TEXT_MODEL`: `meta-llama/llama-4-maverick:free`
- `AI_VISION_MODEL`: `google/gemma-3-27b-it:free`
- `AI_QBANK_MODEL`: `deepseek/deepseek-r1-0528:free`
- `AI_MINDMAP_MODEL`: `microsoft/mai-ds-r1:free`
- `AI_EXPLAIN_MODEL`: `qwen/qwq-32b:free`

**AI endpoints**:
- Card generation (streaming SSE)
- QBank generation (streaming SSE)
- Card batch regeneration
- Explanations (6 modes: full, revision, osce, brief, mnemonic, clinical)
- Batch explanations
- Mind map generation

### 1.11 Migration Report

#### What Exists (Reusable)
- ✅ Express 5 server with middleware pipeline
- ✅ Zod validation on all input schemas
- ✅ Structured logging (pino) with dual-write (file + DB)
- ✅ Health check system with dependency monitoring
- ✅ Rate limiting (in-memory sliding window)
- ✅ Response caching (in-memory LRU)
- ✅ Error handling (standardized AppError + global handler)
- ✅ Request context (UUID + timing)
- ✅ Auth system (OIDC + session DB + role-based access)
- ✅ Stripe integration (checkout, portal, webhooks)
- ✅ Free tier quota system (DB-backed)
- ✅ PDF + Office file extraction
- ✅ AI client with multi-provider fallback
- ✅ SSE streaming infrastructure
- ✅ Admin endpoints (user management, log querying)
- ✅ Dev override system (for local development)
- ✅ OpenAPI spec (629 lines)
- ✅ Drizzle ORM schema with migrations
- ✅ Monitor system (in-memory metrics)

#### What Can Be Reused As-Is
- Database schema (all 9 tables) — no changes needed for agent features
- Auth system — agent endpoints can use same middleware
- Zod schemas — agent input validation follows same pattern
- Error handling — AppError pattern extends naturally
- Logging — pino logger works for agent operations
- Rate limiting — same sliding window approach
- Stripe/subscription — unchanged

#### What Must Be Refactored
- **AI client** (`lib/ai-client.ts`) — needs proper provider abstraction with adapter pattern (currently uses OpenAI SDK directly with baseURL switching)
- **Streaming** — SSE works but needs WebSocket upgrade + structured event types for tool calls
- **Model configuration** — currently env-var based, needs per-mode configuration
- **Route organization** — needs new `/agents/*` routes alongside existing `/api/*` routes

#### Technical Debt
1. **No task queue** — all AI calls are synchronous in request lifecycle; long-running generations block the event loop
2. **In-memory state** — rate limiter, cache, generation status, monitor all in-memory; lost on restart, not shared across instances
3. **No WebSocket** — SSE is one-directional; tool execution needs bidirectional communication
4. **No token accounting** — AI usage not tracked per-user for billing/quotas
5. **No audit trail** — tool executions not logged
6. **Tight coupling** — routes directly import AI client; no service layer abstraction
7. **No input sanitization** on AI-generated content stored in DB (XSS risk via card front/back)
8. **SQL injection risk** — some raw SQL queries use template literals without parameterization in admin routes

#### Bottlenecks
1. **Global concurrency limiter** (max 4) — will bottleneck agent tool execution
2. **No connection pooling tuning** — Drizzle pool uses defaults
3. **PDF processing** — single-threaded, blocks event loop
4. **In-memory cache** — doesn't scale across instances
5. **No CDN** — static assets served directly from Express

#### Security Risks
1. **REPL_ID in env** — OIDC client ID is not secret but coupled to Replit
2. **No CSRF protection** — cookie-based sessions without CSRF tokens
3. **Admin endpoints** use `x-admin-key` header (should use session-based auth)
4. **No request signing** for webhooks beyond Stripe's built-in
5. **CORS** allows credentials from single origin (good) but origin is env-dependent
6. **No rate limiting on auth endpoints** — login/callback vulnerable to brute force
7. **Session data in JSONB** — access tokens stored in plain JSONB (should be encrypted)
