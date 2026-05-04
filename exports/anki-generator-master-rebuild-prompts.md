# AnkiGen — Master Rebuild Prompt Pack
## Complete frontend + backend, prompt by prompt

Use these prompts in order with any AI coding agent (Replit Agent, Cursor, Claude Code, Windsurf, etc.).
Each prompt is self-contained and builds on the previous one.

> ⚠️ **Never paste `OPENROUTER_API_KEY` or `DATABASE_URL` into chat or files.**
> Hand them to the agent through its secret-request tool only.
> If leaked, rotate them immediately.

---

## Prompt 0 — Technology stack (read this before starting)

> Lock in the following stack. I will refer to these decisions in every later prompt.
>
> **Monorepo**: pnpm workspaces, Node 24, TypeScript 5.9 strict mode.
>
> **AI provider**: OpenRouter (`https://openrouter.ai/api/v1`, OpenAI-compatible SDK).
> One env var: `OPENROUTER_API_KEY`.
> Default models (all swappable via env):
> - `AI_TEXT_MODEL` — default `openai/gpt-oss-120b:free`
> - `AI_VISION_MODEL` — default `google/gemma-3-27b-it:free`
> - `AI_IMAGE_MODEL` — default `google/gemini-2.5-flash-image-preview`
>
> **Database**: Neon Postgres (serverless). One env var: `DATABASE_URL` (pooled connection string ending in `?sslmode=require`).
>
> **Backend**: Express 5, bundled with esbuild. Pino + pino-http structured logging.
>
> **Frontend**: React 19 + Vite 7 + Tailwind v4 + shadcn/ui (Radix) + wouter + TanStack Query v5 + framer-motion 11.
>
> **Codegen**: OpenAPI 3.1 spec → Orval → Zod schemas + React Query hooks.
>
> **Key packages**: `drizzle-orm`, `@neondatabase/serverless`, `pdfjs-dist` (legacy build), `canvas` npm pkg, `tesseract.js`, `jszip`, `anki-apkg-export`, `react-markdown`, `remark-gfm`, `vaul`, `canvas-confetti`, `date-fns`, `lucide-react`.

---

## Prompt 1 — Monorepo scaffold

> Create a pnpm monorepo named `ankigen-workspace` with this exact layout:
>
> ```
> artifacts/
>   anki-generator/        # React + Vite frontend
>   api-server/            # Express 5 backend
> lib/
>   db/                    # Drizzle schema + Neon driver + migration
>   api-spec/              # OpenAPI 3.1 YAML + Orval config
>   api-zod/               # Zod schemas (generated)
>   api-client-react/      # React Query hooks (generated)
>   integrations-openai-ai-server/  # Shared OpenRouter client
> ```
>
> Root `pnpm-workspace.yaml`:
> ```yaml
> packages:
>   - "artifacts/*"
>   - "lib/*"
> ```
>
> Root `tsconfig.base.json`: TypeScript 5.9 strict, `moduleResolution: bundler`, `target: ES2022`.
>
> Each package has its own `package.json` with name `@workspace/<dirname>`, a `tsconfig.json` extending base, and a `typecheck` script.
>
> Root scripts: `typecheck` (runs all), `build`, `codegen` (runs Orval).
>
> **Before writing any code referencing secrets, request `OPENROUTER_API_KEY` and `DATABASE_URL` through your secret-request tool.**

---

## Prompt 2 — Database schema (Drizzle + Neon)

> In `lib/db/src/`, create these files:
>
> **`schema/decks.ts`**:
> ```ts
> export const decksTable = pgTable("decks", {
>   id: serial("id").primaryKey(),
>   name: text("name").notNull(),
>   description: text("description"),
>   parentId: integer("parent_id"),
>   kind: text("kind").notNull().default("deck"), // "deck" | "qbank"
>   createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
>   updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
> });
> ```
>
> **`schema/cards.ts`**:
> ```ts
> export const cardsTable = pgTable("cards", {
>   id: serial("id").primaryKey(),
>   deckId: integer("deck_id").notNull(),
>   front: text("front").notNull(),
>   back: text("back").notNull(),
>   tags: text("tags"),            // comma-separated
>   image: text("image"),          // base64 data URL
>   sourceImage: text("source_image"), // full-page base64 for crop-compare
>   bbox: text("bbox"),            // JSON string "{x,y,w,h}" normalized 0-1
>   cardType: text("card_type").default("basic"), // "basic" | "mcq"
>   choices: text("choices"),      // JSON array of strings
>   correctIndex: integer("correct_index"),
>   pageNumber: integer("page_number"),
>   createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
>   updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
> });
> ```
>
> **`schema/generations.ts`**:
> ```ts
> export const generationsTable = pgTable("generations", {
>   id: serial("id").primaryKey(),
>   deckName: text("deck_name").notNull(),
>   deckType: text("deck_type").notNull(), // "text" | "visual" | "both"
>   status: text("status").notNull(),      // "success" | "error" | "cancelled"
>   cardsGenerated: integer("cards_generated").notNull().default(0),
>   pageCount: integer("page_count").notNull().default(0),
>   durationMs: integer("duration_ms").notNull().default(0),
>   customPrompt: text("custom_prompt"),
>   errorMessage: text("error_message"),
>   startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
>   completedAt: timestamp("completed_at", { withTimezone: true }),
> });
> ```
>
> **`index.ts`** — init Neon + Drizzle + `ensureDatabaseSchema()`:
> ```ts
> import { neon } from "@neondatabase/serverless";
> import { drizzle } from "drizzle-orm/neon-http";
>
> if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set.");
> const sql = neon(process.env.DATABASE_URL);
> export const db = drizzle(sql, { schema });
>
> export async function ensureDatabaseSchema(): Promise<void> {
>   // CREATE TABLE IF NOT EXISTS for all three tables
>   // PLUS ALTER TABLE … ADD COLUMN IF NOT EXISTS for EVERY column
>   // This self-heals both fresh and existing databases.
>   // Critical: include "kind" on decks and "page_number" on cards.
>   // Also create the "generations" table — missing it causes 500 on /api/generations.
> }
> ```
>
> ⚠️ **Always pair every `CREATE TABLE IF NOT EXISTS` with `ALTER TABLE … ADD COLUMN IF NOT EXISTS` for every column.** Without the ALTERs, an older database will 500 as soon as a new column is referenced.

---

## Prompt 3 — OpenAPI spec + Orval codegen

> In `lib/api-spec/openapi.yaml`, write a complete OpenAPI 3.1 spec. Base path `/api`.
>
> **Endpoints:**
> - `GET /healthz` — `{ status, checks: { database: { status, latencyMs }, ai: { status, message? } }, uptimeSeconds, timestamp }`
> - `GET /decks` — list all decks (returns `cardCount` virtual field)
> - `POST /decks` — create deck
> - `GET /decks/:id` — get one deck
> - `PATCH /decks/:id` — update deck
> - `DELETE /decks/:id` — delete deck (nulls children's parentId, does NOT cascade)
> - `POST /decks/merge` — merge selected deck IDs into one: `{ deckIds, newDeckName, deleteOriginals }`
> - `GET /decks/:id/cards` — list cards for a deck
> - `POST /cards` — create card
> - `PATCH /cards/:id` — update card
> - `DELETE /cards/:id` — delete card
> - `POST /generate/stream` (SSE) — generate flashcards
> - `POST /generate-qbank/stream` (SSE) — generate MCQ question bank
> - `POST /explain` (streaming text/plain) — AI explanation: modes `full | revision | osce | brief`
> - `POST /extract-pdf` — multipart `file` field → `{ pages: [{ pageNumber, text }] }`
> - `POST /generate-illustration` — `{ cardId, prompt? }` → `{ imageDataUrl }`
> - `POST /export-apkg` — `{ deckIds, exportName }` → binary `.apkg` file
> - `GET /export-all-json` — whole library as `.ankigen.json`
> - `GET /decks/:id/export-json` — one deck as `.ankigen.json`
> - `POST /import-deck-json` — import `.ankigen.json`
> - `GET /generations` — recent generation history (query param `?limit=200`)
> - `DELETE /generations` — clear all history
>
> Run Orval to generate `@workspace/api-zod` (Zod schemas) and `@workspace/api-client-react` (React Query hooks). Add `setBaseUrl(url)` export to api-client-react.

---

## Prompt 4 — Shared OpenRouter AI client

> Create `lib/integrations-openai-ai-server/src/client.ts`:
>
> ```ts
> import OpenAI from "openai";
>
> const apiKey =
>   process.env.OPENROUTER_API_KEY ||
>   process.env.OPENAI_API_KEY1 ||
>   process.env.OPENAI_API_KEY ||
>   process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
>
> if (!apiKey) throw new Error("OPENROUTER_API_KEY must be set. Get one at https://openrouter.ai/keys");
>
> const baseURL =
>   process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||
>   process.env.OPENROUTER_BASE_URL ||
>   "https://openrouter.ai/api/v1";
>
> export const openai = new OpenAI({
>   apiKey,
>   baseURL,
>   defaultHeaders: {
>     "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "https://anki-generator.local",
>     "X-Title": process.env.OPENROUTER_APP_TITLE || "Anki Card Generator",
>   },
> });
>
> export const TEXT_MODEL   = process.env.AI_TEXT_MODEL   || "openai/gpt-oss-120b:free";
> export const VISION_MODEL = process.env.AI_VISION_MODEL || "google/gemma-3-27b-it:free";
> export const IMAGE_MODEL  = process.env.AI_IMAGE_MODEL  || "google/gemini-2.5-flash-image-preview";
> ```
>
> Also export from `index.ts`: `{ openai, TEXT_MODEL, VISION_MODEL, IMAGE_MODEL }`.
>
> Add retry helper `createChatCompletionWithRetry(payload, log, signal?)` that retries on 429/5xx with delays `[2000, 5000, 10000]` ms. Exports `isRetryableAIError`, `isAbortError`, `getErrorStatus`, `getErrorCode`.

---

## Prompt 5 — Express API server skeleton

> In `artifacts/api-server/`:
>
> - Express 5, pino + pino-http structured logging (never `console.log`).
> - Mount all routes under `/api`.
> - Read `PORT` from env; throw if missing.
> - Body limits: JSON 200 MB, urlencoded 200 MB.
> - CORS headers for development.
> - Boot: `await ensureDatabaseSchema()` then `app.listen(port)`.
> - In production, serve the React build from `STATIC_DIR` with SPA fallback for any non-`/api/*` path.
> - Build with esbuild (single `dist/index.mjs`); source maps enabled.
>
> Health route `GET /api/healthz`:
> - Runs `SELECT 1` to check DB; records latency.
> - Checks that at least one AI key env var is set.
> - Returns `{ status: "ok" | "degraded", checks: { database, ai }, uptimeSeconds, timestamp }` — 200 if ok, 503 if degraded.
> - Error message must name ALL accepted env vars: `"AI provider is not configured. Set OPENROUTER_API_KEY (preferred) or OPENAI_API_KEY in your environment."`

---

## Prompt 6 — Decks & cards CRUD routes

> **`routes/decks.ts`**:
> - `GET /api/decks` — `SELECT decks.*, COUNT(cards.id) AS card_count FROM decks LEFT JOIN cards ON cards.deck_id = decks.id GROUP BY decks.id ORDER BY decks.created_at DESC`. Return array with `cardCount` as number.
> - `POST /api/decks` — insert, return new deck.
> - `GET /api/decks/:id` — single deck + `cardCount`.
> - `PATCH /api/decks/:id` — partial update.
> - `DELETE /api/decks/:id` — set children's `parent_id = NULL` first, then delete. Do NOT cascade.
> - `POST /api/decks/merge` — copy all cards from `deckIds` into a new deck named `newDeckName`; if `deleteOriginals` is true, delete the source decks after copying.
>
> **`routes/cards.ts`**:
> - `GET /api/decks/:id/cards` — ordered by `page_number ASC NULLS LAST, created_at ASC`.
> - `POST /api/cards`, `PATCH /api/cards/:id`, `DELETE /api/cards/:id`.
>
> **`lib/serialize-card.ts`** — parse `choices` and `bbox` columns (both stored as JSON strings) inside try/catch before returning to client. A malformed value must not crash the whole card list.

---

## Prompt 7 — PDF extraction route

> **`POST /api/extract-pdf`**:
> - Accept `multipart/form-data` (field `file`, multer 200 MB limit) OR raw `application/pdf` body.
> - Use `pdfjs-dist` legacy build (required for Node). For each page: try embedded text; if empty, render page to PNG with the `canvas` npm package and OCR with `tesseract.js` (English).
> - Return `{ pages: [{ pageNumber, text }] }`.
> - System deps (Linux): `util-linux` (for `libuuid.so.1`), `cairo`, `pango`, `libjpeg`, `giflib`, `librsvg`, `pixman` (for the `canvas` npm package).
> - Add `canvas` and `tesseract.js` to root `pnpm.onlyBuiltDependencies`.

---

## Prompt 8 — Flashcard text generation (SSE streaming)

> **`POST /api/generate/stream`**:
>
> Request body (flat, not nested):
> ```json
> { "text": "...", "deckName": "...", "cardCount": 20, "deckType": "both",
>   "parentId": null, "pageImages": [...base64], "pageTexts": [...],
>   "pageImageRegions": [...], "customPrompt": "..." }
> ```
>
> Behavior:
> 1. Validate with Zod. Reject if `text.trim().length < 10`.
> 2. Use `AbortController` wired to `res.on("close")` — NOT `req.on("close")` (the request body stream closes immediately after body-parser reads it, which would abort the generation before it starts).
> 3. Set SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`. Call `res.flushHeaders()`.
> 4. Send heartbeat comments every 12 seconds: `res.write(": ping <timestamp>\n\n")`.
> 5. Chunk text into ~6000-char pieces with overlap. For PDF sources, use page-aware chunking (pack whole pages, tag each chunk with starting page number).
> 6. Concurrency 3. For each chunk, call OpenRouter with `TEXT_MODEL`.
> 7. System prompt (use verbatim):
>    > You are a meticulous Anki flashcard creator. Your top priority is COMPLETE COVERAGE: every fact, definition, mechanism, classification, dose, value, name, criterion, side-effect, indication, contraindication, formula, step, comparison or relationship in the source text must end up on at least one card. Do not summarise. Do not skip details because they "feel minor". If the text mentions it, the deck must test it.
>    > Preserve any existing multiple-choice questions verbatim as `cardType: "mcq"` — stem in `front`, options in `choices`, 0-based `correctIndex`, explanation in `back`. For non-MCQ content emit one atomic `cardType: "basic"` card per fact.
>    > Return ONLY a JSON array. No prose, no markdown fences.
> 8. Emit SSE progress events: `data: {"type":"progress","percent":N,"message":"..."}\n\n`
> 9. Insert cards ordered by `page_number ASC NULLS LAST, created_at ASC`.
> 10. Emit `data: {"type":"done","generatedCount":N,"deck":{...}}\n\n`.
> 11. On error emit `data: {"type":"error","message":"..."}\n\n`.
> 12. Record every run in the `generations` table.
> 13. Map provider errors to user-friendly messages: quota → "Add credits at openrouter.ai/credits", rate limit → "Wait a minute and try again".

---

## Prompt 9 — Visual card generation (vision model)

> Extend `POST /api/generate/stream` to also call the vision model on PDF page images when `deckType !== "text"` and `pageImages` are present.
>
> Constants:
> ```ts
> const VISUAL_BATCH_SIZE = 6;
> const VISUAL_CONCURRENCY = 2;
> const MAX_VISUAL_BBOX_AREA = 0.55;
> const MAX_VISUAL_BBOX_DIM = 0.85;
> const CROP_PADDING = 0.04;
> const MIN_CROP_DIMENSION = 0.12;
> const REGION_OVERLAP_RATIO = 0.25;
> const REGION_SNAP_PADDING = 0.025;
> ```
>
> Vision system prompt (use verbatim):
> > You are an expert visual learning designer. You convert PDF page images into Anki flashcards centred on the FIGURES shown (NOT the surrounding prose). Identify ONLY genuine visual elements: charts, tables (drug doses, classifications, scoring systems, criteria, lab values), radiology/ECG strips, flowcharts/decision trees, anatomical/mechanism diagrams, photomicrographs, traces, typeset equations.
> > ❌ DO NOT make a card for: pure prose paragraphs, headings alone, page numbers, footnotes, bullet lists of plain text, references, table-of-contents pages, blank pages, copyright notices.
> > For each qualifying figure return: `front` (question about the figure), `back` (answer + caption), `figureType`, and a TIGHT `bbox: {x, y, w, h}` in normalized 0–1 page coords (top-left origin) with 3–5% margin. Forbidden: `{0,0,1,1}` or any near-full-page bbox.
> > Return ONLY a JSON array.
>
> Server-side after receiving AI bboxes:
> - Try to snap each bbox to the nearest detected PDF.js raster region (overlap ≥ `REGION_OVERLAP_RATIO`).
> - **If snap fails, KEEP the AI bbox — do not drop the card.** Vector charts, tables, and scanned pages have no detected regions but contain real figures. Size guards below protect against bad output.
> - Reject bboxes where `w * h > MAX_VISUAL_BBOX_AREA` AND (`w > MAX_VISUAL_BBOX_DIM` AND `h > MAX_VISUAL_BBOX_DIM`).
> - Crop page image using `canvas` npm package with `CROP_PADDING` margin. Skip crops smaller than `MIN_CROP_DIMENSION`.
> - Store cropped image as base64 data URL in `cards.image`; full page image in `cards.source_image`; bbox JSON in `cards.bbox`.
> - **Before inserting, filter out any visual card where `typeof c.image !== "string" || c.image.length === 0`** — a missing image would crash `image.startsWith(...)` in the frontend.
>
> Text + visual cards from one PDF go into ONE merged deck (no text/visual split).

---

## Prompt 10 — Question bank (MCQ-only) generation

> **`POST /api/generate-qbank/stream`**:
>
> Request body: `{ text, deckName, questionCount, parentId, customPrompt }`.
>
> - Uses same SSE setup and heartbeat as flashcard generation.
> - Wire abort to `res.on("close")` (NOT `req.on("close")`). Wiring to `req` fires immediately after body-parser reads the body and insta-cancels every generation.
> - Sets `decks.kind = 'qbank'`.
> - System prompt:
>   > You are an expert question writer creating a high-quality question bank in the style of UWorld/Amboss. Every card MUST be `cardType: "mcq"` — no basic flashcards. Each MCQ: clinically-relevant stem (clinical vignette where applicable), 4–5 options, exactly one correct answer, plausible distractors, teaching-point explanation (why correct is right, why each distractor is wrong). Return JSON array of `{ cardType: "mcq", front, choices: ["A..","B..","C..","D.."], correctIndex, back }`.
> - Filter output: only keep cards where `cardType === "mcq"` AND `Array.isArray(choices)` AND `choices.length >= 2` AND `typeof correctIndex === "number"`.
> - If all chunks fail, propagate the first error so the route can show a meaningful message instead of "AI did not generate any usable MCQs."

---

## Prompt 11 — AI explanation streaming endpoint

> **`POST /api/explain`**:
>
> Request body: `{ front, back, mode, choices?, correctIndex? }`.
>
> Modes and system prompts:
>
> **`full`** (maxTokens: 8000):
> > Act as a senior physician, medical professor, and clinical educator. Cover: Definition, Epidemiology, Etiology & Risk Factors, Pathophysiology, Gross/micro pathology, Clinical presentation, Red flags, Differential diagnosis, Diagnostic approach (labs/imaging/gold standard), Management (acute/long-term/pharmacology), Prognosis, High-yield exam pearls. Use **bold** for key terms. Bullet points + short paragraphs.
>
> **`revision`** (maxTokens: 3000):
> > Act as a senior medical educator. Create a concise 1-page revision sheet. Sections: Key Facts | Pathophysiology | Clinical Features | Investigations | Management | Pearls & Pitfalls. Be ruthlessly concise — fits one A4 page. End with 3–5 "⚡ EXAM PEARLS".
>
> **`osce`** (maxTokens: 8000):
> > Act as a senior OSCE examiner. Generate 3–5 varied OSCE stations. Each station: station type, realistic patient vignette, candidate instructions, examiner mark scheme (8–12 bullets), common mistakes, key clinical teaching point.
>
> **`brief`** (maxTokens: 1500) — MCQ answer breakdown:
> > You are a concise MCQ tutor. Produce a brief answer breakdown in this EXACT format:
> > ✅ Correct answer: [letter]. [choice text]
> > [1–2 sentences: why this is correct — mechanism or key fact.]
> > ❌ Why each wrong answer is incorrect:
> > [letter]. [choice text] — [1 sentence reason]
> > No preamble, no markdown fences — just those two sections.
>
> For `brief` mode, build the user message from `front`, the labeled choices list (mark the correct one with ✓ CORRECT), and `back` as "Explanation given".
>
> Stream as `text/plain; charset=utf-8` with `Transfer-Encoding: chunked`. Set `X-Accel-Buffering: no`. Call `res.flushHeaders()`.
>
> Error handling: If the error occurs AFTER headers are flushed (common with SSE), write the error into the body: `res.write("\n\n[Error] <friendly message>\n")` then `res.end()`. Never silently call `res.end()` on error — the user sees an empty response with no indication of what failed.
>
> Map error messages:
> - Context length: "The explanation request was too long for this model. Try a shorter card or switch AI_TEXT_MODEL."
> - Quota/billing: "AI provider quota exceeded. Add credits at openrouter.ai/credits."

---

## Prompt 12 — AI illustration generation

> **`POST /api/generate-illustration`**:
>
> Request body: `{ cardId, prompt? }`.
>
> 1. Load card from DB.
> 2. If no prompt provided, build: `Educational illustration for flashcard: "<front>". Context: "<back>". Style: clean medical/scientific diagram, labeled, white background, vector feel, no text errors, high contrast.`
> 3. Call OpenRouter with `IMAGE_MODEL` and `modalities: ["image", "text"]`.
> 4. Parse response: image URL is in `choices[0].message.images[0].image_url.url` as base64 data URL (Gemini-image format). Try that first; fall back to parsing `choices[0].message.content` for a data URL.
> 5. Save `imageDataUrl` into `cards.image`.
> 6. Return `{ imageDataUrl }`.

---

## Prompt 13 — `.apkg` export

> **`POST /api/export-apkg`** — body `{ deckIds: number[], exportName: string }`:
>
> 1. For each deckId, load deck + cards (ordered by `page_number ASC NULLS LAST, created_at ASC`).
> 2. Use `anki-apkg-export` to bootstrap the SQLite `collection.anki2` template and `col` row.
> 3. Add each deck to the `col.decks` JSON with a deterministic integer ID (hash of name+timestamp).
> 4. Sub-decks use Anki's `::` convention: `Parent::Child`.
> 5. For each card, run `toAnkiHtml()` (HTML-escape + `\n`→`<br>`). MCQs: render A/B/C/D options, bold the correct one. Cards with `pageNumber` show a `p. N` badge on the front.
> 6. Images: decode data URLs, add via `apkg.addMedia(filename, buffer)`. Write numeric-named media files + `media` JSON manifest into the zip explicitly so AnkiMobile resolves them.
> 7. Use `jszip` for final zip assembly.
> 8. Stream result as `application/octet-stream` with `Content-Disposition: attachment; filename="<name>.apkg"`.

---

## Prompt 14 — JSON backup / restore

> **`GET /api/export-all-json`** and **`GET /api/decks/:id/export-json`**:
> Export format `.ankigen.json` version 2. Include all deck fields + cards array. Cards include `cardType`, `choices`, `correctIndex`, `pageNumber`, `image` (base64).
>
> **`POST /api/import-deck-json`**:
> - Accept `{ root }` or `{ roots: [...] }`.
> - Reject `version > 2`.
> - Insert decks + cards; return `{ importedName, deckCount, cardCount }`.

---

## Prompt 15 — Generation history routes

> **`GET /api/generations?limit=200`** — return recent generations ordered by `started_at DESC`.
> **`DELETE /api/generations`** — truncate the table.
>
> The `generations` table MUST be created in `ensureDatabaseSchema()`. If it's missing, every call to `POST /api/generate/stream` will silently fail trying to record the run (you'll see "Failed to record generation history" in logs).

---

## Prompt 16 — Frontend project setup (Vite + Tailwind v4)

> In `artifacts/anki-generator/`:
>
> **`vite.config.ts`**:
> ```ts
> export default defineConfig({
>   plugins: [react(), tailwindcss()],
>   base: process.env.BASE_PATH || "/",
>   server: { port: parseInt(process.env.PORT || "5173"), host: "0.0.0.0", allowedHosts: true },
> });
> ```
>
> **`src/index.css`** — fonts + full Tailwind v4 theme:
> ```css
> @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Outfit:wght@100..900&family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap');
> @import "tailwindcss";
> @import "tw-animate-css";
> @plugin "@tailwindcss/typography";
>
> @custom-variant dark (&:is(.dark *));
>
> /* LIGHT MODE — green/forest palette */
> :root {
>   --background: 40 33% 98%;
>   --foreground: 150 40% 15%;
>   --border: 150 20% 85%;
>   --card: 0 0% 100%;
>   --card-foreground: 150 40% 15%;
>   --card-border: 150 20% 85%;
>   --sidebar: 40 33% 95%;
>   --sidebar-foreground: 150 40% 15%;
>   --sidebar-border: 150 20% 85%;
>   --primary: 150 40% 25%;
>   --primary-foreground: 40 33% 98%;
>   --secondary: 150 20% 90%;
>   --secondary-foreground: 150 40% 25%;
>   --muted: 40 20% 90%;
>   --muted-foreground: 150 20% 40%;
>   --accent: 35 100% 50%;         /* amber/orange accent */
>   --accent-foreground: 0 0% 100%;
>   --destructive: 0 84% 60%;
>   --destructive-foreground: 0 0% 100%;
>   --input: 150 20% 85%;
>   --ring: 150 40% 25%;
>   --app-font-sans: 'Outfit', 'Inter', sans-serif;
>   --app-font-serif: 'Instrument Serif', Georgia, serif;
>   --app-font-mono: 'Space Mono', Menlo, monospace;
>   --radius: 0.75rem;
> }
>
> /* DARK MODE */
> .dark {
>   --background: 150 30% 10%;
>   --foreground: 40 33% 95%;
>   --border: 150 20% 20%;
>   --card: 150 30% 13%;
>   --card-foreground: 40 33% 95%;
>   --primary: 150 40% 45%;
>   --primary-foreground: 150 30% 10%;
>   --muted: 150 20% 20%;
>   --muted-foreground: 150 20% 60%;
>   --accent: 35 100% 50%;
>   --accent-foreground: 0 0% 100%;
>   --destructive: 0 62% 30%;
>   --destructive-foreground: 40 33% 95%;
> }
>
> @layer base {
>   * { @apply border-border; }
>   body { @apply font-sans antialiased bg-background text-foreground; }
> }
>
> /* Tap feedback: suppress tap highlight, scale on active */
> html { -webkit-tap-highlight-color: transparent; }
> a, button, [role="button"], [role="tab"], [role="menuitem"] {
>   -webkit-tap-highlight-color: transparent;
>   touch-action: manipulation;
> }
> a:not([data-no-press]):active,
> [role="button"]:not([data-no-press]):active,
> [role="tab"]:not([data-no-press]):active {
>   transform: scale(0.97);
>   transition: transform 120ms cubic-bezier(0.22, 1, 0.36, 1);
> }
> .card-press { transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1); }
> .card-press:active { transform: scale(0.985); }
>
> /* APK shine animation for install button */
> @keyframes apk-shine {
>   0% { transform: translateX(-150%) skewX(-20deg); }
>   60%, 100% { transform: translateX(380%) skewX(-20deg); }
> }
> .apk-shine { animation: apk-shine 3.2s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
> ```

---

## Prompt 17 — `main.tsx` + `App.tsx`

> **`src/main.tsx`**:
> ```tsx
> // 1. Safari/iPad polyfill — must be first
> if (!Promise.withResolvers) {
>   Promise.withResolvers = function() {
>     let resolve, reject;
>     const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
>     return { promise, resolve, reject };
>   };
> }
>
> // 2. Set API base URL from env
> import { setBaseUrl } from "@workspace/api-client-react";
> const apiBase = import.meta.env.VITE_API_BASE;
> if (apiBase?.trim()) setBaseUrl(apiBase.trim().replace(/\/$/, ""));
>
> // 3. Detect APK/standalone mode
> function detectApk() {
>   const inApk = !!window.Capacitor?.isNativePlatform?.()
>     || window.matchMedia?.("(display-mode: standalone)").matches
>     || window.navigator.standalone === true
>     || /\bwv\b|AnkiGen/.test(navigator.userAgent);
>   if (inApk) document.documentElement.dataset.apk = "1";
> }
> detectApk();
>
> // 4. Mount React
> const { default: App } = await import("./App");
> createRoot(document.getElementById("root")).render(<App />);
>
> // 5. Hide splash screen (min 3s display)
> const SPLASH_MIN_MS = 3000;
> const remaining = Math.max(0, SPLASH_MIN_MS - performance.now());
> setTimeout(() => {
>   const el = document.getElementById("app-splash");
>   el?.classList.add("is-hidden");
>   setTimeout(() => el?.remove(), 700);
> }, remaining);
>
> // 6. Register service worker (production only)
> if ("serviceWorker" in navigator && import.meta.env.PROD) {
>   window.addEventListener("load", () => {
>     navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
>   });
> }
> ```
>
> **`src/App.tsx`** — TanStack Query with localStorage persistence:
> ```tsx
> const queryClient = new QueryClient({
>   defaultOptions: {
>     queries: {
>       gcTime: 1000 * 60 * 60 * 24 * 7,   // 1 week
>       staleTime: 1000 * 60 * 5,            // 5 min
>       retry: (count, err) => navigator.onLine && count < 2,
>       networkMode: "offlineFirst",
>     },
>     mutations: { networkMode: "offlineFirst" },
>   },
> });
>
> const persister = createSyncStoragePersister({
>   storage: window.localStorage,
>   key: "ankigen-cache-v1",
>   throttleTime: 1000,
> });
>
> // Only persist deck/card queries (not generation streams)
> const shouldDehydrate = (q) => {
>   const key = q.queryKey?.[0];
>   return typeof key === "string" && (key.includes("/decks") || key.includes("/cards"));
> };
> ```
>
> Wrap everything in: `PersistQueryClientProvider > TooltipProvider > OfflineBanner > UpdateBanner > SplashScreen > WouterRouter > Layout > PageTransition > Switch(routes) > ClickRipple > Toaster`.
>
> Routes: `/` → Dashboard, `/generate` → Generate, `/decks` → Decks, `/decks/:id` → DeckDetail, `/history` → History, `*` → NotFound.
> Use `base={import.meta.env.BASE_URL.replace(/\/$/, "")}` on WouterRouter.

---

## Prompt 18 — Layout + Header component

> **`src/components/layout.tsx`**:
>
> Sticky top header (`h-14`) with `backdrop-blur` and `bg-background/95`. Max width `max-w-5xl mx-auto`. Container `px-3 sm:px-4 md:px-6`.
>
> Left side: Logo (BookOpen icon + "AnkiGen" in `font-serif`, hidden on mobile). Nav links: Dashboard (`/`), Library (`/decks`). Each link: `px-2 sm:px-3 py-2 sm:py-1.5 rounded-md text-sm font-medium`. Active: `bg-primary/10 text-primary`. Inactive: `text-foreground/60 hover:text-foreground hover:bg-muted`.
>
> **Generate button** — animated gradient pill with shimmer and wobbling sparkle icon:
> ```tsx
> <motion.span
>   whileHover={{ scale: 1.04 }}
>   whileTap={{ scale: 0.96 }}
>   className="relative ml-0.5 sm:ml-1 inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-md text-sm font-semibold overflow-hidden text-white shadow-sm shadow-primary/20"
>   style={{ background: "linear-gradient(120deg, hsl(150 60% 45%), hsl(140 65% 42%), hsl(95 65% 45%))" }}
> >
>   {/* Shimmer overlay — animates x: -120% → 120% every 2.6s */}
>   {/* Wobbling Sparkles icon — rotates [0,14,-10,0] every 2.4s */}
>   <span className="relative">Generate</span>
> </motion.span>
> ```
> When active (`location === "/generate"`), add `ring-2 ring-primary/40 ring-offset-1`.
>
> Right side: APK download button (shows if `window.Capacitor` is available or in standalone mode).
>
> Main content: `<main className="flex-1 flex flex-col w-full max-w-5xl mx-auto p-4 md:p-8">`.
>
> Below main: `<ApkWelcomeBanner />` — shown once when user installs PWA.

---

## Prompt 19 — Splash screen + offline banner + update banner + ripple

> **`SplashScreen`** — shows `#app-splash` div while React mounts. Center-aligned logo + app name. Fades out after 3s. CSS: `#app-splash.is-hidden { opacity: 0; transition: opacity 0.7s; }`.
>
> **`OfflineBanner`** — sticky top bar that appears when `!navigator.onLine`. Uses `online`/`offline` window events. Message: "You're offline — changes will sync when reconnected."
>
> **`UpdateBanner`** — listens to `navigator.serviceWorker.addEventListener("controllerchange")`. When a new SW takes over, shows a sticky banner: "New version available — reload to update" with a Reload button.
>
> **`ClickRipple`** — attaches a global `mousedown` listener. On each click, creates a `div` with `border-radius: 50%`, `background: rgba(0,0,0,0.08)`, `pointer-events: none`, `position: fixed`, scales from `0` to `60px`, fades out in 400ms, then removes itself. Append to `document.body`.

---

## Prompt 20 — Dashboard page

> **`src/pages/dashboard.tsx`**:
>
> Header: `h1` in `font-serif text-3xl font-bold text-primary` + "Generate Cards" button on the right.
>
> **Top stats grid** — `grid-cols-2 md:grid-cols-4 gap-4`:
> - Total Decks (Layers icon, text-primary)
> - Total Cards (FileText icon, text-blue-500)
> - Decks This Week (TrendingUp icon, text-green-500)
> - Study Streak (Flame icon, text-emerald-500) — reads from localStorage sessions
>
> Each stat card: framer-motion `whileHover={{ y: -3 }}`, staggered `delay: 0.05 * idx`.
>
> **Study stats** (only shown if localStorage has study sessions):
> - 3-column grid: Studied Today (violet Brain icon), Overall Known % (green CheckCircle2), Total Sessions (blue BookOpen).
> - **7-Day Activity bar chart** — 7 columns, each day shows stacked bars (green = known, emerald = still learning). Empty days show a 4px stub. Legend below.
> - **Deck Progress** — per-deck progress bars (% known), sorted by total cards desc.
> - **Recent Sessions** — list of past study sessions with deck name, timestamp, known/unknown counts.
>
> **Empty state** (no sessions) — centered Brain icon, "No study sessions yet", link to Library.
>
> **Quick Actions** — 2-column grid: "Generate New Decks" card (Sparkles, hover border-primary/40) + "Browse Library" card (Layers, blue).
>
> **Recent Decks** — last 5 by `createdAt DESC`. Each row: deck icon, name, timestamp, card count badge, ChevronRight.
>
> All lists use `animate-in fade-in slide-in-from-bottom-2` with staggered `animationDelay`.

---

## Prompt 21 — Generate page (animated mode toggle)

> **`src/pages/generate.tsx`**:
>
> **Animated background** (behind everything, `pointer-events-none absolute inset-0 -z-10`):
> - Two radial gradient halo blobs that pulse (`scale: [1,1.15,1]`) continuously.
> - 10 floating particles that oscillate `y: [0,-20,0]` at different speeds.
> - Colors swap between emerald (deck mode) and violet/fuchsia (qbank mode).
>
> **Hero section** (`text-center max-w-2xl mx-auto pt-6`):
> - Animated icon: 64×64 rounded-2xl gradient square with rotating conic-gradient glow halo.
>   - Deck mode: `Sparkles` icon, green gradient `from-primary via-emerald-500 to-lime-500`.
>   - QBank mode: `Stethoscope` icon, violet gradient `from-violet-500 via-fuchsia-500 to-purple-500`.
> - Title: `AnimatePresence` cross-fade, `font-serif text-4xl md:text-5xl font-bold` with gradient text using `bg-clip-text text-transparent`.
> - Subtitle: AnimatePresence cross-fade.
>
> **Mode toggle pill** (`mt-7 flex justify-center`):
> ```tsx
> <div className="relative inline-flex p-1 rounded-full bg-muted/70 backdrop-blur-sm border border-border/60">
>   {/* Sliding highlight — animates x: "0%" or "100%" with spring physics */}
>   <motion.div className={`absolute top-1 bottom-1 w-1/2 rounded-full shadow-md bg-gradient-to-r ${accent.gradient}`}
>     animate={{ x: isQbank ? "100%" : "0%" }}
>     transition={{ type: "spring", stiffness: 380, damping: 32 }} />
>   {/* Glow halo behind pill */}
>   <button onClick={() => setMode("deck")} className="...">
>     <Library className="h-4 w-4" /> Flashcards
>   </button>
>   <button onClick={() => setMode("qbank")} className="...">
>     <Stethoscope className="h-4 w-4" /> Question Bank
>   </button>
> </div>
> ```
>
> **Feature highlights** (deck mode only, AnimatePresence):
> - 3 feature cards in `grid-cols-2`: "From PDFs & text" (blue), "Visual cards" (violet), "Organized library" (emerald).
> - 4th tile: "Build with AI" — full green gradient button that scrolls to the form.
>
> **QBank CTA** (qbank mode only): large animated button with violet/fuchsia gradient, rotating conic glow, pulsing sheen shimmer, wobbling Stethoscope icon.
>
> **Form card** (`mt-10 max-w-2xl mx-auto`): `Card` with border color swapping (violet for qbank). Shows `GenerateForm` or `GenerateQbankForm` based on mode, with `AnimatePresence` slide transition (`x: ±16`).

---

## Prompt 22 — Generate form component (flashcards)

> **`src/components/generate-form.tsx`**:
>
> Props: `variant ("sheet"|"page")`, `defaultParentId`, `prefilledText`, `prefilledDeckName`, `onDone`, `onClose`, `animated`.
>
> **State per uploaded file** (`FileEntry`): `{ id, name, status, text, pageImages, pageTexts, pageImageRegions, progress, deckName, cardCount, visualCardCount, deckType, generatedCount, generatingPercent, generatingMessage, generatingStartedAt, customPrompt }`.
>
> **Shared instructions panel** — `Textarea` at the top with "Apply to all" checkbox. Placeholder: `e.g. "USMLE Step 1 high-yield style", "rewrite questions as MCQs with 4 options"`.
>
> **Drop zone** — `border-2 border-dashed rounded-xl p-7 text-center cursor-pointer`. UploadCloud icon animates `y: [-2,2,-2]` while dragging. Accepts `.pdf` and `.txt`. Multiple files allowed.
>
> **Per-file card** — `border-l-[3px]` with color: extracting=muted, ready=primary/50, generating=primary, done=green-500/70, error=destructive/70. Shows:
> - File name + status icon (spinning Loader2, FileText, CheckCircle2, AlertCircle).
> - Extracting: progress text + percentage + `<Progress>` bar.
> - Ready: editable deckName `<Input>`, cardCount input, deckType selector (Text only / Text + Visual / Visual only), optional per-file custom prompt.
> - Generating: `<BatteryProgress>` bar + message + ETA (recalculated every second).
> - Done: green "N cards" badge. Error: red error message.
> - Remove button (X) on each file.
>
> **Manual text section** — below files: `<Textarea>` for pasted text + deck name input + card count input. Shows estimated capacity: `chars / 220 + min(pageImages, 50)`.
>
> **Parent deck selector** — `<Select>` with hierarchical indented options (`└─` prefix for children).
>
> **Sticky generate button** at bottom — `Generate N deck(s)` with cancel button (StopCircle icon) during generation.
>
> **`GenerationSuccessOverlay`** — full-screen celebration overlay after successful generation. Shows confetti (canvas-confetti), deck count, card count. Auto-navigates after user dismisses.
>
> **PDF extraction** (`lib/pdf-extraction.ts`):
> - Files >20 MB: skip client extraction, upload to `POST /api/extract-pdf` via FormData.
> - Smaller files: try `pdfjs-dist` embedded text first. If page is empty, render to canvas + `tesseract.js` OCR.
> - Also capture page screenshots (for visual card generation) and detect raster image regions via PDF.js operator list.
> - Report progress via callback: "Extracting page N/M", "Capturing page N/M for visual AI".
>
> **SSE stream consumer** for generation:
> - Uses `fetch` with `ReadableStream`, not `EventSource` (EventSource doesn't support POST).
> - Parse lines starting with `data:`. Handle `type: "progress"` (update per-file state), `type: "done"` (resolve), `type: "error"` (reject).
> - On stream end without `done` event, reject with "Connection dropped" message.
> - Wire `AbortController` to a Cancel button; mark file as "Cancelled" on abort.
> - Sequential (not parallel) file generation with 1.5s pause between files.

---

## Prompt 23 — Generate QBank form component

> **`src/components/generate-qbank-form.tsx`**:
>
> Visually similar to `generate-form` but violet-themed.
>
> **Info banner** at top: violet background `bg-violet-500/5 border-violet-500/30`, Stethoscope icon, text "UWorld-style Question Bank — generates MCQs only with full distractors and detailed explanations."
>
> **Drop zone** — violet hover states (`hover:border-violet-500/60 hover:bg-violet-500/[0.03]`, icon turns violet on drag).
>
> **Per-file card** — same structure but with violet accents. Shows question count input instead of card count. No visual/text type selector (qbanks are text-only).
>
> **Manual text section** — same as flashcard form.
>
> **Shared style instructions** — separate `Textarea` with violet border `border-violet-500/20 bg-violet-500/5`. Placeholder: `e.g. "USMLE Step 1 high-yield style", "include lab values", "vignette must be ≤4 sentences"`.
>
> On success: navigate directly to the generated deck's detail page.

---

## Prompt 24 — Library (Decks) page

> **`src/pages/decks.tsx`**:
>
> **Header**: "Library" title + Transfer dropdown (DropdownMenu with three items: Import .ankigen.json backup, Export library as .apkg, Back up library as JSON) + optional "Generate" button.
>
> **Tabs**: `Flashcards | Question Banks`. Each tab lists its root decks (filtered by `kind`). QBank tab has a violet "Generate QBank" button.
>
> **Search bar** — filters by name or description, recursively matching parent decks if any child matches.
>
> **`DeckRow` component** — recursive tree with collapsible children. Max 2 visual depth levels:
> - Depth 0: `border-border/50 shadow-sm`, `h-9 w-9` icon, `font-semibold`, card count `text-sm px-2.5 py-1`.
> - Depth 1: `border-border/30 bg-muted/20`, `h-7 w-7` icon, `text-sm font-medium`, smaller badges.
> - Depth 2: `border-border/20 bg-muted/30`, `h-6 w-6` icon.
> - Icons: FolderOpen for parent decks, Layers for root leaves, FileText for child leaves.
> - Collapse/expand chevron button.
> - When collapsed: show chip previews of child decks (up to 4).
> - Edit (Pencil) + Delete (Trash2) buttons on right. Delete prompts with card count and descendant count.
> - Indent with `border-l-2 border-primary/20 pl-4` for depth-1 children.
> - "Add sub-deck" text button below each expanded parent.
>
> **Select mode** (triggered by toolbar button): shows checkboxes on each row. Toolbar appears: "N selected", Select All, Cancel, Export .apkg, Merge button (needs ≥2 selected).
>
> **Merge dialog** — name input + "Delete originals" checkbox.
>
> **Transfer dropdown actions**:
> - Import JSON → hidden `<input type="file">` → `POST /api/import-deck-json`.
> - Export library as .apkg → `POST /api/export-apkg` with all root deck IDs.
> - Back up as JSON → `GET /api/export-all-json`.
>
> **DeckFormSheet** — side drawer for create/edit deck. Fields: name, description, parent selector.
>
> **GenerateSheet** — side drawer wrapping `GenerateForm` or `GenerateQbankForm`. Opens when URL has `?new=1` or `?shared_text=...`.
>
> Parents auto-collapse on first load (if any children exist). Children sort by name alphanumerically.

---

## Prompt 25 — Deck Detail page

> **`src/pages/deck-detail.tsx`**:
>
> **Header bar**: Back button (ArrowLeft), deck name, Download dropdown (Export .apkg, Export JSON), Study button.
>
> **Card list tabs** — always show `All | Text | Visual` tabs for non-QBank decks with any cards (even if one side is empty — users need to see the structure). Hide tabs for QBank decks.
> - Text cards: front/back basic display.
> - Visual cards: show cropped image from `card.image`. CropCompare component shows the crop alongside its source region if `card.sourceImage` and `card.bbox` are present.
>
> **Inline edit** — click Edit on a card → fields become editable Inputs/Textareas. Save/Cancel buttons.
>
> **AI Tools section** (per-deck, separate from study mode):
> - "Add AI illustrations to all cards" — loops with concurrency 2, progress bar, skips cards with existing images.
>
> ---
>
> **Study Mode** (full-screen takeover):
>
> **Controls bar**: "Save & Exit" (Bookmark), Shuffle toggle (active = secondary variant), Restart button.
>
> **Progress**: "Card N of M" + "✓ K known · ✗ L learning" + `<Progress>` bar.
>
> **Flashcard** (`min-h-[280px] sm:min-h-[320px]`):
> - Front section: "Q" badge label + front text. If `card.image` exists, show `<CropCompare>` above the text.
> - MCQ choices (when `card.cardType === "mcq"`):
>   - Before reveal: A/B/C/D option buttons. Clicking selects (primary border). "Show Answer" button disabled until an option is picked.
>   - After reveal: correct → green border/background + ✓ checkmark box. Wrong selected → red border + ✗ box. Other wrong → muted.
>   - **Do NOT auto-trigger AI explanation on reveal.** Let the user request it manually.
> - Reveal button: "Pick an answer" if MCQ and nothing selected; "Show Answer" if MCQ and selected; "Reveal Answer" for basic cards.
> - Answer section (after reveal): dashed border, "A" badge, back text. For MCQ: show "Correct answer: X. [choice text]" before the back text. **Bounds-check `correctIndex` against `choices.length`** before indexing — a malformed value crashes the study session.
>
> **Got It / Still Learning buttons** (after reveal): `flex-1 h-12`. Got It = green-600. Still Learning = red border/text. Keyboard: `Space/Enter` → reveal/got-it, `1` → got-it, `2` → still learning, `←/→` → prev/next/skip.
>
> **AI Tools panel** (appears after reveal, `rounded-xl border border-border/40 bg-muted/20 p-3`):
>
> `grid-cols-1 sm:grid-cols-3` for basic cards. For MCQ cards, add a 4th button making it `sm:grid-cols-4`:
>
> | Button | Icon | Mode |
> |--------|------|------|
> | Full Explanation | Brain (text-primary) | `full` |
> | Revision Sheet | ClipboardList (text-primary) | `revision` |
> | OSCE Questions | Stethoscope (text-primary) | `osce` |
> | **Answer Breakdown** *(MCQ only)* | **ListChecks (text-violet-500)** | `brief` |
>
> "Answer Breakdown" button passes `choices` and `correctIndex` to the explain endpoint. The response explains why each option is correct or wrong in a short structured format.
>
> Each button: `flex flex-col items-center gap-1.5 rounded-lg border border-border/60 bg-background hover:bg-primary/5 p-3`. Disabled + opacity-50 while loading.
>
> **Explanation drawer** (`vaul` `Drawer.Root`): slides up from bottom. Shows the streaming markdown content via `react-markdown` + `remark-gfm`. Header shows the mode label. Close button top-right. Scrollable content area with `prose` typography styling.
>
> For `brief` mode, the drawer header shows "Answer Breakdown" in violet.
>
> **Image lightbox** — full-screen dark overlay (`bg-black/90`) when user clicks ZoomIn on a visual card. ESC key closes it. XCircle button top-right.
>
> **Save point** (localStorage): persist `{ deckId, cardIds, index, knownIds, unknownIds, savedAt }` on every card change. Resume where you left off when re-opening the same deck. Clear on session complete.
>
> **Session complete screen**: 🎉 emoji, score (Got It / Still Learning counts), progress bar, "Study again" + "Review N missed" + "Back to deck" buttons.
> Confetti (canvas-confetti): two bursts from left and right. If ≥90% known: third burst from center. Color palette scales with performance.

---

## Prompt 26 — CropCompare component

> **`src/components/crop-compare.tsx`**:
>
> Shows a visual card's cropped region alongside a highlighted version on the full page.
>
> Props: `image` (cropped base64), `sourceImage?` (full-page base64), `bbox?` (`{x,y,w,h}`), `onLightbox?`.
>
> If `sourceImage` and `bbox` are present: show two-panel layout — left panel is the crop, right panel is the full page with a colored overlay rectangle showing the bbox position. User can click either panel to open the lightbox.
>
> If only `image`: show the crop with a ZoomIn button.
>
> `parseBbox(str)` — safely parse the JSON bbox string from the DB, return `null` on error.

---

## Prompt 27 — History page

> **`src/pages/history.tsx`**:
>
> Header: HistoryIcon + "Generation History" + "Clear" button (red, destructive confirm dialog).
>
> **Stats strip** (4 cards, only shown if history exists): Total Runs, Successful, Cards Made, Avg Duration.
>
> **List of generation runs** — each `Card` row shows:
> - Deck name + `StatusBadge` (success=emerald, cancelled=emerald/Ban, error=destructive/XCircle) + deck-type badge (icon: Type for text, ImageIcon for visual, Layers for both).
> - Relative time (`formatDistanceToNow`) + duration (`Xs`, `Xm Xs`, `Xh Xm`) + card count + page count.
> - If `customPrompt`: muted block with "Prompt:" label, `line-clamp-2`.
> - If error: red block with error message.
>
> **Empty state**: dashed border card, HistoryIcon, "Generate your first deck to start building history."
>
> **Clear confirm dialog** — warns "Your decks and cards are not affected."

---

## Prompt 28 — Study stats (localStorage)

> **`src/lib/study-stats.ts`**:
>
> ```ts
> type StudySession = {
>   id: string; deckId: number; deckName: string;
>   total: number; known: number; unknown: number; completedAt: string;
> };
> type StudySavePoint = {
>   deckId: number; cardIds: number[]; index: number;
>   knownIds: number[]; unknownIds: number[]; savedAt: string;
> };
> ```
>
> All data stored in localStorage keys: `"ankigen-sessions"` and `"ankigen-save-<deckId>"`.
>
> **Wrap ALL `JSON.parse(localStorage.getItem(...))` calls in try/catch.** Stale/corrupted localStorage must not crash the dashboard on first paint.
>
> Export: `getSessions()`, `saveSession()`, `getStudyStreak()`, `getLast7Days()`, `getDeckStats()`, `getTodayStats()`, `getSavePoint(deckId)`, `saveSavePoint(sp)`, `clearSavePoint(deckId)`.
>
> `getStudyStreak()` — count consecutive calendar days from today backwards that have at least one session.
>
> `getLast7Days()` — return array of `{ date, label, total, known }` for the past 7 days.

---

## Prompt 29 — PWA + iOS install modal

> **`public/manifest.webmanifest`**:
> ```json
> { "name": "Anki Card Generator", "short_name": "AnkiGen",
>   "start_url": "/", "display": "standalone",
>   "background_color": "#f7f5f0", "theme_color": "#2d6a4f",
>   "icons": [{ "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
>             { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }] }
> ```
>
> **`index.html`** meta tags:
> ```html
> <meta name="apple-mobile-web-app-capable" content="yes" />
> <meta name="apple-mobile-web-app-status-bar-style" content="default" />
> <meta name="apple-mobile-web-app-title" content="AnkiGen" />
> <link rel="apple-touch-icon" href="/icon-192.png" />
> <meta name="theme-color" content="#2d6a4f" />
> ```
>
> **iOS install modal** (`components/ios-install-modal.tsx`) — shown on Safari when not in standalone mode. Explains: "Tap the Share button → Add to Home Screen". Include Share icon screenshot.
>
> **`sw.js`** — minimal service worker: cache-first for static assets, network-first for `/api/*`.

---

## Prompt 30 — `lib/utils.ts` + API URL helper

> **`src/lib/utils.ts`**:
> ```ts
> import { clsx } from "clsx";
> import { twMerge } from "tailwind-merge";
>
> export function cn(...inputs: ClassValue[]) {
>   return twMerge(clsx(inputs));
> }
>
> export function apiUrl(path: string): string {
>   // Works in both dev (relative) and production (absolute via VITE_API_BASE).
>   const base = import.meta.env.VITE_API_BASE?.trim().replace(/\/$/, "") ?? "";
>   const cleanPath = path.replace(/^\//, "");
>   return base ? `${base}/${cleanPath}` : `/${cleanPath}`;
> }
> ```
>
> Use `apiUrl("api/explain")` everywhere instead of hardcoded paths. This is essential for Replit's path-based proxy routing where the app may live at `/ankigen/` instead of `/`.

---

## Prompt 31 — Smoke test checklist

> After setting `OPENROUTER_API_KEY` and `DATABASE_URL` as secrets (never in files), verify:
>
> 1. `GET /api/healthz` → `{ status: "ok", checks: { database: { status: "ok" }, ai: { status: "ok" } } }`.
> 2. Generate flashcards from a 3-paragraph text → ≥3 cards created, deck appears in Library.
> 3. Upload a 5-page PDF with a chart on page 2 → text cards from all pages + at least one visual card.
> 4. Generate a QBank → all cards are MCQ with 4 options and a correctIndex.
> 5. Study a deck → Reveal Answer does NOT auto-trigger AI explanation.
> 6. Study a MCQ card → "Answer Breakdown" button appears. Tapping it opens a drawer explaining each option.
> 7. Click "Full Explanation" → markdown streams into the drawer within 2s.
> 8. Click "Add AI illustrations" on a deck → images appear on cards.
> 9. Export deck as `.apkg` → import into Anki/AnkiMobile → images render correctly.
> 10. Back up library as JSON → import JSON → decks reappear with all cards.
> 11. Merge two decks → merged deck has combined card count.
> 12. History page shows all generation runs with timing and card counts.
> 13. Dashboard shows streak and 7-day activity after studying.
> 14. Install as PWA on iOS → home screen icon → opens in standalone mode.

---

## Critical bugs to avoid (from the original build)

| # | Bug | Fix |
|---|-----|-----|
| 1 | `generations` table missing | Include `CREATE TABLE IF NOT EXISTS generations` in `ensureDatabaseSchema()`. Missing it causes silent 500 on every generation. |
| 2 | `decks.kind` / `cards.page_number` missing on upgrade | Always add `ALTER TABLE … ADD COLUMN IF NOT EXISTS` for EVERY column alongside `CREATE TABLE IF NOT EXISTS`. |
| 3 | QBank insta-cancels | Wire `AbortController` to `res.on("close")` NOT `req.on("close")` — the request body stream closes immediately after body-parser reads it. |
| 4 | Visual cards silently dropped | When AI bbox doesn't overlap a PDF.js raster region, KEEP the AI bbox. Don't `continue`. Vector charts have no detected regions. |
| 5 | Insert crash: `c.image.startsWith is not a function` | Filter out visual cards with empty/null `image` before DB insert. |
| 6 | MCQ study crash | Bounds-check `correctIndex < choices.length` before indexing. |
| 7 | All/Text/Visual tabs hidden | Always show tabs on non-QBank decks with cards, regardless of whether both types exist. |
| 8 | Explain returns empty 200 | `max_completion_tokens: 1_000_000` → OpenRouter rejects with 400 after headers flush. Error swallowed. Cap tokens per mode (full=8000, revision=3000, osce=8000, brief=1500). Write error into body stream if headers already sent. |
| 9 | MCQ auto-explanation | The "Show Answer" button must only call `setRevealed(true)`. Do NOT auto-call `handleExplain()`. |
| 10 | localStorage crash | Wrap ALL `JSON.parse(localStorage.getItem(...))` in try/catch. Stale data must not crash the app. |
| 11 | Secrets in files | Never write `OPENROUTER_API_KEY` or `DATABASE_URL` into any file. Use the agent's secret-request tool only. |

---

## Design tokens reference

| Token | Value |
|-------|-------|
| Primary (light) | `hsl(150 40% 25%)` — deep forest green |
| Primary (dark) | `hsl(150 40% 45%)` |
| Background (light) | `hsl(40 33% 98%)` — warm off-white |
| Background (dark) | `hsl(150 30% 10%)` |
| Accent | `hsl(35 100% 50%)` — amber/orange |
| Font sans | Outfit |
| Font serif | Instrument Serif |
| Font mono | Space Mono |
| Border radius | 0.75rem |
| Gradient (generate) | `from-primary via-emerald-500 to-lime-500` |
| Gradient (qbank) | `from-violet-500 via-fuchsia-500 to-purple-500` |
