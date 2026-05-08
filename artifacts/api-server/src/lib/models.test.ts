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

describe("models.ts — default model names (no -cloud suffix)", () => {
  beforeEach(() => {
    vi.resetModules();
    clearModelEnv();
  });

  afterEach(restoreEnv);

  it("FREE_TEXT_MODEL defaults to qwen3-coder:480b (no -cloud suffix)", async () => {
    const mod = await import("./models");
    expect(mod.FREE_TEXT_MODEL).toBe("qwen3-coder:480b");
    expect(mod.FREE_TEXT_MODEL).not.toContain("-cloud");
  });

  it("FREE_VISION_MODEL defaults to llama4:scout (no -cloud suffix)", async () => {
    const mod = await import("./models");
    expect(mod.FREE_VISION_MODEL).toBe("llama4:scout");
    expect(mod.FREE_VISION_MODEL).not.toContain("-cloud");
  });

  it("QBANK_MODEL defaults to gpt-oss:120b (no -cloud suffix)", async () => {
    const mod = await import("./models");
    expect(mod.QBANK_MODEL).toBe("gpt-oss:120b");
    expect(mod.QBANK_MODEL).not.toContain("-cloud");
  });

  it("MINDMAP_MODEL defaults to deepseek-v4-flash (no -cloud suffix)", async () => {
    const mod = await import("./models");
    expect(mod.MINDMAP_MODEL).toBe("deepseek-v4-flash");
    expect(mod.MINDMAP_MODEL).not.toContain("-cloud");
  });

  it("EXPLAIN_MODEL defaults to qwen3-coder:480b (no -cloud suffix)", async () => {
    const mod = await import("./models");
    expect(mod.EXPLAIN_MODEL).toBe("qwen3-coder:480b");
    expect(mod.EXPLAIN_MODEL).not.toContain("-cloud");
  });

  it("VISUAL_DETECTION_MODEL defaults to llama4:scout (no -cloud suffix)", async () => {
    const mod = await import("./models");
    expect(mod.VISUAL_DETECTION_MODEL).toBe("llama4:scout");
    expect(mod.VISUAL_DETECTION_MODEL).not.toContain("-cloud");
  });

  it("MODEL_SUMMARY.provider is 'ollama' (not 'ollama-cloud')", async () => {
    const mod = await import("./models");
    expect(mod.MODEL_SUMMARY.provider).toBe("ollama");
    expect(mod.MODEL_SUMMARY.provider).not.toContain("-cloud");
  });

  it("MODEL_SUMMARY contains all expected keys", async () => {
    const mod = await import("./models");
    const expectedKeys = ["text", "vision", "qbank", "mindmap", "explain", "visualDetection", "provider"];
    for (const key of expectedKeys) {
      expect(mod.MODEL_SUMMARY).toHaveProperty(key);
    }
  });

  it("no model name in MODEL_SUMMARY contains -cloud suffix", async () => {
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
      expect(val).not.toMatch(/-cloud$/);
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
    expect(mod.FREE_TEXT_MODEL).toBe("qwen3-coder:480b");
  });
});
