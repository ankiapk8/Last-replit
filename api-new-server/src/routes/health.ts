import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { getMonitorSnapshot } from "../lib/monitor";
import {
  FREE_TEXT_MODEL,
  FREE_VISION_MODEL,
  EXPLAIN_MODEL,
  VISUAL_DETECTION_MODEL,
  MODEL_SUMMARY,
} from "../lib/models";
import type { ModelConfig } from "../lib/models";
import { completeChat } from "../lib/ai-client";
import { sendError } from "../lib/error-handler";

const router: IRouter = Router();

function adminOnly(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers["x-admin-key"];
  const secret = process.env.ADMIN_SECRET_KEY;
  if (!secret || key !== secret) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Admin access required." } });
    return;
  }
  next();
}

type CheckStatus = "ok" | "fail" | "skipped";

interface CheckResult {
  status: CheckStatus;
  message?: string;
  latencyMs?: number;
}

async function checkDatabase(): Promise<CheckResult> {
  if (!process.env["DATABASE_URL"]) {
    return { status: "fail", message: "DATABASE_URL is not set" };
  }
  const start = Date.now();
  try {
    await pool.query("SELECT 1");
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "fail",
      message: err instanceof Error ? err.message : "Database query failed",
      latencyMs: Date.now() - start,
    };
  }
}

async function checkAiProvider(): Promise<CheckResult> {
  const hasOpenRouter  = !!process.env["OPENROUTER_API_KEY"];
  const hasOllamaCloud = !!process.env["OLLAMA_CLOUD_API_KEY"];
  const hasGemini      = !!process.env["GOOGLE_AI_API_KEY"];
  const hasGroq        = !!process.env["GROQ_API_KEY"];
  const hasMistral     = !!process.env["MISTRAL_API_KEY"];
  const hasOpenAI      = !!(process.env["OPENAI_API_KEY1"] || process.env["OPENAI_API_KEY"] || process.env["AI_INTEGRATIONS_OPENAI_API_KEY"]);

  const providers: string[] = [];
  if (hasGemini)      providers.push("gemini");
  if (hasGroq)        providers.push("groq");
  if (hasMistral)     providers.push("mistral");
  if (hasOpenRouter)  providers.push("openrouter");
  if (hasOllamaCloud) providers.push("ollama-cloud");
  if (hasOpenAI)      providers.push("openai");

  if (providers.length > 0) {
    return {
      status: "ok",
      message: `configured providers: ${providers.join(", ")}`,
    };
  }

  try {
    const { isConfigured } = await import("@workspace/integrations-openai-ai-server");
    if (isConfigured) {
      return { status: "ok", message: "configured via @workspace/integrations-openai-ai-server" };
    }
  } catch {
    // fall through
  }

  return {
    status: "fail",
    message: "No AI provider configured. Set GOOGLE_AI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, or OPENROUTER_API_KEY.",
  };
}

router.get("/model-info", (_req, res) => {
  const isFree = (m: string) => /:free$/.test(m) || /free/i.test(m.split("/").pop() ?? "");
  res.json({
    ...MODEL_SUMMARY,
    textModel: MODEL_SUMMARY.text,
    visionModel: MODEL_SUMMARY.vision,
    sameModel: MODEL_SUMMARY.text === MODEL_SUMMARY.vision,
    textFree: isFree(MODEL_SUMMARY.text),
    visionFree: isFree(MODEL_SUMMARY.vision),
    explainFree: isFree(MODEL_SUMMARY.explain),
    visualDetectionFree: isFree(MODEL_SUMMARY.visualDetection),
  });
});

router.post("/test-model", adminOnly, async (req, res): Promise<void> => {
  const { model, provider = "openrouter", prompt = "Reply with OK" } = req.body as {
    model?: string;
    provider?: string;
    prompt?: string;
  };
  if (!model) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "model is required" } });
    return;
  }
  try {
    const start = Date.now();
    const result = await completeChat({
      model,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 50,
      temperature: 0.1,
    });
    const latencyMs = Date.now() - start;
    res.json({ ok: true, model, provider, latencyMs, response: result.content.slice(0, 200) });
  } catch (err) {
    const status = (err as { status?: number }).status;
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, model, provider, status, error: message });
  }
});

router.get("/healthz", async (_req, res) => {
  const [database, ai] = await Promise.all([checkDatabase(), checkAiProvider()]);
  const allOk = database.status === "ok" && ai.status === "ok";
  const status: "ok" | "degraded" = allOk ? "ok" : "degraded";

  if (!allOk) {
    logger.warn({ database, ai }, "Health check reported degraded dependencies");
  }

  res.status(allOk ? 200 : 503).json({
    status,
    checks: { database, ai },
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

router.get("/monitor", adminOnly, (_req, res) => {
  const snapshot = getMonitorSnapshot();
  const cacheStats = snapshot.cache;
  const totalCacheOps = cacheStats.hits + cacheStats.misses;
  (snapshot.cache as typeof snapshot.cache & { hitRate: string }).hitRate =
    totalCacheOps > 0 ? ((cacheStats.hits / totalCacheOps) * 100).toFixed(1) + "%" : "0%";
  const httpStatus =
    snapshot.status === "healthy" ? 200 : snapshot.status === "degraded" ? 200 : 503;
  res.status(httpStatus).json(snapshot);
});

export default router;
