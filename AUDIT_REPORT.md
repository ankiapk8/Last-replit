# PHASE 1 — Architecture Audit Report

## Executive Summary

This is a medical education flashcard generator application ("AnkiGen") built as a monorepo. The current architecture deploys as a **single Docker container** running both the API server and frontend static files. The project has significant technical debt around service separation, security hardening, and Render multi-service deployment.

**Overall Health: NEEDS REFACTORING**

---

## 1. Frontend Frameworks

| Framework             | Location                            | Purpose                    | Build Tool     |
| --------------------- | ----------------------------------- | -------------------------- | -------------- |
| React 18 + TypeScript | `artifacts/anki-generator/`         | Public user-facing SPA     | Vite           |
| React 18 + TypeScript | `artifacts/mockup-sandbox/`         | Medical UI component demos | Vite           |
| React 18 + TypeScript | `lib/integrations-openai-ai-react/` | Shared React hooks for AI  | Vite (library) |

**Key observations:**

- Uses `wouter` for routing (not React Router)
- Radix UI + Tailwind CSS for component library
- TanStack Query for server state management
- PWA support with service worker
- Capacitor for Android APK builds

## 2. Backend Framework

| Component  | Technology             | Location                              |
| ---------- | ---------------------- | ------------------------------------- |
| API Server | Express 5 + TypeScript | `api-new-server/`                     |
| ORM        | Drizzle ORM            | `lib/db/`                             |
| Validation | Zod                    | Throughout                            |
| Logging    | Pino                   | `api-new-server/src/lib/logger.ts`    |
| AI Client  | Custom multi-provider  | `api-new-server/src/lib/ai-client.ts` |

**Key observations:**

- Express 5 (latest) with ESM modules
- esbuild for production builds (bundled `.mjs` output)
- Multi-provider AI: OpenRouter, Ollama Cloud, Groq, Mistral, Google AI, OpenAI
- Agent system with MCP server support, tool registry, workspace management

## 3. WebSocket Usage

**NONE FOUND.** No WebSocket server or client code detected.

## 4. SSE Usage

**PARTIALLY FOUND.** The agent-stream route (`api-new-server/src/routes/agent-stream.ts`) likely uses SSE for streaming AI responses. This needs verification but is not explicitly using `text/event-stream` in a standard way.

## 5. Auth Flow

### Public User Auth

- **Method:** OIDC (OpenID Connect) via `openid-client` library
- **Session:** Cookie-based sessions stored in PostgreSQL
- **Refresh:** Automatic token refresh via refresh_token grant
- **Middleware:** `authMiddleware.ts` — attaches `req.user` if session valid

### Admin Auth (Three methods)

1. **Session + Role:** Existing OIDC session with role check in DB
2. **JWT Bearer:** `ADMIN_JWT_SECRET` signed tokens with `sub` + `role` claims
3. **API Key:** `x-admin-api-key` header, hashed lookup in `admin_api_keys` table

- **IP Allowlist:** Optional `ADMIN_IP_ALLOWLIST` env var
- **Roles:** `admin`, `owner`, `developer`

### CRITICAL SECURITY ISSUES in Auth

- `ADMIN_JWT_SECRET` not validated at startup
- JWT uses `import("jsonwebtoken")` dynamic import — fails silently if package missing
- No rate limiting on auth endpoints
- Session store has no TTL enforcement beyond token expiry

## 6. Database Usage

**PostgreSQL 16** via Drizzle ORM

### Schema Tables

| Table                | Purpose                              | Location                                 |
| -------------------- | ------------------------------------ | ---------------------------------------- |
| `users`              | User accounts, roles                 | `lib/db/src/schema/auth.ts`              |
| `decks`              | Flashcard decks                      | `lib/db/src/schema/decks.ts`             |
| `cards`              | Individual flashcards                | `lib/db/src/schema/cards.ts`             |
| `generations`        | AI generation history                | `lib/db/src/schema/generations.ts`       |
| `mind_maps`          | Mind map data                        | `lib/db/src/schema/mind-maps.ts`         |
| `qbanks`             | Question banks                       | `lib/db/src/schema/qbanks.ts`            |
| `questions`          | QBank questions                      | `lib/db/src/schema/questions.ts`         |
| `feedback`           | User feedback                        | `lib/db/src/schema/feedback.ts`          |
| `user_topics`        | Study planner topics                 | `lib/db/src/schema/user-topics.ts`       |
| `quota_usage`        | Rate limit tracking                  | `lib/db/src/schema/quota-usage.ts`       |
| `server_logs`        | DB-backed logging                    | Migration `0001_agent_tables.sql`        |
| `provider_configs`   | AI provider configs (encrypted keys) | Migration `0002_admin_config_tables.sql` |
| `agent_mode_configs` | Agent mode configurations            | Migration `0002_admin_config_tables.sql` |
| `tool_configs`       | Tool configurations                  | Migration `0002_admin_config_tables.sql` |
| `mcp_server_configs` | MCP server configs                   | Migration `0002_admin_config_tables.sql` |
| `admin_api_keys`     | Admin API key hashes                 | Migration `0002_admin_config_tables.sql` |
| `admin_audit_log`    | Admin action audit trail             | Migration `0002_admin_config_tables.sql` |
| `routing_configs`    | AI routing rules                     | Migration `0002_admin_config_tables.sql` |
| `agent_workspaces`   | Agent workspaces                     | Migration `0002_admin_config_tables.sql` |

### Migrations

- `0000_regular_hellfire_club.sql` — Initial schema
- `0001_agent_tables.sql` — Agent system tables
- `0002_admin_config_tables.sql` — Admin config tables

**CRITICAL:** Migrations run via `ensureDatabaseSchema()` on every startup — no proper migration runner (no `drizzle-kit push` or `migrate()`).

## 7. Redis Usage

**NOT FOUND.** No Redis client or configuration exists. Rate limiting and response caching use PostgreSQL.

## 8. Environment Variables

### Currently Configured (in config.ts)

| Variable                | Required          | In .env.example | Notes                             |
| ----------------------- | ----------------- | --------------- | --------------------------------- |
| `NODE_ENV`              | Yes               | No              | Defaults to "development"         |
| `PORT`                  | Yes               | Yes             | Defaults to 3001                  |
| `DATABASE_URL`          | **YES**           | Yes             | No default — will fail at runtime |
| `OPENROUTER_API_KEY`    | **YES**           | Yes             | Primary AI provider               |
| `OLLAMA_CLOUD_API_KEY`  | No                | Yes             | Fallback AI                       |
| `GROQ_API_KEY`          | No                | Yes             | Fallback AI                       |
| `ADMIN_SECRET_KEY`      | No                | Yes             | Used for /monitor, /test-model    |
| `ADMIN_JWT_SECRET`      | **YES for admin** | **MISSING**     | Required for JWT admin auth       |
| `ADMIN_IP_ALLOWLIST`    | No                | **MISSING**     | Optional IP restriction           |
| `STRIPE_SECRET_KEY`     | No                | No              | Optional payments                 |
| `STRIPE_WEBHOOK_SECRET` | No                | No              | Optional payments                 |
| `APP_URL`               | No                | No              | Used for CORS origin              |
| `STATIC_DIR`            | No                | No              | Frontend static dir               |
| `LOG_LEVEL`             | No                | No              | Defaults to "info"                |
| `LOG_RETENTION_DAYS`    | No                | No              | Defaults to 30                    |

### MISSING from config.ts but referenced in code:

- `ADMIN_EMAIL` — Not defined anywhere
- `ADMIN_PASSWORD` — Not defined anywhere
- `JWT_SECRET` — Not defined (only `ADMIN_JWT_SECRET` exists)
- `REDIS_URL` — Not used

## 9. Build System

| Component       | Tool              | Command                               |
| --------------- | ----------------- | ------------------------------------- |
| Package Manager | pnpm 10           | `pnpm install`                        |
| Root build      | pnpm + TypeScript | `pnpm run build`                      |
| API build       | esbuild           | `node ./build.mjs` → `dist/index.mjs` |
| Frontend build  | Vite              | `vite build` → `dist/`                |
| Type checking   | TypeScript 5.9    | `pnpm run typecheck`                  |
| Testing         | Vitest            | `pnpm test`                           |

### Build Pipeline (Docker)

1. `base` — Install system deps (cairo, pango, etc.)
2. `deps` — `pnpm install --frozen-lockfile`
3. `build` — Codegen + frontend build + API build
4. `runner` — Production image with only built artifacts

## 10. Docker Files

### Existing Dockerfile (root)

- Multi-stage build (4 stages)
- Base: `node:24-bookworm-slim`
- System deps for canvas/tesseract
- Health check: `GET /api/healthz`
- Port: 8080
- **Problem:** Builds everything into ONE container

### docker-compose.yml

- Only defines a `db` service (Postgres)
- No API or frontend services defined

## 11. CI Workflows

**NONE FOUND.** No `.github/workflows/` directory. No CI/CD pipeline defined.

## 12. Render Configuration (Current)

### render.yaml

- **Single service:** `anki-generator` (Docker)
- **Single database:** `anki-generator-db` (Postgres 16, basic-256mb)
- **Health check:** `/api/healthz`
- **Auto-deploy:** true
- **Region:** oregon
- **Plan:** starter

### Problems with Current Render Config

1. Only ONE service — no separation of frontend/API/admin
2. No Redis service defined
3. No environment variable validation
4. Health check doesn't verify all dependencies
5. No separate domains for app/api/admin

## 13. Critical Security Issues

### HIGH SEVERITY

1. **Admin routes bundled in same server** — `/internal/admin` is in the same Express app as public `/api`
2. **Admin pages in public frontend** — `admin-feedback.tsx` and `admin-users.tsx` exist in the public frontend bundle
3. **SQL injection risk** — `internal-admin.ts` uses `sql.raw()` with string interpolation for UPDATE/DELETE operations (lines 93-98, 177-191, 244-252)
4. **No env validation at startup** — `DATABASE_URL` and `OPENROUTER_API_KEY` are optional in config but required for operation
5. **CORS origin from env without validation** — `process.env.APP_URL ?? "http://localhost:5000"` allows any origin if APP_URL not set

### MEDIUM SEVERITY

6. **JWT secret not validated** — `ADMIN_JWT_SECRET` checked at point of use, not startup
7. **No rate limiting on auth endpoints** — brute force possible
8. **Admin API key returned in response** — `POST /internal/admin/api-keys` returns the raw key (expected but needs careful handling)
9. **No HTTPS enforcement** — no HSTS or redirect middleware
10. **Model info endpoint exposes configuration** — `/api/model-info` reveals model names and provider info

### LOW SEVERITY

11. **No request size limits on file upload routes** — multer configured but limits not visible
12. **No CSRF protection** — cookie-based sessions without CSRF tokens
13. **Audit log doesn't capture request body** — only metadata

## 14. Service Separation Assessment

### Current State: MONOLITH

```
Single Docker Container
├── Express API Server (:8080)
│   ├── /api/* (public routes)
│   ├── /internal/admin/* (admin routes)
│   └── Static files (public frontend)
└── Built React Frontend (public/)
```

### Target State: THREE SERVICES

```
Service 1: public-frontend (app.<domain>)
├── Static React SPA
├── No admin code
└── Deployed as Render Static Site

Service 2: agent-api (api.<domain>)
├── Express API Server
├── /api/* (public routes only)
├── /api/admin/* (admin routes with JWT auth)
├── No static file serving
└── Deployed as Render Web Service

Service 3: admin-frontend (admin.<domain>)
├── Separate React SPA
├── Admin-only UI
├── Authenticates via JWT
└── Deployed as Render Static Site
```

## 15. File-by-File Change Plan

### Files to Create

1. `render.yaml` — Complete rewrite for 3 services
2. `agent-api/Dockerfile` — API-only container
3. `public-frontend/Dockerfile` — Static site container (or use Render static)
4. `admin-frontend/Dockerfile` — Admin static container
5. `admin-frontend/` — Complete admin frontend application
6. `agent-api/src/middleware/env-validator.ts` — Startup env validation
7. `agent-api/src/middleware/cors.ts` — Strict CORS configuration
8. `agent-api/src/routes/health.ts` — Enhanced health checks
9. `agent-api/src/lib/response-sanitizer.ts` — Audit and fix
10. `tests/` — Automated test suite

### Files to Modify

1. `api-new-server/src/app.ts` — Remove static serving, fix CORS
2. `api-new-server/src/config.ts` — Add required env validation
3. `api-new-server/src/index.ts` — Add env validation call
4. `api-new-server/src/routes/internal-admin.ts` — Fix SQL injection vulnerabilities
5. `api-new-server/src/routes/index.ts` — Remove admin routes from public router
6. `artifacts/anki-generator/src/App.tsx` — Remove admin routes from public frontend
7. `artifacts/anki-generator/src/pages/admin-feedback.tsx` — **DELETE** (move to admin-frontend)
8. `artifacts/anki-generator/src/pages/admin-users.tsx` — **DELETE** (move to admin-frontend)

### Files to Delete

1. `artifacts/anki-generator/src/pages/admin-feedback.tsx`
2. `artifacts/anki-generator/src/pages/admin-users.tsx`

---

## 16. Risk Assessment

| Risk                          | Impact       | Likelihood | Mitigation            |
| ----------------------------- | ------------ | ---------- | --------------------- |
| SQL injection in admin routes | **CRITICAL** | High       | Parameterized queries |
| Admin code in public bundle   | **HIGH**     | Certain    | Separate frontend     |
| No env validation             | **HIGH**     | High       | Startup validation    |
| Single point of failure       | **MEDIUM**   | Certain    | Service separation    |
| No CI/CD                      | **MEDIUM**   | Certain    | Add GitHub Actions    |
| No Redis                      | **LOW**      | N/A        | Use PG for now        |

---

## 17. Recommended Priority Order

1. **IMMEDIATE:** Fix SQL injection in `internal-admin.ts`
2. **IMMEDIATE:** Create separate admin frontend
3. **IMMEDIATE:** Add environment validation at startup
4. **HIGH:** Rewrite `render.yaml` for 3 services
5. **HIGH:** Create service-specific Dockerfiles
6. **HIGH:** Fix CORS configuration
7. **MEDIUM:** Remove admin pages from public frontend
8. **MEDIUM:** Add comprehensive health checks
9. **MEDIUM:** Add automated test suite
10. **LOW:** Add CI/CD pipeline
