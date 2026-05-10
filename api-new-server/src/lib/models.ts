/**
 * AI model selection — Groq (primary) with OpenRouter/Ollama Cloud fallback.
 *
 * Groq models:
 *   - Mind map, text, QBank: openai/gpt-oss-120b
 *   - Visual:               meta-llama/llama-4-scout-17b-16e-instruct
 */

const envText = process.env.AI_TEXT_MODEL?.trim() || null;
const envVision = process.env.AI_VISION_MODEL?.trim() || null;
const envQbank = process.env.AI_QBANK_MODEL?.trim() || null;
const envMindmap = process.env.AI_MINDMAP_MODEL?.trim() || null;

// Groq model IDs (served via https://api.groq.com/openai/v1)
export const FREE_TEXT_MODEL = envText ?? "openai/gpt-oss-120b";
export const FREE_VISION_MODEL = envVision ?? "meta-llama/llama-4-scout-17b-16e-instruct";
export const QBANK_MODEL = envQbank ?? "openai/gpt-oss-120b";
export const MINDMAP_MODEL = envMindmap ?? "openai/gpt-oss-120b";
export const EXPLAIN_MODEL = envText ?? "openai/gpt-oss-120b";
export const VISUAL_DETECTION_MODEL = envVision ?? "meta-llama/llama-4-scout-17b-16e-instruct";

export const MODEL_SUMMARY = {
  text: FREE_TEXT_MODEL,
  vision: FREE_VISION_MODEL,
  qbank: QBANK_MODEL,
  mindmap: MINDMAP_MODEL,
  explain: EXPLAIN_MODEL,
  visualDetection: VISUAL_DETECTION_MODEL,
  provider: "groq",
};

export interface ModelConfig {
  model: string;
  provider: "openrouter" | "ollama-cloud" | "openai" | "gemini" | "groq" | "mistral";
}
