/**
 * Groq provider adapter.
 * Uses the OpenAI SDK with Groq's OpenAI-compatible endpoint.
 * Optimized for ultra-fast inference with LPU architecture.
 */

import {
  BaseProvider,
  type ChatOptions,
  type ChatResult,
  type StreamChunk,
  type ModelConfig,
  type ProviderConfig,
} from "./base";

export class GroqProvider extends BaseProvider {
  readonly name = "groq";

  readonly models: ModelConfig[] = [
    {
      id: "llama-3.1-70b-versatile",
      name: "Llama 3.1 70B Versatile",
      contextWindow: 131_072,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsVision: false,
    },
    {
      id: "llama-3.1-8b-instant",
      name: "Llama 3.1 8B Instant",
      contextWindow: 131_072,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsVision: false,
    },
    {
      id: "llama-3.3-70b-versatile",
      name: "Llama 3.3 70B Versatile",
      contextWindow: 131_072,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsVision: false,
    },
    {
      id: "mixtral-8x7b-32768",
      name: "Mixtral 8x7B",
      contextWindow: 32_768,
      maxOutputTokens: 8192,
      supportsTools: true,
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
          ...(this.config.defaultHeaders
            ? { defaultHeaders: this.config.defaultHeaders }
            : {}),
        });
      });
    }
    return this.clientPromise;
  }

  async chat(options: ChatOptions): Promise<ChatResult> {
    const client = await this.getClient();
    return this.withRetry(
      async () => {
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
      },
      `groq:chat:${options.model}`
    );
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
      `groq:stream:${options.model}`
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
