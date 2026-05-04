import OpenAI from "openai";

const apiKey =
  process.env.OPENROUTER_API_KEY ||
  process.env.OPENAI_API_KEY1 ||
  process.env.OPENAI_API_KEY ||
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

const baseURL =
  process.env.OPENROUTER_BASE_URL ||
  (process.env.OPENROUTER_API_KEY ? "https://openrouter.ai/api/v1" : undefined) ||
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||
  "https://openrouter.ai/api/v1";

export const isConfigured = !!apiKey;

export const openai = new OpenAI({
  apiKey: apiKey ?? "not-configured",
  baseURL,
  defaultHeaders: {
    "HTTP-Referer":
      process.env.OPENROUTER_HTTP_REFERER || "https://anki-generator.local",
    "X-Title": process.env.OPENROUTER_APP_TITLE || "Anki Card Generator",
  },
});

if (!apiKey) {
  console.warn(
    "[integrations-openai] No API key found. Set OPENROUTER_API_KEY or OPENAI_API_KEY. Requests will fail.",
  );
}

export const FALLBACK_MODEL = "gpt-4o-mini";

/**
 * Fallback client using Replit's injected AI integration key.
 * Evaluated lazily so process.env is read at call-time, not module-load time.
 * Returns null if the Replit integration key is not available.
 */
export function getFallbackOpenAI(): OpenAI | null {
  const replitKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!replitKey) return null;
  return new OpenAI({
    apiKey: replitKey,
    ...(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
      ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }
      : {}),
    defaultHeaders: {
      "HTTP-Referer":
        process.env.OPENROUTER_HTTP_REFERER || "https://anki-generator.local",
      "X-Title": process.env.OPENROUTER_APP_TITLE || "Anki Card Generator",
    },
  });
}

/** @deprecated Use getFallbackOpenAI() instead */
export const fallbackOpenai: OpenAI | null = null;
