# Agent Migration Plan — Phases 7-12

## Phase 7 — Memory System

### 7.1 Short-Term Memory

Session-scoped conversation history. Stored in `agent_sessions` table:

- Messages array (JSONB) with full conversation context
- Automatic pruning when context window exceeded
- TTL: 24 hours of inactivity

### 7.2 Workspace Memory

Persistent per-workspace key-value store:

- `agent_workspace_memory` table
- Used for: user preferences, project context, recurring instructions
- Survives across sessions

### 7.3 Semantic Retrieval

Requires `pgvector` extension (available in PostgreSQL 16):

- `agent_memory_embeddings` table with `vector(1536)` column
- Uses OpenAI `text-embedding-3-small` for embeddings
- IVFFlat index for fast cosine similarity search
- Automatic embedding generation for workspace files and conversation summaries

### 7.4 DB Migrations

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Session memory
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES agent_workspaces(id) ON DELETE SET NULL,
  mode VARCHAR NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agent_sessions_user ON agent_sessions(user_id);
CREATE INDEX idx_agent_sessions_updated ON agent_sessions(updated_at);

-- Workspace memory
CREATE TABLE agent_workspace_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES agent_workspaces(id) ON DELETE CASCADE,
  key VARCHAR NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, key)
);

-- Semantic memory
CREATE TABLE agent_memory_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES agent_workspaces(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON agent_memory_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

---

## Phase 8 — MCP Support

### 8.1 MCP Client

Supports two transport types:

- **stdio**: Spawn MCP server process, communicate via stdin/stdout
- **HTTP**: Connect to remote MCP server via HTTP/SSE

### 8.2 Tool Discovery

On connection, MCP client calls `tools/list` and registers discovered tools with prefix `mcp.{server_name}.{tool_name}`.

### 8.3 Configuration Storage

```sql
CREATE TABLE agent_mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES agent_workspaces(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  transport VARCHAR NOT NULL CHECK (transport IN ('stdio', 'http')),
  config JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_connected_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Phase 9 — Workspace Isolation

### 9.1 Directory Structure

```
/workspaces/{workspace_id}/
├── config.json           # Workspace configuration
├── uploads/              # Uploaded PDFs and files
├── generated/            # Generated cards, QBanks
├── checkpoints/          # Agent execution checkpoints
└── logs/                 # Per-workspace agent logs
```

### 9.2 Database Schema

```sql
CREATE TABLE agent_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  storage_path VARCHAR NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agent_workspaces_user ON agent_workspaces(user_id);
```

### 9.3 Default Workspace

Each user gets a default workspace created on first agent interaction.

---

## Phase 10 — Backward Compatibility

### 10.1 API Versioning

- **Existing endpoints**: remain at `/api/*` (unchanged)
- **New agent endpoints**: `/api/v2/agents/*` (versioned)
- **Deprecation headers**: `Deprecation` + `Sunset` headers on any changed endpoints

### 10.2 Compatibility Guarantees

1. All 58 existing endpoints continue working without modification
2. Existing frontend (`artifacts/anki-generator`) requires zero changes
3. Existing API client (`lib/api-client-react`) requires zero changes
4. Database schema additions are additive only (no column drops/renames)
5. New tables use `agent_` prefix to avoid naming conflicts
6. Existing SSE event format preserved for current streaming endpoints

### 10.3 Route Mounting

In `routes/index.ts`, add agent routes alongside existing ones:

```typescript
import agentRoutes from "./agents";
import agentStreamRoutes from "./agent-stream";
// ... other agent routes

// Existing routes (unchanged)
router.use(authMiddleware);
router.use(healthRouter);
// ... all existing routers ...

// New agent routes (v2)
router.use("/v2/agents", agentRoutes);
router.use("/v2/agents/stream", agentStreamRoutes);
```

---

## Phase 11 — Performance Optimization

### 11.1 Async Concurrency

- Increase global concurrency limit from 4 → 10 (configurable per-provider)
- Per-provider concurrency limits (e.g., Groq: 10, OpenAI: 5)
- Connection pooling for provider HTTP clients

### 11.2 Caching

- Extend existing LRU cache with per-user cache keys
- Semantic cache: hash prompt embeddings for similarity matching
- Tool result caching for deterministic tools (filesystem.read)

### 11.3 Task Queue

In-memory task queue (suitable for single-instance deployment):

- Task types: `agent_run`, `tool_execute`, `file_process`
- Priority queue with configurable workers
- Future: Redis-backed queue for multi-instance

### 11.4 Token Accounting

```sql
CREATE TABLE agent_token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES agent_sessions(id) ON DELETE SET NULL,
  provider VARCHAR NOT NULL,
  model VARCHAR NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  cost DECIMAL(10, 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agent_token_usage_user ON agent_token_usage(user_id);
CREATE INDEX idx_agent_token_usage_created ON agent_token_usage(created_at);
```

---

## Phase 12 — Output Summary

### 12.1 New Files to Create (40+)

**Providers** (6 files):

- `src/providers/base.ts` — BaseProvider abstract class
- `src/providers/openai.ts` — OpenAI adapter
- `src/providers/openrouter.ts` — OpenRouter adapter
- `src/providers/ollama.ts` — Ollama adapter
- `src/providers/groq.ts` — Groq adapter
- `src/providers/index.ts` — Provider factory

**Agents** (3 files):

- `src/agents/types.ts` — Agent types + mode definitions
- `src/agents/runner.ts` — Agent execution loop
- `src/agents/registry.ts` — Mode registry

**Tools** (10 files):

- `src/tools/types.ts` — Tool types + base class
- `src/tools/registry.ts` — Tool registry
- `src/tools/filesystem.ts` — filesystem.read, filesystem.write
- `src/tools/terminal.ts` — terminal.exec
- `src/tools/browser.ts` — browser.fetch
- `src/tools/http.ts` — http.request
- `src/tools/pdf.ts` — pdf.extract (wraps existing)
- `src/tools/flashcard.ts` — flashcard.generate (wraps existing)
- `src/tools/qbank.ts` — qbank.generate (wraps existing)
- `src/tools/mindmap.ts` — mindmap.generate (wraps existing)

**Memory** (3 files):

- `src/memory/short-term.ts` — Session memory
- `src/memory/workspace.ts` — Workspace memory
- `src/memory/semantic.ts` — Semantic retrieval

**MCP** (3 files):

- `src/mcp/client.ts` — MCP client
- `src/mcp/registry.ts` — MCP tool registry
- `src/mcp/types.ts` — MCP types

**Workspaces** (2 files):

- `src/workspaces/manager.ts` — Workspace CRUD
- `src/workspaces/storage.ts` — File storage

**Streaming** (3 files):

- `src/streaming/events.ts` — Event type definitions
- `src/streaming/websocket.ts` — WebSocket handler
- `src/streaming/sse.ts` — Enhanced SSE (wraps existing)

**Tasks** (2 files):

- `src/tasks/queue.ts` — Task queue
- `src/tasks/worker.ts` — Task worker

**Routes** (6 files):

- `src/routes/agents.ts` — Agent CRUD routes
- `src/routes/agent-stream.ts` — Agent streaming route
- `src/routes/agent-tasks.ts` — Task management routes
- `src/routes/agent-tools.ts` — Tool management routes
- `src/routes/agent-modes.ts` — Mode management routes
- `src/routes/agent-workspaces.ts` — Workspace routes
- `src/routes/agent-mcp.ts` — MCP management routes

### 12.2 Existing Files to Modify (6 files)

| File                       | Change                            |
| -------------------------- | --------------------------------- |
| `src/lib/ai-client.ts`     | Refactor to use provider adapters |
| `src/lib/models.ts`        | Add per-mode model config         |
| `src/routes/index.ts`      | Add agent route mounts            |
| `src/lib/error-handler.ts` | Add agent error codes             |
| `src/lib/rate-limiter.ts`  | Add per-agent limits              |
| `src/config.ts`            | Add agent-related env vars        |

### 12.3 Database Migrations (8 new tables)

1. `agent_workspaces`
2. `agent_sessions`
3. `agent_workspace_memory`
4. `agent_memory_embeddings` (requires pgvector)
5. `agent_modes`
6. `agent_mcp_servers`
7. `agent_token_usage`
8. `agent_tasks`

All migrations are additive — no existing table changes.

### 12.4 Updated Docker Config

**Dockerfile changes:**

```dockerfile
# Add pgvector support
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-16-pgvector \
    && rm -rf /var/lib/apt/lists/*

# Add workspace volume
VOLUME /workspaces
```

**render.yaml changes:**

```yaml
envVars:
  - key: AGENT_WORKSPACE_PATH
    value: /workspaces
  - key: OPENAI_API_KEY
    sync: false
  - key: AGENT_DEFAULT_MODEL
    value: gpt-4o-mini
```

### 12.5 Tests

| Test File                     | Coverage                |
| ----------------------------- | ----------------------- |
| `tests/providers/*.test.ts`   | All 4 provider adapters |
| `tests/agents/runner.test.ts` | Agent execution loop    |
| `tests/tools/*.test.ts`       | All tool plugins        |
| `tests/memory/*.test.ts`      | Memory systems          |
| `tests/mcp/client.test.ts`    | MCP client              |
| `tests/routes/agents.test.ts` | Agent API endpoints     |
| `tests/streaming/*.test.ts`   | SSE + WebSocket         |

### 12.6 Rollout Plan (8 weeks)

**Week 1-2: Foundation**

- Create provider adapters (Phase 3)
- Create tool system (Phase 5)
- Add database migrations
- Write tests for providers + tools

**Week 3-4: Agent Core**

- Implement agent runner (Phase 2)
- Implement modes (Phase 4)
- Implement streaming upgrade (Phase 6)
- Write tests for agent runner

**Week 5-6: Memory + MCP + Workspaces**

- Implement memory system (Phase 7)
- Implement MCP client (Phase 8)
- Implement workspace isolation (Phase 9)
- Write tests for all three

**Week 7: Integration + Compatibility**

- Wire up all routes (Phase 10)
- Performance optimization (Phase 11)
- End-to-end testing
- Backward compatibility verification

**Week 8: Deploy**

- Update Docker config
- Update Render config
- Deploy to staging
- Smoke test all existing endpoints
- Deploy to production
- Monitor for 48 hours
