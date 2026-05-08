# Plan 2: Enhance AI Explanation — Attractive, Animated, Live Explanation

## Problem Analysis

The current AI Explanation feature in the study mode drawer is functional but visually basic:

### Current State

- **File**: [`artifacts/anki-generator/src/pages/deck-detail.tsx`](../artifacts/anki-generator/src/pages/deck-detail.tsx) (lines 1065-1396)
- Uses a bottom drawer (`vaul` Drawer) for displaying explanations
- Word-by-word reveal animation (20ms per word) — feels slow and mechanical
- Plain `ReactMarkdown` rendering with basic prose styling
- Brief mode has a custom `BriefBreakdownView` component with decent styling
- History navigation via chips and swipe gestures
- Copy and save-to-notes functionality exists

### Pain Points

1. **Word-by-word animation is too slow** — 20ms per word means a 500-word explanation takes 10+ seconds to fully appear
2. **No visual hierarchy or rich formatting** — Sections blend together in markdown
3. **No progressive section reveal** — All content appears as a wall of text
4. **Drawer feels disconnected** — It's a bottom sheet that covers content, not an immersive experience
5. **No visual feedback during streaming** — Just a spinner and "Generating…" text
6. **Brief mode is the only mode with custom rendering** — All other modes use generic markdown
7. **No interactive elements** — No expandable sections, no highlighting, no visual anchors
8. **No audio/text-to-speech** — "Live explanation" implies voice narration

---

## Enhancement Plan

### Phase 1: Replace Word-by-Word with Smooth Streaming Animation

**1.1 — Replace word-by-word reveal with chunked streaming**

- Instead of revealing word-by-word at 20ms intervals, render the streamed text in natural chunks as they arrive from the SSE stream
- Use a smooth fade-in animation for new paragraphs as they appear
- Remove the `revealTimerRef` interval-based approach entirely

**1.2 — Add typing cursor indicator**

- Show a blinking cursor at the end of the streaming text
- Cursor disappears when streaming completes
- Use a styled cursor that matches the theme (e.g., a vertical bar with gradient)

```tsx
// Blinking cursor component
function StreamingCursor() {
  return (
    <span className="inline-block w-[2px] h-[1.1em] bg-gradient-to-b from-violet-500 to-purple-600 ml-0.5 rounded-sm animate-pulse align-middle" />
  );
}
```

### Phase 2: Rich Section-Based Rendering

**2.1 — Parse and render markdown sections as distinct cards**

- Parse the streamed markdown into sections (## headings) as they arrive
- Each section renders as a separate animated card with:
  - Section icon (based on content type: 📊 for Epidemiology, 🔬 for Pathophysiology, etc.)
  - Collapsible/expandable body
  - Staggered entrance animation

**2.2 — Create a section registry for medical content**

```tsx
const SECTION_CONFIG: Record<
  string,
  { icon: React.ReactNode; color: string; label: string }
> = {
  Definition: { icon: <BookOpen />, color: "blue", label: "Definition" },
  Epidemiology: { icon: <BarChart2 />, color: "purple", label: "Epidemiology" },
  Etiology: {
    icon: <GitBranch />,
    color: "amber",
    label: "Etiology & Risk Factors",
  },
  Pathophysiology: {
    icon: <Activity />,
    color: "rose",
    label: "Pathophysiology",
  },
  Clinical: {
    icon: <Stethoscope />,
    color: "emerald",
    label: "Clinical Presentation",
  },
  Diagnosis: { icon: <Search />, color: "sky", label: "Diagnostic Approach" },
  Management: { icon: <Pill />, color: "teal", label: "Management" },
  Prognosis: { icon: <TrendingUp />, color: "green", label: "Prognosis" },
  "Exam Pearls": {
    icon: <Star />,
    color: "yellow",
    label: "High-Yield Exam Pearls",
  },
  Mnemonic: { icon: <Lightbulb />, color: "amber", label: "Mnemonic" },
  OSCE: { icon: <Clipboard />, color: "violet", label: "OSCE Station" },
};
```

**2.3 — Section card component with animations**

```tsx
function ExplanationSection({
  title,
  children,
  index,
  isStreaming,
}: {
  title: string;
  children: React.ReactNode;
  index: number;
  isStreaming: boolean;
}) {
  const config = SECTION_CONFIG[title] || {
    icon: <FileText />,
    color: "gray",
    label: title,
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: index * 0.06,
        type: "spring",
        stiffness: 300,
        damping: 26,
      }}
      className={`rounded-xl border border-${config.color}-200/60 bg-${config.color}-50/30 overflow-hidden`}
    >
      <div
        className={`flex items-center gap-2 px-4 py-2.5 bg-${config.color}-100/40 border-b border-${config.color}-200/40`}
      >
        <config.icon className="h-4 w-4 text-{config.color}-600" />
        <span className="text-sm font-semibold text-{config.color}-800">
          {config.label}
        </span>
      </div>
      <div className="px-4 py-3 prose prose-sm max-w-none">{children}</div>
    </motion.div>
  );
}
```

### Phase 3: Immersive Full-Screen Explanation View

**3.1 — Replace bottom drawer with a full-screen overlay**

- Use a full-screen modal/overlay instead of a bottom drawer
- Animated entrance: scale up from the card position with a spring transition
- Background: blurred card content with a gradient overlay
- This creates a more immersive "study mode" feel

**3.2 — Add a progress indicator for streaming**

- Show a progress bar at the top that fills as more content streams in
- Display word count and estimated reading time
- Show which section is currently being generated

**3.3 — Add a table of contents sidebar**

- As sections stream in, build a TOC on the left side
- Clicking a TOC item scrolls to that section
- Active section is highlighted
- Only visible on wider screens (responsive)

### Phase 4: Live Explanation with Text-to-Speech

**4.1 — Add text-to-speech for the explanation**

- Use the Web Speech API (`SpeechSynthesisUtterance`) for live narration
- Start reading each section as it completes streaming
- Add play/pause/stop controls in the header
- Highlight the currently spoken sentence
- Allow speed control (0.5x, 1x, 1.5x, 2x)

**4.2 — Visual audio indicator**

- Show an animated waveform or pulsing icon when TTS is active
- Sync the highlight with the speech position using `onboundary` events

### Phase 5: Enhanced Mode-Specific Rendering

**5.1 — Revision Sheet mode — Tabbed layout**

- Render as a tabbed interface: Key Facts | Pathophysiology | Clinical | Investigations | Management | Pearls
- Each tab is a compact, scannable card
- Add a "print-friendly" button

**5.2 — OSCE mode — Station cards**

- Each OSCE station renders as a card with:
  - Station type badge (History Taking, Physical Exam, etc.)
  - Scenario vignette in a highlighted box
  - Expandable mark scheme
  - Common mistakes section
- Add a "practice timer" for each station

**5.3 — Mnemonic mode — Visual mnemonic display**

- Large, centered mnemonic text with decorative styling
- Animated reveal of each letter's meaning
- Memory hook as a visual story card
- Add a "copy mnemonic" button

**5.4 — Clinical Pearls mode — Case vignette layout**

- Clinical presentation as a simulated patient card
- Step-by-step decision flowchart
- Pitfalls as warning callouts
- Guideline snapshot as an info box

### Phase 6: Visual Polish & Micro-interactions

**6.1 — Animated background for the explanation view**

- Subtle animated gradient orbs that match the mode color
- Floating particles that respond to scroll position
- Very subtle — should not distract from content

**6.2 — Smooth scroll animations**

- Sections smoothly scroll into view as they appear
- Use `scroll-behavior: smooth` and `IntersectionObserver` for reveal-on-scroll

**6.3 — Interactive elements**

- **Highlight on hover**: Key terms get a subtle highlight on hover
- **Sticky section headers**: Section headers stick to the top as you scroll
- **Back-to-top button**: Appears after scrolling down
- **Reading progress**: A thin progress bar at the very top

**6.4 — Skeleton loading states**

- Show animated skeleton cards for sections that haven't arrived yet
- Each skeleton matches the expected section layout
- Provides visual feedback that more content is coming

---

## Implementation Order

| Step | Change                                                | Impact                              | Risk   |
| ---- | ----------------------------------------------------- | ----------------------------------- | ------ |
| 1    | Replace word-by-word with chunked streaming (Phase 1) | High — removes janky animation      | Low    |
| 2    | Section-based rendering (Phase 2)                     | High — major visual improvement     | Medium |
| 3    | Full-screen immersive view (Phase 3)                  | High — transforms the experience    | Medium |
| 4    | Mode-specific rendering (Phase 5)                     | Medium — per-mode polish            | Medium |
| 5    | Text-to-speech (Phase 4)                              | Medium — "live explanation" feature | Medium |
| 6    | Visual polish & micro-interactions (Phase 6)          | Low — nice-to-have                  | Low    |

---

## Files to Modify

1. [`artifacts/anki-generator/src/pages/deck-detail.tsx`](../artifacts/anki-generator/src/pages/deck-detail.tsx) — Main study mode with AI explanation drawer (lines 279-417 for explain logic, lines 1065-1396 for drawer UI)
2. [`artifacts/api-server/src/routes/explain.ts`](../artifacts/api-server/src/routes/explain.ts) — May need to adjust streaming format for better section parsing

## New Files to Create

1. `artifacts/anki-generator/src/components/explanation-view.tsx` — Full-screen explanation overlay
2. `artifacts/anki-generator/src/components/explanation-section.tsx` — Individual section card
3. `artifacts/anki-generator/src/components/explanation-toc.tsx` — Table of contents sidebar
4. `artifacts/anki-generator/src/components/explanation-tts.tsx` — Text-to-speech controls
5. `artifacts/anki-generator/src/components/explanation-skeleton.tsx` — Skeleton loading state
6. `artifacts/anki-generator/src/lib/explain-sections.ts` — Section parsing and config

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   Study Mode (deck-detail.tsx)           │
│                                                         │
│  ┌──────────────┐    click AI button                    │
│  │  Flashcard    │ ──────────────────────────────────┐  │
│  └──────────────┘                                     │  │
│                                                       ▼  │
│  ┌─────────────────────────────────────────────────────┐│
│  │           Explanation View (full-screen)             ││
│  │  ┌──────────────────────────────────────────────┐   ││
│  │  │  Header: Mode label, TTS controls, Close     │   ││
│  │  ├──────────────┬───────────────────────────────┤   ││
│  │  │  TOC Sidebar │  Content Area                  │   ││
│  │  │  - Section 1 │  ┌─────────────────────────┐  │   ││
│  │  │  - Section 2 │  │ Section Card (animated)  │  │   ││
│  │  │  - Section 3 │  │  Icon + Title            │  │   ││
│  │  │    ...        │  │  Content (markdown)      │  │   ││
│  │  │              │  └─────────────────────────┘  │   ││
│  │  │              │  ┌─────────────────────────┐  │   ││
│  │  │              │  │ Section Card (streaming) │  │   ││
│  │  │              │  │  ...content...█          │  │   ││
│  │  │              │  └─────────────────────────┘  │   ││
│  │  │              │  ┌─────────────────────────┐  │   ││
│  │  │              │  │ Skeleton (loading)       │  │   ││
│  │  │              │  └─────────────────────────┘  │   ││
│  │  └──────────────┴───────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```
