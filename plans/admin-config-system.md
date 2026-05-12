# Private Admin Configuration System — Plan

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Express App                                   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Public Layer (/api/*)                                        │   │
│  │  ├─ authMiddleware (existing)                                │   │
│  │  ├─ All existing routes (unchanged)                          │   │
│  │  ├─ /api/v2/agents/* (sanitized responses)                   │   │
│  │  └─ Static frontend (no admin pages)                         │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Admin Layer (/internal/*)  — Completely Separate             │   │
│  │  ├─ adminAuthMiddleware (JWT + API key + role + IP)          │   │
│  │  ├─ /internal/admin/agents                                   │   │
│  │  ├─ /internal/admin/providers                                │   │
│  │  ├─ /internal/admin/tools                                    │   │
│  │  ├─ /internal/admin/modes                                    │   │
│  │  ├─ /internal/admin/mcp                                      │   │
│  │  ├─ /internal/admin/workspaces                               │   │
│  │  └─ /internal/admin/audit                                    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Internal Config Store                                        │   │
│  │  ├─ DB: provider_configs (encrypted secrets)                 │   │
│  │  ├─ DB: agent_mode_configs                                   │   │
│  │  ├─ DB: tool_configs                                         │   │
│  │  ├─ DB: routing_configs                                      │   │
│  │  ├─ DB: system_prompts                                       │   │
│  │  ├─ DB: mcp_server_configs (encrypted)                       │   │
│  │  └─ In-memory cache with hot-reload                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## 1. Admin Auth Middleware

### 1.1 Role-Based Access Control

**File**: `api-new-server/src/middlewares/adminAuthMiddleware.ts`

**Allowed roles**: `admin`, `owner`, `developer`

**Three auth methods** (any one grants access):

1. **Session + Role Check** — Existing OIDC session, verify `users.role` in DB
2. **JWT Bearer Token** — Signed JWT with role claim, verified against server secret
3. **API Key** — `X-Admin-API-Key` header, verified against hashed key in DB

**Additional protections**:

- IP allowlist via `ADMIN_IP_ALLOWLIST` env var (comma-separated CIDRs)
- Rate limiting on admin endpoints (stricter than public)
- All access attempts logged to audit table

**Response for unauthorized**: 403 with `{ error: { code: "FORBIDDEN", message: "Admin access required" } }`

### 1.2 JWT Implementation

- Use `jsonwebtoken` package (lightweight, no new major dependency)
- JWT secret from `ADMIN_JWT_SECRET` env var (32+ byte random)
- Token TTL: 1 hour default, configurable
- Claims: `{ sub: userId, role: "admin"|"owner"|"developer", iat, exp }`
- Tokens issued via `POST /internal/admin/auth/token` (requires session auth)

### 1.3 API Key Implementation

- Keys stored in `admin_api_keys` table with bcrypt hash
- Key prefix: `ak_live_` (production) / `ak_test_` (test)
- Each key has: name, role, created_by, expires_at, last_used_at
- Keys can be revoked without affecting other keys

## 2. Internal Config Storage

### 2.1 Database Tables

**Migration**: `lib/db/drizzle/0002_admin_config_tables.sql`

```sql
-- Admin API keys
CREATE TABLE IF NOT EXISTS admin_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  key_hash VARCHAR NOT NULL UNIQUE,
  role VARCHAR NOT NULL CHECK (role IN ('admin', 'owner', 'developer')),
  created_by VARCHAR NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Provider configurations (encrypted secrets)
CREATE TABLE IF NOT EXISTS provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR NOT NULL UNIQUE,
  api_key_encrypted TEXT NOT NULL,
  base_url VARCHAR,
  extra_config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agent mode configurations
CREATE TABLE IF NOT EXISTS agent_mode_configs (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  model VARCHAR NOT NULL,
  provider VARCHAR NOT NULL,
  tools JSONB NOT NULL DEFAULT '[]',
  max_tokens INTEGER NOT NULL DEFAULT 4096,
  temperature REAL NOT NULL DEFAULT 0.3,
  approval_policy VARCHAR NOT NULL DEFAULT 'auto',
  max_tool_calls INTEGER NOT NULL DEFAULT 10,
  timeout_ms INTEGER NOT NULL DEFAULT 60000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tool configurations
CREATE TABLE IF NOT EXISTS tool_configs (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  description TEXT,
  category VARCHAR NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}',
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Routing configurations (model routing rules)
CREATE TABLE IF NOT EXISTS routing_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  match_rules JSONB NOT NULL DEFAULT '{}',
  provider VARCHAR NOT NULL,
  model VARCHAR NOT NULL,
  fallback_provider VARCHAR,
  fallback_model VARCHAR,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- MCP server configurations (encrypted credentials)
CREATE TABLE IF NOT EXISTS mcp_server_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  transport VARCHAR NOT NULL CHECK (transport IN ('stdio', 'http')),
  command TEXT,
  args JSONB DEFAULT '[]',
  env_encrypted TEXT,
  url VARCHAR,
  headers_encrypted TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id VARCHAR NOT NULL,
  actor_role VARCHAR NOT NULL,
  action VARCHAR NOT NULL,
  resource VARCHAR NOT NULL,
  resource_id VARCHAR,
  details JSONB,
  ip_address VARCHAR,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON admin_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON admin_audit_log(action, resource);
```

### 2.2 Encryption

**File**: `api-new-server/src/lib/encryption.ts`

- Use Node.js built-in `crypto` (no new dependency)
- AES-256-GCM for symmetric encryption
- Key derived from `ENCRYPTION_KEY` env var (32-byte hex)
- Encrypted format: `iv:authTag:ciphertext` (all base64)
- Encrypt: API keys, MCP credentials, provider secrets
- Never encrypt: mode names, tool names, routing rules (non-secret config)

```typescript
// api-new-server/src/lib/encryption.ts
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== KEY_LENGTH * 2) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  return Buffer.from(keyHex, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(
    ":"
  );
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const [ivB64, authTagB64, encryptedB64] = ciphertext.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}
```

## 3. Config Service with Hot-Reload

**File**: `api-new-server/src/lib/config-service.ts`

### 3.1 Design

- Singleton in-memory cache of all configs
- On startup: load all from DB into cache
- On admin API mutation: update DB → update cache → emit event
- Config changes apply immediately (no server restart)
- File-based fallback: `/internal-config/*.json` for initial seeding

### 3.2 Cache Structure

```typescript
interface ConfigCache {
  providers: Map<string, ProviderConfig>;
  modes: Map<string, AgentModeConfig>;
  tools: Map<string, ToolConfig>;
  routing: RoutingConfig[];
  mcpServers: Map<string, MCPServerConfig>;
  prompts: Map<string, string>;
}
```

### 3.3 Hot-Reload Events

```typescript
type ConfigChangeEvent = {
  resource: "provider" | "mode" | "tool" | "routing" | "mcp" | "prompt";
  action: "create" | "update" | "delete";
  id: string;
  timestamp: Date;
};

type ConfigEventListener = (event: ConfigChangeEvent) => void;
```

Components (agent runner, provider factory, tool registry) subscribe to config changes and update their internal state.

## 4. Admin API Routes

**Base path**: `/internal/admin` (NOT `/api` — completely separate)

### 4.1 Route Structure

```
/internal/admin
├── GET    /health                    — Admin health check
├── POST   /auth/token               — Issue JWT (session auth required)
├── DELETE /auth/token               — Revoke JWT
│
├── /agents
│   ├── GET    /                      — List agent sessions (admin view)
│   ├── GET    /:id                   — Get session details (full internal)
│   ├── DELETE /:id                   — Delete session
│   └── GET    /stats                 — Agent usage statistics
│
├── /providers
│   ├── GET    /                      — List providers (with secrets masked)
│   ├── POST   /                      — Create provider config
│   ├── GET    /:id                   — Get provider (with secrets masked)
│   ├── PUT    /:id                   — Update provider
│   ├── DELETE /:id                   — Delete provider
│   ├── POST   /:id/test              — Test provider connectivity
│   └── POST   /:id/rotate-key        — Rotate API key
│
├── /tools
│   ├── GET    /                      — List tool configs
│   ├── POST   /                      — Create tool config
│   ├── GET    /:id                   — Get tool config
│   ├── PUT    /:id                   — Update tool config
│   ├── DELETE /:id                   — Delete tool config
│   └── POST   /:id/toggle            — Enable/disable tool
│
├── /modes
│   ├── GET    /                      — List mode configs
│   ├── POST   /                      — Create mode config
│   ├── GET    /:id                   — Get mode config (full, including prompts)
│   ├── PUT    /:id                   — Update mode config
│   ├── DELETE /:id                   — Delete mode config
│   └── POST   /:id/clone             — Clone mode config
│
├── /mcp
│   ├── GET    /                      — List MCP server configs
│   ├── POST   /                      — Create MCP server config
│   ├── GET    /:id                   — Get MCP config
│   ├── PUT    /:id                   — Update MCP config
│   ├── DELETE /:id                   — Delete MCP config
│   ├── POST   /:id/connect           — Test MCP connection
│   └── POST   /:id/tools             — Discover MCP tools
│
├── /workspaces
│   ├── GET    /                      — List all workspaces
│   ├── POST   /                      — Create workspace
│   ├── GET    /:id                   — Get workspace details
│   ├── PUT    /:id                   — Update workspace
│   ├── DELETE /:id                   — Delete workspace
│   └── GET    /:id/files             — List workspace files
│
├── /routing
│   ├── GET    /                      — List routing rules
│   ├── POST   /                      — Create routing rule
│   ├── PUT    /:id                   — Update routing rule
│   ├── DELETE /:id                   — Delete routing rule
│   └── POST   /reorder               — Reorder routing rules
│
├── /prompts
│   ├── GET    /                      — List system prompts
│   ├── POST   /                      — Create prompt
│   ├── GET    /:id                   — Get prompt
│   ├── PUT    /:id                   — Update prompt
│   └── DELETE /:id                   — Delete prompt
│
├── /audit
│   ├── GET    /                      — Query audit logs (paginated, filterable)
│   ├── GET    /export                — Export audit logs (CSV/JSON)
│   └── DELETE /:id                   — Delete audit entry (admin only)
│
└── /api-keys
    ├── GET    /                      — List API keys (masked)
    ├── POST   /                      — Create API key (returns full key once)
    ├── DELETE /:id                   — Revoke API key
    └── POST   /:id/rotate            — Rotate API key
```

### 4.2 Response Format

All admin responses use a consistent envelope:

```typescript
// Success
{ ok: true, data: {...}, meta?: { page, limit, total } }

// Error
{ ok: false, error: { code: string, message: string, details?: unknown } }
```

## 5. Public Response Sanitization

### 5.1 Sanitization Layer

**File**: `api-new-server/src/lib/response-sanitizer.ts`

A middleware/transform layer that strips internal fields from responses before they reach public clients.

**Fields stripped from ALL public responses**:

- `api_key`, `apiKey`, `secret`, `password`, `token` (except session tokens)
- `system_prompt`, `systemPrompt`
- `temperature`, `max_tokens`, `maxTokens`
- `provider_config`, `providerConfig`
- `internal_routing`, `internalRouting`
- `mcp_config`, `mcpConfig`
- `tool_permissions`, `toolPermissions`
- `approval_policy`, `approvalPolicy`

### 5.2 Public Agent Response Format

When public clients request agent session info, they receive ONLY:

```json
{
  "agent_id": "uuid",
  "mode": "research",
  "display_name": "Research Agent",
  "status": "ready",
  "created_at": "2026-01-15T10:30:00Z"
}
```

Never included:

- System prompts
- Model names
- Provider names
- Temperature/token settings
- Tool permission lists
- Internal routing rules

### 5.3 Implementation

```typescript
// Applied as middleware on public routes
function sanitizePublicResponse(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(sanitizePublicResponse);
  if (typeof data !== "object" || data === null) return data;

  const SENSITIVE_KEYS = new Set([
    "api_key",
    "apiKey",
    "secret",
    "password",
    "system_prompt",
    "systemPrompt",
    "temperature",
    "max_tokens",
    "maxTokens",
    "provider_config",
    "providerConfig",
    "internal_routing",
    "internalRouting",
    "mcp_config",
    "mcpConfig",
    "tool_permissions",
    "toolPermissions",
    "approval_policy",
    "approvalPolicy",
  ]);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (!SENSITIVE_KEYS.has(key)) {
      result[key] = sanitizePublicResponse(value);
    }
  }
  return result;
}
```

## 6. Audit Logging System

**File**: `api-new-server/src/lib/audit-logger.ts`

### 6.1 What Gets Logged

Every admin API call logs:

- `actor_id` — Who made the change
- `actor_role` — Their role at time of action
- `action` — CRUD operation (create, read, update, delete, test, rotate)
- `resource` — What was affected (provider, mode, tool, mcp, workspace, api_key)
- `resource_id` — Specific resource ID
- `details` — Change diff (old values → new values, excluding secrets)
- `ip_address` — Client IP
- `user_agent` — Client UA string

### 6.2 What NEVER Gets Logged

- API keys (full or partial)
- Provider secrets
- MCP credentials
- System prompts (logged as "updated" but content not stored)
- User passwords/tokens

### 6.3 Audit Middleware

```typescript
// Applied to all admin routes
function auditMiddleware(action: string, resource: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      // Log after response is sent
      logAudit({
        actor_id: req.user?.id || "api-key:" + req.apiKeyId,
        actor_role: req.user?.role || req.apiKeyRole,
        action,
        resource,
        resource_id: req.params.id,
        details: sanitizeAuditDetails(req.body),
        ip_address: req.ip,
        user_agent: req.headers["user-agent"],
      });
      return originalJson(body);
    };
    next();
  };
}
```

## 7. Separate Admin Frontend

### 7.1 Build Exclusion

- Admin UI lives in `admin-dashboard/` directory at project root
- NOT included in `artifacts/anki-generator/` (public frontend)
- Separate Vite config: `admin-dashboard/vite.config.ts`
- Separate build script: `pnpm run admin:build`
- Output to `admin-dashboard/dist/` (never copied to `public/`)

### 7.2 Route Serving

Admin dashboard served ONLY under `/admin` path with additional protection:

```typescript
// In app.ts — separate from public static serving
if (process.env.ENABLE_ADMIN_UI === "true") {
  const adminDir = path.resolve(process.cwd(), "admin-dashboard/dist");
  if (fs.existsSync(adminDir)) {
    // Admin routes require auth middleware
    app.use(
      "/admin",
      adminAuthMiddleware,
      express.static(adminDir, {
        index: false,
        setHeaders: (res) => {
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("X-Frame-Options", "DENY");
        },
      })
    );
    app.get(/^\/admin(\/.*)?/, adminAuthMiddleware, (_req, res) => {
      res.sendFile(path.join(adminDir, "index.html"));
    });
  }
}
```

### 7.3 IP Allowlist for Admin UI

```typescript
// ADMIN_IP_ALLOWLIST env var — comma-separated IPs or CIDRs
const adminIPs = process.env.ADMIN_IP_ALLOWLIST?.split(",").map((s) => s.trim()) || [];

function checkIPAllowlist(req: Request): boolean {
  if (adminIPs.length === 0) return true; // No restriction if not configured
  const clientIP = req.ip || req.socket.remoteAddress || "";
  return adminIPs.some((ip) => clientIP.startsWith(ip));
}
```

## 8. Agent Startup with Internal Configs

### 8.1 Config Loading Sequence

```
Server Start
  1. Load DB schema
  2. Load provider_configs from DB → decrypt secrets → cache
  3. Load agent_mode_configs from DB → cache
  4. Load tool_configs from DB → cache
  5. Load routing_configs from DB → cache (sorted by priority)
  6. Load mcp_server_configs from DB → decrypt → cache
  7. Load system_prompts from DB → cache
  8. Register tools with tool registry
  9. Initialize provider factory with cached configs
  10. Start HTTP server
```

### 8.2 Session Start

```
Agent Session Start
  1. Load mode config from cache (not DB — cache is hot)
  2. Load provider config from cache
  3. Load tool permissions from mode config
  4. Build sanitized public response (no internal fields)
  5. Return to client: { agent_id, mode, display_name, status }
```

### 8.3 Config Change Propagation

```
Admin updates provider config
  1. PUT /internal/admin/providers/:id
  2. Validate + encrypt secret
  3. Update DB
  4. Update in-memory cache
  5. Emit config change event
  6. Provider factory picks up new config on next request
  7. Existing sessions continue with old config until restarted
  8. New sessions use new config immediately
```

## 9. File-by-File Implementation Plan

### New Files

| File                                          | Purpose                                      |
| --------------------------------------------- | -------------------------------------------- |
| `src/middlewares/adminAuthMiddleware.ts`      | JWT + API key + role + IP validation         |
| `src/lib/encryption.ts`                       | AES-256-GCM encrypt/decrypt                  |
| `src/lib/config-service.ts`                   | In-memory config cache with hot-reload       |
| `src/lib/audit-logger.ts`                     | Audit logging to DB                          |
| `src/lib/response-sanitizer.ts`               | Strip sensitive fields from public responses |
| `src/routes/internal-admin.ts`                | Main admin router (all 7 resource groups)    |
| `src/routes/internal-admin/agents.ts`         | Admin agent session management               |
| `src/routes/internal-admin/providers.ts`      | Provider config CRUD                         |
| `src/routes/internal-admin/tools.ts`          | Tool config CRUD                             |
| `src/routes/internal-admin/modes.ts`          | Mode config CRUD                             |
| `src/routes/internal-admin/mcp.ts`            | MCP server config CRUD                       |
| `src/routes/internal-admin/workspaces.ts`     | Workspace admin CRUD                         |
| `src/routes/internal-admin/routing.ts`        | Routing rule CRUD                            |
| `src/routes/internal-admin/prompts.ts`        | System prompt CRUD                           |
| `src/routes/internal-admin/audit.ts`          | Audit log query/export                       |
| `src/routes/internal-admin/api-keys.ts`       | Admin API key management                     |
| `src/routes/internal-admin/auth.ts`           | JWT token issuance/revocation                |
| `lib/db/drizzle/0002_admin_config_tables.sql` | 9 new admin config tables                    |

### Modified Files

| File                     | Change                                                        |
| ------------------------ | ------------------------------------------------------------- |
| `src/app.ts`             | Add `/internal` route group with admin auth middleware        |
| `src/routes/index.ts`    | Add sanitization to public agent routes                       |
| `src/agents/runner.ts`   | Load config from config-service instead of hardcoded defaults |
| `src/agents/types.ts`    | Add `displayName` field for public-safe mode names            |
| `src/providers/index.ts` | Accept config from config-service instead of env vars only    |
| `src/config.ts`          | Add admin-related env vars                                    |
| `package.json`           | Add `jsonwebtoken` + `@types/jsonwebtoken`                    |

### Environment Variables

```
ENCRYPTION_KEY=64-char-hex-string
ADMIN_JWT_SECRET=32-byte-random
ADMIN_API_KEY_SALT=bcrypt-salt-rounds
ADMIN_IP_ALLOWLIST=10.0.0.0/8,172.16.0.0/12
ENABLE_ADMIN_UI=true|false
```

## 10. Security Checklist

- [ ] All admin routes require adminAuthMiddleware
- [ ] JWT tokens signed with HS256, 1-hour TTL
- [ ] API keys stored as bcrypt hashes
- [ ] Secrets encrypted at rest (AES-256-GCM)
- [ ] Secrets never logged (redact from all log statements)
- [ ] Secrets never in API responses (mask as `sk_***last4`)
- [ ] Public responses sanitized via middleware
- [ ] Admin UI not bundled in public frontend
- [ ] IP allowlist for admin endpoints
- [ ] Rate limiting on admin auth endpoints
- [ ] All admin actions audit-logged
- [ ] Audit logs never contain secrets
- [ ] CORS restricted on admin routes (no public origin)
- [ ] Helmet headers on admin routes
- [ ] Admin routes under `/internal` (not `/api`) to avoid accidental exposure
