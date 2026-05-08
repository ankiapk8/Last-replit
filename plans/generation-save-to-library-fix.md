# Fix Generation & Save-to-Library — Complete Plan

## Problem Summary

The generation flow (creating AI flashcards from PDFs/text and saving them to the user's library) has multiple interconnected problems that cause cards to be lost, decks to be empty, the entire generation to silently fail, or generation time to degrade from 30 seconds to 17+ minutes. The root causes span the full stack: SSE connection handling on Render, missing DB transactions, no generation status tracking, a fragile preview→commit flow, and severe performance degradation from memory leaks and redundant processing.

---

## Root Cause Analysis

### Problem 1: SSE Connections Drop on Render (Critical)

**Symptom:** Generation appears to complete on the frontend but the deck never appears in the library.

**Cause:** The `/api/generate/stream` endpoint uses Server-Sent Events (SSE) — a long-lived HTTP connection. Render's infrastructure (especially free/basic tiers) can terminate idle or long-running connections. The heartbeat interval is 15s, but Render's proxy may timeout sooner. When the connection drops:

- The frontend's `reader.read()` loop exits with `done: true` before receiving the `done` event
- The frontend rejects with "Connection dropped before generation finished"
- On the server side, the AI call may have **already completed** and `saveDeckAndCards()` may have already run — but the client never gets the `deck.id` response
- Result: **deck exists in DB with cards, but user has no way to find it** (no deck ID returned)

**Evidence in code:**

- [`generate.ts:542-679`](artifacts/api-server/src/routes/generate.ts) — SSE stream with 15s heartbeat
- [`generate-form.tsx:420-422`](artifacts/anki-generator/src/components/generate-form.tsx) — "Connection dropped" error message

### Problem 2: No DB Transaction for Deck + Cards (Critical)

**Symptom:** Empty decks appear in the library (0 cards).

**Cause:** `saveDeckAndCards()` in [`generate.ts:501-538`](artifacts/api-server/src/routes/generate.ts) does:

1. `INSERT INTO decks` → succeeds
2. `INSERT INTO cards` → fails (e.g. data too long, encoding issue, connection drop)

There is NO transaction wrapping both inserts. If step 2 fails, the deck exists but has 0 cards. The user sees an empty deck in their library.

### Problem 3: Preview→Commit Flow is Fragile (High)

**Symptom:** User previews cards, clicks "Save", but deck doesn't appear in library.

**Cause:** The single-target flow uses a two-phase approach:

1. `POST /api/generate/stream` with `preview: true` — generates cards but does NOT save to DB
2. `POST /api/generate/commit` — saves cards to DB

If the user closes the browser between steps 1 and 2, or if the commit request fails, the cards are permanently lost. The frontend shows an inline preview with an `onSave` callback, but there's no retry mechanism and no local backup of the staged cards.

**Evidence in code:**

- [`generate-form.tsx:598-618`](artifacts/anki-generator/src/components/generate-form.tsx) — commit flow
- [`generate.ts:637-656`](artifacts/api-server/src/routes/generate.ts) — preview mode skips `saveDeckAndCards`

### Problem 4: No Generation Status Tracking (Medium)

**Symptom:** User has no way to know if a generation succeeded, failed, or is still running after a page refresh.

**Cause:** The `generations` table exists in the DB ([`lib/db/src/schema/generations.ts`](lib/db/src/schema/generations.ts)) but is **never written to** during the generation flow. The `/api/generations` endpoint only reads/writes manually. There's no way to:

- Show "generation in progress" after a page refresh
- Recover from a failed generation
- Debug why a generation failed (no error messages stored)

### Problem 5: Frontend Doesn't Refresh Library After Save (Medium)

**Symptom:** After generating and saving a deck, the library page doesn't show the new deck until manual refresh.

**Cause:** The `queryClient.invalidateQueries({ queryKey: getListDecksQueryKey() })` call happens in `handleGenerateAll` at [`generate-form.tsx:584`](artifacts/anki-generator/src/components/generate-form.tsx), but:

- It's called immediately after the loop, before the user interacts with the success overlay
- The `GenerateSheet` component's `onDone` callback switches the library tab but doesn't guarantee a refetch
- The decks page may have stale cached data

### Problem 6: Offline Queue Uses SSE Without Streaming Support (Low)

**Symptom:** Offline-queued generations fail when syncing.

**Cause:** The offline queue sync in [`offline-queue-provider.tsx:24-71`](artifacts/anki-generator/src/providers/offline-queue-provider.tsx) reads the SSE stream but doesn't properly handle the streaming response — it just waits for `done` or `error` events. If the stream format changes or an unexpected event occurs, the sync silently fails.

### Problem 7: Generation Performance Degrades Over Time (Critical)

**Symptom:** Generation starts at ~30 seconds for a fresh server, then degrades to 17+ minutes after the server has been running and handling requests.

**Cause:** Multiple compounding memory and resource leaks:

**7a — ResponseCache grows unbounded (memory leak):**
The `generationCache` singleton in [`response-cache.ts:61`](artifacts/api-server/src/lib/response-cache.ts) is created with `maxSize = 100` and `ttlMs = 600_000` (10 min). However, the cache key includes the full prompt text hash, meaning identical content with different `targetCount` or `customPrompt` creates unique entries. For PDF generation, the cache key includes the entire text content hash — a 50-page PDF produces a unique key every time. The cache grows to 100 entries and evicts LRU, but each entry stores the **full AI response** (up to 8K tokens ≈ 30KB+). That's up to 3MB of cached responses. More importantly, the cache `Map` is never cleared — it persists for the lifetime of the process.

**7b — Rate limiter map grows unbounded (memory leak):**
The `createRateLimiter` in [`rate-limiter.ts:1-11`](artifacts/api-server/src/lib/rate-limiter.ts) stores timestamps per IP in a `Map`. The filter `now - t < windowMs` only runs when that IP makes a new request. Old IPs that don't make new requests **never get cleaned up**. On a public server, this accumulates thousands of stale entries.

**7c — PDF extraction loads entire PDF into memory:**
The `/api/extract-pdf` endpoint in [`extract-pdf.ts:260-290`](artifacts/api-server/src/routes/extract-pdf.ts) loads the full PDF buffer, then runs both `extractEmbeddedPdfText()` and `detectPagesWithVisuals()` in parallel. Each of these opens the PDF separately via `pdfjs-dist`, creating two full PDF document proxies simultaneously. For a 200MB PDF, this can consume 600MB+ of RAM. The `Buffer.from(buffer)` copy on line 54 doubles the memory usage unnecessarily.

**7d — OCR is extremely slow for scanned PDFs:**
When embedded text is missing, `extractOcrText()` renders each page to a canvas at 3x scale, converts to PNG, then runs Tesseract.js OCR. Each page takes 5-15 seconds. A 60-page scanned PDF = 5-15 minutes of OCR. The Tesseract worker is created fresh for each request (`createWorker("eng")` on line 243) — worker initialization alone takes 2-3 seconds.

**7e — AI client is re-imported on every request:**
In `getAIClient()` at [`generate.ts:65-99`](artifacts/api-server/src/routes/generate.ts), the `@workspace/integrations-openai-ai-server` module is dynamically imported on every call. While Node.js caches modules, the `await import()` still has overhead, and the function also checks 5 different environment variables each time.

**7f — No request timeout on AI calls:**
The `openai.chat.completions.create()` calls have no timeout. If the AI provider is slow or the connection hangs, the request can wait indefinitely, blocking the event loop and accumulating pending requests.

**Evidence:**

- `response-cache.ts:20-23` — LRU cache with 100 entry limit but no periodic cleanup
- `rate-limiter.ts:5` — Filter only runs on new requests, no background cleanup
- `extract-pdf.ts:54` — `Buffer.from(buffer)` creates unnecessary copy
- `extract-pdf.ts:240-258` — Sequential OCR with fresh worker per request
- `generate.ts:65-99` — Dynamic import on every request

---

## Fix Plan

### Fix 1: Add Polling Fallback for SSE (Critical)

**Goal:** Make generation resilient to SSE connection drops on Render.

**Approach:** Add a generation ID to the SSE stream. If the SSE connection drops, the frontend falls back to polling a status endpoint.

**Files to modify:**

1. **`artifacts/api-server/src/routes/generate.ts`** — `/generate/stream` endpoint:
   - Generate a UUID at the start of generation
   - Store generation status in a new in-memory map (or DB `generations` table)
   - Return the generation ID in the first SSE event
   - Update status as generation progresses (`processing` → `saving` → `done`/`error`)
   - On completion, store the `deckId` in the status

2. **`artifacts/api-server/src/routes/generations.ts`** — New endpoint:
   - `GET /api/generations/:id` — returns status of a specific generation
   - Response: `{ status: "processing"|"done"|"error", deckId?: number, error?: string }`

3. **`artifacts/anki-generator/src/components/generate-form.tsx`** — `generateOne` function:
   - Extract the generation ID from the first SSE event
   - On connection drop, start polling `GET /api/generations/:id` every 2s
   - If polling returns `done`, resolve with the deck ID
   - If polling returns `error`, reject with the error message
   - Timeout after 5 minutes of polling

```typescript
// New polling fallback in generateOne:
const POLL_INTERVAL = 2000;
const POLL_TIMEOUT = 300_000; // 5 min

async function pollGenerationStatus(genId: string): Promise<{ deckId?: number }> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    const resp = await fetch(apiUrl(`api/generations/${genId}`));
    if (!resp.ok) continue;
    const data = await resp.json();
    if (data.status === "done") return { deckId: data.deckId };
    if (data.status === "error") throw new Error(data.error ?? "Generation failed");
  }
  throw new Error("Generation timed out");
}
```

### Fix 2: Wrap Deck + Cards in DB Transaction (Critical)

**Goal:** Ensure atomic deck + cards creation — either both succeed or both fail.

**File:** `artifacts/api-server/src/routes/generate.ts` — `saveDeckAndCards()` function

```typescript
import { sql } from "drizzle-orm";

async function saveDeckAndCards(
  deckName: string,
  parentId: number | null,
  userId: string | null,
  cards: StagedCard[]
): Promise<{ deckId: number; cardCount: number }> {
  return await db.transaction(async (tx) => {
    const [deck] = await tx
      .insert(decksTable)
      .values({
        name: deckName.trim() || "Generated Deck",
        parentId: parentId ?? undefined,
        userId: userId ?? undefined,
        kind: "deck",
      })
      .returning();

    if (cards.length > 0) {
      await tx.insert(cardsTable).values(
        cards.map((c) => ({
          deckId: deck.id,
          front: c.front,
          back: c.back,
          tags: c.tags ?? null,
          cardType: (c.cardType ?? "basic") as "basic" | "mcq" | "image",
          choices: c.choices ? JSON.stringify(c.choices) : null,
          correctIndex: c.correctIndex ?? null,
          pageNumber: c.pageNumber ?? null,
          image: c.image ?? null,
          sourceImage: c.sourceImage ?? null,
          bbox: c.bbox ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }))
      );
    }

    return { deckId: deck.id, cardCount: cards.length };
  });
}
```

Also apply the same transaction pattern to the QBank save in the `/generate-qbank/stream` endpoint (lines 838-862).

### Fix 3: Eliminate Preview→Commit Two-Phase Flow (High)

**Goal:** Save cards to DB immediately during generation. Remove the fragile preview→commit pattern.

**Approach:** Always save to DB during the stream. The "preview" becomes a read-only view of already-saved cards, not a pre-save holding area.

**Files to modify:**

1. **`artifacts/api-server/src/routes/generate.ts`**:
   - Remove the `preview` flag handling from `/generate/stream`
   - Always call `saveDeckAndCards()` — cards are persisted immediately
   - Return `deck.id` in the `done` event so the frontend can link to it

2. **`artifacts/api-server/src/routes/generate.ts`**:
   - Remove the `/generate/commit` endpoint (no longer needed)

3. **`artifacts/anki-generator/src/components/generate-form.tsx`**:
   - Remove `usePreview` logic (line 510)
   - Remove `inlinePreview` state and `CardPreviewPanel` rendering (lines 598-618, 743-760)
   - Remove `stagedCards` from `FileEntry` type
   - After generation completes, show the `CardReviewModal` directly with the saved deck ID
   - The review modal can still allow editing cards (via `PATCH /api/cards/:id`) and regenerating individual cards

**Benefits:**

- Cards are never lost due to connection drops
- Simpler frontend logic (no two-phase commit)
- User can always find their deck in the library immediately

### Fix 4: Track Generation Status in DB (Medium)

**Goal:** Persist generation progress for debugging and recovery.

**Files to modify:**

1. **`artifacts/api-server/src/routes/generate.ts`** — Both stream endpoints:
   - At start: `INSERT INTO generations (deckName, deckType, status, startedAt) VALUES (..., 'running', NOW())`
   - On completion: `UPDATE generations SET status='completed', cardsGenerated=..., durationMs=..., completedAt=NOW() WHERE id=...`
   - On error: `UPDATE generations SET status='failed', errorMessage=... WHERE id=...`

2. **`artifacts/api-server/src/routes/generations.ts`**:
   - `GET /api/generations` — already exists, returns recent generations
   - `GET /api/generations/:id` — new, returns single generation status

3. **`artifacts/anki-generator/src/pages/history.tsx`**:
   - Show generation status (running/completed/failed) with error messages
   - Allow retrying failed generations

### Fix 5: Ensure Library Refreshes After Generation (Medium)

**Goal:** Newly generated decks appear in the library immediately.

**Files to modify:**

1. **`artifacts/anki-generator/src/components/generate-sheet.tsx`**:
   - After `onDone` callback, ensure the library tab is active AND data is refetched

2. **`artifacts/anki-generator/src/pages/decks.tsx`**:
   - Add a `useEffect` that refetches decks when the tab becomes visible (using `document.visibilitychange` event)
   - This handles the case where generation completes in a sheet overlay and the user dismisses it

### Fix 6: Improve Offline Queue Sync (Low)

**Goal:** Make offline-queued generations more reliable.

**File:** `artifacts/anki-generator/src/providers/offline-queue-provider.tsx`

- Add retry logic (3 attempts with exponential backoff)
- Add timeout handling (abort after 5 minutes)
- Better error reporting — show which items failed and why

### Fix 7: Fix Performance Degradation (Critical)

**Goal:** Prevent generation from degrading from 30s to 17+ minutes over time.

**Approach:** Fix 6 compounding memory leaks and resource issues.

**7a — Cap ResponseCache memory and add periodic cleanup:**

File: `artifacts/api-server/src/lib/response-cache.ts`

- Reduce `maxSize` from 100 to 50, `ttlMs` from 10min to 5min
- Add a `cleanup()` method that removes expired entries, called every 60s
- Track total cached response size and evict if > 10MB total

```typescript
export class ResponseCache {
  private cache = new Map<string, CacheEntry>();
  private currentSizeBytes = 0;

  constructor(maxSize = 50, ttlMs = 300_000, maxTotalSizeBytes = 10 * 1024 * 1024) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.maxTotalSizeBytes = maxTotalSizeBytes;
    setInterval(() => this.cleanup(), 60_000);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expires) {
        this.currentSizeBytes -= Buffer.byteLength(entry.result, "utf8");
        this.cache.delete(key);
      }
    }
  }

  set(key: string, result: string): void {
    const resultSize = Buffer.byteLength(result, "utf8");
    while (
      this.cache.size >= this.maxSize ||
      this.currentSizeBytes + resultSize > this.maxTotalSizeBytes
    ) {
      const firstKey = this.cache.keys().next().value;
      if (!firstKey) break;
      const evicted = this.cache.get(firstKey)!;
      this.currentSizeBytes -= Buffer.byteLength(evicted.result, "utf8");
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { result, expires: Date.now() + this.ttlMs });
    this.currentSizeBytes += resultSize;
  }
}
```

**7b — Add background cleanup to rate limiter:**

File: `artifacts/api-server/src/lib/rate-limiter.ts`

- Add periodic cleanup interval that removes stale IPs (no requests in 2x window)
- Cap total tracked IPs at 10,000

```typescript
export function createRateLimiter(maxRequests: number, windowMs: number) {
  const map = new Map<string, number[]>();
  const MAX_IPS = 10_000;

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, times] of map) {
      const fresh = times.filter((t) => now - t < windowMs);
      if (fresh.length === 0) map.delete(ip);
      else map.set(ip, fresh);
    }
  }, 60_000);
  (cleanup as NodeJS.Timeout).unref?.();

  return (ip: string): boolean => {
    const now = Date.now();
    const times = (map.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (times.length >= maxRequests) return false;
    times.push(now);
    if (map.size >= MAX_IPS) {
      const first = map.keys().next().value;
      if (first) map.delete(first);
    }
    map.set(ip, times);
    return true;
  };
}
```

**7c — Eliminate buffer copy in PDF extraction:**

File: `artifacts/api-server/src/routes/extract-pdf.ts` — `pdfDocOptions()` function

- Remove `const copy = Buffer.from(buffer)` — pass buffer directly to `Uint8Array`
- This halves memory usage for large PDFs

**7d — Reuse Tesseract worker across requests:**

File: `artifacts/api-server/src/routes/extract-pdf.ts`

- Create a singleton Tesseract worker at module level, reuse across OCR requests
- Avoids 2-3s worker initialization per request

```typescript
let workerPromise: Promise<Tesseract.Worker> | null = null;
async function getOcrWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) workerPromise = createWorker("eng");
  return workerPromise;
}
```

**7e — Cache AI client initialization:**

File: `artifacts/api-server/src/routes/generate.ts`

- Move `getAIClient()` result to module-level singleton
- Avoids re-checking 5 env vars and dynamic import on every request

**7f — Add timeout to AI API calls:**

File: `artifacts/api-server/src/routes/generate.ts`

- Add `timeout: 120_000` (2 min) to all `openai.chat.completions.create()` calls
- Prevents indefinite hangs from slow AI providers

---

## Implementation Order

| Step | Fix                               | Impact               | Risk                     | Files                                                |
| ---- | --------------------------------- | -------------------- | ------------------------ | ---------------------------------------------------- |
| 1    | Fix 2: DB transactions            | Prevents empty decks | Low — additive change    | `generate.ts`                                        |
| 2    | Fix 7a: ResponseCache cleanup     | Prevents memory leak | Low — additive           | `response-cache.ts`                                  |
| 3    | Fix 7b: Rate limiter cleanup      | Prevents memory leak | Low — additive           | `rate-limiter.ts`                                    |
| 4    | Fix 7c: Remove PDF buffer copy    | Halves PDF memory    | Low — single line        | `extract-pdf.ts`                                     |
| 5    | Fix 7d: Reuse Tesseract worker    | Faster OCR startup   | Low — singleton          | `extract-pdf.ts`                                     |
| 6    | Fix 7e: Cache AI client init      | Reduces overhead     | Low — module cache       | `generate.ts`                                        |
| 7    | Fix 7f: AI call timeouts          | Prevents hangs       | Low — additive           | `generate.ts`                                        |
| 8    | Fix 3: Eliminate preview→commit   | Prevents card loss   | Medium — removes feature | `generate.ts`, `generate-form.tsx`                   |
| 9    | Fix 1: SSE polling fallback       | Handles Render drops | Medium — new endpoint    | `generate.ts`, `generations.ts`, `generate-form.tsx` |
| 10   | Fix 4: Generation status tracking | Debuggability        | Low — additive           | `generate.ts`, `generations.ts`                      |
| 11   | Fix 5: Library refresh            | UX polish            | Low — frontend only      | `generate-sheet.tsx`, `decks.tsx`                    |
| 12   | Fix 6: Offline queue retry        | Reliability          | Low — isolated           | `offline-queue-provider.tsx`                         |

---

## Architecture Diagram

### Current Flow (Broken)

```
User → POST /generate/stream (SSE) → AI generates cards
  ├─ preview:true → cards NOT saved → frontend shows preview
  │   └─ User clicks Save → POST /generate/commit → cards saved
  │       └─ If commit fails → CARDS LOST ❌
  └─ preview:false → saveDeckAndCards() → deck + cards
      └─ If cards insert fails → EMPTY DECK ❌
      └─ If SSE drops → User doesn't get deck ID ❌
```

### Fixed Flow

```
User → POST /generate/stream (SSE) → AI generates cards
  └─ saveDeckAndCards() in TRANSACTION → deck + cards saved atomically ✅
      └─ SSE returns deck ID → frontend shows review modal
      └─ If SSE drops → frontend polls GET /generations/:id → gets deck ID ✅
          └─ Library auto-refreshes → deck visible ✅
```

---

## Testing Checklist

### Save-to-Library Tests

- [ ] Generate a single deck from text → verify deck appears in library
- [ ] Generate a single deck from PDF → verify deck appears in library
- [ ] Generate multiple decks at once → verify all appear in library
- [ ] Generate with SSE connection dropped mid-stream → verify polling recovers
- [ ] Generate with very large PDF (50+ pages) → verify no timeout
- [ ] Generate while offline → verify queue works and syncs when back online
- [ ] Generate, then immediately refresh page → verify deck persists
- [ ] Generate with invalid/very long card content → verify transaction rolls back (no empty deck)
- [ ] Open library tab after generation → verify new deck appears without manual refresh

### Performance Tests

- [ ] Generate 10 decks in sequence → verify generation time stays consistent (no degradation from 30s to 17min)
- [ ] Generate with a 100MB PDF → verify memory usage doesn't spike above 500MB
- [ ] Generate with a scanned PDF (OCR required) → verify OCR completes within reasonable time
- [ ] Run server for 24 hours with periodic generations → verify no memory leak (RSS stays stable)
- [ ] Generate after rate limiter has tracked 1000+ IPs → verify rate limiter map is cleaned up
- [ ] Generate same content twice → verify response cache hit (faster second generation)
- [ ] Generate with AI provider slow/unresponsive → verify 2min timeout triggers error
