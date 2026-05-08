# Unified Project Improvement Plan
## AI-Powered Performance & UX Overhaul

---

## Executive Summary

This plan combines and extends two existing plans ([Generation Performance Optimization](../plans/generation-performance-optimization.md) and [AI Explanation UI Enhancement](../plans/ai-explanation-ui-enhancement.md)) with additional frontend rendering optimizations identified from a full codebase review.

**Goals:**
1. **3-4x faster AI generation** — parallel chunk processing, eliminated redundant work, faster models
2. **Instant perceived performance** — streaming partial results, skeleton states, optimistic UI
3. **Beautiful AI explanation UX** — section-based rendering, immersive view, TTS
4. **Faster website rendering** — code splitting, preconnect hints, optimized build, reduced bundle

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vite + React)                      │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │ GenerateForm  │  │  StudyMode   │  │  MindMap Panel            │ │
│  │ ─ SSE stream  │  │ ─ Explain    │  │ ─ Parallel chunk gen      │ │
│  │ ─ Parallel    │  │ ─ Section    │  │ ─ Streaming results       │ │
│  │   file gen    │  │   rendering  │  │                           │ │
│  └──────┬───────┘  └──────┬───────┘  └─────────────┬─────────────┘ │
│         │                 │                         │               │
│         └────────────┬────┴─────────────────────────┘               │
│                      │ SSE / HTTP                                    │
└──────────────────────┼──────────────────────────────────────────────┘
                       │
┌──────────────────────┼──────────────────────────────────────────────┐
│                 BACKEND (Express)                                    │
│                      │                                              │
│  ┌───────────────────┴───────────────────────────────────────────┐  │
│  │                    API Router                                   │  │
│  │  ┌─────────────┐ ┌──────────────┐ ┌────────────┐ ┌─────────┐ │  │
│  │  │/generate/*  │ │/explain      │ │/mind-map   │ │/qbank/* │ │  │
│  │  │─ Parallel   │ │─ SSE stream  │ │─ Parallel  │ │─Parallel│ │  │
│  │  │  chunks     │ │─ Section     │ │  chunks    │ │ chunks  │ │  │
│  │  │─ Partial    │ │  markers     │ │            │ │         │ │  │
│  │  │  SSE events │ │              │ │            │ │         │ │  │
│  │  └─────────────┘ └──────────────┘ └────────────┘ └─────────┘ │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Shared: AI Client (cached init) + LRU Response Cache         │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Backend Generation Speed (High Impact)

### 1.1 — Parallel Chunk Processing

**Files:** [`artifacts/api-server/src/routes/generate.ts`](../artifacts/api-server/src/routes/generate.ts)

**Problem:** `generateTextCards()` and `generateVisualCards()` process chunks sequentially in a `for` loop. For 10 chunks at 3s each = 30s.

**Solution:** Add a concurrency-limited parallel executor and apply it to all generation functions.

```typescript
// New utility — add to generate.ts or a shared lib
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
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

**Changes per function:**

| Function | Concurrency Limit | Expected Speedup |
|----------|------------------|-----------------|
| `generateTextCards()` | 4 | ~3-4x |
| `generateVisualCards()` | 2 | ~2x |
| QBank chunk loop | 3 | ~3x |

**Implementation:**
- Replace `for` loops with `runWithChunks()` using the pattern above
- Each chunk's SSE progress event fires as it completes (not in order)
- Track completed count for accurate progress percentage

### 1.2 — Cache AI Client Initialization

**Problem:** `getAIClient()` dynamically imports `@workspace/integrations-openai-ai-server` on every call. In `generateTextCards()` and `generateVisualCards()`, this is called inside the function body (once per invocation, but still redundant).

**Solution:** Initialize the AI client once at the top of each route handler and pass it down.

```typescript
// In each route handler:
const { openai, getFallbackOpenAI, FALLBACK_MODEL } = await getAIClient();
// Pass to generateTextCards(openai, getFallbackOpenAI, FALLBACK_MODEL, ...)
```

### 1.3 — Remove Artificial Delays

**Problem:** `setTimeout(r, 200)` in text generation and `setTimeout(r, 300)` in visual generation add 200-300ms per chunk. For 10 chunks = 2-3s wasted.

**Solution:** Remove these delays entirely. The concurrency limiter in 1.1 already prevents rate-limit issues.

### 1.4 — Add In-Memory Response Cache

**Problem:** Regenerating the same content re-computes everything from scratch.

**Solution:** Add an LRU cache keyed by `hash(content + model + prompt)`.

```typescript
// Simple LRU cache for AI responses
class ResponseCache {
  private cache = new Map<string, { result: string; expires: number }>();
  constructor(private maxSize = 100, private ttlMs = 600_000) {}

  get(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) { this.cache.delete(key); return undefined; }
    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.result;
  }

  set(key: string, result: string) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { result, expires: Date.now() + this.ttlMs });
  }
}
```

**Apply to:** `generateTextCards()`, `generateVisualCards()`, QBank generation, mind map generation.

### 1.5 — Stream Partial Results via SSE

**Problem:** Users see no cards until ALL chunks complete. For 10 chunks, this means waiting 30s+ with only a progress bar.

**Solution:** Emit `type: "partial_cards"` SSE events as each chunk completes.

```typescript
// SSE event types:
// { type: "progress", percent, message }
// { type: "partial_cards", cards: [...], chunkIndex }  ← NEW
// { type: "done", generatedCount, deck }
// { type: "error", message }
```

**Backend changes:**
- In `generateTextCards()`, emit SSE event after each chunk with the new cards
- In the main route handler, forward these to the client

### 1.6 — Use Faster Models for Generation

**Problem:** `qwen3-coder:480b-cloud` is used for all text generation. It's a 480B parameter model — very high quality but slow.

**Solution:** Use tiered model strategy:

| Task | Current Model | Proposed Model | Reason |
|------|--------------|----------------|--------|
| Card generation | `qwen3-coder:480b-cloud` | `qwen3-coder:30b-cloud` | 16x smaller, much faster, still excellent |
| AI Explanation | `qwen3-coder:480b-cloud` | `qwen3-coder:480b-cloud` | Keep — quality matters more here |
| QBank | `gpt-oss:120b-cloud` | `gpt-oss:120b-cloud` | Keep — MCQ quality critical |
| Mind Map | `gpt-oss:120b-cloud` | `gpt-oss:120b-cloud` | Keep — small output, quality matters |
| Visual detection | `qwen3-vl:235b-cloud` | `qwen3-vl:235b-cloud` | Keep — vision quality critical |

**Change:** Update `render.yaml` and `.env.example` default for `AI_TEXT_MODEL`.

---

## Phase 2: Frontend Rendering Speed (High Impact)

### 2.1 — Code Splitting & Lazy Loading

**Problem:** The entire frontend is a single bundle. `deck-detail.tsx` is 2253 lines with heavy dependencies (framer-motion, react-markdown, canvas-confetti, etc.) loaded upfront.

**Solution:** Lazy-load heavy routes and components.

```tsx
// In App.tsx — wrap heavy pages in lazy + Suspense
import { lazy, Suspense } from "react";

const DeckDetail = lazy(() => import("@/pages/deck-detail"));
const Generate = lazy(() => import("@/pages/generate"));
const Practice = lazy(() => import("@/pages/practice"));

// In routes:
<Route path="/decks/:id" component={() => (
  <Suspense fallback={<PageSkeleton />}>
    <DeckDetail />
  </Suspense>
)} />
```

**Also lazy-load:**
- `MindMapGallery` component (heavy SVG generation)
- `StudyMode` component (only loaded when user enters study mode)
- `react-markdown` (only needed in explanation view)

### 2.2 — Optimize index.html Loading

**File:** [`artifacts/anki-generator/index.html`](../artifacts/anki-generator/index.html)

**Current issues:**
- Google Fonts loaded via two `<link>` tags + CSS import — blocks rendering
- No resource preconnect for API server
- No preload for critical assets

**Solution:**

```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Anki Card Generator</title>

  <!-- Preconnect to critical origins -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="preconnect" href="/api" />

  <!-- Preload critical font (only the weights we actually use) -->
  <link rel="preload" as="style"
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
  <link rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
    media="print" onload="this.media='all'" />
  <noscript>
    <link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
  </noscript>

  <!-- DNS prefetch for AI provider -->
  <link rel="dns-prefetch" href="https://ollama.com" />
  <link rel="dns-prefetch" href="https://openrouter.ai" />

  <meta name="theme-color" content="#0a0f0a" />
  <!-- ... rest of meta tags ... -->
</head>
```

### 2.3 — Vite Build Optimizations

**File:** [`artifacts/anki-generator/vite.config.ts`](../artifacts/anki-generator/vite.config.ts)

**Add:**

```typescript
build: {
  outDir: path.resolve(import.meta.dirname, "dist/public"),
  emptyOutDir: true,
  // Enable better chunk splitting
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom'],
        'vendor-motion': ['framer-motion'],
        'vendor-markdown': ['react-markdown', 'remark-gfm'],
        'vendor-query': ['@tanstack/react-query'],
      },
    },
  },
  // Enable compression reporting
  reportCompressedSize: true,
  // Target modern browsers for smaller output
  target: 'es2022',
},
```

### 2.4 — Add Aggressive Static Caching Headers

**File:** [`artifacts/api-server/src/app.ts`](../artifacts/api-server/src/app.ts)

**Problem:** Static assets cached for only 1 hour with no immutable hashing.

**Solution:**

```typescript
app.use(
  express.static(staticDir, {
    index: false,
    maxAge: "1y",  // Hash-based filenames allow long cache
    immutable: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      } else {
        // JS/CSS with hashed filenames — cache forever
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }),
);
```

### 2.5 — Optimize React Query Configuration

**File:** [`artifacts/anki-generator/src/App.tsx`](../artifacts/anki-generator/src/App.tsx)

**Current:** `staleTime: 5 minutes`, `gcTime: 1 week`, retry up to 2 times.

**Improvements:**

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: ONE_WEEK,
      staleTime: 1000 * 60 * 30,  // 30 min — decks don't change often
      retry: (failureCount, err) => {
        if (typeof navigator !== "undefined" && !navigator.onLine) return false;
        if (err instanceof Response && err.status === 404) return false;
        return failureCount < 2;
      },
      networkMode: "offlineFirst",
      // Don't refetch on window focus — reduces API calls
      refetchOnWindowFocus: false,
    },
    mutations: {
      networkMode: "offlineFirst",
    },
  },
});
```

---

## Phase 3: AI Explanation UX Overhaul (Medium-High Impact)

### 3.1 — Replace Word-by-Word Animation with Natural Streaming

**File:** [`artifacts/anki-generator/src/pages/deck-detail.tsx`](../artifacts/anki-generator/src/pages/deck-detail.tsx) (lines 325-420)

**Problem:** Word-by-word reveal at 20ms/word means a 500-word explanation takes 10+ seconds to fully appear. The `setInterval` approach is janky and blocks the main thread.

**Solution:** Render text in natural chunks as they arrive from the SSE stream. Remove `revealTimerRef` entirely.

```tsx
// Simplified streaming — no interval needed
const handleExplain = useCallback(async (mode: ExplainMode) => {
  // ... setup ...
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    accumulated += decoder.decode(value, { stream: true });
    setDisplayText(accumulated);  // React batches this naturally
  }
  // Record history when done
  setExplainHistory(prev => [{ mode, text: accumulated }, ...prev.slice(0, 4)]);
  setIsExplaining(false);
}, [current]);
```

### 3.2 — Section-Based Rendering for Explanations

**Problem:** All explanation modes render as a single `ReactMarkdown` block. No visual hierarchy.

**Solution:** Parse markdown sections (## headings) and render each as a distinct animated card.

**New file:** `artifacts/anki-generator/src/lib/explain-sections.ts`

```typescript
export interface ExplainSection {
  title: string;
  content: string;
  icon: string;
  color: string;
}

export function parseSections(markdown: string): ExplainSection[] {
  const sections: ExplainSection[] = [];
  const parts = markdown.split(/^##\s+/m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const [titleLine, ...rest] = part.split("\n");
    const title = titleLine.trim();
    const content = rest.join("\n").trim();
    sections.push({
      title,
      content,
      icon: SECTION_ICONS[title] ?? "📄",
      color: SECTION_COLORS[title] ?? "gray",
    });
  }
  return sections;
}

const SECTION_ICONS: Record<string, string> = {
  "Definition": "📖",
  "Epidemiology": "📊",
  "Etiology & Risk Factors": "🔀",
  "Pathophysiology": "🔬",
  "Clinical presentation": "🏥",
  "Diagnosis": "🔍",
  "Management": "💊",
  "Prognosis": "📈",
  "High-yield exam pearls": "⚡",
  "Mnemonic": "💡",
  "OSCE": "🩺",
};

const SECTION_COLORS: Record<string, string> = {
  "Definition": "blue",
  "Epidemiology": "purple",
  "Pathophysiology": "rose",
  "Clinical presentation": "emerald",
  "Diagnosis": "sky",
  "Management": "teal",
  "Prognosis": "green",
  "High-yield exam pearls": "yellow",
};
```

**New file:** `artifacts/anki-generator/src/components/explanation-section.tsx`

```tsx
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ExplainSection } from "@/lib/explain-sections";

export function ExplanationSectionCard({
  section,
  index,
  isStreaming,
}: {
  section: ExplainSection;
  index: number;
  isStreaming: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={`rounded-xl border border-${section.color}-200/60 bg-${section.color}-50/30 overflow-hidden mb-3`}
    >
      <div className={`flex items-center gap-2 px-4 py-2 bg-${section.color}-100/40`}>
        <span className="text-base">{section.icon}</span>
        <span className="text-sm font-semibold">{section.title}</span>
      </div>
      <div className="px-4 py-3 prose prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {section.content}
        </ReactMarkdown>
      </div>
    </motion.div>
  );
}
```

### 3.3 — Immersive Full-Screen Explanation View

**Problem:** Bottom drawer (`vaul` Drawer) feels disconnected and limits content visibility.

**Solution:** Replace with a full-screen overlay with animated entrance.

**New file:** `artifacts/anki-generator/src/components/explanation-view.tsx`

```tsx
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, BookmarkPlus, Loader2 } from "lucide-react";
import { ExplanationSectionCard } from "./explanation-section";
import { parseSections } from "@/lib/explain-sections";

export function ExplanationView({
  text,
  mode,
  isStreaming,
  onClose,
  onSwitchMode,
}: {
  text: string;
  mode: string;
  isStreaming: boolean;
  onClose: () => void;
  onSwitchMode: (mode: string) => void;
}) {
  const sections = parseSections(text);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b px-4 py-3 flex items-center justify-between">
        <h2 className="font-semibold text-lg">{mode}</h2>
        <div className="flex items-center gap-2">
          {isStreaming && <Loader2 className="h-4 w-4 animate-spin" />}
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {sections.map((section, i) => (
          <ExplanationSectionCard
            key={`${section.title}-${i}`}
            section={section}
            index={i}
            isStreaming={isStreaming && i === sections.length - 1}
          />
        ))}

        {isStreaming && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm mt-4">
            <Loader2 className="h-3 w-3 animate-spin" />
            Generating more…
          </div>
        )}
      </div>
    </motion.div>
  );
}
```

### 3.4 — Skeleton Loading States

**Problem:** During streaming, users see either a spinner or blank content.

**Solution:** Show skeleton section cards for expected sections while streaming.

```tsx
const EXPECTED_SECTIONS = ["Definition", "Epidemiology", "Pathophysiology", "Clinical", "Management"];

function ExplanationSkeleton() {
  return (
    <div className="space-y-3">
      {EXPECTED_SECTIONS.map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.1 }}
          className="rounded-xl border border-border/30 overflow-hidden"
        >
          <div className="h-10 bg-muted/50" />
          <div className="p-4 space-y-2">
            <div className="h-3 bg-muted/30 rounded w-3/4" />
            <div className="h-3 bg-muted/30 rounded w-1/2" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
```

### 3.5 — Text-to-Speech for Live Explanation

**Solution:** Add Web Speech API integration for reading explanations aloud.

**New file:** `artifacts/anki-generator/src/hooks/use-text-to-speech.ts`

```tsx
import { useState, useRef, useCallback, useEffect } from "react";

export function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => { setIsSpeaking(false); setIsPaused(false); };
    utterance.onerror = () => { setIsSpeaking(false); setIsPaused(false); };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [rate]);

  const pause = useCallback(() => {
    if (isSpeaking && !isPaused) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, [isSpeaking, isPaused]);

  const resume = useCallback(() => {
    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, [isPaused]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  }, []);

  useEffect(() => () => { window.speechSynthesis.cancel(); }, []);

  return { speak, pause, resume, stop, isSpeaking, isPaused, rate, setRate };
}
```

---

## Phase 4: Mind Map Generation Speed (Medium Impact)

### 4.1 — Parallel Mind Map Chunk Processing

**File:** [`artifacts/anki-generator/src/components/mind-map-panel.tsx`](../artifacts/anki-generator/src/components/mind-map-panel.tsx)

**Problem:** `generateMaps()` processes card chunks sequentially.

**Solution:** Apply the same concurrency pattern as deck generation (batches of 2-3).

### 4.2 — Stream Mind Map Results

**Problem:** Mind map generation waits for all chunks before showing anything.

**Solution:** Emit partial mind map data as each chunk completes, merging on the client.

---

## Phase 5: Build & Deployment Optimizations (Low-Medium Impact)

### 5.1 — Docker Multi-Stage Build Optimization

**File:** [`Dockerfile`](../Dockerfile)

**Current issues:**
- `pnpm install --frozen-lockfile=false` disables lockfile caching
- No `.dockerignore` optimization
- Production dependencies include dev tooling

**Improvements:**
- Use `frozen-lockfile=true` in CI/production
- Add `.dockerignore` for `node_modules`, `.git`, etc.
- Prune dev dependencies more aggressively

### 5.2 — Add Compression Middleware

**File:** [`artifacts/api-server/src/app.ts`](../artifacts/api-server/src/app.ts)

Add `compression` middleware for JSON responses:

```typescript
import compression from "compression";
app.use(compression({ filter: (req, res) => {
  if (req.headers["x-no-compression"]) return false;
  return compression.filter(req, res);
}}));
```

### 5.3 — Add ETags for API Responses

For deck/card list endpoints that are queried frequently:

```typescript
import etag from "etag";

// In route handlers for GET /api/decards/:id/cards
const data = await getCards(deckId);
res.setHeader("ETag", etag(JSON.stringify(data)));
res.json(data);
```

---

## Implementation Order

| Step | Change | Impact | Risk | Phase |
|------|--------|--------|------|-------|
| 1 | Remove artificial delays (200-300ms) | ~2s savings per 10 chunks | Low | 1.3 |
| 2 | Cache AI client initialization | ~200ms savings | Low | 1.2 |
| 3 | Parallel chunk processing (backend) | 3-4x speedup | Medium — rate limits | 1.1 |
| 4 | Use faster model for card generation | 2-3x speedup | Low — quality check | 1.6 |
| 5 | Stream partial SSE results | Better perceived perf | Medium — SSE changes | 1.5 |
| 6 | Add response caching (LRU) | Instant for repeats | Low | 1.4 |
| 7 | Code splitting + lazy loading | Faster initial paint | Low | 2.1 |
| 8 | Optimize index.html (preconnect, preload) | Faster FCP | Low | 2.2 |
| 9 | Vite build optimizations | Smaller bundle | Low | 2.3 |
| 10 | Static caching headers | Faster repeat visits | Low | 2.4 |
| 11 | React Query tuning | Fewer API calls | Low | 2.5 |
| 12 | Replace word-by-word with natural streaming | Smoother UX | Low | 3.1 |
| 13 | Section-based rendering | Major visual improvement | Medium | 3.2 |
| 14 | Full-screen explanation view | Immersive UX | Medium | 3.3 |
| 15 | Skeleton loading states | Better perceived perf | Low | 3.4 |
| 16 | Text-to-speech | Accessibility + "live" feel | Low | 3.5 |
| 17 | Parallel mind map generation | 2-3x speedup | Low | 4.1 |
| 18 | Compression middleware | Smaller responses | Low | 5.2 |
| 19 | Docker build optimization | Faster deploys | Low | 5.1 |

---

## Files to Modify

### Backend
1. [`artifacts/api-server/src/routes/generate.ts`](../artifacts/api-server/src/routes/generate.ts) — Parallel processing, partial SSE, caching
2. [`artifacts/api-server/src/routes/mind-map.ts`](../artifacts/api-server/src/routes/mind-map.ts) — Parallel processing
3. [`artifacts/api-server/src/routes/explain.ts`](../artifacts/api-server/src/routes/explain.ts) — Section markers in stream
4. [`artifacts/api-server/src/app.ts`](../artifacts/api-server/src/app.ts) — Compression, caching headers
5. [`artifacts/api-server/src/lib/models.ts`](../artifacts/api-server/src/lib/models.ts) — Faster default text model

### Frontend
6. [`artifacts/anki-generator/src/App.tsx`](../artifacts/anki-generator/src/App.tsx) — Code splitting, query tuning
7. [`artifacts/anki-generator/index.html`](../artifacts/anki-generator/index.html) — Preconnect, preload
8. [`artifacts/anki-generator/vite.config.ts`](../artifacts/anki-generator/vite.config.ts) — Build optimizations
9. [`artifacts/anki-generator/src/pages/deck-detail.tsx`](../artifacts/anki-generator/src/pages/deck-detail.tsx) — Streaming, section rendering, TTS
10. [`artifacts/anki-generator/src/components/generate-form.tsx`](../artifacts/anki-generator/src/components/generate-form.tsx) — Handle partial SSE events
11. [`artifacts/anki-generator/src/components/mind-map-panel.tsx`](../artifacts/anki-generator/src/components/mind-map-panel.tsx) — Parallel generation

### Config
12. [`render.yaml`](../render.yaml) — Faster default model
13. [`Dockerfile`](../Dockerfile) — Build optimizations

### New Files
14. `artifacts/anki-generator/src/lib/explain-sections.ts` — Section parsing
15. `artifacts/anki-generator/src/components/explanation-section.tsx` — Section card component
16. `artifacts/anki-generator/src/components/explanation-view.tsx` — Full-screen overlay
17. `artifacts/anki-generator/src/components/explanation-skeleton.tsx` — Skeleton loading
18. `artifacts/anki-generator/src/hooks/use-text-to-speech.ts` — TTS hook
19. `artifacts/api-server/src/lib/response-cache.ts` — LRU cache

---

## Expected Outcomes

| Metric | Before | After |
|--------|--------|-------|
| 10-chunk deck generation | ~30-40s | ~8-12s |
| QBank generation (10 chunks) | ~30s | ~10s |
| Mind map generation | ~15s | ~5s |
| Repeat generation (cached) | Same as first | <1s |
| First Contentful Paint | ~2.5s | ~1.2s |
| Time to Interactive | ~4s | ~2s |
| AI Explanation appearance | 10s word-by-word | Instant streaming |
| Bundle size (gzipped) | ~450KB | ~300KB (split) |
