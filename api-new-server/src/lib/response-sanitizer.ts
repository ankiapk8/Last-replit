/**
 * Response sanitizer — strips internal/sensitive fields from public API responses.
 * Applied as middleware on public routes to ensure no internal config leaks.
 */

const SENSITIVE_KEYS = new Set([
  // Secrets
  "api_key", "apiKey", "secret", "password", "token",
  "access_token", "refresh_token", "client_secret",
  "key_hash", "encrypted", "ciphertext",
  // Internal config
  "system_prompt", "systemPrompt",
  "temperature", "max_tokens", "maxTokens",
  "provider_config", "providerConfig",
  "internal_routing", "internalRouting",
  "mcp_config", "mcpConfig",
  "tool_permissions", "toolPermissions",
  "approval_policy", "approvalPolicy",
  "base_url", "extra_config",
  "env_encrypted", "headers_encrypted",
  "api_key_encrypted",
  // Internal metadata
  "internal", "private", "secret_key",
  "routing_rules", "model_config",
]);

/**
 * Recursively strip sensitive fields from a response object.
 */
export function sanitize<T>(data: T): T {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitize(item)) as T;
  }

  if (typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key)) {
        continue; // Strip entirely
      }
      result[key] = sanitize(value);
    }
    return result as T;
  }

  return data;
}

/**
 * Express middleware that sanitizes the response body.
 * Usage: app.use("/api/v2", sanitizeMiddleware);
 */
import type { Request, Response, NextFunction } from "express";

export function sanitizeMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    return originalJson(sanitize(body));
  };
  next();
}

/**
 * Public-safe agent session response.
 * Only exposes fields that are safe for public consumption.
 */
export function toPublicSession(session: Record<string, unknown>): Record<string, unknown> {
  return {
    agent_id: session.id,
    mode: session.mode,
    display_name: session.display_name || session.mode,
    status: session.status,
    created_at: session.created_at,
  };
}

/**
 * Public-safe mode response.
 * Strips system prompts, model names, provider names, etc.
 */
export function toPublicMode(mode: Record<string, unknown>): Record<string, unknown> {
  return {
    id: mode.id,
    name: mode.name,
    description: mode.description,
    display_name: mode.name,
    is_active: mode.is_active,
  };
}

/**
 * Public-safe provider response.
 * Masks API keys, strips internal routing.
 */
export function toPublicProvider(provider: Record<string, unknown>): Record<string, unknown> {
  return {
    id: provider.id,
    provider: provider.provider,
    is_active: provider.is_active,
    // Mask the key: show only last 4 chars
    key_preview: provider.api_key_encrypted
      ? "***" + String(provider.api_key_encrypted).slice(-4)
      : null,
    created_at: provider.created_at,
    updated_at: provider.updated_at,
  };
}
