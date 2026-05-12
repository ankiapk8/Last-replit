-- Admin configuration system: internal config tables
-- All additive — no existing table changes

-- Enable pgvector for semantic memory
CREATE EXTENSION IF NOT EXISTS vector;

-- Admin API keys (hashed)
CREATE TABLE IF NOT EXISTS admin_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  key_hash VARCHAR NOT NULL UNIQUE,
  role VARCHAR NOT NULL CHECK (role IN ('admin', 'owner', 'developer')),
  created_by VARCHAR NOT NULL,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_api_keys_hash ON admin_api_keys(key_hash);

-- Provider configurations (encrypted secrets)
CREATE TABLE IF NOT EXISTS provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR NOT NULL UNIQUE,
  api_key_encrypted TEXT NOT NULL,
  base_url VARCHAR,
  extra_config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by VARCHAR,
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
  updated_by VARCHAR,
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
  updated_by VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Routing configurations
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
  updated_by VARCHAR,
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
  updated_by VARCHAR,
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

-- Agent workspaces
CREATE TABLE IF NOT EXISTS agent_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  storage_path VARCHAR NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_workspaces_user ON agent_workspaces(user_id);

-- Agent sessions
CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  workspace_id UUID,
  mode VARCHAR NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  status VARCHAR NOT NULL DEFAULT 'idle',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user ON agent_sessions(user_id);

-- Token usage tracking
CREATE TABLE IF NOT EXISTS agent_token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  session_id UUID,
  provider VARCHAR NOT NULL,
  model VARCHAR NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  cost DECIMAL(10, 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_token_usage_user ON agent_token_usage(user_id);

-- Task queue
CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  session_id UUID,
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
