import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { FREE_TEXT_MODEL, FREE_VISION_MODEL, EXPLAIN_MODEL, VISUAL_DETECTION_MODEL, MODEL_SUMMARY } from "../lib/models";

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
  const hasEnvKey =
    process.env["OPENROUTER_API_KEY"] ||
    process.env["OPENAI_API_KEY1"] ||
    process.env["OPENAI_API_KEY"] ||
    process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];

  if (hasEnvKey) {
    const baseUrl =
      process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] ||
      process.env["OPENROUTER_BASE_URL"] ||
      "https://openrouter.ai/api/v1";
    try {
      new URL(baseUrl);
    } catch {
      return { status: "fail", message: `Invalid AI base URL: ${baseUrl}` };
    }
    return { status: "ok" };
  }

  // Env key not visible — try importing the integration client at runtime.
  // The Replit platform injects AI_INTEGRATIONS_OPENAI_API_KEY into managed
  // server processes without exposing it through normal env introspection.
  try {
    const { isConfigured } = await import("@workspace/integrations-openai-ai-server");
    if (isConfigured) {
      return { status: "ok" };
    }
    return {
      status: "fail",
      message: "AI provider is not configured. Set OPENROUTER_API_KEY (https://openrouter.ai/keys) or OPENAI_API_KEY in your environment.",
    };
  } catch {
    return {
      status: "fail",
      message: "AI provider is not configured. Set OPENROUTER_API_KEY (https://openrouter.ai/keys) or OPENAI_API_KEY in your environment.",
    };
  }
}

router.get("/model-info", (_req, res) => {
  const isFree = (m: string) => /:free$/.test(m) || /free/i.test(m.split("/").pop() ?? "");
  res.json({
    ...MODEL_SUMMARY,
    textModel:   MODEL_SUMMARY.text,
    visionModel: MODEL_SUMMARY.vision,
    sameModel:   MODEL_SUMMARY.text === MODEL_SUMMARY.vision,
    textFree:   isFree(MODEL_SUMMARY.text),
    visionFree: isFree(MODEL_SUMMARY.vision),
    explainFree: isFree(MODEL_SUMMARY.explain),
    visualDetectionFree: isFree(MODEL_SUMMARY.visualDetection),
  });
});

router.get("/healthz", async (_req, res) => {
  const [database, ai] = await Promise.all([
    checkDatabase(),
    checkAiProvider(),
  ]);

  const allOk = database.status === "ok" && ai.status === "ok";
  const status: "ok" | "degraded" = allOk ? "ok" : "degraded";

  if (!allOk) {
    logger.warn(
      { database, ai },
      "Health check reported degraded dependencies",
    );
  }

  res.status(allOk ? 200 : 503).json({
    status,
    checks: {
      database,
      ai,
    },
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
