#!/usr/bin/env bash
# Resilient frontend starter — restarts Vite automatically on crash
set -euo pipefail

log() { echo "[start-frontend] $*"; }

MAX_RESTARTS=20
RESTART_DELAY=2

restarts=0
while true; do
  log "Starting Vite dev server (attempt $((restarts + 1)))..."
  BASE_PATH=/ PORT=5000 pnpm --filter @workspace/anki-generator run dev || true

  restarts=$((restarts + 1))
  if [ "$restarts" -ge "$MAX_RESTARTS" ]; then
    log "ERROR: Vite crashed $MAX_RESTARTS times. Giving up."
    exit 1
  fi

  log "Vite exited unexpectedly. Restarting in ${RESTART_DELAY}s..."
  sleep "$RESTART_DELAY"
done
