# ══════════════════════════════════════════════════════════════════════════════
# Production API Server — Production Dockerfile
# Multi-stage: install → build → run (non-root, hardened)
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Base with system deps ───────────────────────────────────────────
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

# ── Stage 2: Install all dependencies (layer-cached) ─────────────────────────
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY tsconfig.base.json tsconfig.json ./

COPY lib/api-zod/package.json       ./lib/api-zod/
COPY lib/db/package.json            ./lib/db/
COPY lib/integrations-openai-ai-server/package.json ./lib/integrations-openai-ai-server/

COPY api-new-server/package.json   ./api-new-server/

RUN pnpm install --frozen-lockfile=true 2>/dev/null || pnpm install --frozen-lockfile=false

# ── Stage 3: Build API server ────────────────────────────────────────────────
FROM deps AS build

COPY . .

ENV NODE_ENV=production

RUN pnpm --filter @workspace/api-new-server run build

# ── Stage 4: Production runner ───────────────────────────────────────────────
FROM base AS runner

LABEL org.opencontainers.image.title="AnkiGen API"
LABEL org.opencontainers.image.description="AI-powered Anki flashcard generator — Production API Server"

ENV NODE_ENV=production
ENV PORT=3001

WORKDIR /app

# Copy only production artifacts
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=build /app/lib ./lib
COPY --from=build /app/api-new-server/package.json ./api-new-server/
COPY --from=build /app/api-new-server/dist ./api-new-server/dist

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile=true --filter @workspace/api-new-server... 2>/dev/null || \
    pnpm install --prod --frozen-lockfile=false --filter @workspace/api-new-server... && \
    pnpm store prune

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser && \
    chown -R appuser:appuser /app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/api/healthz || exit 1

# Expose only internal port (not published to host)
EXPOSE 3001

USER appuser

WORKDIR /app/api-new-server

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
