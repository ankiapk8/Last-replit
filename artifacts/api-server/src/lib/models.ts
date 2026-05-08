/**
 * AI model selection — Ollama Cloud (primary) with OpenRouter fallback.
 *
 * Per-feature model strategy:
 *  - Text generation (decks, cards, explanations)  → qwen3-coder:480b-cloud
 *  - Vision (visual card detection from PDF pages)   → llama4:scout-cloud
 *  - QBank (MCQ question generation)                  → gpt-oss:120b-cloud
 *  - Mind map generation                              → deepseek-v4-flash-cloud
 *
 * Priority:
 *  1. Explicit non-empty env override (AI_TEXT_MODEL / AI_VISION_MODEL / AI_QBANK_MODEL / AI_MINDMAP_MODEL)
 *  2. Defaults below
 */

const envText = process.env.AI_TEXT_MODEL?.trim() || null;
const envVision = process.env.AI_VISION_MODEL?.trim() || null;
const envQbank = process.env.AI_QBANK_MODEL?.trim() || null;
const envMindmap = process.env.AI_MINDMAP_MODEL?.trim() || null;

/** Text model — deck/card generation, AI explanation */
export const FREE_TEXT_MODEL = envText ?? "qwen3-coder:480b-cloud";

/** Vision model — image-based visual card detection (llama4:scout-cloud is multimodal) */
export const FREE_VISION_MODEL = envVision ?? "llama4:scout-cloud";

/** QBank model — MCQ question generation */
export const QBANK_MODEL = envQbank ?? "gpt-oss:120b-cloud";

/** Mind map model — mind map generation */
export const MINDMAP_MODEL = envMindmap ?? "deepseek-v4-flash-cloud";

/** Long-form explanation model — AI Explanation feature (shares text model) */
export const EXPLAIN_MODEL = envText ?? "qwen3-coder:480b-cloud";

/** Vision model for detecting figures in PDF page images (shares vision model) */
export const VISUAL_DETECTION_MODEL = envVision ?? "llama4:scout-cloud";

/** Human-readable list of all active models (for logging / health endpoint) */
export const MODEL_SUMMARY = {
  text: FREE_TEXT_MODEL,
  vision: FREE_VISION_MODEL,
  qbank: QBANK_MODEL,
  mindmap: MINDMAP_MODEL,
  explain: EXPLAIN_MODEL,
  visualDetection: VISUAL_DETECTION_MODEL,
  provider: "ollama-cloud",
};
