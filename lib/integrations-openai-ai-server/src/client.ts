import OpenAI from "openai";

/**
 * Provider priority:
 *  1. OLLAMA_BASE_URL  → local Ollama (no API key needed)
 *  2. OPENROUTER_API_KEY → OpenRouter
 *  3. OPENAI_API_KEY / OPENAI_API_KEY1 → OpenAI
 *  4. AI_INTEGRATIONS_OPENAI_API_KEY → Replit injected key
 */
const ollamaBaseURL = process.env.OLLAMA_BASE_URL?.trim() || null;
const isOpenRouter = !!process.env.OPENROUTER_API_KEY && !ollamaBaseURL;

const apiKey = ollamaBaseURL
  ? "ollama"  // Ollama doesn't require a real key
  : process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY1 ||
    process.env.OPENAI_API_KEY ||
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

const baseURL =
  ollamaBaseURL ||
  process.env.OPENROUTER_BASE_URL ||
  (process.env.OPENROUTER_API_KEY ? "https://openrouter.ai/api/v1" : undefined) ||
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||
  "https://openrouter.ai/api/v1";

export const isConfigured = !!apiKey;

// Only send OpenRouter-specific headers when using OpenRouter
const defaultHeaders = isOpenRouter
  ? {
      "HTTP-Referer":
        process.env.OPENROUTER_HTTP_REFERER || "https://anki-generator.local",
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
    "[integrations-openai] No API key found. Set OLLAMA_BASE_URL for local Ollama, or OPENROUTER_API_KEY / OPENAI_API_KEY. Requests will fail.",
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
    ...(isOpenRouter
      ? {
          defaultHeaders: {
            "HTTP-Referer":
              process.env.OPENROUTER_HTTP_REFERER || "https://anki-generator.local",
            "X-Title": process.env.OPENROUTER_APP_TITLE || "Anki Card Generator",
          },
        }
      : {}),
  });
}

/** @deprecated Use getFallbackOpenAI() instead */
export const fallbackOpenai: OpenAI | null = null;
