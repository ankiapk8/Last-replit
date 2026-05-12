/**
 * BaseProvider — Abstract base class for all LLM provider adapters.
 * All AI calls go through this interface. No route file should import AI SDKs directly.
 */

import { logger } from "../lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChatMessageRole = "system" | "user" | "assistant" | "tool";

export interface ChatContentBlock {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail?: "low" | "high" };
}

export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: ToolCallFunction;
}

export interface ChatMessage {
  role: ChatMessageRole;
  content: string | ChatContentBlock[];
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  name?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
  timeoutMs?: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  usage: TokenUsage;
  model: string;
  finishReason: "stop" | "length" | "tool_calls" | "content_filter";
}

export interface StreamChunk {
  content: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
  finishReason?: string;
}

export interface ModelConfig {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
}

export interface ProviderConfig {
  apiKey: string;
  baseURL: string;
  defaultHeaders?: Record<string, string>;
}

// ─── Retry Options ─────────────────────────────────────────────────────────────

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  retryableStatuses?: number[];
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 2000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

// ─── Base Provider ─────────────────────────────────────────────────────────────

export abstract class BaseProvider {
  abstract readonly name: string;
  abstract readonly models: ModelConfig[];

  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /** Non-streaming chat completion */
  abstract chat(options: ChatOptions): Promise<ChatResult>;

  /** Streaming chat completion — yields partial content chunks */
  abstract stream(options: ChatOptions): AsyncGenerator<StreamChunk>;

  /** Check whether a given model supports tool/function calling */
  supportsTools(model: string): boolean {
    const cfg = this.models.find((m) => m.id === model);
    return cfg?.supportsTools ?? false;
  }

  /** Get model configuration */
  getModelConfig(model: string): ModelConfig {
    const cfg = this.models.find((m) => m.id === model);
    if (!cfg) {
      throw new Error(`Unknown model '${model}' for provider '${this.name}'`);
    }
    return cfg;
  }

  // ─── Shared Retry Logic ─────────────────────────────────────────────────────

  protected async withRetry<T>(
    fn: () => Promise<T>,
    label: string,
    opts: RetryOptions = {}
  ): Promise<T> {
    const options = { ...DEFAULT_RETRY_OPTIONS, ...opts };
    let lastError: unknown;

    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay =
            options.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000;
          logger.info(
            { label, attempt, delayMs: Math.round(delay) },
            "Retrying after backoff"
          );
          await new Promise((r) => setTimeout(r, delay));
        }
        return await fn();
      } catch (err) {
        lastError = err;
        const status = (err as { status?: number }).status;
        const msg = err instanceof Error ? err.message : String(err);

        const isRetryable =
          (status !== undefined && options.retryableStatuses.includes(status)) ||
          /timeout/i.test(msg);

        if (attempt < options.maxRetries && isRetryable) {
          logger.warn(
            { label, attempt: attempt + 1, status, msg },
            "Request failed — retrying"
          );
          continue;
        }

        logger.error(
          { label, attempt: attempt + 1, status, msg },
          "Request failed — no more retries"
        );
        throw err;
      }
    }

    throw lastError;
  }

  /** Determine whether an error should trigger a fallback to another provider */
  static shouldFallback(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    const status = (error as { status?: number }).status;
    if (msg.includes("free-models-per-day")) return true;
    if (status === 429) return true;
    if (status && status >= 500) return true;
    if (/ECONNREFUSED|connect|connection|network|fetch failed|timeout/i.test(msg))
      return true;
    return false;
  }
}
