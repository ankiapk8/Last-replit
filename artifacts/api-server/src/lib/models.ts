/**
 * AI model selection — OpenRouter (primary) with Ollama Cloud fallback.
 *
 * Per-feature model strategy:
 *  - Flashcards & MCQs (text generation)  → openai/gpt-oss-120b:free (Highest reasoning power)
 *  - Visual Cards (PDF/image analysis)    → google/gemma-4-31b-it:free (Superior diagram/image analysis)
 *  - Mind Maps (JSON generation)          → tencent/hy3-preview:free (Excellent for complex agentic workflows)
 *  - QBank (MCQ question generation)      → openai/gpt-oss-120b:free (Highest reasoning power)
 *
 * Priority:
 *  1. Explicit non-empty env override (AI_TEXT_MODEL / AI_VISION_MODEL / AI_QBANK_MODEL / AI_MINDMAP_MODEL)
 *  2. Defaults below
 */

const envText = process.env.AI_TEXT_MODEL?.trim() || null;
const envVision = process.env.AI_VISION_MODEL?.trim() || null;
const envQbank = process.env.AI_QBANK_MODEL?.trim() || null;
const envMindmap = process.env.AI_MINDMAP_MODEL?.trim() || null;

/** Text model — deck/card generation, AI explanation (OpenRouter: highest reasoning power) */
export const FREE_TEXT_MODEL = envText ?? "openai/gpt-oss-120b:free";

/** Vision model — image-based visual card detection (OpenRouter: superior diagram/image analysis) */
export const FREE_VISION_MODEL = envVision ?? "google/gemma-4-31b-it:free";

/** QBank model — MCQ question generation (OpenRouter: highest reasoning power) */
export const QBANK_MODEL = envQbank ?? "openai/gpt-oss-120b:free";

/** Mind map model — mind map generation (OpenRouter: excellent for complex agentic workflows) */
export const MINDMAP_MODEL = envMindmap ?? "tencent/hy3-preview:free";

/** Long-form explanation model — AI Explanation feature (shares text model) */
export const EXPLAIN_MODEL = envText ?? "openai/gpt-oss-120b:free";

/** Vision model for detecting figures in PDF page images (shares vision model) */
export const VISUAL_DETECTION_MODEL = envVision ?? "google/gemma-4-31b-it:free";

/** Human-readable list of all active models (for logging / health endpoint) */
export const MODEL_SUMMARY = {
  text: FREE_TEXT_MODEL,
  vision: FREE_VISION_MODEL,
  qbank: QBANK_MODEL,
  mindmap: MINDMAP_MODEL,
  explain: EXPLAIN_MODEL,
  visualDetection: VISUAL_DETECTION_MODEL,
  provider: "openrouter",
};
