# Rate Limit Fix: Batch Everything Into 1 Request Per PDF

## Problem Analysis

The current architecture makes **N separate AI API calls per PDF** — one per text chunk, one per visual page, one per QBank chunk, one per explanation, one per card regenerate, one per mind map. For a typical 60-page PDF:

| Operation | Current API Calls |
|-----------|------------------|
| Text card generation | 5–15 (one per text chunk, already parallel) |
| Visual card generation | 5–20 (one per page image) |
| QBank generation | 5–15 (one per text chunk) |
| AI Explanation (per card) | 1 per card clicked |
| Card regenerate | 1 per card |
| Mind map generation | 1 per deck |

**Total: 50–200+ API calls per PDF workflow** → hits rate limits (429) on Ollama Cloud / OpenRouter free tiers.

The existing code already parallelized chunks and added caching, but the **fundamental problem remains**: each chunk/page/card is still a separate HTTP request to the AI provider.

---

## Solution: 1 PDF = 1 AI Request

### Core Principle

> **All content extraction, card generation, MCQ generation, and flashcard creation for a single PDF MUST happen in a single AI request.**

Instead of splitting text into chunks and calling AI for each chunk, we send the **entire extracted text** (or a large portion) in **one prompt** and ask the AI to generate **all cards at once**.

---

## Architecture Change

### Current (BAD) — 50–200 API calls

```
For each PDF:
  extract text
  split into chunks [c1, c2, c3, ... c10]
  for each chunk:
    call AI for flashcards        ← 10 calls
  for each page image:
    call AI for visual cards      ← 10 calls
  for each QBank chunk:
    call AI for MCQs             ← 10 calls
  for each card clicked:
    call AI for explanation       ← N calls
  for each card regenerated:
    call AI for new card         ← N calls
```

### Target (GOOD) — 1–3 API calls

```
For each PDF:
  extract text + page images
  call AI ONCE with full text → get ALL flashcards, MCQs, visual cards
  (optional) call AI for mind map → 2nd call
  (optional) call AI for batch explanations → 3rd call
```

---

## Implementation Plan

### Phase 1: Unified Generation Endpoint (Critical)

**Goal:** Replace per-chunk AI calls with a single AI call that generates all cards.

#### 1.1 — New Prompt: "Generate All Cards From Full Text"

Replace `buildTextCardPrompt()` (which targets a single chunk) with a new prompt that receives the **full extracted text** and generates all cards in one response.

```typescript
function buildUnifiedCardPrompt(
  fullText: string,
  targetCount: number,
  customPrompt?: string,
): { system: string; user: string } {
  return {
    system: `You are an expert medical educator and Anki flashcard creator.

Return ONLY a valid JSON object — no markdown fences, no explanation:
{
  "cards": [
    {
      "front": "Concise question or term (max 200 chars)",
      "back": "Answer with key details (max 500 chars)",
      "tags": "optional,comma,tags",
      "cardType": "basic",
      "pageNumber": null
    }
  ],
  "mcqs": [
    {
      "front": "Clinical vignette or direct question",
      "back": "Explanation of correct answer and why distractors are wrong",
      "choices": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "tags": "optional,tags",
      "pageNumber": null
    }
  ]
}

RULES:
- Generate exactly ${targetCount} flashcards AND ${Math.ceil(targetCount / 4)} MCQs
- Each card must cover one atomic fact, mechanism, or concept
- MCQs must be USMLE/professional exam style with clinical vignettes
- Focus on high-yield clinical facts, mechanisms, definitions, and exam pearls
- Do not repeat the same concept across cards
- Distribute cards across the entire source material (don't cluster on one section)`,

    user: `Generate ${targetCount} flashcards and ${Math.ceil(targetCount / 4)} MCQs from this medical text:\n\n${fullText}`,
  };
}
```

#### 1.2 — New Endpoint: `POST /api/generate/unified`

Replace the current `/api/generate/stream` with a unified endpoint that:

1. Receives the full extracted text (and optionally page images)
2. Makes **ONE** AI call to generate all cards
3. Optionally makes a **second** AI call to generate visual cards from page images
4. Returns everything in a single SSE stream

```typescript
router.post("/generate/unified", async (req, res) => {
  // 1. Extract text from PDF (already done client-side or in extract-pdf)
  // 2. Single AI call → all text cards + MCQs
  // 3. Optional: single AI call with ALL page images → all visual cards
  // 4. Save deck + cards
  // 5. Return result
});
```

#### 1.3 — Handle Large PDFs That Exceed Context Limits

For PDFs with text longer than the model's context window (~32K tokens):

```typescript
const MAX_CONTEXT_CHARS = 90_000; // ~30K tokens with safety margin

function prepareTextForUnifiedGeneration(
  fullText: string,
  targetCount: number,
): { text: string; isPartial: boolean } {
  if (fullText.length <= MAX_CONTEXT_CHARS) {
    return { text: fullText, isPartial: false };
  }

  // Strategy: Take first 30%, middle 30%, and last 40% of text
  // This captures intro, key middle content, and conclusion/management
  const third = Math.floor(MAX_CONTEXT_CHARS / 3);
  const first = fullText.slice(0, third);
  const midStart = Math.floor(fullText.length / 2) - Math.floor(third / 2);
  const mid = fullText.slice(midStart, midStart + third);
  const last = fullText.slice(-Math.floor(MAX_CONTEXT_CHARS * 0.4));

  return {
    text: `[BEGINNING]\n${first}\n\n[MIDDLE]\n${mid}\n\n[END]\n${last}`,
    isPartial: true,
  };
}
```

**Key insight:** Even with this sampling strategy, a single AI call over 90K chars will produce better, more diverse cards than 10 separate calls over 9K char chunks, because the AI sees the **entire document structure**.

#### 1.4 — Visual Cards: Batch All Pages Into One Request

Instead of one AI call per page image, send **all page images** in a single multimodal request:

```typescript
async function generateVisualCardsUnified(
  openai: OpenAIClient,
  pageImages: string[],
  customPrompt?: string,
): Promise<StagedCard[]> {
  const system = `You are a medical visual flashcard expert.
Review ALL page images and identify distinct visual elements (diagrams, charts, tables, anatomical illustrations, flowcharts, graphs).

Return ONLY a valid JSON array:
[{"front":"...","back":"...","bbox":[x,y,w,h],"pageNumber":N}]

Rules:
- Maximum 2 cards per page (only for pages with actual visual content)
- Skip pages that are pure text
- bbox: normalised 0-1, tight around the figure, max 0.7×0.7`;

  const content: Array<{ type: string; text?: string; image_url?: { url: string; detail: "low" } }> = [
    { type: "text", text: system },
  ];

  for (const base64 of pageImages) {
    const dataUrl = base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`;
    content.push({ type: "image_url", image_url: { url: dataUrl, detail: "low" } });
  }

  const completion = await openai.chat.completions.create({
    model: VISUAL_DETECTION_MODEL,
    messages: [{ role: "user", content }],
    max_tokens: 4000,
    temperature: 0.2,
  });

  // Parse all visual cards from single response
  return parseVisualCardsFromAI(completion.choices[0]?.message?.content ?? "");
}
```

**Note:** This only works if the vision model supports multiple images in one request. Most multimodal models (GPT-4V, Llama 4 Scout) support up to 20 images per request.

---

### Phase 2: Batch Explanations (High Impact)

**Goal:** Instead of 1 AI call per card explanation, batch multiple cards into a single explanation request.

#### 2.1 — New Endpoint: `POST /api/explain/batch`

```typescript
router.post("/explain/batch", async (req, res) => {
  // Input: array of { front, back, mode } for multiple cards
  // Output: single AI response with explanations for all cards

  const { cards, mode = "brief" } = req.body as {
    cards: Array<{ front: string; back: string }>;
    mode?: ExplainMode;
  };

  // Build a single prompt that explains all cards
  const system = buildBatchExplainSystemPrompt(mode);
  const user = cards
    .map((c, i) => `Card ${i + 1}:\nQ: ${c.front}\nA: ${c.back}`)
    .join("\n\n");

  // Single AI call → all explanations
  const completion = await openai.chat.completions.create({
    model: EXPLAIN_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 8000,
    temperature: 0.3,
  });

  // Parse and return structured explanations
  const explanations = parseBatchExplanations(completion.choices[0]?.message?.content ?? "");
  res.json({ explanations });
});
```

#### 2.2 — Frontend: Pre-fetch Explanations on Deck Load

Instead of calling `/api/explain` when a user clicks a card, **pre-fetch explanations for all visible cards** in a single batch call when the deck detail page loads:

```tsx
// In deck-detail.tsx
useEffect(() => {
  if (cards.length > 0) {
    // Batch-fetch brief explanations for all cards
    fetch(apiUrl("api/explain/batch"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cards: cards.map(c => ({ front: c.front, back: c.back })),
        mode: "brief",
      }),
    })
      .then(r => r.json())
      .then(data => {
        // Cache explanations keyed by card ID
        const map = new Map<number, string>();
        data.explanations.forEach((exp: string, i: number) => {
          map.set(cards[i].id, exp);
        });
        setExplanationCache(map);
      });
  }
}, [cards]);
```

---

### Phase 3: Batch Card Regeneration (Medium Impact)

**Goal:** When users regenerate cards, batch multiple regenerations into one call.

#### 3.1 — New Endpoint: `POST /api/cards/regenerate-batch`

```typescript
router.post("/cards/regenerate-batch", async (req, res) => {
  const { cardIds, deckId } = req.body as {
    cardIds: number[];
    deckId: number;
  };

  // Fetch all cards in one DB query
  const cardsToRegenerate = await db
    .select()
    .from(cardsTable)
    .where(inArray(cardsTable.id, cardIds));

  // Build single prompt with all cards
  const system = `You are an expert medical Anki card writer. Below are existing flashcards that need improvement.
For each card, generate a better version. Return a JSON array of improved cards:
[{"front":"...","back":"...","tags":"..."}]`;

  const user = cardsToRegenerate
    .map((c, i) => `Card ${i + 1} (current):\nQ: ${c.front}\nA: ${c.back}`)
    .join("\n\n");

  // Single AI call → all regenerated cards
  const completion = await openai.chat.completions.create({
    model: FREE_TEXT_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 4000,
    temperature: 0.3,
  });

  const improvedCards = parseCardsFromAI(completion.choices[0]?.message?.content ?? "");

  // Update all cards in DB
  for (let i = 0; i < improvedCards.length && i < cardsToRegenerate.length; i++) {
    await db
      .update(cardsTable)
      .set({
        front: improvedCards[i].front,
        back: improvedCards[i].back,
        tags: improvedCards[i].tags ?? null,
        updatedAt: new Date(),
      })
      .where(eq(cardsTable.id, cardsToRegenerate[i].id));
  }

  res.json({ regeneratedCount: improvedCards.length });
});
```

---

### Phase 4: QBank Generation — Single Request (High Impact)

**Goal:** Generate all MCQs for a QBank in a single AI call.

#### 4.1 — Modify `/api/generate-qbank/stream`

Replace the chunked approach with a single-call approach:

```typescript
// Before: split into chunks, call AI for each chunk
// After: send full text, get all MCQs in one response

const chunks = splitIntoChunks(text);  // REMOVE THIS
for (const chunk of chunks) {          // REMOVE THIS
  await callAI(chunk);                 // REMOVE THIS
}                                      // REMOVE THIS

// After:
const { system, user } = buildUnifiedQBankPrompt(text, targetQuestions);
const completion = await openai.chat.completions.create({
  model: QBANK_MODEL,
  messages: [
    { role: "system", content: system },
    { role: "user", content: user },
  ],
  max_tokens: 8000,
  temperature: 0.3,
});
const allQuestions = parseCardsFromAI(completion.choices[0]?.message?.content ?? "");
```

---

### Phase 5: Frontend Changes

#### 5.1 — Update `generate-form.tsx`

Replace the SSE stream handler to work with the new unified endpoint:

```typescript
// Before: sends text chunks separately
// After: sends full text in one request

fetch(apiUrl("api/generate/unified"), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: fullText,           // Full extracted text, not chunked
    deckName,
    cardCount: targetCount,
    pageImages,               // All page images at once
    deckType,
    customPrompt,
  }),
});
```

#### 5.2 — Update `generate-qbank-form.tsx`

Same pattern — send full text instead of chunks.

#### 5.3 — Update `deck-detail.tsx`

Replace per-card explanation calls with batch pre-fetching.

---

## API Call Reduction Summary

| Operation | Before (calls/PDF) | After (calls/PDF) | Reduction |
|-----------|-------------------|-------------------|-----------|
| Text card generation | 5–15 | **1** | 90–93% |
| Visual card generation | 5–20 | **1** | 95–95% |
| QBank generation | 5–15 | **1** | 90–93% |
| Explanations (20 cards) | 20 | **1** | 95% |
| Card regenerations (5 cards) | 5 | **1** | 80% |
| Mind map | 1 | **1** | 0% |
| **TOTAL** | **41–76** | **6** | **~90%** |

---

## Files to Modify

### Backend

| File | Change |
|------|--------|
| `artifacts/api-server/src/routes/generate.ts` | Replace chunked generation with unified single-call approach |
| `artifacts/api-server/src/routes/explain.ts` | Add `/explain/batch` endpoint |
| `artifacts/api-server/src/routes/cards.ts` | Add `/cards/regenerate-batch` endpoint |
| `artifacts/api-server/src/lib/models.ts` | Increase `max_tokens` defaults for larger responses |

### Frontend

| File | Change |
|------|--------|
| `artifacts/anki-generator/src/components/generate-form.tsx` | Use new unified endpoint |
| `artifacts/anki-generator/src/components/generate-qbank-form.tsx` | Use new unified endpoint |
| `artifacts/anki-generator/src/pages/deck-detail.tsx` | Batch explanation pre-fetching |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Context window too small for full PDF text | Use text sampling strategy (first/middle/last) for large PDFs |
| Single response too large for `max_tokens` | Increase to 8000–16000 tokens; use JSON array streaming |
| Vision model can't handle 20+ images at once | Limit to 10 images per call; make 2 calls if needed |
| Quality loss from single-pass generation | The AI sees the full document context — quality should **improve** |
| Longer single request timeout | Set HTTP timeout to 120s; show progress via SSE heartbeat |

---

## Implementation Order

| Step | Change | Impact | Risk |
|------|--------|--------|------|
| 1 | Unified text card generation (Phase 1) | 90% reduction in card gen calls | Medium — context limits |
| 2 | Unified visual card generation (Phase 1.4) | 95% reduction in visual calls | Low |
| 3 | Unified QBank generation (Phase 4) | 90% reduction in QBank calls | Low |
| 4 | Batch explanations (Phase 2) | 95% reduction in explanation calls | Low |
| 5 | Batch card regeneration (Phase 3) | 80% reduction in regen calls | Low |
| 6 | Frontend updates (Phase 5) | All of the above | Medium — SSE changes |
