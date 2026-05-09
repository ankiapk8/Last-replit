# Plan: Remove Replit Dependencies

## Goal

Remove all Replit-specific dependencies from the project so it runs entirely on local files and standard tooling. AI models (OpenRouter/Ollama) are kept as-is — they are cloud APIs, not Replit-specific.

## Current State

The project already has most Replit features **conditionally guarded** (e.g., `if (process.env.REPL_ID)`). However, several hard dependencies remain:

1. **`stripe-replit-sync`** — an npm package used for Stripe webhook processing and DB migrations
2. **`@replit/vite-plugin-*`** — three Vite plugins (cartographer, dev-banner, runtime-error-modal)
3. **Replit OIDC auth** — the `openid-client` + `REPL_ID` login system
4. **Replit Connectors** — Stripe credential fetching via `REPLIT_CONNECTORS_HOSTNAME` / `REPL_IDENTITY`
5. **Replit-specific env vars** — `REPLIT_DOMAINS`, `REPLIT_DEV_DOMAIN`, `REPLIT_DEPLOYMENT_DOMAIN`
6. **Replit-dedicated scripts/configs** — `keepalive.sh`, `auto-rebuild.sh`, `post-merge.sh`, APK host configs
7. **`replit.md`** — Replit workspace documentation file
8. **UI text/placeholders** — `.replit.app` / `.replit.dev` references in APK card component

## What Stays

- **OpenRouter / Ollama Cloud** AI models — configured via `OPENROUTER_API_KEY`, `OLLAMA_CLOUD_API_KEY` env vars (not Replit-specific)
- **Render deployment** — `render.yaml` + `Dockerfile` (already independent)
- **GitHub Codespaces** — `.devcontainer/` (already independent)
- **All application code** — decks, cards, QBank, mind maps, explanations, etc.

## Migration Steps

### Phase 1: Remove `stripe-replit-sync` dependency

This is the hardest dependency because it's used for:
- Stripe webhook verification (`processWebhook`)
- Stripe DB schema migrations (`runMigrations`)
- Subscription status checks (`stripe.subscriptions` schema)

**Changes:**

| File | Change |
|---|---|
| `package.json` | Remove `stripe-replit-sync` from root `dependencies` |
| `artifacts/api-server/package.json` | Remove `stripe-replit-sync` from `dependencies` |
| `artifacts/api-server/src/index.ts` | Remove `import { runMigrations } from 'stripe-replit-sync'` and the `runMigrations()` call. Replace with a no-op or a comment that Stripe schema is managed separately. |
| `artifacts/api-server/src/stripeClient.ts` | Remove `import { StripeSync } from 'stripe-replit-sync'`. Remove the entire `getStripeSync()` function. Keep `getUncachableStripeClient()` which only needs `STRIPE_SECRET_KEY`. |
| `artifacts/api-server/src/webhookHandlers.ts` | Remove the `stripe-replit-sync` fallback in `processWebhook()`. Keep only the direct Stripe verification path (using `STRIPE_WEBHOOK_SECRET`). |
| `artifacts/api-server/src/lib/free-tier-limits.ts` | The `checkIsPro()` function queries `stripe.subscriptions` table (created by `stripe-replit-sync`). Replace with a simpler check: read `stripe_subscription_id` from the `users` table directly (already exists as fallback). Remove the `stripe.subscriptions` query entirely. |
| `artifacts/api-server/src/routes/subscription.ts` | The `getActiveSubscription()` query joins on `stripe.subscriptions` — replace with a direct check of `users.stripe_subscription_id IS NOT NULL`. The `/subscription/products` endpoint queries `stripe.products`/`stripe.prices` — replace with a simple hardcoded config or remove if not actively used. |
| `scripts/src/stripeClient.ts` | This file only works with Replit Connectors. Delete it entirely (it's a standalone script, not imported by the app). |
| `pnpm-workspace.yaml` | Remove `stripe-replit-sync` from `minimumReleaseAgeExclude` |
| `pnpm-lock.yaml` | Will be regenerated on next `pnpm install` |

### Phase 2: Remove `@replit/vite-plugin-*` dependencies

These are dev-only Vite plugins. They're already conditionally imported, but the packages are still in `package.json` and `pnpm-lock.yaml`.

**Changes:**

| File | Change |
|---|---|
| `pnpm-workspace.yaml` | Remove all three `@replit/*` entries from `catalog`. Remove `@replit/*` from `minimumReleaseAgeExclude`. |
| `artifacts/anki-generator/package.json` | Remove `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner`, `@replit/vite-plugin-runtime-error-modal` from `devDependencies` |
| `artifacts/anki-generator/vite.config.ts` | Remove the `isReplit` variable and the entire conditional plugin block (lines 15, 47-61). The `plugins` array becomes just `[react(), tailwindcss(), apkMimePlugin()]`. |
| `artifacts/mockup-sandbox/package.json` | Remove `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-runtime-error-modal` from `devDependencies` |
| `artifacts/mockup-sandbox/vite.config.ts` | Remove `import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal"` (line 5). Remove `runtimeErrorOverlay()` from plugins array (line 36). Remove the `REPL_ID` conditional + cartographer block (lines 37-46). |
| `pnpm-lock.yaml` | Will be regenerated on next `pnpm install` |

### Phase 3: Remove Replit OIDC auth (openid-client)

The auth system is already designed to work without Replit — when `REPL_ID` is not set, login shows a "not available" page and the app works anonymously. The `openid-client` package is only used for OIDC flows.

**Option A (Recommended): Keep `openid-client` as optional**
- Leave the code as-is but make the import conditional/lazy
- The app already works without `REPL_ID` — no code changes needed
- This preserves the ability to add a custom OIDC provider later via `ISSUER_URL` env var

**Option B: Remove `openid-client` entirely**
- Remove `openid-client` from `artifacts/api-server/package.json`
- Remove `artifacts/api-server/src/lib/auth.ts` OIDC functions (or make them no-ops)
- Remove `artifacts/api-server/src/middlewares/authMiddleware.ts` refresh logic
- Simplify `artifacts/api-server/src/routes/auth.ts` to only support anonymous sessions

**Recommendation: Option A** — the code already gracefully handles missing `REPL_ID`, and keeping the dependency allows future OIDC integration. No changes needed.

### Phase 4: Remove Replit Connectors (Stripe credential fetching)

The `REPLIT_CONNECTORS_HOSTNAME` / `REPL_IDENTITY` / `WEB_REPL_RENEWAL` env vars are only used in `stripeClient.ts` for fetching Stripe keys from Replit's connector API. After Phase 1 removes `getStripeSync()`, the connector fallback in `getStripeCredentials()` is no longer needed.

**Changes:**

| File | Change |
|---|---|
| `artifacts/api-server/src/stripeClient.ts` | Simplify `getStripeCredentials()` to only check `STRIPE_SECRET_KEY`. Remove the entire Replit Connectors fallback block (lines 34-46 and the associated interfaces). The function becomes: if `STRIPE_SECRET_KEY` is set, use it; otherwise throw. |
| `artifacts/api-server/src/routes/subscription.ts` | Remove the `REPLIT_CONNECTORS_HOSTNAME` / `REPL_IDENTITY` check in `/subscription/stripe-configured` endpoint (lines 40-41). Only check `STRIPE_SECRET_KEY`. |
| `.env.example` | Remove any comments about Replit Connectors |

### Phase 5: Remove Replit-specific env vars and scripts

**Changes:**

| File | Change |
|---|---|
| `artifacts/api-server/src/index.ts` | Remove the `REPLIT_DOMAINS` check for webhook registration (lines 28-34). Replace with: if `STRIPE_WEBHOOK_SECRET` is set, try to register webhook using `APP_URL` env var. |
| `artifacts/api-server/src/routes/subscription.ts` | Remove the `REPLIT_DOMAINS` fallback in `resolveBaseUrl()` (line 15). Keep `APP_URL` and Codespaces fallbacks. |
| `artifacts/api-server/src/lib/apk-builder.ts` | Remove `REPLIT_DEV_DOMAIN` and `REPLIT_DEPLOYMENT_DOMAIN` from `devHostFromEnv()` and `publishedHostFromEnv()`. Only use `getStoredTargetHost()`. Remove the log line referencing `REPLIT_*_DOMAIN`. |
| `artifacts/api-server/src/routes/generate.ts` | Change the provider fallback label from `"openai/replit"` to `"openai"` (line 124). |
| `scripts/keepalive.sh` | Delete — only useful for Replit's hibernation behavior. |
| `scripts/auto-rebuild.sh` | Delete — Replit-specific file-watching rebuild loop. |
| `scripts/post-merge.sh` | Simplify — remove the `git-pull.sh` step (which was for Replit sync). Keep `pnpm install` and `git-push.sh`. |
| `scripts/src/stripeClient.ts` | Delete — only works with Replit Connectors (already covered in Phase 1). |

### Phase 6: Remove Replit-specific config/data files

**Changes:**

| File | Change |
|---|---|
| `replit.md` | Delete — Replit workspace documentation. |
| `build-apk/twa-manifest.json` | Update `packageId` from `app.replit.ankicards` to `app.ankigen.cards`. Update `host`, `iconUrl`, `maskableIconUrl`, `webManifestUrl`, `fullScopeUrl`, `shareTarget.action` to use a generic placeholder or remove Replit URLs. |
| `build-apk/build-bundled.sh` | Remove the `REPLIT_DEV_DOMAIN` fallback in `API_BASE` (line 14). Require `API_BASE` to be explicitly set. Update `packageId` from `app.replit.ankigen` to `app.ankigen.cards`. |
| `artifacts/anki-generator/capacitor.config.ts` | Change `appId` from `app.replit.ankigen` to `app.ankigen.mobile`. |
| `artifacts/anki-generator/public/apk-target.json` | Clear the host values to empty strings or remove the file. |
| `artifacts/anki-generator/public/anki-cards.apk.json` | Update `packageId` from `app.replit.ankigen` to `app.ankigen.mobile`. |
| `artifacts/anki-generator/public/anki-cards-dev.apk.json` | Update `packageId` from `app.replit.ankigen` to `app.ankigen.mobile`. |
| `artifacts/anki-generator/public/apk-history.json` | Clear or delete — contains Replit host history. |

### Phase 7: Update UI text references

**Changes:**

| File | Change |
|---|---|
| `artifacts/anki-generator/src/components/download-apk-card.tsx` | Remove `.replit.app` / `.replit.dev` heuristic in `pickSlotForHost()` (lines 85-87). Default to `"published"` always. Update placeholder texts from `my-branch.replit.dev` / `myapp.replit.app` to generic examples like `dev.example.com` / `app.example.com`. Remove the `@replit` CSS comments in `button.tsx` and `badge.tsx` (cosmetic). |
| `artifacts/anki-generator/src/components/ui/button.tsx` | Remove `@replit` comments (cosmetic, lines 14-32). |
| `artifacts/anki-generator/src/components/ui/badge.tsx` | Remove `@replit` comments (cosmetic, lines 7-24). |

### Phase 8: Update documentation

**Changes:**

| File | Change |
|---|---|
| `SETUP.md` | Remove the "Log in with Replit auth" reference in the dev override panel section. Replace with "Open the Dev Mode panel". |
| `replit.md` | Already deleted in Phase 6. |
| `.dockerignore` | Remove `**/.replit*` entry (no longer needed). |

### Phase 9: Regenerate lockfile and verify

| Step | Command |
|---|---|
| Remove old lockfile | `rm pnpm-lock.yaml` |
| Reinstall | `pnpm install` |
| Type-check | `pnpm typecheck` |
| Build | `pnpm build` |
| Test | `pnpm test` |

## Summary of Package Removals

| Package | Where | Reason |
|---|---|---|
| `stripe-replit-sync` | root `package.json`, `api-server/package.json` | Replit-specific Stripe sync |
| `@replit/vite-plugin-cartographer` | `pnpm-workspace.yaml`, `anki-generator/package.json`, `mockup-sandbox/package.json` | Replit code mapping |
| `@replit/vite-plugin-dev-banner` | `pnpm-workspace.yaml`, `anki-generator/package.json` | Replit dev banner |
| `@replit/vite-plugin-runtime-error-modal` | `pnpm-workspace.yaml`, `anki-generator/package.json`, `mockup-sandbox/package.json` | Replit error overlay |

## Files to Delete

1. `replit.md`
2. `scripts/keepalive.sh`
3. `scripts/auto-rebuild.sh`
4. `scripts/src/stripeClient.ts`

## Risk Assessment

- **Low risk**: Removing Vite plugins (already conditional), removing scripts (Replit-only), updating config files
- **Medium risk**: Removing `stripe-replit-sync` — need to ensure Stripe webhooks still work with direct `stripe` SDK verification
- **Low risk**: The app already works anonymously without auth, so removing Replit OIDC is safe

## Rollback

All changes are file edits and deletions. The `pnpm-lock.yaml` should be committed before starting so it can be restored. Each phase can be committed independently.
