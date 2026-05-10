/**
 * Logs every request/response to the database via the dual-write logger.
 */

import type { Request, Response, NextFunction } from "express";
import { logInfo, logError } from "../lib/logger";

export function requestLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startTime;
    const statusCode = res.statusCode;
    const userId = (req as Request & { user?: { id: string } }).user?.id;
    const requestId = (req as Request & { requestId?: string }).requestId;

    const logEntry = {
      endpoint: `${req.method} ${req.url?.split("?")[0]}`,
      method: req.method,
      userId,
      requestId,
      ip: req.ip,
      statusCode,
      durationMs,
    };

    if (statusCode >= 500) {
      logError(new Error(`Server error ${statusCode}`), logEntry);
    } else {
      logInfo(`${req.method} ${req.url?.split("?")[0]} ${statusCode}`, logEntry);
    }
  });

  next();
}
