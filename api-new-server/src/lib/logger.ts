/**
 * Dual-write logger: writes to both database and local file.
 * Falls back to file-only if DB is unavailable.
 * In development, also writes to console via pino-pretty.
 */

import pino from "pino";
import { getConfig, isDevelopment } from "../config";

const LOG_LEVEL = getConfig().LOG_LEVEL;

// Base pino logger — always has at least a file/console transport
const transports: pino.TransportTargetOptions[] = [];

if (isDevelopment()) {
  transports.push({
    target: "pino-pretty",
    options: { colorize: true },
  });
}

// File transport via pino-roll for production file logging
if (getConfig().LOG_TO_FILE) {
  transports.push({
    target: "pino-roll",
    options: {
      file: getConfig().LOG_FILE_PATH,
      size: getConfig().LOG_MAX_FILE_SIZE,
      mkdir: true,
    },
    level: LOG_LEVEL,
  });
}

const transport =
  transports.length > 1
    ? { targets: transports }
    : transports.length === 1
      ? transports[0]
      : undefined;

export const logger = pino({
  level: LOG_LEVEL,
  redact: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"],
  ...(transport ? { transport } : {}),
});

// DB log writer — initialized lazily to avoid circular deps
let dbLogWriter: ((entry: DbLogEntry) => Promise<void>) | null = null;

export function setDbLogWriter(writer: (entry: DbLogEntry) => Promise<void>) {
  dbLogWriter = writer;
}

export interface DbLogEntry {
  level: string;
  message: string;
  endpoint?: string;
  method?: string;
  userId?: string;
  requestId?: string;
  ip?: string;
  statusCode?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  stack?: string;
}

/**
 * Write a log entry to the database (async, non-blocking).
 * Failures are silently caught — the file/console logger is the safety net.
 */
export async function logToDb(entry: DbLogEntry): Promise<void> {
  if (!dbLogWriter) return;
  try {
    await dbLogWriter(entry);
  } catch {
    // DB logging failure must never break the application
  }
}

/**
 * Convenience: log an error with full context to both pino and DB.
 */
export function logError(
  err: unknown,
  context: {
    message?: string;
    endpoint?: string;
    method?: string;
    userId?: string;
    requestId?: string;
    ip?: string;
    statusCode?: number;
    metadata?: Record<string, unknown>;
  } = {}
): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const entry: DbLogEntry = {
    level: "error",
    message: context.message ?? error.message,
    endpoint: context.endpoint,
    method: context.method,
    userId: context.userId,
    requestId: context.requestId,
    ip: context.ip,
    statusCode: context.statusCode,
    metadata: context.metadata,
    stack: error.stack,
  };
  logger.error({ ...entry }, entry.message);
  // Fire-and-forget DB write
  logToDb(entry);
}

/**
 * Convenience: log an info message to both pino and DB.
 */
export function logInfo(
  message: string,
  context: {
    endpoint?: string;
    method?: string;
    userId?: string;
    requestId?: string;
    ip?: string;
    statusCode?: number;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  } = {}
): void {
  const entry: DbLogEntry = { level: "info", message, ...context };
  logger.info({ ...entry }, message);
  logToDb(entry);
}
