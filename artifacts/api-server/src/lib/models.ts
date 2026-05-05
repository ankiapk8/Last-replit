/**
 * AI model selection — local Ollama.
 *
 * Two-model strategy:
 *  - Text generation (decks, cards, QBank, mind maps, explanations) → phi4-mini
 *  - Vision generation (visual card detection from PDF pages)        → llama3.2-vision
 *
 * Priority:
 *  1. Explicit non-empty env override (AI_TEXT_MODEL / AI_VISION_MODEL)
 *  2. Defaults below
 */

const envText   = process.env.AI_TEXT_MODEL?.trim()  || null;
const envVision = process.env.AI_VISION_MODEL?.trim() || null;

/** Text model — deck/card generation, QBank, mind maps, AI explanation */
export const FREE_TEXT_MODEL = envText ?? "phi4-mini";

/** Vision model — image-based visual card detection (gemma3:4b is multimodal) */
export const FREE_VISION_MODEL = envVision ?? "gemma3:4b";

/** Long-form explanation model — AI Explanation feature */
export const EXPLAIN_MODEL = envText ?? "phi4-mini";

/** Vision model for detecting figures in PDF page images (gemma3:4b is multimodal) */
export const VISUAL_DETECTION_MODEL = envVision ?? "gemma3:4b";

/** Human-readable list of all active models (for logging / health endpoint) */
export const MODEL_SUMMARY = {
  text:            FREE_TEXT_MODEL,
  vision:          FREE_VISION_MODEL,
  explain:         EXPLAIN_MODEL,
  visualDetection: VISUAL_DETECTION_MODEL,
  provider:        "ollama",
};
