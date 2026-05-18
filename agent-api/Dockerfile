# ── agent-api Dockerfile — API-only service for Render ────────────────────────
# No frontend static files. Pure API server.
# ──────────────────────────────────────────────────────────────────────────────

FROM node:24-bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      build-essential \
      python3 \
      pkg-config \
      libcairo2-dev \
      libpango1.0-dev \
      libjpeg-dev \
      libgif-dev \
      librsvg2-dev \
      libpixman-1-dev \
    && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

# ─── Install deps (layer-cached) ───────────────────────────────────────────────
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY tsconfig.base.json tsconfig.json ./

COPY lib/api-zod/package.json       ./lib/api-zod/
COPY lib/db/package.json            ./lib/db/
COPY lib/integrations-openai-ai-server/package.json ./lib/integrations-openai-ai-server/

COPY api-new-server/package.json   ./api-new-server/

RUN pnpm install --frozen-lockfile=true || pnpm install --frozen-lockfile=false

# ─── Build ─────────────────────────────────────────────────────────────────────
FROM deps AS build

COPY . .

ENV NODE_ENV=production

RUN pnpm --filter @workspace/api-new-server run build

# ─── Production runner ─────────────────────────────────────────────────────────
FROM base AS runner

LABEL org.opencontainers.image.title="AnkiGen API"
LABEL org.opencontainers.image.description="AI-powered Anki flashcard generator — API server"

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=build /app/lib ./lib
COPY --from=build /app/api-new-server/package.json ./api-new-server/
COPY --from=build /app/api-new-server/dist          ./api-new-server/dist

RUN pnpm install --prod --frozen-lockfile=true --filter @workspace/api-new-server... 2>/dev/null || pnpm install --prod --frozen-lockfile=false --filter @workspace/api-new-server... \
    && pnpm store prune

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8080/api/healthz || exit 1

WORKDIR /app/api-new-server

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
