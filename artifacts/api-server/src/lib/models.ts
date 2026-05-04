/**
 * AI model selection.
 *
 * Priority:
 *  1. Explicit non-empty env override (AI_TEXT_MODEL / AI_VISION_MODEL)
 *  2. OPENROUTER_API_KEY present → high-performance free models on OpenRouter
 *  3. Emergency fallback → gpt-4o-mini (works with AI_INTEGRATIONS_OPENAI_API_KEY)
 *
 * Feature-specific models (OpenRouter only):
 *  - Explain / AI Explanation → deepseek/deepseek-v3:free  (long reasoning)
 *  - Visual Card Detection    → google/gemma-4-31b-it:free  (vision-capable)
 *  - Mind Map & MCQ           → FREE_TEXT_MODEL             (fast JSON/logic)
 */

const isOpenRouter = !!process.env.OPENROUTER_API_KEY;

const envText   = process.env.AI_TEXT_MODEL?.trim()  || null;
const envVision = process.env.AI_VISION_MODEL?.trim() || null;

/** Fast, high-reasoning text model — used for deck generation, mind maps, MCQ */
export const FREE_TEXT_MODEL =
  envText ?? (isOpenRouter ? "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" : "gpt-4o-mini");

/** Multimodal / vision model — used for image-based card generation */
export const FREE_VISION_MODEL =
  envVision ?? (isOpenRouter ? "google/gemma-4-31b-it:free" : "gpt-4o-mini");

/** Long-form explanation model — AI Explanation feature */
export const EXPLAIN_MODEL =
  isOpenRouter ? "deepseek/deepseek-v3:free" : FREE_TEXT_MODEL;

/** Vision model for detecting figures in PDF page images */
export const VISUAL_DETECTION_MODEL =
  isOpenRouter ? "google/gemma-4-31b-it:free" : FREE_VISION_MODEL;

/** Human-readable list of all active models (for logging / health endpoint) */
export const MODEL_SUMMARY = {
  text:            FREE_TEXT_MODEL,
  vision:          FREE_VISION_MODEL,
  explain:         EXPLAIN_MODEL,
  visualDetection: VISUAL_DETECTION_MODEL,
  usingOpenRouter: isOpenRouter,
};
