/**
 * AI model selection — each feature uses a different free model
 * to spread quota across multiple rate-limit buckets.
 */

const envText    = process.env.AI_TEXT_MODEL?.trim()    || null;
const envVision  = process.env.AI_VISION_MODEL?.trim()  || null;
const envQbank   = process.env.AI_QBANK_MODEL?.trim()   || null;
const envMindmap = process.env.AI_MINDMAP_MODEL?.trim() || null;
const envExplain = process.env.AI_EXPLAIN_MODEL?.trim() || null;

export const FREE_TEXT_MODEL        = envText    ?? "meta-llama/llama-4-maverick:free";
export const FREE_VISION_MODEL      = envVision  ?? "google/gemma-3-27b-it:free";
export const QBANK_MODEL            = envQbank   ?? "deepseek/deepseek-r1-0528:free";
export const MINDMAP_MODEL          = envMindmap ?? "microsoft/mai-ds-r1:free";
export const EXPLAIN_MODEL          = envExplain ?? "qwen/qwq-32b:free";
export const VISUAL_DETECTION_MODEL = envVision  ?? "google/gemma-3-27b-it:free";

export type ModelConfig = {
  model: string;
  provider: "openrouter" | "ollama-cloud" | "openai" | "gemini" | "groq" | "mistral";
};

export const MODEL_SUMMARY = {
  text: FREE_TEXT_MODEL,
  vision: FREE_VISION_MODEL,
  qbank: QBANK_MODEL,
  mindmap: MINDMAP_MODEL,
  explain: EXPLAIN_MODEL,
  visualDetection: VISUAL_DETECTION_MODEL,
  provider: "openrouter",
};
