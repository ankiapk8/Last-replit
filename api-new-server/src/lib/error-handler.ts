/**
 * Centralized error handling — standardized error responses + logging.
 */

import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logError } from "./logger";

// ─── Error Codes ──────────────────────────────────────────────────────────────

export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  AI_ERROR: "AI_ERROR",
  AI_TIMEOUT: "AI_TIMEOUT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

const ERROR_HTTP_STATUS: Record<ErrorCodeType, number> = {
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.AI_ERROR]: 502,
  [ErrorCode.AI_TIMEOUT]: 504,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
};

// ─── AppError Class ───────────────────────────────────────────────────────────

export class AppError extends Error {
  public readonly code: ErrorCodeType;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCodeType, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.statusCode = ERROR_HTTP_STATUS[code];
    this.details = details;
    this.name = "AppError";
  }

  static validation(message: string, details?: Record<string, unknown>) {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, details);
  }

  static unauthorized(message = "Authentication required") {
    return new AppError(ErrorCode.UNAUTHORIZED, message);
  }

  static forbidden(message = "Access denied") {
    return new AppError(ErrorCode.FORBIDDEN, message);
  }

  static notFound(message = "Resource not found") {
    return new AppError(ErrorCode.NOT_FOUND, message);
  }

  static rateLimited(message = "Too many requests. Please wait a moment.") {
    return new AppError(ErrorCode.RATE_LIMITED, message);
  }

  static aiError(message = "AI service error") {
    return new AppError(ErrorCode.AI_ERROR, message);
  }

  static aiTimeout(message = "AI request timed out") {
    return new AppError(ErrorCode.AI_TIMEOUT, message);
  }

  static internal(message = "Internal server error") {
    return new AppError(ErrorCode.INTERNAL_ERROR, message);
  }

  static serviceUnavailable(message = "Service temporarily unavailable") {
    return new AppError(ErrorCode.SERVICE_UNAVAILABLE, message);
  }
}

// ─── Error Response Formatter ─────────────────────────────────────────────────

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    request_id?: string;
  };
}

export function sendError(
  res: Response,
  err: AppError | Error | ZodError,
  requestId?: string
): void {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const body: ErrorResponseBody = {
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: "Validation failed",
        details: { issues: err.issues },
        request_id: requestId,
      },
    };
    res.status(400).json(body);
    return;
  }

  // Handle AppError (our standardized errors)
  if (err instanceof AppError) {
    const body: ErrorResponseBody = {
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        request_id: requestId,
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // Handle unknown errors — don't leak internals
  const body: ErrorResponseBody = {
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: "An unexpected error occurred",
      request_id: requestId,
    },
  };
  res.status(500).json(body);
}

// ─── Global Error Middleware ──────────────────────────────────────────────────

export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req as Request & { requestId?: string }).requestId;

  // Log the error with full context
  logError(err, {
    endpoint: `${req.method} ${req.url?.split("?")[0]}`,
    method: req.method,
    userId: (req as Request & { user?: { id: string } }).user?.id,
    requestId,
    ip: req.ip,
  });

  if (!res.headersSent) {
    sendError(res, err, requestId);
  }
}
