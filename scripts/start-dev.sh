#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# start-dev.sh  — starts API server + Vite frontend together for local dev
# Works in GitHub Codespaces, Docker, and plain local environments.
# ──────────────────────────────────────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load .env if it exists
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . .env
  set +a
fi

# Defaults
export PORT="${PORT:-3001}"
export NODE_ENV="${NODE_ENV:-development}"
export FRONTEND_PORT="${FRONTEND_PORT:-5000}"

echo "[dev] Starting API server on port $PORT..."
echo "[dev] Starting frontend on port $FRONTEND_PORT..."
echo "[dev] Press Ctrl+C to stop both."
echo ""

# Trap to kill both on exit
cleanup() {
  echo ""
  echo "[dev] Shutting down..."
  kill 0
}
trap cleanup EXIT INT TERM

# Start API server
PORT="$PORT" NODE_ENV="$NODE_ENV" \
  pnpm --filter @workspace/api-server run dev &
API_PID=$!

# Wait for API server to start
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$PORT/api/healthz" > /dev/null 2>&1; then
    echo "[dev] ✓ API server ready on http://localhost:$PORT"
    break
  fi
  sleep 1
done

# Start Vite frontend
PORT="$FRONTEND_PORT" BASE_PATH=/ API_PORT="$PORT" \
  pnpm --filter @workspace/anki-generator run dev &
VITE_PID=$!

wait "$API_PID" "$VITE_PID"
