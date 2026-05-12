/**
 * Provider factory — creates and caches provider adapters.
 * Replaces the direct OpenAI SDK usage in ai-client.ts with a proper adapter pattern.
 */

import { logger } from "../lib/logger";
import { BaseProvider, type ProviderConfig } from "./base";
import { OpenAIProvider } from "./openai";
import { OpenRouterProvider } from "./openrouter";
import { OllamaProvider } from "./ollama";
import { GroqProvider } from "./groq";

// ─── Provider Registry ────────────────────────────────────────────────────────

type ProviderConstructor = new (config: ProviderConfig) => BaseProvider;

const providerRegistry: Record<string, ProviderConstructor> = {
  openai: OpenAIProvider,
  openrouter: OpenRouterProvider,
  ollama: OllamaProvider,
  groq: GroqProvider,
};

// ─── Provider Cache ───────────────────────────────────────────────────────────

const providerCache: Map<string, BaseProvider> = new Map();

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createProvider(name: string, config: ProviderConfig): BaseProvider {
  const ProviderClass = providerRegistry[name];
  if (!ProviderClass) {
    throw new Error(
      `Unknown provider '${name}'. Available: ${Object.keys(providerRegistry).join(", ")}`
    );
  }
  return new ProviderClass(config);
}

export function getOrCreateProvider(name: string, config: ProviderConfig): BaseProvider {
  const cacheKey = `${name}:${config.baseURL}`;
  let provider = providerCache.get(cacheKey);
  if (!provider) {
    provider = createProvider(name, config);
    providerCache.set(cacheKey, provider);
    logger.info({ provider: name, baseURL: config.baseURL }, "Provider initialized");
  }
  return provider;
}

// ─── Auto-Detection (matches existing priority from integrations library) ──────

export function detectProvider(): { name: string; config: ProviderConfig } {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const ollamaCloudKey = process.env.OLLAMA_CLOUD_API_KEY?.trim();
  const openAIKey1 = process.env.OPENAI_API_KEY1?.trim();
  const openAIKey = process.env.OPENAI_API_KEY?.trim();
  const replitKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim();

  if (groqKey) {
    return {
      name: "groq",
      config: {
        apiKey: groqKey,
        baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
      },
    };
  }

  if (openRouterKey) {
    return {
      name: "openrouter",
      config: {
        apiKey: openRouterKey,
        baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "https://anki-generator.local",
          "X-Title": process.env.OPENROUTER_APP_TITLE || "Anki Card Generator",
        },
      },
    };
  }

  if (ollamaCloudKey) {
    return {
      name: "ollama",
      config: {
        apiKey: ollamaCloudKey,
        baseURL: process.env.OLLAMA_CLOUD_BASE_URL || "https://ollama.com/api",
      },
    };
  }

  if (openAIKey1 || openAIKey) {
    return {
      name: "openai",
      config: {
        apiKey: openAIKey1 || openAIKey!,
        baseURL: "https://api.openai.com/v1",
      },
    };
  }

  if (replitKey) {
    return {
      name: "openai",
      config: {
        apiKey: replitKey,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.groq.com/openai/v1",
      },
    };
  }

  // Fallback: create a provider that will fail gracefully
  logger.warn(
    "No AI provider API key configured. Set GROQ_API_KEY, OPENROUTER_API_KEY, OLLAMA_CLOUD_API_KEY, or OPENAI_API_KEY."
  );
  return {
    name: "openrouter",
    config: {
      apiKey: "not-configured",
      baseURL: "https://openrouter.ai/api/v1",
    },
  };
}

// ─── Fallback Detection ───────────────────────────────────────────────────────

export function detectFallbackProvider(
  primaryName: string
): { name: string; config: ProviderConfig } | null {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const ollamaCloudKey = process.env.OLLAMA_CLOUD_API_KEY?.trim();
  const openAIKey1 = process.env.OPENAI_API_KEY1?.trim();
  const openAIKey = process.env.OPENAI_API_KEY?.trim();

  // If primary is Groq, try OpenRouter or Ollama Cloud as fallback
  if (primaryName === "groq") {
    if (openRouterKey) {
      return {
        name: "openrouter",
        config: {
          apiKey: openRouterKey,
          baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
          defaultHeaders: {
            "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "https://anki-generator.local",
            "X-Title": process.env.OPENROUTER_APP_TITLE || "Anki Card Generator",
          },
        },
      };
    }
    if (ollamaCloudKey) {
      return {
        name: "ollama",
        config: {
          apiKey: ollamaCloudKey,
          baseURL: process.env.OLLAMA_CLOUD_BASE_URL || "https://ollama.com/api",
        },
      };
    }
    return null;
  }

  // If primary is OpenRouter, try Ollama Cloud as fallback
  if (primaryName === "openrouter" && ollamaCloudKey) {
    return {
      name: "ollama",
      config: {
        apiKey: ollamaCloudKey,
        baseURL: process.env.OLLAMA_CLOUD_BASE_URL || "https://ollama.com/api",
      },
    };
  }

  // If primary is Ollama or OpenAI, try OpenRouter as fallback
  if ((primaryName === "ollama" || primaryName === "openai") && openRouterKey) {
    return {
      name: "openrouter",
      config: {
        apiKey: openRouterKey,
        baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "https://anki-generator.local",
          "X-Title": process.env.OPENROUTER_APP_TITLE || "Anki Card Generator",
        },
      },
    };
  }

  return null;
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export { BaseProvider } from "./base";
export type {
  ChatMessage,
  ChatOptions,
  ChatResult,
  StreamChunk,
  ToolCall,
  ToolDefinition,
  TokenUsage,
  ModelConfig,
  ProviderConfig,
} from "./base";
