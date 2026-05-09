import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_ENV: Record<string, string | undefined> = { ...process.env };

function clearModelEnv() {
  delete process.env.AI_TEXT_MODEL;
  delete process.env.AI_VISION_MODEL;
  delete process.env.AI_QBANK_MODEL;
  delete process.env.AI_MINDMAP_MODEL;
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

describe("models.ts — OpenRouter free tier defaults", () => {
  beforeEach(() => {
    vi.resetModules();
    clearModelEnv();
  });

  afterEach(restoreEnv);

  it("FREE_TEXT_MODEL defaults to openai/gpt-oss-120b:free", async () => {
    const mod = await import("./models");
    expect(mod.FREE_TEXT_MODEL).toBe("openai/gpt-oss-120b:free");
  });

  it("FREE_VISION_MODEL defaults to google/gemma-4-31b-it:free", async () => {
    const mod = await import("./models");
    expect(mod.FREE_VISION_MODEL).toBe("google/gemma-4-31b-it:free");
  });

  it("QBANK_MODEL defaults to openai/gpt-oss-120b:free", async () => {
    const mod = await import("./models");
    expect(mod.QBANK_MODEL).toBe("openai/gpt-oss-120b:free");
  });

  it("MINDMAP_MODEL defaults to tencent/hy3-preview:free", async () => {
    const mod = await import("./models");
    expect(mod.MINDMAP_MODEL).toBe("tencent/hy3-preview:free");
  });

  it("EXPLAIN_MODEL defaults to openai/gpt-oss-120b:free", async () => {
    const mod = await import("./models");
    expect(mod.EXPLAIN_MODEL).toBe("openai/gpt-oss-120b:free");
  });

  it("VISUAL_DETECTION_MODEL defaults to google/gemma-4-31b-it:free", async () => {
    const mod = await import("./models");
    expect(mod.VISUAL_DETECTION_MODEL).toBe("google/gemma-4-31b-it:free");
  });

  it("MODEL_SUMMARY.provider is 'openrouter'", async () => {
    const mod = await import("./models");
    expect(mod.MODEL_SUMMARY.provider).toBe("openrouter");
  });

  it("MODEL_SUMMARY contains all expected keys", async () => {
    const mod = await import("./models");
    const expectedKeys = [
      "text",
      "vision",
      "qbank",
      "mindmap",
      "explain",
      "visualDetection",
      "provider",
    ];
    for (const key of expectedKeys) {
      expect(mod.MODEL_SUMMARY).toHaveProperty(key);
    }
  });

  it("all model names use OpenRouter :free tier format", async () => {
    const mod = await import("./models");
    const modelValues = [
      mod.MODEL_SUMMARY.text,
      mod.MODEL_SUMMARY.vision,
      mod.MODEL_SUMMARY.qbank,
      mod.MODEL_SUMMARY.mindmap,
      mod.MODEL_SUMMARY.explain,
      mod.MODEL_SUMMARY.visualDetection,
    ];
    for (const val of modelValues) {
      expect(val).toMatch(/:free$/);
    }
  });
});

describe("models.ts — env var overrides", () => {
  beforeEach(() => {
    vi.resetModules();
    clearModelEnv();
  });

  afterEach(restoreEnv);

  it("AI_TEXT_MODEL env var overrides FREE_TEXT_MODEL", async () => {
    process.env.AI_TEXT_MODEL = "custom-text-model";
    const mod = await import("./models");
    expect(mod.FREE_TEXT_MODEL).toBe("custom-text-model");
  });

  it("AI_VISION_MODEL env var overrides FREE_VISION_MODEL", async () => {
    process.env.AI_VISION_MODEL = "custom-vision-model";
    const mod = await import("./models");
    expect(mod.FREE_VISION_MODEL).toBe("custom-vision-model");
  });

  it("AI_QBANK_MODEL env var overrides QBANK_MODEL", async () => {
    process.env.AI_QBANK_MODEL = "custom-qbank-model";
    const mod = await import("./models");
    expect(mod.QBANK_MODEL).toBe("custom-qbank-model");
  });

  it("AI_MINDMAP_MODEL env var overrides MINDMAP_MODEL", async () => {
    process.env.AI_MINDMAP_MODEL = "custom-mindmap-model";
    const mod = await import("./models");
    expect(mod.MINDMAP_MODEL).toBe("custom-mindmap-model");
  });

  it("empty string env var falls back to default", async () => {
    process.env.AI_TEXT_MODEL = "   ";
    const mod = await import("./models");
    expect(mod.FREE_TEXT_MODEL).toBe("openai/gpt-oss-120b:free");
  });
});
