/**
 * Agent streaming route — SSE endpoint for real-time agent execution.
 * POST /api/v2/agents/stream
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { createSession, getSession, runAgent } from "../agents/runner";
import { setupSSEHeaders, sendSSE, startHeartbeat } from "../lib/ai-client";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const StreamAgentBody = z.object({
  message: z.string().min(1),
  sessionId: z.string().optional(),
  modeId: z.string().optional(),
  workspaceId: z.string().optional(),
});

router.post("/stream", async (req: Request, res: Response): Promise<void> => {
  const parsed = StreamAgentBody.safeParse(req.body);
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

  setupSSEHeaders(res);
  const heartbeat = startHeartbeat(res);

  const cleanup = () => clearInterval(heartbeat);
  req.on("close", cleanup);

  try {
    const runner = runAgent(session, parsed.data.message);

    for await (const event of runner) {
      sendSSE(res, event as Record<string, unknown>);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ sessionId: session.id, err: message }, "Agent stream error");
    sendSSE(res, {
      type: "error",
      code: "AGENT_ERROR",
      message,
    });
  } finally {
    cleanup();
    res.end();
  }
});

export default router;
