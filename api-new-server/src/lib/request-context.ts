/**
 * Request context — assigns a unique ID to each request for log correlation.
 */

import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.requestId = randomUUID();
  req.startTime = Date.now();
  res.setHeader("X-Request-Id", req.requestId);
  next();
}
