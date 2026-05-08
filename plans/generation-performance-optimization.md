# Plan 1: Optimize Slow Generation for Decks, QBank, and MindMap

## Problem Analysis

The current generation flow has several performance bottlenecks:

### Current Architecture Issues

1. **Sequential chunk processing** — All three generation endpoints (`/generate/stream`, `/generate-qbank/stream`, `/mind-map`) process chunks **one at a time** in a `for` loop. For a 60-page PDF split into 10 chunks, this means 10 sequential API calls.

2. **No request parallelism** — Each chunk waits for the previous to complete before starting. With ~2-4s per AI call, 10 chunks = 20-40s minimum.

3. **Redundant AI client initialization** — `getAIClient()` dynamically imports the OpenAI module on every chunk iteration in `generateTextCards()` and `generateVisualCards()`.

4. **Fixed delays between chunks** — `setTimeout(r, 200)` and `setTimeout(r, 300)` add unnecessary 200-300ms per chunk.

5. **Mind map generation is fully sequential** — The `MindMapGallery` component processes card chunks one-by-one with no parallelism.

6. **No caching/reuse** — If a user regenerates with the same content, everything is re-computed from scratch.

7. **Visual card generation uses base64 data URLs** — Converting page images to data URLs for every request adds overhead.

---

## Optimization Plan

### Phase 1: Parallel Chunk Processing (High Impact)

**1.1 — Parallelize deck generation chunks**

- File: [`artifacts/api-server/src/routes/generate.ts`](../artifacts/api-server/src/routes/generate.ts)
- Change `generateTextCards()` from sequential `for` loop to `Promise.all()` with a concurrency limit (e.g., 3-4 parallel requests)
- Use a semaphore pattern: process chunks in batches of 3, wait for batch to complete, then process next batch
- This alone should reduce 10-chunk generation from ~30s to ~10-12s

```typescript
// Pattern: concurrency-limited parallel execution
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker),
  );
  return results;
}
```

**1.2 — Parallelize visual card generation**

- Same pattern for `generateVisualCards()` — process page images in parallel batches of 2-3
- Vision models are typically slower, so limit concurrency to 2

**1.3 — Parallelize QBank generation**

- File: [`artifacts/api-server/src/routes/generate.ts`](../artifacts/api-server/src/routes/generate.ts) (lines 656-820)
- Apply same concurrency pattern to the `generate-qbank/stream` endpoint

**1.4 — Parallelize mind map chunk generation**

- File: [`artifacts/anki-generator/src/components/mind-map-panel.tsx`](../artifacts/anki-generator/src/components/mind-map-panel.tsx) (lines 602-631)
- Change `generateMaps()` from sequential `for` loop to parallel batches of 2-3

### Phase 2: Eliminate Redundant Work (Medium Impact)

**2.1 — Move AI client initialization outside loops**

- In `generateTextCards()` (line 230) and `generateVisualCards()` (line 327), `getAIClient()` is called inside the function but should be called once and passed in
- In the stream endpoints, call `getAIClient()` once before the loop

**2.2 — Remove artificial delays between chunks**

- Remove or reduce the `setTimeout(r, 200)` and `setTimeout(r, 300)` delays between chunks
- These were likely added to avoid rate limiting, but with proper concurrency control they're unnecessary

**2.3 — Send SSE progress events more efficiently**

- Batch progress updates instead of sending one per chunk
- Send progress at most every 200ms to reduce SSE overhead

### Phase 3: Caching & Reuse (Medium Impact)

**3.1 — Add response caching for identical chunks**

- Cache AI responses keyed by content hash + model + prompt
- If the same text chunk is sent again (e.g., user regenerates), return cached result
- Use an in-memory LRU cache with TTL (e.g., 10 minutes)

**3.2 — Cache mind map results**

- If the same set of cards is sent for mind map generation, return the cached mind map
- Store cache keyed by sorted card IDs hash

### Phase 4: Streaming Improvements (Low-Medium Impact)

**4.1 — Stream partial results for deck generation**

- Instead of waiting for all chunks to complete before showing cards, emit cards as each chunk completes
- Modify the SSE protocol to include a `type: "partial_cards"` event with cards from completed chunks
- This improves perceived performance — users see cards appearing in real-time

**4.2 — Stream mind map results**

- Emit mind map data as each chunk completes rather than waiting for all chunks

### Phase 5: Model Optimization (Low Impact)

**5.1 — Use faster models for initial generation**

- Consider using a faster/cheaper model for the initial pass and a more detailed model for explanations
- The current `qwen3-coder:480b-cloud` is a very large model — consider `qwen3-coder:30b-cloud` or similar for card generation

**5.2 — Reduce max_tokens where possible**

- Visual card generation uses `max_tokens: 1024` which is reasonable
- Text card generation uses `max_tokens: 4000` — could be reduced to 2000 for most cards

---

## Implementation Order

| Step | Change                                      | Expected Impact           | Risk                 |
| ---- | ------------------------------------------- | ------------------------- | -------------------- |
| 1    | Parallel chunk processing (Phase 1)         | 3-4x speedup              | Medium — rate limits |
| 2    | Remove redundant AI client init (Phase 2.1) | ~200ms savings            | Low                  |
| 3    | Remove artificial delays (Phase 2.2)        | ~2s savings for 10 chunks | Low                  |
| 4    | Stream partial results (Phase 4)            | Better perceived perf     | Medium — SSE changes |
| 5    | Add caching (Phase 3)                       | Instant for repeats       | Low                  |
| 6    | Model optimization (Phase 5)                | Variable                  | Low                  |

---

## Files to Modify

1. [`artifacts/api-server/src/routes/generate.ts`](../artifacts/api-server/src/routes/generate.ts) — Main generation endpoint
2. [`artifacts/api-server/src/routes/mind-map.ts`](../artifacts/api-server/src/routes/mind-map.ts) — Mind map generation
3. [`artifacts/anki-generator/src/components/mind-map-panel.tsx`](../artifacts/anki-generator/src/components/mind-map-panel.tsx) — Mind map frontend
4. [`artifacts/anki-generator/src/components/generate-form.tsx`](../artifacts/anki-generator/src/components/generate-form.tsx) — Deck generation form (SSE handling)
5. [`artifacts/anki-generator/src/components/generate-qbank-form.tsx`](../artifacts/anki-generator/src/components/generate-qbank-form.tsx) — QBank generation form
