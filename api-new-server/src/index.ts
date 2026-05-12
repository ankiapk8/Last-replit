import app from "./app";
import { logger, setDbLogWriter } from "./lib/logger";
import { ensureDatabaseSchema } from "@workspace/db";
import { writeLogToDb, cleanupOldLogs } from "./lib/db-logger";
import { getConfig, isDevelopment } from "./config";
import { loadDevOverridesFromDB } from "./lib/dev-overrides";
import { terminateOcrWorker } from "./routes/extract-pdf";
import { registerBuiltInTools } from "./tools/register";
import { loadAllConfigs } from "./lib/config-service";

const rawPort = process.env["PORT"] ?? "3001";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initStripe(): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) {
    logger.info("STRIPE_SECRET_KEY not set — skipping Stripe initialization");
    return;
  }
  logger.info("Stripe configured (direct API key)");
}

async function main(): Promise<void> {
  // 1. Ensure database schema exists
  await ensureDatabaseSchema();

  // 2. Initialize DB log writer (dual-write: DB + file)
  setDbLogWriter(writeLogToDb);
  logger.info("DB log writer initialized");

  // 3. Schedule log cleanup (daily)
  const retentionDays = getConfig().LOG_RETENTION_DAYS;
  setInterval(async () => {
    try {
      const deleted = await cleanupOldLogs(retentionDays);
      if (deleted > 0) logger.info({ deleted }, "Cleaned up old logs");
    } catch (err) {
      logger.warn({ err }, "Log cleanup failed (non-fatal)");
    }
  }, 86400_000);

  // 4. Load dev overrides in non-production
  if (isDevelopment()) {
    await loadDevOverridesFromDB().catch((err) =>
      logger.warn({ err }, "Dev overrides load failed (non-fatal)")
    );
    logger.info("Dev overrides loaded from DB");
  }

  // 5. Initialize Stripe
  await initStripe();

  // 6. Register agent tools
  registerBuiltInTools();
  logger.info("Agent tools registered");

  // 7. Load internal admin configs (providers, modes, tools, routing, MCP)
  await loadAllConfigs().catch((err) =>
    logger.warn({ err }, "Internal config load failed (non-fatal) — using defaults")
  );

  // 8. Start server
  app.listen(port, () => {
    logger.info({ port, env: getConfig().NODE_ENV }, "Server listening");
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, "Shutting down gracefully…");
    try {
      await terminateOcrWorker();
      logger.info("OCR worker terminated");
    } catch (err) {
      logger.warn({ err }, "OCR worker termination failed");
    }
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "Server startup failed");
  process.exit(1);
});
