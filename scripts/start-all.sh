#!/usr/bin/env bash
# Vite dev server with unlimited auto-restart.
# "Start application" runs this with waitForPort=5000 — Replit's preview
# pane will NOT open until port 5000 is actually accepting connections.

log() { echo "[start-frontend] $*"; }

while true; do
  log "Starting Vite dev server..."
  PORT=5000 BASE_PATH=/ pnpm --filter @workspace/anki-generator run dev || true
  log "Vite exited unexpectedly — restarting in 1 s..."
  sleep 1
done
