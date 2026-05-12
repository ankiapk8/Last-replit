# Agent Migration Plan — Phases 2-6

## Phase 2 — Agent Architecture Migration

### 2.1 Target Module Structure

```
api-new-server/src/
├── agents/                  # NEW: Agent runtime
│   ├── runner.ts            # Agent execution loop
│   ├── registry.ts          # Agent mode registry
│   └── types.ts             # Agent types
├── providers/               # NEW: Provider adapters
│   ├── base.ts              # BaseProvider abstract class
│   ├── openai.ts            # OpenAI adapter
│   ├── openrouter.ts        # OpenRouter adapter
│   ├── ollama.ts            # Ollama adapter
│   ├── groq.ts              # Groq adapter
│   └── index.ts             # Provider factory
├── tools/                   # NEW: Tool plugins
│   ├── registry.ts          # Tool registry
│   ├── filesystem.ts        # filesystem.read, filesystem.write
│   ├── terminal.ts          # terminal.exec
│   ├── browser.ts           # browser.fetch
│   ├── http.ts              # http.request
│   ├── pdf.ts               # pdf.extract
│   ├── flashcard.ts         # flashcard.generate
│   ├── qbank.ts             # qbank.generate
│   ├── mindmap.ts           # mindmap.generate
│   └── types.ts             # Tool types + validation
├── memory/                  # NEW: Memory system
│   ├── short-term.ts        # Session-scoped memory
│   ├── workspace.ts         # Workspace-scoped memory
│   ├── semantic.ts          # Semantic retrieval (pgvector)
│   └── schema.ts            # DB schema additions
├── mcp/                     # NEW: MCP support
│   ├── client.ts            # MCP client (stdio + HTTP)
│   ├── registry.ts          # MCP tool registry
│   └── types.ts             # MCP types
├── workspaces/              # NEW: Workspace isolation
│   ├── manager.ts           # Workspace CRUD
│   ├── storage.ts           # File storage per workspace
│   └── schema.ts            # DB schema additions
├── streaming/               # NEW: Enhanced streaming
│   ├── sse.ts               # SSE upgrade (reuse existing)
│   ├── websocket.ts         # WebSocket support
│   └── events.ts            # Event type definitions
├── tasks/                   # NEW: Task queue
│   ├── queue.ts             # In-memory task queue
│   ├── worker.ts            # Task worker
│   └── schema.ts            # DB schema for task persistence
├── auth/                    # REUSE + EXTEND
│   ├── middleware.ts         # Existing auth middleware (reuse)
│   ├── agent-auth.ts        # NEW: Agent-specific auth (API keys)
│   └── types.ts             # Extended auth types
├── routes/
│   ├── agents.ts            # NEW: /api/v2/agents/* routes
│   ├── agent-stream.ts      # NEW: /api/v2/agents/stream
│   ├── agent-tasks.ts       # NEW: /api/v2/agents/tasks/*
│   ├── agent-tools.ts       # NEW: /api/v2/agents/tools/*
│   ├── agent-modes.ts       # NEW: /api/v2/agents/modes/*
│   ├── agent-workspaces.ts  # NEW: /api/v2/agents/workspaces/*
│   ├── agent-mcp.ts         # NEW: /api/v2/agents/mcp/*
│   └── ...                  # Existing routes (unchanged)
├── lib/
│   ├── ai-client.ts         # REFACTORED → delegates to providers/
│   ├── models.ts            # EXTENDED → per-mode model config
│   └── ...                  # Existing libs (unchanged)
```

### 2.2 Reuse Strategy

| Existing Module          | Reuse                                         | Extension                                       |
| ------------------------ | --------------------------------------------- | ----------------------------------------------- |
| `lib/ai-client.ts`       | SSE helpers, concurrency limiter, retry logic | Replace OpenAI SDK calls with provider adapters |
| `lib/models.ts`          | Model name constants                          | Add per-mode model selection                    |
| `lib/auth.ts`            | Session management, OIDC flow                 | Add API key auth for agents                     |
| `lib/error-handler.ts`   | AppError class, global handler                | Add agent-specific error codes                  |
| `lib/rate-limiter.ts`    | Sliding window implementation                 | Add per-user and per-agent limits               |
| `lib/response-cache.ts`  | LRU cache implementation                      | Add agent response caching                      |
| `lib/monitor.ts`         | Metrics collection                            | Add agent execution metrics                     |
| `lib/logger.ts`          | Dual-write logging                            | Add agent audit logging                         |
| `lib/request-context.ts` | Request ID + timing                           | Add agent session context                       |
| `routes/health.ts`       | Health check pattern                          | Add agent dependency checks                     |
| `@workspace/db`          | All existing tables                           | Add agent-specific tables                       |
| `@workspace/api-zod`     | Zod schema patterns                           | Add agent validation schemas                    |

---

## Phase 3 — Provider Abstraction

### 3.1 BaseProvider Interface

Location: `api-new-server/src/providers/base.ts`

Key design decisions:

- Abstract class with template method pattern
- Shared retry logic migrated from `lib/ai-client.ts`
- Streaming via AsyncGenerator (matches existing `streamChat` pattern)
- Tool calling support via standardized `ToolCall` interface

### 3.2 Required Adapters

**OpenAI** (`providers/openai.ts`):

- Uses `openai` SDK directly
- Base URL: `https://api.openai.com/v1`
- Supports: function calling, vision, streaming
- Models: gpt-4o, gpt-4o-mini, o1, o3

**OpenRouter** (`providers/openrouter.ts`):

- Uses `openai` SDK with custom base URL
- Base URL: `https://openrouter.ai/api/v1`
- Headers: `HTTP-Referer`, `X-Title`
- Supports: function calling (model-dependent), vision, streaming

**Ollama** (`providers/ollama.ts`):

- Uses `openai` SDK with custom base URL
- Base URL: `http://localhost:11434/v1` (or cloud URL)
- Supports: function calling (model-dependent), streaming

**Groq** (`providers/groq.ts`):

- Uses `openai` SDK with custom base URL
- Base URL: `https://api.groq.com/openai/v1`
- Supports: function calling, streaming

### 3.3 Migration Path for Existing AI Calls

1. Create `providers/` directory with base + 4 adapters
2. Refactor `lib/ai-client.ts` to use provider factory
3. Keep existing SSE helpers (`setupSSEHeaders`, `sendSSE`, `startHeartbeat`)
4. Keep existing concurrency limiter and retry logic
5. All 6 existing AI endpoints continue working unchanged

---

## Phase 4 — Roo-Style Agent Modes

### 4.1 Mode Definitions

5 default modes: `ask`, `code`, `architect`, `debug`, `research`

Each mode configures:

- System prompt
- Model + provider
- Allowed tools (whitelist or `['*']` for all)
- Token limits
- Temperature
- Approval policy (`auto` | `confirm` | `deny`)
- Max tool calls
- Timeout

### 4.2 Mode Storage

- Default modes defined in code (seeded to DB on first run)
- User-customizable modes stored in `agent_modes` table
- Mode selection per agent session

---

## Phase 5 — Tool System

### 5.1 Tool Interface

Each tool implements:

- `definition: ToolDefinition` — name, description, JSON Schema parameters
- `execute(input, context): Promise<ToolResult>` — main execution

### 5.2 Tool Pipeline

```
Input → Zod Validation → Permission Check → Audit Log Start → Execute (with timeout) → Audit Log End → Result
```

### 5.3 Tool Implementations

| Tool ID              | Reuse From              | Description                        |
| -------------------- | ----------------------- | ---------------------------------- |
| `filesystem.read`    | —                       | Read files from workspace          |
| `filesystem.write`   | —                       | Write files to workspace           |
| `terminal.exec`      | —                       | Execute shell commands (sandboxed) |
| `browser.fetch`      | —                       | Fetch web content                  |
| `http.request`       | —                       | Make HTTP requests                 |
| `pdf.extract`        | `routes/extract-pdf.ts` | Extract text from PDFs             |
| `flashcard.generate` | `routes/generate.ts`    | Generate flashcards                |
| `qbank.generate`     | `routes/generate.ts`    | Generate question banks            |
| `mindmap.generate`   | `routes/mind-map.ts`    | Generate mind maps                 |

---

## Phase 6 — Streaming Upgrade

### 6.1 Event Types

Structured events for agent streaming:

- `start` — session init
- `token` — partial content
- `tool_call_start` / `tool_call_end` / `tool_call_error` — tool execution lifecycle
- `status` — thinking, tool_calling, streaming, done, error
- `usage` — token consumption + cost
- `error` — error with code
- `done` — final event with reason + usage

### 6.2 Transport Support

- **SSE** (existing, upgraded): `POST /api/v2/agents/stream`
- **WebSocket** (new): `WS /api/v2/agents/ws` — bidirectional for tool approval

### 6.3 Backward Compatibility

Existing SSE endpoints (`/api/generate/stream`, `/api/generate-qbank/stream`, `/api/explain`) continue working with their current event format.
