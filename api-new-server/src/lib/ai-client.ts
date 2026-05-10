/**
 * Unified AI client — Groq (primary) with OpenRouter/Ollama Cloud fallback.
 * All AI calls go through this module. No route file should import AI SDKs directly.
 */

import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContent[];
}

export type ChatContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" } };

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  timeoutMs?: number;
}

export interface ChatResult {
  content: string;
  model: string;
}

// ─── Client Cache ─────────────────────────────────────────────────────────────

interface AIClientBundle {
  openai: Awaited<ReturnType<typeof createAIClient>>["openai"];
  getFallbackOpenAI: Awaited<ReturnType<typeof createAIClient>>["getFallbackOpenAI"];
  FALLBACK_MODEL: string;
}

let cachedClient: AIClientBundle | null = null;

// ─── Initialization ───────────────────────────────────────────────────────────

async function createAIClient() {
  const mod = await import("@workspace/integrations-openai-ai-server");
  return {
    openai: mod.openai,
    getFallbackOpenAI: mod.getFallbackOpenAI,
    FALLBACK_MODEL: mod.FALLBACK_MODEL,
  };
}

export async function getAIClient(): Promise<AIClientBundle> {
  if (!cachedClient) {
    cachedClient = await createAIClient();
    const groqKey = process.env.GROQ_API_KEY?.trim();
    const orKey = process.env.OPENROUTER_API_KEY?.trim();
    const provider = groqKey
      ? "groq"
      : orKey
        ? "openrouter"
        : process.env.OLLAMA_CLOUD_API_KEY
          ? "ollama-cloud"
          : "openai";
    logger.info({ provider }, "AI client initialized");
  }
  return cachedClient;
}

// ─── Fallback Logic ──────────────────────────────────────────────────────────

export function shouldFallback(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number }).status;
  if (msg.includes("free-models-per-day")) return true;
  if (status === 429) return true;
  if (status && status >= 500) return true;
  if (/ECONNREFUSED|connect|connection|network|fetch failed|timeout/i.test(msg)) return true;
  return false;
}

// ─── Non-streaming Chat ───────────────────────────────────────────────────────

export async function completeChat(options: ChatOptions): Promise<ChatResult> {
  const { model, messages, maxTokens = 4000, temperature = 0.3, timeoutMs = 120_000 } = options;
  const client = await getAIClient();
  const { openai, getFallbackOpenAI, FALLBACK_MODEL } = client;

  const makeRequest = (o: typeof openai, m: string) =>
    o.chat.completions.create(
      {
        model: m,
        messages: messages as Parameters<typeof o.chat.completions.create>[0]["messages"],
        max_tokens: maxTokens,
        temperature,
      },
      { signal: AbortSignal.timeout(timeoutMs) }
    );

  try {
    const completion = await makeRequest(openai, model);
    return {
      content: completion.choices[0]?.message?.content ?? "",
      model,
    };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err, model },
      "Primary AI model failed"
    );
    const fb = shouldFallback(err) ? getFallbackOpenAI() : null;
    if (fb) {
      logger.info({ model: FALLBACK_MODEL }, "Falling back to secondary AI model");
      const completion = await makeRequest(fb, FALLBACK_MODEL);
      return {
        content: completion.choices[0]?.message?.content ?? "",
        model: FALLBACK_MODEL,
      };
    }
    throw err;
  }
}

// ─── Streaming Chat ───────────────────────────────────────────────────────────

export async function* streamChat(
  options: Omit<ChatOptions, "stream">
): AsyncGenerator<string, void, unknown> {
  const { model, messages, maxTokens = 4000, temperature = 0.3, timeoutMs = 120_000 } = options;
  const client = await getAIClient();
  const { openai, getFallbackOpenAI, FALLBACK_MODEL } = client;

  const makeRequest = (o: typeof openai, m: string) =>
    o.chat.completions.create(
      {
        model: m,
        messages: messages as Parameters<typeof o.chat.completions.create>[0]["messages"],
        max_tokens: maxTokens,
        temperature,
        stream: true,
      },
      { signal: AbortSignal.timeout(timeoutMs) }
    );

  let stream;
  try {
    stream = await makeRequest(openai, model);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err, model },
      "Primary AI model failed (streaming)"
    );
    const fb = shouldFallback(err) ? getFallbackOpenAI() : null;
    if (fb) {
      logger.info({ model: FALLBACK_MODEL }, "Falling back to secondary AI model (streaming)");
      stream = await makeRequest(fb, FALLBACK_MODEL);
    } else {
      throw err;
    }
  }

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}

// ─── SSE Helper ───────────────────────────────────────────────────────────────

export function setupSSEHeaders(res: import("express").Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof (res as unknown as { flushHeaders?: () => void }).flushHeaders === "function") {
    (res as unknown as { flushHeaders: () => void }).flushHeaders();
  }
}

export function sendSSE(res: import("express").Response, event: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
  if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
    (res as unknown as { flush: () => void }).flush();
  }
}

export function startHeartbeat(
  res: import("express").Response,
  intervalMs = 15000
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    res.write(": heartbeat\n\n");
    if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
      (res as unknown as { flush: () => void }).flush();
    }
  }, intervalMs);
}
