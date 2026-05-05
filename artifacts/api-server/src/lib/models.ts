/**
 * AI model selection.
 *
 * Priority:
 *  1. Explicit non-empty env override (AI_TEXT_MODEL / AI_VISION_MODEL)
 *  2. OPENROUTER_API_KEY present → reliable free models on OpenRouter
 *  3. Emergency fallback → gpt-4o-mini (works with AI_INTEGRATIONS_OPENAI_API_KEY)
 *
 * Recommended free models for local dev (set in .env):
 *  AI_TEXT_MODEL=meta-llama/llama-3.3-70b-instruct:free
 *  AI_VISION_MODEL=meta-llama/llama-3.2-11b-vision-instruct:free
 *
 * Feature-specific models (OpenRouter only):
 *  - Explain / AI Explanation → deepseek/deepseek-v3:free
 *  - Visual Card Detection    → meta-llama/llama-3.2-11b-vision-instruct:free
 *  - Mind Map & MCQ           → FREE_TEXT_MODEL
 */

const isOpenRouter = !!process.env.OPENROUTER_API_KEY;

const envText   = process.env.AI_TEXT_MODEL?.trim()  || null;
const envVision = process.env.AI_VISION_MODEL?.trim() || null;

/** Fast, instruction-following text model — deck generation, mind maps, MCQ */
export const FREE_TEXT_MODEL =
  envText ?? (isOpenRouter ? "meta-llama/llama-3.3-70b-instruct:free" : "gpt-4o-mini");

/** Multimodal / vision model — image-based card generation */
export const FREE_VISION_MODEL =
  envVision ?? (isOpenRouter ? "meta-llama/llama-3.2-11b-vision-instruct:free" : "gpt-4o-mini");

/** Long-form explanation model — AI Explanation feature */
export const EXPLAIN_MODEL =
  isOpenRouter ? "deepseek/deepseek-v3:free" : FREE_TEXT_MODEL;

/** Vision model for detecting figures in PDF page images */
export const VISUAL_DETECTION_MODEL =
  envVision ?? (isOpenRouter ? "meta-llama/llama-3.2-11b-vision-instruct:free" : FREE_VISION_MODEL);

/** Human-readable list of all active models (for logging / health endpoint) */
export const MODEL_SUMMARY = {
  text:            FREE_TEXT_MODEL,
  vision:          FREE_VISION_MODEL,
  explain:         EXPLAIN_MODEL,
  visualDetection: VISUAL_DETECTION_MODEL,
  usingOpenRouter: isOpenRouter,
};
