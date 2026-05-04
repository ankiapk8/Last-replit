# AnkiGen — AI Flashcard Generator

Generate Anki flashcards from PDFs, slides, images, and more using AI. Includes study mode, MCQ practice, question banks, mind maps, and Anki export.

## Tech Stack

- **Frontend** — React 19, Vite, TailwindCSS 4, Framer Motion, shadcn/ui
- **Backend** — Express 5, Node.js 24, Drizzle ORM
- **Database** — PostgreSQL 16
- **AI** — OpenRouter (OpenAI-compatible API)
- **Monorepo** — pnpm workspaces

---

## Running locally with Docker (recommended)

This is the fastest way to get a full working environment without installing Node, pnpm, or PostgreSQL manually.

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/ankigen.git
cd ankigen

# 2. Create your .env file from the template
cp .env.example .env
# Edit .env and set your OPENROUTER_API_KEY

# 3. Build and start everything (first run takes 5–10 min to compile native modules)
docker compose up --build

# 4. Open the app
open http://localhost:8080
```

To stop: `docker compose down`
To stop and wipe the database: `docker compose down -v`

---

## Running locally without Docker (VS Code dev mode)

**Prerequisites:** Node.js 20+, pnpm 10+, PostgreSQL 16

```bash
# 1. Install pnpm globally if you haven't
npm install -g pnpm

# 2. Install all dependencies
pnpm install

# 3. Create your .env file
cp .env.example .env
# Set DATABASE_URL to your local Postgres, e.g.:
# DATABASE_URL=postgres://postgres:postgres@localhost:5432/ankigen
# Set OPENROUTER_API_KEY

# 4. Start both services (two separate terminals)

# Terminal A — API server (runs on PORT set in .env or defaults to 3001)
PORT=3001 BASE_PATH=/ pnpm --filter @workspace/api-server run dev

# Terminal B — Vite frontend (runs on PORT set in .env or 5173)
PORT=5173 BASE_PATH=/ VITE_API_BASE=http://localhost:3001 \
  pnpm --filter @workspace/anki-generator run dev
```

Then open http://localhost:5173.

---

## Project structure

```
ankigen/
├── artifacts/
│   ├── anki-generator/     # React + Vite frontend
│   │   └── src/
│   │       ├── components/ # UI components
│   │       ├── pages/      # Route pages
│   │       ├── hooks/      # Custom React hooks
│   │       └── lib/        # Utilities
│   └── api-server/         # Express API
│       └── src/
│           ├── routes/     # API route handlers
│           └── lib/        # Server utilities (PDF, APK builder, etc.)
├── lib/
│   ├── db/                 # Drizzle ORM schema + database connection
│   ├── api-spec/           # OpenAPI spec + orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Shared Zod schemas
│   └── integrations-openai-ai-server/  # OpenAI/OpenRouter client
├── Dockerfile              # Multi-stage production build
├── docker-compose.yml      # Local full-stack Docker setup
├── render.yaml             # Render.com Blueprint
└── .env.example            # Required environment variables
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `OPENROUTER_API_KEY` | Yes | OpenRouter key (`sk-or-...`) from [openrouter.ai/keys](https://openrouter.ai/keys) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | No | Defaults to `https://openrouter.ai/api/v1` |
| `PORT` | No | Server port (default `8080`) |
| `STATIC_DIR` | No | Path to built frontend (default `/app/public`) |
| `NODE_ENV` | No | `production` or `development` |

---

## Deploy to Render.com

See [RENDER_DEPLOY.md](./RENDER_DEPLOY.md) for step-by-step instructions.

The short version:
1. Push this repo to GitHub
2. In Render dashboard → **New → Blueprint** → point at your repo
3. Set `OPENROUTER_API_KEY` when prompted
4. Wait ~10 min for first build

---

## Building the Docker image manually

```bash
docker build -t ankigen .

docker run --rm -p 8080:8080 \
  -e DATABASE_URL="postgres://user:pw@host:5432/db" \
  -e OPENROUTER_API_KEY="sk-or-..." \
  -e AI_INTEGRATIONS_OPENAI_BASE_URL="https://openrouter.ai/api/v1" \
  ankigen
```

---

## VS Code setup

Open the repo in VS Code and install the recommended extensions when prompted (`.vscode/extensions.json`). Key ones:

- **ESLint** — inline linting
- **Prettier** — auto-format on save
- **Tailwind CSS IntelliSense** — class autocomplete
- **Docker** — manage containers from the sidebar
- **Error Lens** — inline error highlighting

TypeScript is configured to use the workspace version automatically.
