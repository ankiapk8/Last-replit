import OpenAI from "openai";
export declare const isConfigured: boolean;
export declare const openai: OpenAI;
/** Fallback model — Ollama Cloud text model (used when OpenRouter is primary) */
export declare const FALLBACK_MODEL = "qwen3-coder:480b";
/**
 * Fallback client using a secondary provider.
 * Evaluated lazily so process.env is read at call-time, not module-load time.
 * Returns null if no fallback key is available.
 */
export declare function getFallbackOpenAI(): OpenAI | null;
/** @deprecated Use getFallbackOpenAI() instead */
export declare const fallbackOpenai: OpenAI | null;
export interface RetryOptions {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    retryableStatuses?: number[];
    retryableErrorPatterns?: RegExp[];
}
/**
 * Execute an async function with exponential backoff retry.
 * Retries on rate limits (429), server errors (5xx), and network errors.
 */
export declare function withRetry<T>(fn: () => Promise<T>, label: string, opts?: RetryOptions): Promise<T>;
//# sourceMappingURL=client.d.ts.map