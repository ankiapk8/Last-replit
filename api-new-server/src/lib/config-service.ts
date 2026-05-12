/**
 * Config service — in-memory cache of internal configurations with hot-reload.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { encrypt, decrypt } from "./encryption";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProviderConfigRow {
  id: string;
  provider: string;
  api_key_encrypted: string;
  base_url: string | null;
  extra_config: Record<string, unknown>;
  is_active: boolean;
}

export interface AgentModeConfigRow {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  model: string;
  provider: string;
  tools: unknown;
  max_tokens: number;
  temperature: number;
  approval_policy: string;
  max_tool_calls: number;
  timeout_ms: number;
  is_active: boolean;
}

export interface ToolConfigRow {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: unknown;
  requires_approval: boolean;
  is_enabled: boolean;
}

export interface RoutingConfigRow {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  match_rules: unknown;
  provider: string;
  model: string;
  fallback_provider: string | null;
  fallback_model: string | null;
  is_active: boolean;
}

export interface MCPServerConfigRow {
  id: string;
  name: string;
  transport: "stdio" | "http";
  command: string | null;
  args: unknown;
  env_encrypted: string | null;
  url: string | null;
  headers_encrypted: string | null;
  is_enabled: boolean;
}

export type ConfigChangeEvent = {
  resource: "provider" | "mode" | "tool" | "routing" | "mcp" | "prompt";
  action: "create" | "update" | "delete";
  id: string;
  timestamp: Date;
};

type Listener = (event: ConfigChangeEvent) => void;

// ─── Cache ────────────────────────────────────────────────────────────────────

interface ConfigCache {
  providers: Map<string, ProviderConfigRow>;
  modes: Map<string, AgentModeConfigRow>;
  tools: Map<string, ToolConfigRow>;
  routing: RoutingConfigRow[];
  mcpServers: Map<string, MCPServerConfigRow>;
}

let cache: ConfigCache = {
  providers: new Map(),
  modes: new Map(),
  tools: new Map(),
  routing: [],
  mcpServers: new Map(),
};

const listeners: Set<Listener> = new Set();

// ─── Public API ───────────────────────────────────────────────────────────────

export function getConfig(): Readonly<ConfigCache> {
  return cache;
}

export function getProviderConfig(id: string): ProviderConfigRow | undefined {
  return cache.providers.get(id);
}

export function getModeConfig(id: string): AgentModeConfigRow | undefined {
  return cache.modes.get(id);
}

export function getToolConfig(id: string): ToolConfigRow | undefined {
  return cache.tools.get(id);
}

export function getRoutingConfigs(): ReadonlyArray<RoutingConfigRow> {
  return cache.routing;
}

export function getMCPConfig(id: string): MCPServerConfigRow | undefined {
  return cache.mcpServers.get(id);
}

export function getDecryptedApiKey(provider: string): string | null {
  const config = cache.providers.get(provider);
  if (!config) return null;
  try {
    return decrypt(config.api_key_encrypted);
  } catch (err) {
    logger.error({ provider, err }, "Failed to decrypt provider API key");
    return null;
  }
}

export function onConfigChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange(event: ConfigChangeEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      logger.error({ err, event }, "Config change listener error");
    }
  }
}

// ─── Load from DB ─────────────────────────────────────────────────────────────

function castRow<T>(row: unknown): T {
  return row as T;
}

export async function loadAllConfigs(): Promise<void> {
  logger.info("Loading internal configs from DB...");

  try {
    const providers = await db.execute(
      sql`SELECT id, provider, api_key_encrypted, base_url, extra_config, is_active FROM provider_configs`
    );
    cache.providers.clear();
    for (const raw of providers.rows) {
      const row = castRow<ProviderConfigRow>(raw);
      if (row.is_active) cache.providers.set(row.id, row);
    }
  } catch (err) {
    logger.warn({ err }, "Failed to load provider_configs (table may not exist yet)");
  }

  try {
    const modes = await db.execute(
      sql`SELECT id, name, description, system_prompt, model, provider, tools, max_tokens, temperature, approval_policy, max_tool_calls, timeout_ms, is_active FROM agent_mode_configs`
    );
    cache.modes.clear();
    for (const raw of modes.rows) {
      const row = castRow<AgentModeConfigRow>(raw);
      if (row.is_active) cache.modes.set(row.id, row);
    }
  } catch (err) {
    logger.warn({ err }, "Failed to load agent_mode_configs (table may not exist yet)");
  }

  try {
    const tools = await db.execute(
      sql`SELECT id, name, description, category, parameters, requires_approval, is_enabled FROM tool_configs`
    );
    cache.tools.clear();
    for (const raw of tools.rows) {
      const row = castRow<ToolConfigRow>(raw);
      if (row.is_enabled) cache.tools.set(row.id, row);
    }
  } catch (err) {
    logger.warn({ err }, "Failed to load tool_configs (table may not exist yet)");
  }

  try {
    const routing = await db.execute(
      sql`SELECT id, name, description, priority, match_rules, provider, model, fallback_provider, fallback_model, is_active FROM routing_configs ORDER BY priority DESC`
    );
    cache.routing = (routing.rows as unknown[])
      .map((r) => castRow<RoutingConfigRow>(r))
      .filter((r) => r.is_active);
  } catch (err) {
    logger.warn({ err }, "Failed to load routing_configs (table may not exist yet)");
  }

  try {
    const mcpServers = await db.execute(
      sql`SELECT id, name, transport, command, args, env_encrypted, url, headers_encrypted, is_enabled FROM mcp_server_configs`
    );
    cache.mcpServers.clear();
    for (const raw of mcpServers.rows) {
      const row = castRow<MCPServerConfigRow>(raw);
      if (row.is_enabled) cache.mcpServers.set(row.id, row);
    }
  } catch (err) {
    logger.warn({ err }, "Failed to load mcp_server_configs (table may not exist yet)");
  }

  logger.info(
    {
      providers: cache.providers.size,
      modes: cache.modes.size,
      tools: cache.tools.size,
      routing: cache.routing.length,
      mcpServers: cache.mcpServers.size,
    },
    "Internal configs loaded"
  );
}
