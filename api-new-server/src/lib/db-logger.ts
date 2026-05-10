/**
 * Database log writer — writes log entries to the server_logs table.
 * Initialized after DB connection is established.
 */

import type { DbLogEntry } from "./logger";
import { pool } from "@workspace/db";

const MAX_LOG_MESSAGE_LENGTH = 4000;
const MAX_STACK_LENGTH = 8000;

export async function writeLogToDb(entry: DbLogEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO server_logs (level, message, endpoint, method, user_id, request_id, ip, status_code, duration_ms, metadata, stack, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'db')`,
      [
        entry.level,
        entry.message.slice(0, MAX_LOG_MESSAGE_LENGTH),
        entry.endpoint ?? null,
        entry.method ?? null,
        entry.userId ?? null,
        entry.requestId ?? null,
        entry.ip ?? null,
        entry.statusCode ?? null,
        entry.durationMs ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.stack?.slice(0, MAX_STACK_LENGTH) ?? null,
      ]
    );
  } catch {
    // DB logging must never throw — the file/console logger is the safety net
  }
}

/**
 * Query logs from the database (for admin use).
 */
export interface LogQueryParams {
  level?: string;
  endpoint?: string;
  userId?: string;
  requestId?: string;
  since?: string; // ISO date or relative like "24h"
  limit?: number;
  offset?: number;
}

export async function queryLogs(params: LogQueryParams): Promise<{
  logs: unknown[];
  total: number;
}> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (params.level) {
    conditions.push(`level = $${paramIdx++}`);
    values.push(params.level);
  }
  if (params.endpoint) {
    conditions.push(`endpoint = $${paramIdx++}`);
    values.push(params.endpoint);
  }
  if (params.userId) {
    conditions.push(`user_id = $${paramIdx++}`);
    values.push(params.userId);
  }
  if (params.requestId) {
    conditions.push(`request_id = $${paramIdx++}`);
    values.push(params.requestId);
  }
  if (params.since) {
    const sinceDate = parseSince(params.since);
    if (sinceDate) {
      conditions.push(`created_at >= $${paramIdx++}`);
      values.push(sinceDate);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const [logsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT * FROM server_logs ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, limit, offset]
    ),
    pool.query(`SELECT count(*)::int AS total FROM server_logs ${whereClause}`, values),
  ]);

  return {
    logs: logsResult.rows,
    total: (countResult.rows[0] as { total?: number } | undefined)?.total ?? 0,
  };
}

function parseSince(since: string): string | null {
  // Handle relative time like "24h", "7d"
  const match = since.match(/^(\d+)(h|d)$/);
  if (match) {
    const amount = parseInt(match[1], 10);
    const unit = match[2];
    const ms = unit === "h" ? amount * 3600000 : amount * 86400000;
    return new Date(Date.now() - ms).toISOString();
  }
  // Try parsing as ISO date
  const date = new Date(since);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }
  return null;
}

/**
 * Delete old logs beyond the retention period.
 */
export async function cleanupOldLogs(retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
  const result = await pool.query(`DELETE FROM server_logs WHERE created_at < $1`, [cutoff]);
  return result.rowCount ?? 0;
}
