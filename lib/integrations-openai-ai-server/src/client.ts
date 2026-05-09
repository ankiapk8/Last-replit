import OpenAI from "openai";

/**
 * Provider priority:
 *  1. OPENROUTER_API_KEY        → OpenRouter (primary — best intelligence, free tier)
 *  2. OLLAMA_CLOUD_API_KEY      → Ollama Cloud (fallback — preserved models)
 *  3. OPENAI_API_KEY / OPENAI_API_KEY1 → OpenAI
 *  4. AI_INTEGRATIONS_OPENAI_API_KEY → Replit injected key
 */
const openRouterKey = process.env.OPENROUTER_API_KEY?.trim() || null;
const ollamaCloudKey = process.env.OLLAMA_CLOUD_API_KEY?.trim() || null;

// Primary client: OpenRouter if key exists, else Ollama Cloud, else OpenAI/Replit
const apiKey = openRouterKey
  ? openRouterKey
  : ollamaCloudKey
    ? ollamaCloudKey
    : (process.env.OPENAI_API_KEY1 ??
      process.env.OPENAI_API_KEY ??
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY);

const baseURL = openRouterKey
  ? process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"
  : ollamaCloudKey
    ? process.env.OLLAMA_CLOUD_BASE_URL || "https://cloud.ollama.com/v1"
    : (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://openrouter.ai/api/v1");

export const isConfigured = !!apiKey;

// Only send OpenRouter-specific headers when using OpenRouter
const defaultHeaders = openRouterKey
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
    "[integrations-openai] No API key found. Set OPENROUTER_API_KEY for OpenRouter, or OLLAMA_CLOUD_API_KEY / OPENAI_API_KEY. Requests will fail."
  );
} else {
  const keySource = openRouterKey
    ? "OPENROUTER_API_KEY"
    : ollamaCloudKey
      ? "OLLAMA_CLOUD_API_KEY"
      : process.env.OPENAI_API_KEY1
        ? "OPENAI_API_KEY1"
        : process.env.OPENAI_API_KEY
          ? "OPENAI_API_KEY"
          : "AI_INTEGRATIONS_OPENAI_API_KEY";
  const providerName = openRouterKey ? "openrouter" : ollamaCloudKey ? "ollama-cloud" : "openai";
  console.log(
    `[integrations-openai] Initialized — provider=${providerName}, baseURL=${baseURL}, keySource=${keySource}`
  );
}

/** Fallback model — Ollama Cloud text model (used when OpenRouter is primary) */
export const FALLBACK_MODEL = "qwen3-coder:480b";

/**
 * Fallback client using a secondary provider.
 * Evaluated lazily so process.env is read at call-time, not module-load time.
 * Returns null if no fallback key is available.
 */
export function getFallbackOpenAI(): OpenAI | null {
  // If primary is OpenRouter, try Ollama Cloud as fallback
  if (openRouterKey && ollamaCloudKey) {
    return new OpenAI({
      apiKey: ollamaCloudKey,
      baseURL: process.env.OLLAMA_CLOUD_BASE_URL || "https://cloud.ollama.com/v1",
    });
  }

  // If primary is Ollama Cloud, try OpenRouter as fallback
  if (ollamaCloudKey && openRouterKey) {
    return new OpenAI({
      apiKey: openRouterKey,
      baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "https://anki-generator.local",
        "X-Title": process.env.OPENROUTER_APP_TITLE || "Anki Card Generator",
      },
    });
  }

  return null;
}

/** @deprecated Use getFallbackOpenAI() instead */
export const fallbackOpenai: OpenAI | null = null;
