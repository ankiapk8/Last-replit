# Plan: OpenRouter Primary + Ollama Cloud Fallback

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Server                               │
│                                                                 │
│  Routes (generate.ts, explain.ts, mind-map.ts, etc.)            │
│    │                                                            │
│    ▼                                                            │
│  @workspace/integrations-openai-ai-server  (client.ts)          │
│    │                                                            │
│    ├── PRIMARY:   OpenRouter  (openrouter.ai/api/v1)            │
│    │              Models:                                         │
│    │                Flashcards/MCQs → openai/gpt-oss-120b:free   │
│    │                Visual (PDF)    → google/gemma-4-31b-it:free │
│    │                Mind Maps JSON  → tencent/hy3-preview:free   │
│    │                                                             │
│    └── FALLBACK:  Ollama Cloud (cloud.ollama.com/v1)            │
│                   Models (preserved as-is):                       │
│                     Text/Vision/QBank/Mindmap = original Ollama  │
│                     Cloud models (unchanged)                      │
└─────────────────────────────────────────────────────────────────┘
```

## Current State → Target State

| Aspect                | Current                                                                                         | Target                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Primary provider**  | Ollama Cloud                                                                                    | **OpenRouter**                                                                       |
| **Primary models**    | `qwen3-coder:480b-cloud`, `llama4:scout-cloud`, `gpt-oss:120b-cloud`, `deepseek-v4-flash-cloud` | `openai/gpt-oss-120b:free`, `google/gemma-4-31b-it:free`, `tencent/hy3-preview:free` |
| **Fallback provider** | OpenRouter                                                                                      | **Ollama Cloud** (with original models)                                              |
| **Fallback trigger**  | `free-models-per-day` error                                                                     | Any primary failure (timeout, 429, 500, connection)                                  |
| **API key env**       | `OLLAMA_CLOUD_API_KEY`                                                                          | `OPENROUTER_API_KEY` (provided)                                                      |
| **Fallback key env**  | `OPENROUTER_API_KEY`                                                                            | `OLLAMA_CLOUD_API_KEY`                                                               |

## Files to Modify

### 1. `lib/integrations-openai-ai-server/src/client.ts` — Core AI client

**Purpose**: Reverse provider priority + update fallback logic

Changes:

- Primary: OpenRouter (`OPENROUTER_API_KEY` → `https://openrouter.ai/api/v1`)
- Fallback: Ollama Cloud (`OLLAMA_CLOUD_API_KEY` → `https://cloud.ollama.com/v1`)
- `getFallbackOpenAI()`: When primary is OpenRouter, return Ollama Cloud client
- `FALLBACK_MODEL`: Set to the Ollama Cloud text model (`qwen3-coder:480b-cloud`)
- Keep OpenRouter-specific headers (`HTTP-Referer`, `X-Title`) on primary client
- Remove OpenRouter headers from fallback (Ollama Cloud doesn't need them)

### 2. `lib/integrations-openai-ai-server/src/image/client.ts` — Image generation client

**Purpose**: Same provider reversal for image operations

Changes:

- Same priority reversal as `client.ts`
- Primary: OpenRouter, Fallback: Ollama Cloud

### 3. `artifacts/api-server/src/lib/models.ts` — Model selection

**Purpose**: Update default models to OpenRouter free tier

Changes:

- `FREE_TEXT_MODEL`: `qwen3-coder:480b-cloud` → `openai/gpt-oss-120b:free`
- `FREE_VISION_MODEL`: `llama4:scout-cloud` → `google/gemma-4-31b-it:free`
- `QBANK_MODEL`: `gpt-oss:120b-cloud` → `openai/gpt-oss-120b:free` (same model, already correct)
- `MINDMAP_MODEL`: `deepseek-v4-flash-cloud` → `tencent/hy3-preview:free`
- `EXPLAIN_MODEL`: `qwen3-coder:480b-cloud` → `openai/gpt-oss-120b:free`
- `VISUAL_DETECTION_MODEL`: `llama4:scout-cloud` → `google/gemma-4-31b-it:free`
- `MODEL_SUMMARY.provider`: `"ollama-cloud"` → `"openrouter"`

### 4. `artifacts/api-server/src/routes/generate.ts` — Card/QBank generation

**Purpose**: Update fallback trigger logic

Changes:

- The `isDailyLimitError()` check currently only triggers fallback on `free-models-per-day` errors
- Expand fallback trigger to catch: timeout, 429 rate limit, 500/502/503 server errors, connection errors
- Update error messages to reference OpenRouter as primary, Ollama Cloud as fallback
- Update `getAIClient()` logging to reflect new provider priority

### 5. `artifacts/api-server/src/routes/explain.ts` — AI explanation

**Purpose**: Same fallback trigger update

Changes:

- Same expanded fallback trigger as generate.ts
- Update error messages

### 6. `artifacts/api-server/src/routes/mind-map.ts` — Mind map generation

**Purpose**: Same fallback trigger update

Changes:

- Same expanded fallback trigger
- Update error messages

### 7. `.env.example` — Environment variable documentation

**Purpose**: Reflect new provider priority

Changes:

- Swap the order: OpenRouter first, Ollama Cloud second
- Update comments
- Add the provided OpenRouter API key placeholder

### 8. `artifacts/api-server/src/routes/health.ts` — Health check

**Purpose**: Update provider detection logic

Changes:

- Check `OPENROUTER_API_KEY` first, then `OLLAMA_CLOUD_API_KEY`
- Update status messages

## Detailed Changes Per File

### File 1: `lib/integrations-openai-ai-server/src/client.ts`

```typescript
// NEW priority:
//  1. OPENROUTER_API_KEY → OpenRouter (primary)
//  2. OLLAMA_CLOUD_API_KEY → Ollama Cloud (fallback)
//  3. OPENAI_API_KEY / OPENAI_API_KEY1 → OpenAI
//  4. AI_INTEGRATIONS_OPENAI_API_KEY → Replit injected key

const openRouterKey = process.env.OPENROUTER_API_KEY?.trim() || null;
const ollamaCloudKey = process.env.OLLAMA_CLOUD_API_KEY?.trim() || null;

// Primary client uses OpenRouter if key exists, else Ollama Cloud
const apiKey = openRouterKey
  ? openRouterKey
  : ollamaCloudKey
    ? ollamaCloudKey
    : process.env.OPENAI_API_KEY1
      ?? process.env.OPENAI_API_KEY
      ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

const baseURL = openRouterKey
  ? (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1")
  : ollamaCloudKey
    ? (process.env.OLLAMA_CLOUD_BASE_URL || "https://cloud.ollama.com/v1")
    : process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
      ?? "https://openrouter.ai/api/v1";

// OpenRouter headers only when OpenRouter is primary
const defaultHeaders = openRouterKey
  ? {
      "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "https://anki-generator.local",
      "X-Title": process.env.OPENROUTER_APP_TITLE || "Anki Card Generator",
    }
  : undefined;

// Fallback: Ollama Cloud when OpenRouter is primary
export function getFallbackOpenAI(): OpenAI | null {
  if (openRouterKey && ollamaCloudKey) {
    return new OpenAI({
      apiKey: ollamaCloudKey,
      baseURL: process.env.OLLAMA_CLOUD_BASE_URL || "https://cloud.ollama.com/v1",
    });
  }
  // If primary is Ollama Cloud, try OpenRouter as fallback
  if (ollamaCloudKey && openRouterKey) { ... } // (already covered above)
  // Replit key fallback
  const replitKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (replitKey && !openRouterKey && !ollamaCloudKey) { ... }
  return null;
}

export const FALLBACK_MODEL = "qwen3-coder:480b-cloud"; // Ollama Cloud text model
```

### File 2: `lib/integrations-openai-ai-server/src/image/client.ts`

Same provider priority reversal as client.ts.

### File 3: `artifacts/api-server/src/lib/models.ts`

```typescript
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
```

### File 4-6: Route files — Expanded fallback trigger

Replace the narrow `isDailyLimitError()` check with a broader `shouldFallback()`:

```typescript
function shouldFallback(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number }).status;
  // Daily limit on OpenRouter free tier
  if (msg.includes("free-models-per-day")) return true;
  // Rate limited
  if (status === 429) return true;
  // Server errors
  if (status && status >= 500) return true;
  // Connection errors
  if (/ECONNREFUSED|connect|connection|network|fetch failed|timeout/i.test(msg)) return true;
  return false;
}
```

Then in each route, change:

```typescript
// OLD:
const fb = isDailyLimitError(err) ? getFallbackOpenAI() : null;
// NEW:
const fb = shouldFallback(err) ? getFallbackOpenAI() : null;
```

### File 7: `.env.example`

```bash
# ── AI provider (required for card generation, mind maps, explanations) ────────
# Primary: OpenRouter (https://openrouter.ai)
# Get a FREE key at https://openrouter.ai/keys (no credit card required)
OPENROUTER_API_KEY=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

# Fallback: Ollama Cloud (https://cloud.ollama.com)
# Used when OpenRouter hits limits or is unavailable
OLLAMA_CLOUD_API_KEY=your-ollama-cloud-key-here
OLLAMA_CLOUD_BASE_URL=https://cloud.ollama.com/v1

# Per-feature model selection (OpenRouter free tier defaults)
# Flashcards & MCQs (highest reasoning power)
AI_TEXT_MODEL=openai/gpt-oss-120b:free
# Visual card detection from PDF pages (superior diagram/image analysis)
AI_VISION_MODEL=google/gemma-4-31b-it:free
# QBank — MCQ question generation (same high-reasoning model)
AI_QBANK_MODEL=openai/gpt-oss-120b:free
# Mind map generation (excellent for complex agentic workflows)
AI_MINDMAP_MODEL=tencent/hy3-preview:free
```

### File 8: `artifacts/api-server/src/routes/health.ts`

Update `checkAiProvider()` to check `OPENROUTER_API_KEY` first.

## Execution Order

1. **`lib/integrations-openai-ai-server/src/client.ts`** — Core provider reversal
2. **`lib/integrations-openai-ai-server/src/image/client.ts`** — Image client reversal
3. **`artifacts/api-server/src/lib/models.ts`** — New OpenRouter model defaults
4. **`artifacts/api-server/src/routes/generate.ts`** — Expanded fallback trigger
5. **`artifacts/api-server/src/routes/explain.ts`** — Expanded fallback trigger
6. **`artifacts/api-server/src/routes/mind-map.ts`** — Expanded fallback trigger
7. **`.env.example`** — Updated documentation + API key
8. **`artifacts/api-server/src/routes/health.ts`** — Updated provider detection

## Key Design Decisions

1. **Ollama Cloud models are preserved as-is** — The user explicitly said "don't change ollama clouds models take them with it to backfail". The Ollama Cloud models (`qwen3-coder:480b-cloud`, `llama4:scout-cloud`, etc.) become the fallback models automatically via `FALLBACK_MODEL` and the env var overrides.

2. **Expanded fallback trigger** — The current code only falls back on `free-models-per-day` errors. Since OpenRouter free tier can also hit rate limits (429), server errors (500/502/503), and connection issues, the fallback should trigger on any of these.

3. **Per-feature model env vars still work** — `AI_TEXT_MODEL`, `AI_VISION_MODEL`, `AI_QBANK_MODEL`, `AI_MINDMAP_MODEL` still override defaults. This means users can override individual models without changing code.

4. **OpenRouter headers** — `HTTP-Referer` and `X-Title` headers are only sent when using OpenRouter (not Ollama Cloud), since they're OpenRouter-specific for analytics/ranking.

5. **The provided API key** — `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` should be placed in `.env` (not committed to `.env.example`).
