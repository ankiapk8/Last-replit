/**
 * Admin auth middleware — four auth methods + role validation + IP allowlist.
 * Methods: 1) Session+Role, 2) JWT Bearer, 3) API Key header, 4) Basic Auth (email:password).
 * Allowed roles: admin, owner, developer.
 */

import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { hashApiKey } from "../lib/encryption";

const ALLOWED_ROLES = ["admin", "owner", "developer"] as const;
type AdminRole = (typeof ALLOWED_ROLES)[number];

// Extend Express Request for admin context
declare global {
  namespace Express {
    interface Request {
      adminRole?: AdminRole;
      adminActorId?: string;
      adminAuthMethod?: "session" | "jwt" | "api_key" | "basic";
    }
  }
}

// ─── IP Allowlist ─────────────────────────────────────────────────────────────

function checkIPAllowlist(req: Request): boolean {
  const allowlist =
    process.env.ADMIN_IP_ALLOWLIST?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) || [];
  if (allowlist.length === 0) return true; // No restriction if not configured
  const clientIP = req.ip || req.socket.remoteAddress || "";
  return allowlist.some((entry) => {
    if (entry.includes("/")) {
      const [network, bits] = entry.split("/");
      return clientIP.startsWith(network.slice(0, network.lastIndexOf(".")));
    }
    return clientIP === entry || clientIP.startsWith(entry);
  });
}

// ─── Role Check from DB ───────────────────────────────────────────────────────

async function getUserRole(userId: string): Promise<string | null> {
  try {
    const result = await db.execute(
      sql`SELECT role FROM public.users WHERE id = ${userId} LIMIT 1`
    );
    return (result.rows[0] as { role?: string } | undefined)?.role || null;
  } catch (err) { logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Basic auth verifyBasicAuth error");
    return null;
  }
}

// ─── JWT Verification ─────────────────────────────────────────────────────────

async function verifyJWT(token: string): Promise<{ sub: string; role: AdminRole } | null> {
  try {
    const jwt = await import("jsonwebtoken");
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) {
      logger.error("ADMIN_JWT_SECRET not set — JWT auth disabled");
      return null;
    }
    const payload = jwt.verify(token, secret) as {
      sub: string;
      role: string;
      exp: number;
    };
    if (!ALLOWED_ROLES.includes(payload.role as AdminRole)) return null;
    return { sub: payload.sub, role: payload.role as AdminRole };
  } catch (err) { logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Basic auth verifyBasicAuth error");
    return null;
  }
}

// ─── API Key Verification ─────────────────────────────────────────────────────

async function verifyApiKey(key: string): Promise<{ id: string; role: AdminRole } | null> {
  try {
    const keyHash = hashApiKey(key);
    const result = await db.execute(
      sql`SELECT id, role, expires_at, is_active FROM admin_api_keys WHERE key_hash = ${keyHash} LIMIT 1`
    );
    const row = result.rows[0] as
      | {
          id: string;
          role: string;
          expires_at: Date | null;
          is_active: boolean;
        }
      | undefined;

    if (!row || !row.is_active) return null;
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
    if (!ALLOWED_ROLES.includes(row.role as AdminRole)) return null;

    // Update last_used_at (fire-and-forget)
    db.execute(sql`UPDATE admin_api_keys SET last_used_at = NOW() WHERE id = ${row.id}`).catch(
      () => {}
    );

    return { id: row.id, role: row.role as AdminRole };
  } catch (err) { logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Basic auth verifyBasicAuth error");
    return null;
  }
}

// ─── Basic Auth Validation ────────────────────────────────────────────────────

async function verifyBasicAuth(authHeader: string): Promise<{ id: string; role: AdminRole } | null> {
  try {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
    const colonIdx = decoded.indexOf(":");
    if (colonIdx === -1) return null;
    const email = decoded.slice(0, colonIdx);
    const password = decoded.slice(colonIdx + 1);
    if (!email || !password) return null;

    const userResult = await db.execute(
      sql`SELECT id, role, password_hash FROM public.users WHERE email = ${email} AND is_active = true LIMIT 1`
    );
    const user = userResult.rows[0] as { id: string; role: string; password_hash?: string } | undefined;
    logger.info({ foundUser: !!user, userRole: user?.role, hasPasswordHash: !!user?.password_hash }, "Basic auth user lookup");
    if (!user || !ALLOWED_ROLES.includes(user.role as AdminRole)) return null;

    // Validate password — support SHA-256 hash or empty password_hash (for dev users without password)
    const crypto = await import("node:crypto");
    const passwordHash = crypto.createHash("sha256").update(password).digest("hex");
    const isValidPassword = !user.password_hash || user.password_hash === passwordHash;
    logger.info({ isValidPassword, passwordHashPrefix: passwordHash.slice(0,8) }, "Basic auth password check");
    if (!isValidPassword) return null;

    return { id: user.id, role: user.role as AdminRole };
  } catch (err) { logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Basic auth verifyBasicAuth error");
    return null;
  }
}

// ─── Main Middleware ───────────────────────────────────────────────────────────

export async function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // 1. Check IP allowlist
  if (!checkIPAllowlist(req)) {
    logger.warn({ ip: req.ip, path: req.path }, "Admin access denied — IP not in allowlist");
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "Admin access denied" },
    });
    return;
  }

  // 2. Try session-based auth (existing OIDC session + role check)
  if (req.isAuthenticated && req.isAuthenticated() && req.user?.id) {
    const role = await getUserRole(req.user.id);
    if (role && ALLOWED_ROLES.includes(role as AdminRole)) {
      req.adminRole = role as AdminRole;
      req.adminActorId = req.user.id;
      req.adminAuthMethod = "session";
      next();
      return;
    }
  }

  const authHeader = req.headers.authorization;

  // 3. Try JWT Bearer token
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const jwtPayload = await verifyJWT(token);
    if (jwtPayload) {
      req.adminRole = jwtPayload.role;
      req.adminActorId = jwtPayload.sub;
      req.adminAuthMethod = "jwt";
      next();
      return;
    }
  }

  // 4. Try API Key
  const apiKey = req.headers["x-admin-api-key"] as string | undefined;
  if (apiKey) {
    const keyResult = await verifyApiKey(apiKey);
    if (keyResult) {
      req.adminRole = keyResult.role;
      req.adminActorId = `api-key:${keyResult.id}`;
      req.adminAuthMethod = "api_key";
      next();
      return;
    }
  }

  // 5. Try Basic Auth (email:password) — for admin frontend login
    logger.info({ path: req.path, hasBasic: !!authHeader?.startsWith("Basic ") }, "Basic auth attempt");
  if (authHeader?.startsWith("Basic ")) {
    const basicResult = await verifyBasicAuth(authHeader);
    logger.info({ hasBasicResult: !!basicResult }, "Basic auth result");
    if (basicResult) {
      req.adminRole = basicResult.role;
      req.adminActorId = basicResult.id;
      req.adminAuthMethod = "basic";
      next();
      return;
    }
  }

  // 6. All methods failed
  logger.warn(
    { ip: req.ip, path: req.path, hasAuth: !!authHeader, hasApiKey: !!apiKey },
    "Admin access denied — no valid credentials"
  );
  res.status(403).json({
    error: { code: "FORBIDDEN", message: "Admin access required" },
  });
}

// ─── Role Check Helper ────────────────────────────────────────────────────────

export function requireRole(...roles: AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.adminRole || !roles.includes(req.adminRole)) {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: `Required role: ${roles.join(" or ")}`,
        },
      });
      return;
    }
    next();
  };
}
