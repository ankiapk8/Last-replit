/**
 * Environment variable validation — fail fast at startup if required vars are missing.
 * Called once during server initialization before any routes are registered.
 */

import { logger } from "./logger";

/**
 * Required environment variables that MUST be set for the server to start.
 * Missing any of these causes immediate process exit.
 */
const REQUIRED_VARS = ["DATABASE_URL", "OPENROUTER_API_KEY", "ADMIN_JWT_SECRET"] as const;

/**
 * Environment variables that are required in production but optional in development.
 */
const PRODUCTION_ONLY_REQUIRED = ["ADMIN_EMAIL", "ADMIN_PASSWORD"] as const;

/**
 * Validates that a non-empty string value exists for the given env var.
 */
function assertEnvVar(name: string, value: string | undefined): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

/**
 * Validate all required environment variables.
 * Throws (and logs) on the first missing variable to fail fast.
 */
export function validateEnvironment(isProduction: boolean): void {
  const missing: string[] = [];

  for (const name of REQUIRED_VARS) {
    try {
      assertEnvVar(name, process.env[name]);
    } catch {
      missing.push(name);
    }
  }

  if (isProduction) {
    for (const name of PRODUCTION_ONLY_REQUIRED) {
      try {
        assertEnvVar(name, process.env[name]);
      } catch {
        missing.push(name);
      }
    }
  }

  if (missing.length > 0) {
    const message = `FATAL: Missing required environment variables: ${missing.join(", ")}`;
    logger.error(message);
    throw new Error(message);
  }

  // Validate ADMIN_JWT_SECRET strength in production
  if (isProduction) {
    const jwtSecret = process.env["ADMIN_JWT_SECRET"]!;
    if (jwtSecret.length < 32) {
      const message = "FATAL: ADMIN_JWT_SECRET must be at least 32 characters in production";
      logger.error(message);
      throw new Error(message);
    }
  }

  // Validate DATABASE_URL format
  const dbUrl = process.env["DATABASE_URL"]!;
  if (!dbUrl.startsWith("postgres://") && !dbUrl.startsWith("postgresql://")) {
    const message = "FATAL: DATABASE_URL must start with postgres:// or postgresql://";
    logger.error(message);
    throw new Error(message);
  }

  logger.info(
    {
      isProduction,
      requiredVarsChecked:
        REQUIRED_VARS.length + (isProduction ? PRODUCTION_ONLY_REQUIRED.length : 0),
    },
    "Environment validation passed"
  );
}
