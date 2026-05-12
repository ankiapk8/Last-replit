/**
 * OpenRouter provider adapter.
 * Uses the OpenAI SDK with OpenRouter's base URL.
 * Supports all OpenRouter models with automatic routing.
 */

import {
  BaseProvider,
  type ChatOptions,
  type ChatResult,
  type StreamChunk,
  type ModelConfig,
  type ProviderConfig,
} from "./base";

export class OpenRouterProvider extends BaseProvider {
  readonly name = "openrouter";

  readonly models: ModelConfig[] = [
    {
      id: "openai/gpt-4o",
      name: "GPT-4o (OpenRouter)",
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      supportsTools: true,
      supportsVision: true,
    },
    {
      id: "openai/gpt-4o-mini",
      name: "GPT-4o Mini (OpenRouter)",
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      supportsTools: true,
      supportsVision: true,
    },
    {
      id: "anthropic/claude-sonnet-4",
      name: "Claude Sonnet 4 (OpenRouter)",
      contextWindow: 200_000,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsVision: true,
    },
    {
      id: "anthropic/claude-3.5-sonnet",
      name: "Claude 3.5 Sonnet (OpenRouter)",
      contextWindow: 200_000,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsVision: true,
    },
    {
      id: "meta-llama/llama-4-maverick:free",
      name: "Llama 4 Maverick Free",
      contextWindow: 1_048_576,
      maxOutputTokens: 8192,
      supportsTools: false,
      supportsVision: true,
    },
    {
      id: "deepseek/deepseek-r1-0528:free",
      name: "DeepSeek R1 Free",
      contextWindow: 163_840,
      maxOutputTokens: 8192,
      supportsTools: false,
      supportsVision: false,
    },
    {
      id: "qwen/qwq-32b:free",
      name: "Qwen QwQ 32B Free",
      contextWindow: 131_072,
      maxOutputTokens: 8192,
      supportsTools: false,
      supportsVision: false,
    },
    {
      id: "google/gemma-3-27b-it:free",
      name: "Gemma 3 27B Free",
      contextWindow: 131_072,
      maxOutputTokens: 8192,
      supportsTools: false,
      supportsVision: true,
    },
    {
      id: "microsoft/mai-ds-r1:free",
      name: "Microsoft MAI DS R1 Free",
      contextWindow: 163_840,
      maxOutputTokens: 8192,
      supportsTools: false,
      supportsVision: false,
    },
  ];

  private clientPromise: Promise<any> | null = null;

  constructor(config: ProviderConfig) {
    super(config);
  }

  private async getClient(): Promise<any> {
    if (!this.clientPromise) {
      this.clientPromise = import("openai").then(({ default: OpenAI }) => {
        return new OpenAI({
          apiKey: this.config.apiKey,
          baseURL: this.config.baseURL,
          defaultHeaders: {
            "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "https://anki-generator.local",
            "X-Title": process.env.OPENROUTER_APP_TITLE || "Anki Card Generator",
            ...this.config.defaultHeaders,
          },
        });
      });
    }
    return this.clientPromise;
  }

  async chat(options: ChatOptions): Promise<ChatResult> {
    const client = await this.getClient();
    return this.withRetry(async () => {
      const params: Record<string, unknown> = {
        model: options.model,
        messages: options.messages,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.3,
      };

      if (options.tools && options.tools.length > 0) {
        params.tools = options.tools;
        params.tool_choice = options.toolChoice ?? "auto";
      }

      const signal =
        options.timeoutMs && options.timeoutMs > 0
          ? AbortSignal.timeout(options.timeoutMs)
          : undefined;

      const completion = await client.chat.completions.create(params, {
        signal,
      });

      const choice = completion.choices[0];
      return {
        content: choice?.message?.content ?? "",
        toolCalls:
          choice?.message?.tool_calls?.map((tc: any) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })) ?? [],
        usage: {
          promptTokens: completion.usage?.prompt_tokens ?? 0,
          completionTokens: completion.usage?.completion_tokens ?? 0,
          totalTokens: completion.usage?.total_tokens ?? 0,
        },
        model: completion.model,
        finishReason: choice?.finish_reason ?? "stop",
      };
    }, `openrouter:chat:${options.model}`);
  }

  async *stream(options: ChatOptions): AsyncGenerator<StreamChunk> {
    const client = await this.getClient();

    const params: Record<string, unknown> = {
      model: options.model,
      messages: options.messages,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.3,
      stream: true,
    };

    if (options.tools && options.tools.length > 0) {
      params.tools = options.tools;
      params.tool_choice = options.toolChoice ?? "auto";
    }

    const signal =
      options.timeoutMs && options.timeoutMs > 0
        ? AbortSignal.timeout(options.timeoutMs)
        : undefined;

    const stream = await this.withRetry(
      () => client.chat.completions.create(params, { signal }),
      `openrouter:stream:${options.model}`
    );

    for await (const chunk of stream as any) {
      const choice = chunk.choices[0];
      const content = choice?.delta?.content;
      const toolCalls = choice?.delta?.tool_calls;

      yield {
        content: content ?? "",
        toolCalls: toolCalls?.map((tc: any) => ({
          id: tc.id ?? "",
          type: "function" as const,
          function: {
            name: tc.function?.name ?? "",
            arguments: tc.function?.arguments ?? "",
          },
        })),
        finishReason: choice?.finish_reason ?? undefined,
      };
    }
  }
}
