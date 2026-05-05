#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# setup-local.sh  — one-command setup for local dev and GitHub Codespaces
# ──────────────────────────────────────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log()  { echo "[setup] $*"; }
warn() { echo "[setup] ⚠  $*"; }
ok()   { echo "[setup] ✓  $*"; }

# ── 1. Copy .env.example → .env if .env doesn't exist ─────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  log "Created .env from .env.example"
  warn "Open .env and fill in OPENROUTER_API_KEY before starting the server."
else
  ok ".env already exists"
fi

# ── 2. Install dependencies ───────────────────────────────────────────────────
log "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
ok "Dependencies installed"

# ── 3. Start PostgreSQL (Docker Compose) ──────────────────────────────────────
if command -v docker &>/dev/null; then
  log "Starting PostgreSQL container..."
  docker compose up db -d 2>/dev/null || warn "Docker Compose failed — if using Neon, ignore this."
  # Wait for it to be ready
  for i in $(seq 1 20); do
    if docker compose exec db pg_isready -U ankigen -d ankigen &>/dev/null 2>&1; then
      ok "PostgreSQL is ready"
      break
    fi
    sleep 1
  done
else
  warn "Docker not found — skipping local PostgreSQL. Make sure DATABASE_URL points to an accessible database."
fi

# ── 4. Run database migrations ─────────────────────────────────────────────────
if grep -qv "^#" .env 2>/dev/null && grep -q "DATABASE_URL" .env; then
  log "Running database migrations..."
  # Load .env for migration
  set -a; . .env 2>/dev/null; set +a
  pnpm --filter @workspace/db run migrate 2>/dev/null || \
    node --env-file .env -e "
      import('@workspace/db').then(m => m.ensureDatabaseSchema()).then(() => {
        console.log('[setup] DB schema ready');
        process.exit(0);
      }).catch(e => { console.warn('[setup] Migration failed (non-fatal):', e.message); process.exit(0); });
    " 2>/dev/null || warn "Migration failed — schema may already be up to date."
  ok "Database ready"
fi

echo ""
echo "────────────────────────────────────────────────────────"
echo "  AnkiGen is ready to run!"
echo ""
echo "  Start the API server:"
echo "    pnpm --filter @workspace/api-server run dev"
echo "    (or: PORT=3001 pnpm --filter @workspace/api-server run dev)"
echo ""
echo "  Start the frontend:"
echo "    PORT=5000 pnpm --filter @workspace/anki-generator run dev"
echo ""
echo "  Or run both together:"
echo "    bash scripts/start-dev.sh"
echo ""
echo "  ⚠  Set OPENROUTER_API_KEY in .env to enable AI features."
echo "     Get a free key at: https://openrouter.ai/keys"
echo "────────────────────────────────────────────────────────"
