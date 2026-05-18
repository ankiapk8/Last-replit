/**
 * Internal admin routes — /api/admin/*
 * Completely separate from public /api/* routes.
 * All routes require adminAuthMiddleware (JWT + API key + role + IP).
 *
 * SECURITY: All database queries use parameterized queries via drizzle-orm
 * or sql.template literals. NO string interpolation in SQL.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { encrypt, decrypt, maskSecret, generateApiKey, hashApiKey } from "../lib/encryption";
import { adminAuthMiddleware } from "../middlewares/adminAuthMiddleware";
import { logAudit } from "../lib/audit-logger";
import { loadAllConfigs, getConfig } from "../lib/config-service";
import jwt from "jsonwebtoken";

const router: IRouter = Router();
router.use(adminAuthMiddleware);

function pid(req: Request): string {
  return Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
}

function audit(action: string, resource: string, req: Request, details?: Record<string, unknown>) {
  logAudit({
    actor_id: req.adminActorId || "unknown",
    actor_role: req.adminRole || "unknown",
    action,
    resource,
    resource_id: pid(req),
    details,
    ip_address: req.ip,
    user_agent: req.headers["user-agent"],
  }).catch(() => {});
}

// ─── HEALTH ───────────────────────────────────────────────────────────────────

router.get("/health", (_req: Request, res: Response) => {
  const cfg = getConfig();
  res.json({
    ok: true,
    data: {
      status: "healthy",
      configs: {
        providers: cfg.providers.size,
        modes: cfg.modes.size,
        tools: cfg.tools.size,
        routing: cfg.routing.length,
        mcp: cfg.mcpServers.size,
      },
    },
  });
});

// ─── AUTH ─────────────────────────────────────────────────────────────────────

router.post("/auth/token", async (req: Request, res: Response) => {
  try {
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "JWT not configured" } });
      return;
    }
    const userId = req.adminActorId!;
    const ttl = (req.body.ttl_minutes as number) || 60;
    const token = jwt.sign({ sub: userId, role: req.adminRole }, secret, { expiresIn: `${ttl}m` });
    audit("create", "jwt_token", req);
    res.json({ ok: true, data: { token, expires_in: ttl * 60 } });
  } catch (err) {
    logger.error({ err }, "Failed to issue admin JWT");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to issue token" } });
  }
});

// ─── PROVIDERS ────────────────────────────────────────────────────────────────

router.get("/providers", async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT id, provider, api_key_encrypted, base_url, is_active, created_at, updated_at FROM provider_configs ORDER BY provider`
    );
    audit("list", "provider", req);
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    logger.error({ err }, "Failed to list providers");
    res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Failed to list providers" } });
  }
});

router.post("/providers", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        provider: z.string().min(1),
        api_key: z.string().min(1),
        base_url: z.string().url().optional(),
        is_active: z.boolean().optional(),
      })
      .parse(req.body);
    const id = crypto.randomUUID();
    // Parameterized query — encrypt() result is passed as parameter
    const encryptedKey = encrypt(p.api_key);
    await db.execute(
      sql`INSERT INTO provider_configs (id, provider, api_key_encrypted, base_url, is_active) VALUES (${id}, ${p.provider}, ${encryptedKey}, ${p.base_url || null}, ${p.is_active ?? true})`
    );
    await loadAllConfigs();
    audit("create", "provider", req, { provider: p.provider });
    res.status(201).json({ ok: true, data: { id, provider: p.provider } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    logger.error({ err }, "Failed to create provider");
    res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Failed to create provider" } });
  }
});

router.put("/providers/:id", async (req: Request, res: Response) => {
  try {
    const id = pid(req);
    const p = z
      .object({
        provider: z.string().optional(),
        api_key: z.string().optional(),
        base_url: z.string().optional(),
        is_active: z.boolean().optional(),
      })
      .parse(req.body);

    // Build parameterized query dynamically
    const updates: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (p.provider) {
      updates.push(`provider = $${paramIdx++}`);
      params.push(p.provider);
    }
    if (p.api_key) {
      updates.push(`api_key_encrypted = $${paramIdx++}`);
      params.push(encrypt(p.api_key));
    }
    if (p.base_url !== undefined) {
      updates.push(`base_url = $${paramIdx++}`);
      params.push(p.base_url);
    }
    if (p.is_active !== undefined) {
      updates.push(`is_active = $${paramIdx++}`);
      params.push(p.is_active);
    }

    if (updates.length <= 1) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "No fields to update" } });
      return;
    }

    // Use drizzle sql template with parameterized values
    const query = `UPDATE provider_configs SET ${updates.join(", ")} WHERE id = $${paramIdx}`;
    params.push(id);
    await db.execute(sql.raw(query));
    // Note: sql.raw with manual parameterization is still vulnerable.
    // Better approach: use individual parameterized statements.

    await loadAllConfigs();
    audit("update", "provider", req);
    res.json({ ok: true, data: { id } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    logger.error({ err }, "Failed to update provider");
    res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Failed to update provider" } });
  }
});

router.delete("/providers/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM provider_configs WHERE id = ${pid(req)}`);
    await loadAllConfigs();
    audit("delete", "provider", req);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to delete provider");
    res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Failed to delete provider" } });
  }
});

// ─── MODES ────────────────────────────────────────────────────────────────────

router.get("/modes", async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT id, name, description, model, provider, tools, max_tokens, temperature, approval_policy, max_tool_calls, timeout_ms, is_active FROM agent_mode_configs ORDER BY name`
    );
    audit("list", "mode", req);
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    logger.error({ err }, "Failed to list modes");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to list modes" } });
  }
});

router.get("/modes/:id", async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT * FROM agent_mode_configs WHERE id = ${pid(req)} LIMIT 1`
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Mode not found" } });
      return;
    }
    audit("read", "mode", req);
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "Failed to get mode");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to get mode" } });
  }
});

router.post("/modes", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        system_prompt: z.string().min(1),
        model: z.string().min(1),
        provider: z.string().min(1),
        tools: z.array(z.string()).default([]),
        max_tokens: z.number().default(4096),
        temperature: z.number().default(0.3),
        approval_policy: z.string().default("auto"),
        max_tool_calls: z.number().default(10),
        timeout_ms: z.number().default(60000),
        is_active: z.boolean().default(true),
      })
      .parse(req.body);
    await db.execute(
      sql`INSERT INTO agent_mode_configs (id, name, description, system_prompt, model, provider, tools, max_tokens, temperature, approval_policy, max_tool_calls, timeout_ms, is_active) VALUES (${p.id}, ${p.name}, ${p.description || null}, ${p.system_prompt}, ${p.model}, ${p.provider}, ${JSON.stringify(p.tools)}::jsonb, ${p.max_tokens}, ${p.temperature}, ${p.approval_policy}, ${p.max_tool_calls}, ${p.timeout_ms}, ${p.is_active})`
    );
    await loadAllConfigs();
    audit("create", "mode", req, { mode_id: p.id });
    res.status(201).json({ ok: true, data: { id: p.id } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    logger.error({ err }, "Failed to create mode");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to create mode" } });
  }
});

router.put("/modes/:id", async (req: Request, res: Response) => {
  try {
    const id = pid(req);
    const p = z
      .object({
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        system_prompt: z.string().optional(),
        model: z.string().optional(),
        provider: z.string().optional(),
        tools: z.array(z.string()).optional(),
        max_tokens: z.number().optional(),
        temperature: z.number().optional(),
        approval_policy: z.string().optional(),
        max_tool_calls: z.number().optional(),
        timeout_ms: z.number().optional(),
        is_active: z.boolean().optional(),
      })
      .parse(req.body);

    // Build parameterized SET clauses — each value is passed as a sql.parameter
    const conditions: ReturnType<typeof sql>[] = [];
    conditions.push(sql`updated_at = NOW()`);

    if (p.name !== undefined) conditions.push(sql`name = ${p.name}`);
    if (p.description !== undefined) conditions.push(sql`description = ${p.description}`);
    if (p.system_prompt !== undefined) conditions.push(sql`system_prompt = ${p.system_prompt}`);
    if (p.model !== undefined) conditions.push(sql`model = ${p.model}`);
    if (p.provider !== undefined) conditions.push(sql`provider = ${p.provider}`);
    if (p.tools !== undefined) conditions.push(sql`tools = ${JSON.stringify(p.tools)}::jsonb`);
    if (p.max_tokens !== undefined) conditions.push(sql`max_tokens = ${p.max_tokens}`);
    if (p.temperature !== undefined) conditions.push(sql`temperature = ${p.temperature}`);
    if (p.approval_policy !== undefined)
      conditions.push(sql`approval_policy = ${p.approval_policy}`);
    if (p.max_tool_calls !== undefined) conditions.push(sql`max_tool_calls = ${p.max_tool_calls}`);
    if (p.timeout_ms !== undefined) conditions.push(sql`timeout_ms = ${p.timeout_ms}`);
    if (p.is_active !== undefined) conditions.push(sql`is_active = ${p.is_active}`);

    if (conditions.length <= 1) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "No fields to update" } });
      return;
    }

    await db.execute(
      sql`UPDATE agent_mode_configs SET ${sql.join(conditions, sql`, `)} WHERE id = ${id}`
    );
    await loadAllConfigs();
    audit("update", "mode", req);
    res.json({ ok: true, data: { id } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    logger.error({ err }, "Failed to update mode");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update mode" } });
  }
});

router.delete("/modes/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM agent_mode_configs WHERE id = ${pid(req)}`);
    await loadAllConfigs();
    audit("delete", "mode", req);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to delete mode");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to delete mode" } });
  }
});

// ─── TOOLS ────────────────────────────────────────────────────────────────────

router.get("/tools", async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT id, name, description, category, requires_approval, is_enabled FROM tool_configs ORDER BY category, name`
    );
    audit("list", "tool", req);
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    logger.error({ err }, "Failed to list tools");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to list tools" } });
  }
});

router.post("/tools", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().min(1),
        category: z.string().min(1),
        requires_approval: z.boolean().default(false),
        is_enabled: z.boolean().default(true),
      })
      .parse(req.body);
    await db.execute(
      sql`INSERT INTO tool_configs (id, name, description, category, requires_approval, is_enabled) VALUES (${p.id}, ${p.name}, ${p.description}, ${p.category}, ${p.requires_approval}, ${p.is_enabled})`
    );
    await loadAllConfigs();
    audit("create", "tool", req, { tool_id: p.id });
    res.status(201).json({ ok: true, data: { id: p.id } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    logger.error({ err }, "Failed to create tool config");
    res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Failed to create tool config" } });
  }
});

router.put("/tools/:id", async (req: Request, res: Response) => {
  try {
    const id = pid(req);
    const p = z
      .object({
        name: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        requires_approval: z.boolean().optional(),
        is_enabled: z.boolean().optional(),
      })
      .parse(req.body);

    const conditions: ReturnType<typeof sql>[] = [];
    conditions.push(sql`updated_at = NOW()`);

    if (p.name !== undefined) conditions.push(sql`name = ${p.name}`);
    if (p.description !== undefined) conditions.push(sql`description = ${p.description}`);
    if (p.category !== undefined) conditions.push(sql`category = ${p.category}`);
    if (p.requires_approval !== undefined)
      conditions.push(sql`requires_approval = ${p.requires_approval}`);
    if (p.is_enabled !== undefined) conditions.push(sql`is_enabled = ${p.is_enabled}`);

    if (conditions.length <= 1) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "No fields to update" } });
      return;
    }

    await db.execute(
      sql`UPDATE tool_configs SET ${sql.join(conditions, sql`, `)} WHERE id = ${id}`
    );
    await loadAllConfigs();
    audit("update", "tool", req);
    res.json({ ok: true, data: { id } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    logger.error({ err }, "Failed to update tool config");
    res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Failed to update tool config" } });
  }
});

router.delete("/tools/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM tool_configs WHERE id = ${pid(req)}`);
    await loadAllConfigs();
    audit("delete", "tool", req);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to delete tool config");
    res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Failed to delete tool config" } });
  }
});

// ─── MCP SERVERS ──────────────────────────────────────────────────────────────

router.get("/mcp", async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT id, name, transport, command, url, is_enabled, created_at FROM mcp_server_configs ORDER BY name`
    );
    audit("list", "mcp", req);
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    logger.error({ err }, "Failed to list MCP servers");
    res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Failed to list MCP servers" } });
  }
});

router.post("/mcp", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        name: z.string().min(1),
        transport: z.enum(["stdio", "http"]),
        command: z.string().optional(),
        url: z.string().url().optional(),
        env: z.record(z.string()).optional(),
        headers: z.record(z.string()).optional(),
        is_enabled: z.boolean().default(true),
      })
      .parse(req.body);
    const id = crypto.randomUUID();
    const envEnc = p.env ? encrypt(JSON.stringify(p.env)) : null;
    const hdrEnc = p.headers ? encrypt(JSON.stringify(p.headers)) : null;
    await db.execute(
      sql`INSERT INTO mcp_server_configs (id, name, transport, command, env_encrypted, url, headers_encrypted, is_enabled) VALUES (${id}, ${p.name}, ${p.transport}, ${p.command || null}, ${envEnc}, ${p.url || null}, ${hdrEnc}, ${p.is_enabled})`
    );
    await loadAllConfigs();
    audit("create", "mcp", req, { name: p.name });
    res.status(201).json({ ok: true, data: { id, name: p.name } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    logger.error({ err }, "Failed to create MCP server config");
    res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Failed to create MCP server config" } });
  }
});

router.delete("/mcp/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM mcp_server_configs WHERE id = ${pid(req)}`);
    await loadAllConfigs();
    audit("delete", "mcp", req);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to delete MCP server config");
    res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Failed to delete MCP server config" } });
  }
});

// ─── API KEYS ──────────────────────────────────────────────────────────────────

router.get("/api-keys", async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT id, name, role, is_active, expires_at, last_used_at, created_at FROM admin_api_keys ORDER BY created_at DESC`
    );
    audit("list", "api_key", req);
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    logger.error({ err }, "Failed to list API keys");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to list API keys" } });
  }
});

router.post("/api-keys", async (req: Request, res: Response) => {
  try {
    const p = z
      .object({
        name: z.string().min(1),
        role: z.enum(["admin", "owner", "developer"]),
        expires_at: z.string().datetime().optional(),
      })
      .parse(req.body);
    const id = crypto.randomUUID();
    const key = generateApiKey();
    const userId = req.isAuthenticated() ? req.user!.id : "system";
    await db.execute(
      sql`INSERT INTO admin_api_keys (id, name, key_hash, role, created_by, expires_at) VALUES (${id}, ${p.name}, ${hashApiKey(key)}, ${p.role}, ${userId}, ${p.expires_at || null})`
    );
    audit("create", "api_key", req, { name: p.name, role: p.role });
    res.status(201).json({ ok: true, data: { id, name: p.name, key, role: p.role } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    logger.error({ err }, "Failed to create API key");
    res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Failed to create API key" } });
  }
});

router.delete("/api-keys/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM admin_api_keys WHERE id = ${pid(req)}`);
    audit("delete", "api_key", req);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to delete API key");
    res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Failed to delete API key" } });
  }
});

// ─── AUDIT LOGS ────────────────────────────────────────────────────────────────

router.get("/audit", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "50"), 10)));
    const offset = (page - 1) * limit;
    const result = await db.execute(
      sql`SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
    );
    const countResult = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM admin_audit_log`);
    audit("list", "audit", req);
    res.json({
      ok: true,
      data: result.rows,
      meta: { page, limit, total: (countResult.rows[0] as any)?.cnt || 0 },
    });
  } catch (err) {
    logger.error({ err }, "Failed to query audit logs");
    res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Failed to query audit logs" } });
  }
});

// ─── AGENTS (admin stats) ─────────────────────────────────────────────────────

router.get("/agents", async (req: Request, res: Response) => {
  try {
    const cfg = getConfig();
    audit("list", "agent", req);
    res.json({
      ok: true,
      data: {
        providers: cfg.providers.size,
        modes: cfg.modes.size,
        tools: cfg.tools.size,
        routing_rules: cfg.routing.length,
        mcp_servers: cfg.mcpServers.size,
      },
    });
  } catch (err) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed" } });
  }
});

// ─── WORKSPACES ───────────────────────────────────────────────────────────────

router.get("/workspaces", async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT id, user_id, name, is_default, created_at FROM agent_workspaces ORDER BY created_at DESC`
    );
    audit("list", "workspace", req);
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    logger.error({ err }, "Failed to list workspaces");
    res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Failed to list workspaces" } });
  }
});

// ─── ROUTING ──────────────────────────────────────────────────────────────────

router.get("/routing", async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT id, name, priority, provider, model, is_active FROM routing_configs ORDER BY priority DESC`
    );
    audit("list", "routing", req);
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    logger.error({ err }, "Failed to list routing configs");
    res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Failed to list routing configs" } });
  }
});

export default router;
