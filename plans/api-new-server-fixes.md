# Plan: api-new-server Fixes

## Status Summary

After reading all 9 target files, **most requested edits are already applied**. Only 2 remaining items need code changes.

## Already Complete (no changes needed)

| File                                    | Edits                                                       | Status    |
| --------------------------------------- | ----------------------------------------------------------- | --------- |
| `api-new-server/src/app.ts`             | 1A–1E (helmet, compression, trust proxy, cors, body limits) | ✅ Done   |
| `api-new-server/src/config.ts`          | 2A (new config keys)                                        | ✅ Done   |
| `api-new-server/src/routes/health.ts`   | 3A–3F (adminOnly, checkAiProvider, monitor, test-model)     | ✅ Done\* |
| `api-new-server/src/routes/generate.ts` | 4A–4C (rate limit keys, text validation, anon quota)        | ✅ Done   |
| `api-new-server/src/routes/mind-map.ts` | 5A–5B (rate limit key, topic validation)                    | ✅ Done   |
| `api-new-server/src/routes/explain.ts`  | 6A (rate limit key)                                         | ✅ Done   |
| `api-new-server/src/index.ts`           | 7A (graceful shutdown)                                      | ✅ Done   |
| `api-new-server/package.json`           | 8A (helmet, compression deps)                               | ✅ Done   |
| `.env.example`                          | 9A (ADMIN_SECRET_KEY)                                       | ✅ Done   |

## Remaining Changes

### Change 1: Add `ModelConfig` type to `api-new-server/src/lib/models.ts`

**Why:** `health.ts` line 12 already has `import type { ModelConfig } from "../lib/models"` but the type doesn't exist in `models.ts`. This will cause a TypeScript compilation error.

**Action:** Add the following export to `api-new-server/src/lib/models.ts` after line 17 (after `VISUAL_DETECTION_MODEL`):

```typescript
export type ModelConfig = {
  model: string;
  provider: "openrouter" | "ollama-cloud" | "openai" | "gemini" | "groq" | "mistral";
};
```

### Change 2: Run `pnpm install`

**Why:** Per edit 8A, after editing `package.json`, `pnpm install` should be run. The deps are already in package.json but this ensures the lockfile is synced.

**Action:** Run `pnpm install` from the workspace root.

## Verification Checklist

1. ✅ `app.ts` — trust proxy set to 1, cors() uses APP_URL, express.json limit is "1mb", helmet() and compression() called before routes
2. ✅ `config.ts` — ConfigSchema includes AI_EXPLAIN_MODEL, GOOGLE_AI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, ADMIN_SECRET_KEY as optional strings
3. ✅ `health.ts` — adminOnly middleware exists, /monitor uses adminOnly, /test-model uses adminOnly and calls completeChat(), checkAiProvider() checks GOOGLE_AI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY
4. ✅ `generate.ts` — Both stream handlers use userId-based rate limit key, /generate/stream validates text.length <= 500,000, /generate/stream checks anonymous deck quota
5. ✅ `mind-map.ts` — Uses userId-based rate limit key, validates topic length <= 10,000
6. ✅ `explain.ts` — Uses userId-based rate limit key
7. ✅ `index.ts` — SIGTERM and SIGINT handlers call terminateOcrWorker() before exit
8. ✅ `package.json` — helmet and compression are in dependencies
9. ⬜ `models.ts` — ModelConfig type needs to be added
10. ⬜ `pnpm install` needs to be run
