import { Router, type IRouter } from "express";
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
import { sendError } from "../lib/error-handler";

const router: IRouter = Router();

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
  const hasGroq = !!process.env["GROQ_API_KEY"];
  const hasOpenRouter = !!process.env["OPENROUTER_API_KEY"];
  const hasOllamaCloud = !!process.env["OLLAMA_CLOUD_API_KEY"];
  const hasEnvKey =
    hasGroq ||
    hasOpenRouter ||
    hasOllamaCloud ||
    process.env["OPENAI_API_KEY1"] ||
    process.env["OPENAI_API_KEY"] ||
    process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];

  if (hasEnvKey) {
    const providers: string[] = [];
    if (hasGroq) providers.push("groq");
    if (hasOpenRouter) providers.push("openrouter");
    if (hasOllamaCloud) providers.push("ollama-cloud");
    if (process.env["OPENAI_API_KEY1"] || process.env["OPENAI_API_KEY"]) providers.push("openai");
    const fallback =
      (hasGroq && (hasOpenRouter || hasOllamaCloud)) ||
      (hasOpenRouter && hasOllamaCloud)
        ? "cross-provider fallback available"
        : "no cross-provider fallback";
    return { status: "ok", message: `providers: ${providers.join(", ")} (${fallback})` };
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
    message: "AI provider is not configured. Set GROQ_API_KEY, OPENROUTER_API_KEY, or OLLAMA_CLOUD_API_KEY.",
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

router.post("/test-model", async (req, res): Promise<void> => {
  const { model, prompt = "Reply with OK" } = req.body as { model?: string; prompt?: string };
  if (!model) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "model is required" } });
    return;
  }
  try {
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    const start = Date.now();
    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 50,
      temperature: 0.1,
    });
    const latencyMs = Date.now() - start;
    const content = completion.choices[0]?.message?.content ?? "";
    res.json({ ok: true, model, latencyMs, response: content.slice(0, 200) });
  } catch (err) {
    const status = (err as { status?: number }).status;
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, model, status, error: message });
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

router.get("/monitor", (_req, res) => {
  const snapshot = getMonitorSnapshot();
  const httpStatus =
    snapshot.status === "healthy" ? 200 : snapshot.status === "degraded" ? 200 : 503;
  res.status(httpStatus).json(snapshot);
});

export default router;
