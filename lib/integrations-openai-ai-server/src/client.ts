import OpenAI from "openai";

/**
 * Provider priority:
 *  1. OLLAMA_CLOUD_API_KEY → qwen3-coder:latest (primary)
 *  2. OPENROUTER_API_KEY   → OpenRouter (fallback backend)
 *  3. OPENAI_API_KEY / OPENAI_API_KEY1 → OpenAI
 *  4. AI_INTEGRATIONS_OPENAI_API_KEY → Replit injected key
 */
const ollamaCloudKey = process.env.OLLAMA_CLOUD_API_KEY?.trim() || null;
const isOpenRouter = !!process.env.OPENROUTER_API_KEY && !ollamaCloudKey;

const apiKey = ollamaCloudKey
  ? ollamaCloudKey
  : process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY1 ||
    process.env.OPENAI_API_KEY ||
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

const baseURL = ollamaCloudKey
  ? process.env.OLLAMA_CLOUD_BASE_URL || "https://ollama.com/v1"
  : process.env.OPENROUTER_BASE_URL ||
    (process.env.OPENROUTER_API_KEY ? "https://openrouter.ai/api/v1" : undefined) ||
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||
    "https://openrouter.ai/api/v1";

export const isConfigured = !!apiKey;

// Only send OpenRouter-specific headers when using OpenRouter
const defaultHeaders = isOpenRouter
  ? {
      "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "https://anki-generator.local",
      "X-Title": process.env.OPENROUTER_APP_TITLE || "Anki Card Generator",
    }
  : undefined;

export const openai = new OpenAI({
  apiKey: apiKey ?? "not-configured",
  baseURL,
  ...(defaultHeaders ? { defaultHeaders } : {}),
});

if (!apiKey) {
  console.warn(
    "[integrations-openai] No API key found. Set OLLAMA_CLOUD_API_KEY for qwen3-coder:latest, or OPENROUTER_API_KEY / OPENAI_API_KEY. Requests will fail."
  );
} else {
  const keySource = ollamaCloudKey
    ? "OLLAMA_CLOUD_API_KEY"
    : process.env.OPENROUTER_API_KEY
      ? "OPENROUTER_API_KEY"
      : process.env.OPENAI_API_KEY1
        ? "OPENAI_API_KEY1"
        : process.env.OPENAI_API_KEY
          ? "OPENAI_API_KEY"
          : "AI_INTEGRATIONS_OPENAI_API_KEY";
  console.log(
    `[integrations-openai] Initialized — provider=${isOpenRouter ? "openrouter" : ollamaCloudKey ? "ollama" : "openai"}, baseURL=${baseURL}, keySource=${keySource}`
  );
}

export const FALLBACK_MODEL = "gpt-4o-mini";

/**
 * Fallback client using a secondary provider.
 * Evaluated lazily so process.env is read at call-time, not module-load time.
 * Returns null if no fallback key is available.
 */
export function getFallbackOpenAI(): OpenAI | null {
  // If primary is qwen3-coder:latest, try OpenRouter as fallback
  if (ollamaCloudKey && process.env.OPENROUTER_API_KEY) {
    return new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "https://anki-generator.local",
        "X-Title": process.env.OPENROUTER_APP_TITLE || "Anki Card Generator",
      },
    });
  }

  // If primary is OpenRouter, try Replit injected key as fallback
  const replitKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (replitKey && !ollamaCloudKey && process.env.OPENROUTER_API_KEY) {
    return new OpenAI({
      apiKey: replitKey,
      ...(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
        ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }
        : {}),
    });
  }

  return null;
}

/** @deprecated Use getFallbackOpenAI() instead */
export const fallbackOpenai: OpenAI | null = null;
