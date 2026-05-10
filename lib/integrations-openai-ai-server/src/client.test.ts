import { describe, it, expect, afterEach, vi } from "vitest";

const ORIGINAL_ENV: Record<string, string | undefined> = { ...process.env };

function clearAllApiKeys() {
  delete process.env.GROQ_API_KEY;
  delete process.env.OLLAMA_CLOUD_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY1;
  delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

describe("client.ts — provider detection", () => {
  afterEach(() => {
    vi.resetModules();
    restoreEnv;
  });

  it("isConfigured is false when no API keys are set", async () => {
    vi.resetModules();
    clearAllApiKeys();
    const mod = await import("./client");
    expect(mod.isConfigured).toBe(false);
  });

  it("isConfigured is true when GROQ_API_KEY is set", async () => {
    vi.resetModules();
    clearAllApiKeys();
    process.env.GROQ_API_KEY = "test-key";
    const mod = await import("./client");
    expect(mod.isConfigured).toBe(true);
  });

  it("isConfigured is true when OLLAMA_CLOUD_API_KEY is set", async () => {
    vi.resetModules();
    clearAllApiKeys();
    process.env.OLLAMA_CLOUD_API_KEY = "test-key";
    const mod = await import("./client");
    expect(mod.isConfigured).toBe(true);
  });

  it("isConfigured is true when OPENROUTER_API_KEY is set", async () => {
    vi.resetModules();
    clearAllApiKeys();
    process.env.OPENROUTER_API_KEY = "test-key";
    const mod = await import("./client");
    expect(mod.isConfigured).toBe(true);
  });

  it("isConfigured is true when OPENAI_API_KEY is set", async () => {
    vi.resetModules();
    clearAllApiKeys();
    process.env.OPENAI_API_KEY = "test-key";
    const mod = await import("./client");
    expect(mod.isConfigured).toBe(true);
  });

  it("FALLBACK_MODEL is openai/gpt-oss-120b", async () => {
    vi.resetModules();
    const mod = await import("./client");
    expect(mod.FALLBACK_MODEL).toBe("openai/gpt-oss-120b");
  });
});

describe("client.ts — getFallbackOpenAI", () => {
  afterEach(() => {
    vi.resetModules();
    restoreEnv;
  });

  it("returns OpenRouter client when primary is Groq and OpenRouter key exists", async () => {
    vi.resetModules();
    clearAllApiKeys();
    process.env.GROQ_API_KEY = "groq-key";
    process.env.OPENROUTER_API_KEY = "or-key";
    const mod = await import("./client");
    const fallback = mod.getFallbackOpenAI();
    expect(fallback).not.toBeNull();
  });

  it("returns Ollama Cloud client when primary is Groq and only Ollama key exists", async () => {
    vi.resetModules();
    clearAllApiKeys();
    process.env.GROQ_API_KEY = "groq-key";
    process.env.OLLAMA_CLOUD_API_KEY = "ollama-key";
    const mod = await import("./client");
    const fallback = mod.getFallbackOpenAI();
    expect(fallback).not.toBeNull();
  });

  it("returns Ollama Cloud client when primary is OpenRouter and Ollama key exists", async () => {
    vi.resetModules();
    clearAllApiKeys();
    process.env.OPENROUTER_API_KEY = "or-key";
    process.env.OLLAMA_CLOUD_API_KEY = "ollama-key";
    const mod = await import("./client");
    const fallback = mod.getFallbackOpenAI();
    expect(fallback).not.toBeNull();
  });

  it("returns null when only Groq key is set (no fallback provider)", async () => {
    vi.resetModules();
    clearAllApiKeys();
    process.env.GROQ_API_KEY = "groq-key";
    const mod = await import("./client");
    const fallback = mod.getFallbackOpenAI();
    expect(fallback).toBeNull();
  });

  it("returns null when only OpenRouter key is set (no fallback provider)", async () => {
    vi.resetModules();
    clearAllApiKeys();
    process.env.OPENROUTER_API_KEY = "or-key";
    const mod = await import("./client");
    const fallback = mod.getFallbackOpenAI();
    expect(fallback).toBeNull();
  });

  it("returns null when no keys are set", async () => {
    vi.resetModules();
    clearAllApiKeys();
    const mod = await import("./client");
    const fallback = mod.getFallbackOpenAI();
    expect(fallback).toBeNull();
  });
});
