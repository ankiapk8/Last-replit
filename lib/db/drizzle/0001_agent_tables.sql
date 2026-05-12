-- Agent migration: new tables for agent functionality
-- All tables are additive — no existing table changes

-- Enable pgvector extension for semantic memory
CREATE EXTENSION IF NOT EXISTS vector;

-- Agent workspaces
CREATE TABLE IF NOT EXISTS agent_workspaces (
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
CREATE INDEX IF NOT EXISTS idx_agent_workspaces_user ON agent_workspaces(user_id);

-- Agent sessions (conversation history)
CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES agent_workspaces(id) ON DELETE SET NULL,
  mode VARCHAR NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  status VARCHAR NOT NULL DEFAULT 'idle',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user ON agent_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_updated ON agent_sessions(updated_at);

-- Workspace memory (key-value store)
CREATE TABLE IF NOT EXISTS agent_workspace_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES agent_workspaces(id) ON DELETE CASCADE,
  key VARCHAR NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, key)
);

-- Semantic memory (requires pgvector)
CREATE TABLE IF NOT EXISTS agent_memory_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES agent_workspaces(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_embeddings_workspace ON agent_memory_embeddings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_embeddings_vector ON agent_memory_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Agent modes (user-customizable)
CREATE TABLE IF NOT EXISTS agent_modes (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
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
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- MCP server configurations
CREATE TABLE IF NOT EXISTS agent_mcp_servers (
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

-- Token usage tracking
CREATE TABLE IF NOT EXISTS agent_token_usage (
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
CREATE INDEX IF NOT EXISTS idx_agent_token_usage_user ON agent_token_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_token_usage_created ON agent_token_usage(created_at);

-- Task queue
CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES agent_sessions(id) ON DELETE SET NULL,
  type VARCHAR NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_user ON agent_tasks(user_id);
