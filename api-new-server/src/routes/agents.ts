/**
 * Agent routes — /api/v2/agents/*
 * CRUD for agent sessions, modes, and workspaces.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { createSession, getSession, runAgent } from "../agents/runner";
import { getMode, listModes } from "../agents/registry";
import { listTools } from "../tools/registry";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateSessionBody = z.object({
  modeId: z.string().min(1),
  workspaceId: z.string().optional(),
});

const RunAgentBody = z.object({
  message: z.string().min(1),
  sessionId: z.string().optional(),
  modeId: z.string().optional(),
  workspaceId: z.string().optional(),
});

// ─── GET /api/v2/agents/modes ─────────────────────────────────────────────────

router.get("/modes", (_req: Request, res: Response) => {
  res.json({ modes: listModes() });
});

// ─── GET /api/v2/agents/tools ─────────────────────────────────────────────────

router.get("/tools", (_req: Request, res: Response) => {
  const tools = listTools().map((entry) => ({
    id: entry.id,
    name: entry.tool.definition.name,
    description: entry.tool.definition.description,
    category: entry.category,
    requiresApproval: entry.requiresApproval,
  }));
  res.json({ tools });
});

// ─── POST /api/v2/agents/sessions ─────────────────────────────────────────────

router.post("/sessions", async (req: Request, res: Response) => {
  try {
    const parsed = CreateSessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
      return;
    }

    const userId = req.isAuthenticated() ? req.user!.id : "anonymous";
    const mode = getMode(parsed.data.modeId);
    if (!mode) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: `Unknown mode: ${parsed.data.modeId}`,
        },
      });
      return;
    }

    const session = createSession(userId, parsed.data.modeId, parsed.data.workspaceId || null);
    res.status(201).json({ session });
  } catch (err) {
    logger.error({ err }, "Failed to create agent session");
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to create session" },
    });
  }
});

// ─── GET /api/v2/agents/sessions/:id ──────────────────────────────────────────

router.get("/sessions/:id", (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const session = getSession(id);
  if (!session) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Session not found" },
    });
    return;
  }
  res.json({ session });
});

// ─── POST /api/v2/agents/run ──────────────────────────────────────────────────

router.post("/run", async (req: Request, res: Response) => {
  try {
    const parsed = RunAgentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
      return;
    }

    const userId = req.isAuthenticated() ? req.user!.id : "anonymous";
    const modeId = parsed.data.modeId || "ask";

    let session = parsed.data.sessionId ? getSession(parsed.data.sessionId) : null;

    if (!session) {
      session = createSession(userId, modeId, parsed.data.workspaceId || null);
    }

    const events: unknown[] = [];
    const runner = runAgent(session, parsed.data.message);

    for await (const event of runner) {
      events.push(event);
    }

    const doneEvent = events.find((e: any) => e.type === "done") as any;
    const errorEvent = events.find((e: any) => e.type === "error") as any;

    if (errorEvent) {
      res.status(502).json({
        error: { code: errorEvent.code, message: errorEvent.message },
        sessionId: session.id,
        events,
      });
      return;
    }

    res.json({
      sessionId: session.id,
      status: session.status,
      usage: doneEvent?.usage,
      events,
    });
  } catch (err) {
    logger.error({ err }, "Agent run failed");
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Agent run failed" },
    });
  }
});

export default router;
