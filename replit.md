# Workspace

## Overview

This project is a pnpm workspace monorepo using TypeScript, designed to provide a comprehensive Anki flashcard generation and study planning solution. The core application, an Anki Card Generator, allows users to upload various file types (PDF, TXT) or paste text to generate Anki flashcards using AI. It also includes features for managing decks, editing cards, and exporting `.apkg` files for Anki import. A key component is a self-contained "Final Year Study Planner" for medical students, offering detailed subject management, a multi-month calendar, activity tracking, and data export options. The project aims to streamline the process of creating study materials and organizing academic efforts, leveraging AI for content generation and robust backend services for data management and export.

## User Preferences

No explicit user preferences were found in the provided document.

## System Architecture

The project is structured as a pnpm workspace monorepo.

**UI/UX Decisions:**

*   **Anki Card Generator:** React + Vite web application. Features a study mode with card flipping, answer revelation, and progress tracking.
*   **Final Year Study Planner:** Self-contained tab using MemoryRouter and `localStorage` for state management, featuring a grid of medical subjects, CRUD operations for topics, a multi-month study calendar, an 8-week activity heatmap, and streak counter.
*   **Mobile Responsiveness:** Implemented with responsive design patterns, including tighter spacing, larger touch targets, and collapsing elements on smaller screens (e.g., nav labels, card-count badges, AI tool buttons stacking).
*   **Generate Tab:** Features a mode toggle with a sliding gradient highlight (Flashcards / Question Bank), animated hero elements, and a big animated CTA card for the new Question Bank feature.

**Technical Implementations:**

*   **Monorepo:** pnpm workspaces.
*   **Language & Runtime:** Node.js 24, TypeScript 5.9.
*   **API Framework:** Express 5 backend.
*   **Database:** PostgreSQL with Drizzle ORM.
*   **Validation:** Zod (`zod/v4`), `drizzle-zod`.
*   **API Codegen:** Orval (from OpenAPI spec).
*   **Build System:** esbuild (CJS bundle).
*   **AI Integration:** OpenRouter via `@workspace/integrations-openai-ai-server`. Uses `OPENROUTER_API_KEY`. Default model: `google/gemini-2.5-flash-preview` (upgraded from 2.0-flash). AI client loaded lazily.
*   **PDF Extraction:** Client-side processing for smaller files, server-side for larger, with OCR fallback. Uses `FormData` for server uploads to bypass proxy limits.
*   **Server-side Rendering (Production):** The Express server serves the built React frontend and handles SPA fallback in production environments (Docker/Render).
*   **Streaming Endpoints:** Long-running AI endpoints (`/api/generate/stream`, `/api/generate-qbank/stream`, `/api/explain`) use SSE with heartbeat comments and `X-Accel-Buffering: no` to prevent proxy buffering.
*   **Database Schema:** `decks` (deck metadata, parentId for hierarchy, kind: 'deck' or 'qbank') and `cards` (flashcard data including front, back, tags, image, sourceImage, bbox, cardType: 'basic' or 'mcq', choices, correctIndex, pageNumber).
*   **AI Visual-Card Generation:** Explicit prompting to identify and extract figures (charts, tables, diagrams) with tight bounding boxes, skipping non-figure pages. Server-side filtering discards oversized bboxes.
*   **AI Text-Card Generation:** Splits long text into chunks, preserving `pageNumber` for paged inputs. Prioritizes existing multiple-choice questions for MCQ cards and generates atomic basic cards for other facts. Orders cards by `pageNumber` and `createdAt` for source-document reading order.
*   **Deck Hierarchy:** Supports one-level deep sub-decks using `parentId`. Export uses Anki's `::` convention.
*   **APK Builder:** Requires Android SDK and JDK 21 for building AnkiDroid packages.
*   **Anki `.apkg` Export:** Hand-built using JSZip, ensuring iOS compatibility. Notes/cards use monotonic IDs and are sorted by `pageNumber`. Card content is HTML-escaped, and images are added as media files within the zip.
*   **Library Backup / Restore (Transfer):** Provides endpoints for exporting all decks or single decks as JSON (`.ankigen.json` v2 format) and importing JSON backups. Includes `cardType`, `choices`, `correctIndex`, and `pageNumber` in exported cards.

**Development Features (Dev Only):**

*   **Local Subscription Control:** Dev panel (`dev-panel.tsx`) for toggling Free/Pro plans, simulating subscriptions, and resetting quotas, persisting overrides via `localStorage`.
*   **Dev Override Endpoints:** API routes (`/api/dev/*`) to control subscription status and usage for testing.
*   **In-Memory Override Store:** `dev-overrides.ts` for storing dev overrides, resetting on server restart.

## Local Development & GitHub Codespaces

The project runs fully outside Replit. All Replit-specific features are conditional.

### Quick Start (local / Codespaces)

```bash
# 1. Copy and fill in your env
cp .env.example .env        # then add your OPENROUTER_API_KEY

# 2. Run setup (installs deps, starts Postgres, runs migrations)
bash scripts/setup-local.sh

# 3. Start both servers
bash scripts/start-dev.sh   # API on :3001 + frontend on :5000
```

**GitHub Codespaces:** Open the repo in Codespaces — the devcontainer (`.devcontainer/`) auto-runs `setup-local.sh` and forwards ports 3001 + 5000.

### Required Environment Variables

| Variable | Description | Where to get it |
|---|---|---|
| `OPENROUTER_API_KEY` | AI generation (flashcards, mind maps, QBank) | https://openrouter.ai/keys |
| `DATABASE_URL` | PostgreSQL connection string | Docker Compose (local) or Neon (cloud) |

### Recommended Free AI Models (set in `.env`)

```
AI_TEXT_MODEL=meta-llama/llama-3.3-70b-instruct:free
AI_VISION_MODEL=meta-llama/llama-3.2-11b-vision-instruct:free
```

### Pro Features in Local Dev

Set `LOCAL_DEV_IS_PRO=true` in `.env` to unlock all Pro features (QBank, Mind Map, Visual Cards, AI explanations) without a Stripe subscription. Already set in `.env.example`.

### Replit-Specific Dependencies (all gracefully skipped outside Replit)

- **Auth**: Replit OIDC (`REPL_ID`). Without it, the app works anonymously. Login page shows a friendly message.
- **Stripe webhook**: Auto-registered only when `REPLIT_DOMAINS` is set. Skipped locally.
- **APK builder**: Requires Android SDK; skips gracefully without it.
- **Vite plugins**: `@replit/vite-plugin-*` loaded only when `REPL_ID` is set.

### Environment Loading

The API server dev script uses `--env-file-if-exists ../../.env` to load the root `.env` file. In Replit, secrets are injected directly and `.env` is a local convenience file.

## External Dependencies

*   **Monorepo Tool:** pnpm workspaces
*   **AI Provider:** OpenRouter (using OpenAI-compatible endpoint)
*   **Database:** PostgreSQL
*   **ORM:** Drizzle ORM
*   **Validation:** Zod
*   **API Codegen:** Orval
*   **Build Tool:** esbuild
*   **Web Framework:** Express 5
*   **Frontend Framework:** React
*   **Bundler:** Vite
*   **PDF Handling:** `pdf.js` (legacy build for Safari/iPad)
*   **Image Processing/OCR:** `canvas` npm package (requires `util-linux` system dependency), `tesseract.js`
*   **File Uploads:** `multer` (for `multipart/form-data`)
*   **Zip Archiving:** `jszip`
*   **Anki Package Generation:** `anki-apkg-export` (for SQLite template)
*   **UI Animation:** `framer-motion`
*   **Payment Gateway Simulation:** Stripe (mocked for dev environment)
*   **Containerization:** Docker (`docker-compose.yml`)
*   **Deployment:** Render (`render.yaml`)