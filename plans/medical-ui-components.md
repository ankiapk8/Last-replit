# Medical UI Components — Implementation Plan

## Overview

Build 5 animated, production-ready medical study components in React + Tailwind CSS + Framer Motion, deployed to the existing `mockup-sandbox` app at `artifacts/mockup-sandbox/`. Each component lives in `src/components/mockups/` and is auto-discovered by the existing `mockupPreviewPlugin` for live preview at `/preview/ComponentName`.

## Target Environment

- **App**: `artifacts/mockup-sandbox/` (Vite + React 19 + Tailwind CSS v4 + Framer Motion 12)
- **Component directory**: `src/components/mockups/`
- **Preview URL pattern**: `/preview/ComponentName`
- **Existing UI library**: shadcn/ui components in `src/components/ui/`
- **Utility**: `cn()` from `src/lib/utils.ts` (clsx + tailwind-merge)
- **CSS variables**: defined in `src/index.css` (light/dark mode via `.dark` class)

## Step 1: Install Additional Dependencies

Component E (Clinical Pearls Card Stack) requires `react-spring` and `@use-gesture` which are not in the current catalog.

```bash
cd artifacts/mockup-sandbox
pnpm add @react-spring/web @use-gesture/react
```

Add to `package.json` devDependencies.

## Step 2: Create Shared Types and Data Fixtures

**File**: `src/components/mockups/data/fixtures.ts`

Centralized mock data for all 5 components:

- `clinicalArticleData` — full 15-section article on "Acute Myocardial Infarction" with all subsections populated
- `revisionSheetData` — array of 8-10 findings with significance/action text
- `osceStationData` — station metadata + scenario + 4 MCQ options + correct index
- `mnemonicData` — "CARDIAC" letters with meanings, colors, spaced-repetition stars
- `clinicalPearlsData` — array of 5 pearl objects (title, body, category)

## Step 3: Component A — AMBOSS-Style Clinical Article Card

**File**: `src/components/mockups/ClinicalArticleCard.tsx`

### Color Scheme
- Primary accent: `#6C63FF` (deep purple)
- Background: soft lavender gradient (`linear-gradient(135deg, #f5f3ff 0%, #ede9fe 50%, #e0e7ff 100%)`)
- Font: Inter (already configured as `--font-sans`)

### Architecture

```
ClinicalArticleCard
├── StickyHeader (sticky top-0, glassmorphism via backdrop-blur)
│   ├── Title + SpecialtyTag + SeverityBadge
│   ├── BookmarkButton (toggle with framer-motion scale)
│   ├── ReadingProgress (animated progress bar)
│   └── QuickNav (prev/next section buttons)
├── DesktopLayout (lg+)
│   ├── SectionNav (sticky left sidebar, vertical)
│   │   └── SectionNavItem × 15 (active glow, scroll-spy)
│   └── MainContent
│       └── CollapsibleSection × 15
│           ├── SectionHeader (colored left border, icon, badge, chevron)
│           └── SectionContent
│               ├── HighlightBox (5 types: high-yield, exam-pearl, warning, emergency, pitfall)
│               └── SubSection blocks
├── MobileLayout (<lg)
│   └── HorizontalSectionNav (horizontal scrollable pills)
│   └── MainContent (same sections)
```

### Section Order (exact)
1. Overview, 2. Etiology, 3. Pathophysiology, 4. Clinical Features, 5. Differential Diagnosis, 6. Diagnostics, 7. Classification and Severity, 8. Management, 9. Medication Details, 10. Complications, 11. Prognosis, 12. Prevention, 13. Clinical Pearls, 14. Clinical Case, 15. Evidence and Guidelines

### Animations (Framer Motion)
- **Staggered mount**: `initial={{ opacity: 0, y: 20 }}` → `animate={{ opacity: 1, y: 0 }}` with `delay: index * 0.1`
- **Accordion**: `AnimatePresence` + `height: auto` transition on expand/collapse
- **Typewriter**: custom hook using `useState` + `useEffect` with character-by-character reveal
- **Hover**: `whileHover={{ scale: 1.02 }}` + glowing border (`boxShadow: 0 0 20px rgba(108,99,255,0.3)`)
- **Active section glow**: `boxShadow` animation on scroll-spy active item

### Highlight Box Types
| Type | Border | Background | Icon |
|------|--------|------------|------|
| high-yield | `border-yellow-400` | `bg-yellow-50` | ⭐ |
| exam-pearl | `border-purple-400` | `bg-purple-50` | 💡 |
| warning | `border-orange-400` | `bg-orange-50` | ⚠️ |
| emergency | `border-red-400` | `bg-red-50` | 🚨 |
| pitfall | `border-amber-400` | `bg-amber-50` | 🕳️ |

### Accessibility
- ARIA `role="navigation"`, `aria-label` on nav regions
- `aria-expanded` on collapsible sections
- Keyboard navigation (Tab, Enter, Space)
- `prefers-reduced-motion` check (disable animations)

### Dark Mode
- Gradient becomes `linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e3a5f 100%)`
- Highlight boxes use dark variants (`dark:bg-yellow-950` etc.)

## Step 4: Component B — Revision Sheet Table

**File**: `src/components/mockups/RevisionSheetTable.tsx`

### Color Scheme
- Header: `#00A878` (emerald green)
- Rows: alternating `#f0fdf4` / `#ffffff` (soft green / white)
- Progress bar: `#00A878` fill

### Features
- 3 columns: **Finding**, **Significance**, **Action**
- Sticky header row
- Checkbox per row (checkmark with bounce animation)
- Progress bar at bottom: `Reviewed X / Y`
- Column sort with flip animation

### Animations (Framer Motion)
- **Row stagger**: `initial={{ x: -50, opacity: 0 }}` → `animate={{ x: 0, opacity: 1 }}` with `delay: index * 0.05`
- **Progress bar fill**: `initial={{ width: 0 }}` → `animate={{ width: "${percent}%" }}` with `ease: "easeOut", duration: 1`
- **Checkmark bounce**: `scale: [0, 1.3, 1]` spring on toggle
- **Sort flip**: `rotateY: 180 → 0` on column header click

### Mobile
- Horizontal scroll container
- Sticky first column (Finding)

## Step 5: Component C — OSCE Station Question

**File**: `src/components/mockups/OsceStationQuestion.tsx`

### Color Scheme
- Primary: `#E55A2B` (warm orange)
- Timer ring: `#E55A2B` arc, gray track

### Features
- Station badge (e.g., "Station 3 — Cardiology")
- SVG circular countdown timer using `stroke-dashoffset`
- Clinical scenario paragraph
- 4 MCQ options with radio buttons
- Reveal answer button
- Score counter

### Animations (Framer Motion)
- **Timer arc**: `stroke-dashoffset` from `0` to `circumference` over countdown duration
- **Ripple on click**: scale ripple effect on option buttons
- **Correct answer**: `backgroundColor → green` + `scale: [1, 1.1, 1]` bounceIn
- **Wrong answers**: `x: [-10, 10, -10, 0]` shake + `opacity: 0.4`
- **Score counter**: countUp animation using `useSpring` or `useMotionValue` + `useTransform`
- **Card flip**: `rotateY: 0 → 180` 3D transition between questions (perspective transform)

### SVG Timer
```tsx
<svg viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="45" stroke="#e5e7eb" strokeWidth="8" fill="none" />
  <motion.circle
    cx="50" cy="50" r="45"
    stroke="#E55A2B" strokeWidth="8" fill="none"
    strokeLinecap="round"
    initial={{ strokeDashoffset: 0 }}
    animate={{ strokeDashoffset: 2 * Math.PI * 45 }}
    transition={{ duration: 60, ease: "linear" }}
    style={{ strokeDasharray: `${2 * Math.PI * 45}` }}
    transform="rotate(-90 50 50)"
  />
</svg>
```

## Step 6: Component D — Mnemonic Card

**File**: `src/components/mockups/MnemonicCard.tsx`

### Color Scheme
- Primary palette: `#8E24AA` (vibrant purple)
- Letter tile hues: `['#8E24AA', '#AB47BC', '#CE93D8', '#E1BEE7', '#F3E5F5', '#BA68C8']` (purple spectrum)
- Star rating: golden `#FFD700`

### Features
- Row of 6 colored letter tiles spelling "CARDIAC"
- List of 6 meanings with matching colored bullet circles
- Spaced repetition star rating (1-5 stars) at bottom
- Repeat icon button

### Animations (Framer Motion)
- **Tile pop-in**: `initial={{ scale: 0, rotateZ: -180 }}` → `animate={{ scale: 1, rotateZ: 0 }}` with spring physics (`stiffness: 260, damping: 20`) and `delay: index * 0.08`
- **Tile flip on tap**: `rotateY: 0 → 180` 3D flip revealing meaning on back face
- **Color cascade wave**: sequential `backgroundColor` animation across tiles on mount
- **Star fill**: golden glow `boxShadow: 0 0 10px #FFD700` pulse on rate
- **Repeat icon spin**: `rotate: 360` on hover

### 3D Tile Flip Structure
```tsx
<motion.div
  style={{ perspective: 600 }}
  onClick={() => setFlipped(!flipped)}
>
  <motion.div
    animate={{ rotateY: flipped ? 180 : 0 }}
    transition={{ duration: 0.6 }}
    style={{ transformStyle: "preserve-3d" }}
  >
    <div style={{ backfaceVisibility: "hidden" }}>C</div>
    <div style={{ backfaceVisibility: "hidden", rotateY: 180 }}>Meaning</div>
  </motion.div>
</motion.div>
```

## Step 7: Component E — Clinical Pearls Card Stack

**File**: `src/components/mockups/ClinicalPearlsCardStack.tsx`

### Color Scheme
- Primary: `#F59E0B` (golden amber)
- Card backgrounds: white with amber accents

### Features
- 3 cards in stacked deck (offset + rotation)
- Top card: label badge, pearl title, 3-line body text
- Dot pagination below
- Action buttons: Bookmark, Share, Add to Deck

### Animations (React Spring + use-Gesture)
- **Swipe**: `useGesture` drag handler with `offset`, `velocity`, `direction`
- **Velocity-based throw**: if `velocity > 0.5`, animate card off-screen; else spring back
- **Next card spring**: `from: { scale: 0.9, rotateZ: -2 }}` → `to: { scale: 1, rotateZ: 0 }}`
- **Bookmark sparkle**: canvas confetti burst (use `canvas-confetti` — already in anki-generator deps, add to mockup-sandbox)
- **Stack shuffle**: `rotateZ` spring animation on dismiss
- **Dot indicator**: smooth slide to active dot position

### Dependencies to add
```bash
pnpm add canvas-confetti
pnpm add -D @types/canvas-confetti
```

## Step 8: Demo Page

**File**: `src/components/mockups/MedicalComponentsDemo.tsx`

A single page that renders all 5 components vertically with section headings and dividers. This serves as the integration test and showcase.

Preview at: `/preview/MedicalComponentsDemo`

## File Structure

```
artifacts/mockup-sandbox/
├── package.json                          # +@react-spring/web, @use-gesture/react, canvas-confetti, @types/canvas-confetti
└── src/
    ├── index.css                         # (unchanged)
    └── components/
        └── mockups/
            ├── data/
            │   └── fixtures.ts           # Shared mock data
            ├── ClinicalArticleCard.tsx    # Component A
            ├── RevisionSheetTable.tsx     # Component B
            ├── OsceStationQuestion.tsx    # Component C
            ├── MnemonicCard.tsx           # Component D
            ├── ClinicalPearlsCardStack.tsx # Component E
            └── MedicalComponentsDemo.tsx  # All-in-one demo
```

## Technical Constraints

- All components use `use client` directive (React 19 convention)
- Framer Motion for Components A-D; React Spring + use-Gesture for Component E
- Tailwind CSS v4 with `@theme inline` CSS variables (existing pattern)
- No inline styles except for dynamic animation values
- All text content comes from props (API-ready)
- `prefers-reduced-motion` respected via Framer Motion's `useReducedMotion()`
- Dark mode via `.dark` class on `<html>` (existing pattern)

## Verification Plan

1. Run `pnpm run dev` in `artifacts/mockup-sandbox/`
2. Navigate to each `/preview/ComponentName` URL
3. Verify animations trigger correctly
4. Test responsive behavior (mobile/desktop)
5. Toggle dark mode and verify color adaptation
6. Run `pnpm run typecheck` to verify no TypeScript errors
