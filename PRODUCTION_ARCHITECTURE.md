# AnkiGen — Production Architecture

## 1. Detected Project Architecture

### Frontend (Public)

- **Framework:** React 19 + Vite 7 + TypeScript
- **Location:** `artifacts/anki-generator/`
- **Package:** `@workspace/anki-generator`
- **Build:** `vite build` → `artifacts/anki-generator/dist/public`
- **Port:** 5000 (dev), 80 (production via Nginx)
- **Routing:** Client-side SPA via `wouter`
- **State:** `@tanstack/react-query` for server state
- **Styling:** Tailwind CSS v4 + shadcn/ui components
- **Key deps:** framer-motion, react-markdown, pdfjs-dist, tesseract.js, jszip, html2canvas
- **API proxy:** `/api` → `http://localhost:3001` (dev only)

### Production API Server

- **Framework:** Express.js 5 + TypeScript
- **Location:** `api-new-server/`
- **Package:** `@workspace/api-new-server`
- **Build:** esbuild → bundled ESM at `api-new-server/dist/index.mjs`
- **Port:** 3001
- **Database:** PostgreSQL via `drizzle-orm/node-postgres`
- **Auth:** OIDC (openid-client) for users, JWT + API Key + Basic Auth for admin
- **Logging:** pino + pino-http + pino-roll (file) + DB dual-write
- **Security:** helmet, cors, compression, cookie-parser
- **Routes:** `/api/*` (public), `/api/admin/*` (admin control plane)
- **Key deps:** stripe, openai, jsonwebtoken, multer, pdfjs-dist, tesseract.js

### Admin Frontend

- **Framework:** React 19 + Vite 8 + TypeScript
- **Location:** `admin-frontend/`
- **Package:** `@workspace/admin-frontend`
- **Build:** `vite build` → `admin-frontend/dist`
- **Port:** 5174 (dev), 80 (production via Nginx)
- **Routing:** `react-router-dom` v7
- **Auth:** Basic Auth → JWT token exchange
- **Pages:** Dashboard, Providers, Modes, Tools, MCP, API Keys, Audit, Users, Feedback

### Database

- **Engine:** PostgreSQL 16
- **ORM:** drizzle-orm
- **Schema:** Auto-created via `ensureDatabaseSchema()` on startup
- **Tables:** users, sessions, decks, cards, qbanks, questions, generations, mind_maps, feedback, server_logs, generation_status, quota_usage, user_topics, provider_configs, agent_mode_configs, tool_configs, mcp_server_configs, admin_api_keys, admin_audit_log, routing_configs, agent_workspaces

### Existing Deployment (Render)

- **render.yaml:** 3 services (static frontend, Docker API, static admin) + PostgreSQL
- **Subdomain routing:** app.domain, api.domain, admin.domain
- **Existing Dockerfiles:** Root `Dockerfile` (monolith), `agent-api/Dockerfile` (API-only)

---

## 2. Recommended Production Architecture

### Single-Domain Path-Based Routing

```
https://mydomain.com/           → Frontend (public SPA)
https://mydomain.com/api/*     → Production API (Express.js)
https://mydomain.com/admin/*   → Admin Frontend (SPA)
https://mydomain.com/api/admin/* → Admin API (control plane)
```

### Key Changes from Current Render Setup

| Aspect        | Current (Render)             | New (Docker VPS)               |
| ------------- | ---------------------------- | ------------------------------ |
| Routing       | 3 subdomains                 | 1 domain, path-based           |
| SSL           | Per-service (Render managed) | Single cert (Let's Encrypt)    |
| Frontend      | Static site (Render)         | Nginx-served SPA               |
| API           | Docker container             | Docker container (unchanged)   |
| Admin         | Static site (Render)         | Nginx-served SPA               |
| Database      | Render managed Postgres      | Self-hosted Postgres container |
| Reverse proxy | Render built-in              | Nginx container                |
| Deployment    | Git push → auto-deploy       | Git pull → docker compose      |

---

## 3. Folder Structure

```
/root/Last-replit/
├── docker/
│   ├── frontend/
│   │   ├── Dockerfile          # Multi-stage: Vite build → Nginx
│   │   └── nginx.conf          # Frontend SPA config
│   ├── api/
│   │   └── Dockerfile          # Multi-stage: install → build → run
│   ├── admin/
│   │   ├── Dockerfile          # Multi-stage: Vite build → Nginx
│   │   └── nginx.conf          # Admin SPA config
│   └── proxy/
│       ├── Dockerfile          # Nginx + certbot
│       └── nginx.conf          # Main reverse proxy config
├── scripts/
│   ├── init-ssl.sh             # Initial SSL certificate setup
│   ├── renew-ssl.sh            # SSL renewal script
│   └── monitor.sh              # Production monitoring
├── docker-compose.yml          # Multi-service orchestration
├── .env.production             # Production environment variables
├── PRODUCTION_ARCHITECTURE.md  # This file
├── PRODUCTION_DEPLOYMENT.md    # Step-by-step deployment guide
├── SECURITY_CHECKLIST.md       # Security hardening checklist
├── TESTING_CHECKLIST.md        # Post-deployment testing
└── TROUBLESHOOTING.md          # Common issues and fixes
```

---

## 4. Dockerfiles

### Frontend Dockerfile (`docker/frontend/Dockerfile`)

- **Stage 1 (deps):** Install pnpm dependencies
- **Stage 2 (build):** Vite build → static assets
- **Stage 3 (runner):** Nginx 1.27 Alpine, non-root, health check

### API Dockerfile (`docker/api/Dockerfile`)

- **Stage 1 (base):** System deps (cairo, pango, etc. for canvas)
- **Stage 2 (deps):** Install pnpm dependencies
- **Stage 3 (build):** esbuild bundle → ESM
- **Stage 4 (runner):** Production deps only, non-root, health check

### Admin Dockerfile (`docker/admin/Dockerfile`)

- **Stage 1 (deps):** Install pnpm dependencies
- **Stage 2 (build):** Vite build → static assets
- **Stage 3 (runner):** Nginx 1.27 Alpine, non-root, robots.txt, health check

### Proxy Dockerfile (`docker/proxy/Dockerfile`)

- **Base:** Nginx 1.27 Alpine + certbot
- **Config:** Main reverse proxy with SSL, rate limiting, security headers

---

## 5. Docker Compose Services

| Service  | Image                    | Networks       | Exposed | Restart        |
| -------- | ------------------------ | -------------- | ------- | -------------- |
| db       | postgres:16-alpine       | backend        | No      | unless-stopped |
| api      | Custom (docker/api)      | backend, proxy | No      | unless-stopped |
| frontend | Custom (docker/frontend) | proxy          | No      | unless-stopped |
| admin    | Custom (docker/admin)    | proxy          | No      | unless-stopped |
| proxy    | Custom (docker/proxy)    | proxy          | 80, 443 | unless-stopped |

**Networks:**

- `backend` (internal: true) — db ↔ api only
- `proxy` — proxy ↔ frontend, admin, api

---

## 6. Nginx Reverse Proxy Configuration

### Routing Rules

| Path                    | Upstream    | Notes                               |
| ----------------------- | ----------- | ----------------------------------- |
| `/`                     | frontend:80 | SPA fallback to index.html          |
| `/api`                  | api:3001    | Rate limited 30r/s                  |
| `/api/generate`         | api:3001    | Extended timeout 300s               |
| `/api/v2/agents/stream` | api:3001    | WebSocket, no buffering             |
| `/api/stripe/webhook`   | api:3001    | No rate limit, raw body             |
| `/api/admin`            | api:3001    | Rate limited 10r/s                  |
| `/api/admin/auth`       | api:3001    | Brute-force protection 5r/m         |
| `/admin`                | admin:80    | SPA, noindex, rewrite /admin/_ → /_ |

### Security Features

- HTTP → HTTPS redirect
- HSTS (max-age=63072000)
- TLS 1.2+ only
- OCSP stapling
- Rate limiting (general API, admin, login)
- Connection limiting (50 per IP)
- Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- Blocked paths (.env, .git, wp-admin, etc.)
- Gzip compression
- Request buffering optimization

---

## 7. HTTPS/SSL

- **Provider:** Let's Encrypt via certbot
- **Certificate:** Full chain + private key
- **Auto-renewal:** Daily cron job via `scripts/renew-ssl.sh`
- **Challenge:** HTTP-01 via webroot at `/var/www/certbot`
- **Redirect:** All HTTP → HTTPS
- **HSTS:** Enabled with preload

---

## 8. Admin Security

### Authentication Methods (4 layers)

1. **Session + Role:** OIDC session with DB role check
2. **JWT Bearer:** Signed with `ADMIN_JWT_SECRET`, configurable TTL
3. **API Key:** `X-Admin-API-Key` header, hashed in DB
4. **Basic Auth:** email:password for initial token exchange

### Authorization

- **Roles:** admin, owner, developer
- **IP Allowlist:** CIDR support via `ADMIN_IP_ALLOWLIST`
- **Role enforcement:** `requireRole()` middleware helper

### Protection

- Rate limiting: 10 req/s (burst 20)
- Brute-force: 5 req/min on auth endpoints
- CORS: Only `APP_URL` and `ADMIN_URL`
- Audit logging: All admin actions logged to `admin_audit_log`
- Encrypted secrets: Provider API keys encrypted at rest

---

## 9. Control Plane Features (Admin API)

The admin API at `/api/admin/*` manages:

| Resource   | Endpoints          | Description                     |
| ---------- | ------------------ | ------------------------------- |
| Health     | `GET /health`      | Config status snapshot          |
| Auth       | `POST /auth/token` | Issue JWT token                 |
| Providers  | CRUD `/providers`  | AI provider configs (encrypted) |
| Modes      | CRUD `/modes`      | Agent mode configurations       |
| Tools      | CRUD `/tools`      | Tool configurations             |
| MCP        | CRUD `/mcp`        | MCP server configurations       |
| API Keys   | CRUD `/api-keys`   | Admin API key management        |
| Audit      | `GET /audit`       | Audit log query                 |
| Agents     | `GET /agents`      | Agent system stats              |
| Workspaces | `GET /workspaces`  | Agent workspace list            |
| Routing    | `GET /routing`     | Routing rule configs            |

---

## 10. Environment Variables

### `.env.production` (required)

```
DOMAIN, POSTGRES_*, OPENROUTER_API_KEY, ADMIN_JWT_SECRET,
ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_SECRET_KEY, ENCRYPTION_KEY,
AI_*_MODEL, STRIPE_*, LOG_*
```

### Service-specific injection

- **api:** All env vars from `.env.production`
- **frontend:** Built at compile time (BASE_PATH=/)
- **admin:** Built at compile time
- **proxy:** DOMAIN, ADMIN_EMAIL
- **db:** POSTGRES\_\*

---

## 11. Monitoring

### Health Endpoints

| Endpoint            | Auth  | Description                   |
| ------------------- | ----- | ----------------------------- |
| `/health`           | None  | Proxy health                  |
| `/api/healthz`      | None  | API + DB + AI provider status |
| `/api/admin/health` | Admin | Config system status          |

### Monitoring Script (`scripts/monitor.sh`)

- Container health checks (auto-restart on failure)
- Disk space monitoring (>85% alert)
- SSL certificate expiry (<14 days alert)
- API health check
- Memory monitoring (>90% alert)
- Log rotation

### Logging

- **API:** pino structured logs → file + DB dual-write
- **Containers:** json-file driver with rotation (max 10-20MB, 3-5 files)
- **Nginx:** Access + error logs via Docker logging
- **Retention:** 30 days for DB logs, container-managed for files

---

## 12. Deployment Commands

```bash
# Initial setup
git clone <repo> /opt/ankigen
cd /opt/ankigen
cp .env.production .env
nano .env  # Fill in all values

# Build and deploy
docker compose build
./scripts/init-ssl.sh
docker compose up -d

# Verify
docker compose ps
curl https://mydomain.com/health
curl https://mydomain.com/api/healthz

# Update
git pull
docker compose build
docker compose up -d

# Monitor
docker compose logs -f
docker stats
./scripts/monitor.sh
```
