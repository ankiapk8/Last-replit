import { describe, it, expect, afterEach, vi } from "vitest";

const ORIGINAL_ENV: Record<string, string | undefined> = { ...process.env };

function clearAllApiKeys() {
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

  it("FALLBACK_MODEL is gpt-4o-mini", async () => {
    vi.resetModules();
    const mod = await import("./client");
    expect(mod.FALLBACK_MODEL).toBe("gpt-4o-mini");
  });
});

describe("client.ts — getFallbackOpenAI", () => {
  afterEach(() => {
    vi.resetModules();
    restoreEnv;
  });

  it("returns OpenRouter client when primary is qwen3-coder:latest and OpenRouter key exists", async () => {
    vi.resetModules();
    clearAllApiKeys();
    process.env.OLLAMA_CLOUD_API_KEY = "ollama-key";
    process.env.OPENROUTER_API_KEY = "or-key";
    const mod = await import("./client");
    const fallback = mod.getFallbackOpenAI();
    expect(fallback).not.toBeNull();
  });

  it("returns null when only qwen3-coder:latest key is set (no fallback provider)", async () => {
    vi.resetModules();
    clearAllApiKeys();
    process.env.OLLAMA_CLOUD_API_KEY = "ollama-key";
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

  it("returns Replit key fallback when primary is OpenRouter", async () => {
    vi.resetModules();
    clearAllApiKeys();
    process.env.OPENROUTER_API_KEY = "or-key";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "replit-key";
    const mod = await import("./client");
    const fallback = mod.getFallbackOpenAI();
    expect(fallback).not.toBeNull();
  });
});
