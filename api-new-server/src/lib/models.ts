/**
 * AI model selection — OpenRouter (primary) with Ollama Cloud fallback.
 */

const envText = process.env.AI_TEXT_MODEL?.trim() || null;
const envVision = process.env.AI_VISION_MODEL?.trim() || null;
const envQbank = process.env.AI_QBANK_MODEL?.trim() || null;
const envMindmap = process.env.AI_MINDMAP_MODEL?.trim() || null;

export const FREE_TEXT_MODEL = envText ?? "openai/gpt-oss-120b:free";
export const FREE_VISION_MODEL = envVision ?? "google/gemma-4-31b-it:free";
export const QBANK_MODEL = envQbank ?? "openai/gpt-oss-120b:free";
export const MINDMAP_MODEL = envMindmap ?? "tencent/hy3-preview:free";
export const EXPLAIN_MODEL = envText ?? "openai/gpt-oss-120b:free";
export const VISUAL_DETECTION_MODEL = envVision ?? "google/gemma-4-31b-it:free";

export const MODEL_SUMMARY = {
  text: FREE_TEXT_MODEL,
  vision: FREE_VISION_MODEL,
  qbank: QBANK_MODEL,
  mindmap: MINDMAP_MODEL,
  explain: EXPLAIN_MODEL,
  visualDetection: VISUAL_DETECTION_MODEL,
  provider: "openrouter",
};
