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
    ? process.env.OLLAMA_CLOUD_BASE_URL || "https://ollama.com/api"
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
  const hasFallback = !!(openRouterKey && ollamaCloudKey);
  console.log(`[integrations-openai] Cross-provider fallback available: ${hasFallback}`);
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
    const fallbackBase = process.env.OLLAMA_CLOUD_BASE_URL || "https://ollama.com/api";
    console.log(`[integrations-openai] Fallback client: Ollama Cloud at ${fallbackBase}`);
    return new OpenAI({
      apiKey: ollamaCloudKey,
      baseURL: fallbackBase,
    });
  }

  // If primary is Ollama Cloud (or OpenAI/Replit), try OpenRouter as fallback
  if (!openRouterKey) return null;
  const hasNonOpenRouterPrimary = ollamaCloudKey || process.env.OPENAI_API_KEY1 || process.env.OPENAI_API_KEY;
  if (hasNonOpenRouterPrimary) {
    const fallbackBase = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
    console.log(`[integrations-openai] Fallback client: OpenRouter at ${fallbackBase}`);
    return new OpenAI({
      apiKey: openRouterKey,
      baseURL: fallbackBase,
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

// ─── Retry utility ─────────────────────────────────────────────────────────────

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableStatuses?: number[];
  retryableErrorPatterns?: RegExp[];
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  retryableStatuses: [429, 500, 502, 503, 504],
  retryableErrorPatterns: [
    /rate.?limit/i,
    /quota/i,
    /timeout/i,
    /ECONNREFUSED/i,
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /network/i,
    /fetch failed/i,
    /service unavailable/i,
    /internal server error/i,
  ],
};

function isRetryableError(err: unknown, options: Required<RetryOptions>): boolean {
  const status = (err as { status?: number }).status;
  if (status && options.retryableStatuses.includes(status)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return options.retryableErrorPatterns.some((re) => re.test(msg));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an async function with exponential backoff retry.
 * Retries on rate limits (429), server errors (5xx), and network errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  opts: RetryOptions = {}
): Promise<T> {
  const options = { ...DEFAULT_RETRY_OPTIONS, ...opts };
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(
          options.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000,
          options.maxDelayMs
        );
        console.log(`[retry] ${label}: attempt ${attempt + 1}/${options.maxRetries + 1} after ${Math.round(delay)}ms delay`);
        await sleep(delay);
      }
      return await fn();
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number }).status;
      const msg = err instanceof Error ? err.message : String(err);

      if (attempt < options.maxRetries && isRetryableError(err, options)) {
        console.warn(`[retry] ${label}: attempt ${attempt + 1} failed (status=${status}): ${msg}. Retrying...`);
        continue;
      }

      console.error(`[retry] ${label}: final attempt ${attempt + 1} failed (status=${status}): ${msg}`);
      throw err;
    }
  }

  throw lastError;
}
