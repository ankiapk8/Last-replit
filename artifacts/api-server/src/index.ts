import app from "./app";
import { logger } from "./lib/logger";
import { ensureDatabaseSchema } from "@workspace/db";
import { autoConfigureFromEnv } from "./lib/apk-builder";
import { loadDevOverridesFromDB } from "./lib/dev-overrides";

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
  await ensureDatabaseSchema();

  if (process.env.NODE_ENV !== "production") {
    await loadDevOverridesFromDB().catch((err) =>
      logger.warn({ err }, "Dev overrides load failed (non-fatal)")
    );
    logger.info("Dev overrides loaded from DB");
  }

  await initStripe();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    try {
      autoConfigureFromEnv();
    } catch (err) {
      logger.warn({ err }, "APK auto-configure failed (non-fatal)");
    }
  });
}

main().catch((err) => {
  logger.error({ err }, "Server startup failed");
  process.exit(1);
});
