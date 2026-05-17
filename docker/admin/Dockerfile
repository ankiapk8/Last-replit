# ══════════════════════════════════════════════════════════════════════════════
# Admin Frontend — Production Dockerfile
# Multi-stage: build with Vite, serve with Nginx
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:24-bookworm-slim AS deps

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY tsconfig.base.json tsconfig.json ./

COPY admin-frontend/package.json ./admin-frontend/

# Also copy workspace deps that admin-frontend may need
COPY lib/api-zod/package.json ./lib/api-zod/

RUN pnpm install --frozen-lockfile=true 2>/dev/null || pnpm install --frozen-lockfile=false

# ── Stage 2: Build admin frontend ────────────────────────────────────────────
FROM deps AS build

COPY . .

ENV NODE_ENV=production

RUN pnpm --filter @workspace/admin-frontend run build

# ── Stage 3: Production Nginx server ─────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

LABEL org.opencontainers.image.title="AnkiGen Admin"
LABEL org.opencontainers.image.description="AI-powered Anki flashcard generator — Admin Frontend"

# Remove default nginx config
RUN rm -f /etc/nginx/conf.d/default.conf

# Copy custom nginx config for admin
COPY docker/admin/nginx.conf /etc/nginx/conf.d/admin.conf

# Copy built static assets
COPY --from=build /app/admin-frontend/dist /usr/share/nginx/html

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup && \
    chown -R appuser:appgroup /usr/share/nginx/html && \
    chown -R appuser:appgroup /var/cache/nginx && \
    chown -R appuser:appgroup /var/log/nginx && \
    chown -R appuser:appgroup /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R appuser:appgroup /var/run/nginx.pid

# Security: add robots.txt to prevent indexing
RUN echo "User-agent: *\nDisallow: /" > /usr/share/nginx/html/robots.txt

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

EXPOSE 80

USER appuser

CMD ["nginx", "-g", "daemon off;"]
