import { z } from "zod";

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "fatal"]).default("info"),
  LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  LOG_TO_FILE: z.coerce.boolean().default(true),
  LOG_FILE_PATH: z.string().default("./logs/server.log"),
  LOG_MAX_FILE_SIZE: z.string().default("10m"),
  OPENROUTER_API_KEY: z.string().optional(),
  OLLAMA_CLOUD_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_API_KEY1: z.string().optional(),
  AI_INTEGRATIONS_OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().url().optional(),
  OLLAMA_CLOUD_BASE_URL: z.string().url().optional(),
  AI_INTEGRATIONS_OPENAI_BASE_URL: z.string().url().optional(),
  AI_TEXT_MODEL: z.string().optional(),
  AI_VISION_MODEL: z.string().optional(),
  AI_QBANK_MODEL: z.string().optional(),
  AI_MINDMAP_MODEL: z.string().optional(),
  AI_EXPLAIN_MODEL: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  ADMIN_SECRET_KEY: z.string().optional(),
  ADMIN_IP_ALLOWLIST: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),
  REPL_ID: z.string().optional(),
  ISSUER_URL: z.string().url().optional(),
  APP_URL: z.string().optional(),
  ADMIN_URL: z.string().optional(),
  FRONTEND_PORT: z.coerce.number().int().positive().default(5000),
  STATIC_DIR: z.string().optional(),
  LOCAL_DEV_IS_PRO: z.coerce.boolean().default(false),
  CODESPACE_NAME: z.string().optional(),
  GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: z.string().optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.message}`);
  }
  cachedConfig = parsed.data;
  return cachedConfig;
}

export function isProduction(): boolean {
  return getConfig().NODE_ENV === "production";
}

export function isDevelopment(): boolean {
  return getConfig().NODE_ENV !== "production";
}
