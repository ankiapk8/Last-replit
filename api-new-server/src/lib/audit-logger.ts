/**
 * Audit logger — records all admin actions to the database.
 * Never logs secrets, API keys, or credential material.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export interface AuditEntry {
  actor_id: string;
  actor_role: string;
  action: string;
  resource: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
}

// Keys that should never appear in audit details
const SENSITIVE_KEYS = new Set([
  "api_key",
  "apiKey",
  "secret",
  "password",
  "token",
  "access_token",
  "refresh_token",
  "client_secret",
  "system_prompt", // logged as "updated" but content not stored
  "authorization",
  "cookie",
]);

function sanitizeDetails(
  details: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeDetails(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const safeDetails = sanitizeDetails(entry.details);
    await db.execute(sql`
      INSERT INTO admin_audit_log (actor_id, actor_role, action, resource, resource_id, details, ip_address, user_agent)
      VALUES (
        ${entry.actor_id},
        ${entry.actor_role},
        ${entry.action},
        ${entry.resource},
        ${entry.resource_id || null},
        ${safeDetails ? JSON.stringify(safeDetails) : null}::jsonb,
        ${entry.ip_address || null},
        ${entry.user_agent || null}
      )
    `);
  } catch (err) {
    // Audit logging must never break the application
    logger.error(
      { err, action: entry.action, resource: entry.resource },
      "Failed to write audit log"
    );
  }
}

export async function queryAuditLogs(params: {
  actorId?: string;
  action?: string;
  resource?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: unknown[]; total: number }> {
  const limit = Math.min(params.limit || 50, 200);
  const offset = params.offset || 0;

  let whereClause = "WHERE 1=1";
  const conditions: string[] = [];

  if (params.actorId) conditions.push(`actor_id = '${params.actorId.replace(/'/g, "''")}'`);
  if (params.action) conditions.push(`action = '${params.action.replace(/'/g, "''")}'`);
  if (params.resource) conditions.push(`resource = '${params.resource.replace(/'/g, "''")}'`);

  if (conditions.length > 0) {
    whereClause = "WHERE " + conditions.join(" AND ");
  }

  const [entriesResult, countResult] = await Promise.all([
    db.execute(
      sql`SELECT * FROM admin_audit_log ${sql.raw(whereClause)} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
    ),
    db.execute(sql`SELECT COUNT(*)::int AS cnt FROM admin_audit_log ${sql.raw(whereClause)}`),
  ]);

  return {
    entries: entriesResult.rows,
    total: (countResult.rows[0] as { cnt?: number } | undefined)?.cnt || 0,
  };
}
