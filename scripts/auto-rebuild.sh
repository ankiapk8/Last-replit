#!/usr/bin/env bash
# Auto-rebuild: builds frontend + API on startup, then watches for source changes
# and rebuilds automatically so the artifact router always serves fresh code.

set -euo pipefail

POLL_INTERVAL=20   # seconds between change-detection polls
HASH_FILE="/tmp/.ankigen_src_hash"

log() { echo "[auto-rebuild] $*"; }

# ── Hash the source files that matter ────────────────────────────────────────
source_hash() {
  find artifacts/anki-generator/src artifacts/api-server/src lib \
       artifacts/anki-generator/index.html \
       artifacts/anki-generator/vite.config.ts \
       artifacts/anki-generator/package.json \
       artifacts/api-server/package.json \
       -type f 2>/dev/null \
    | sort | xargs md5sum 2>/dev/null | md5sum | awk '{print $1}'
}

# ── Build both artifacts ──────────────────────────────────────────────────────
build_all() {
  log "Building frontend..."
  if BASE_PATH=/ pnpm --filter @workspace/anki-generator run build 2>&1 | tail -5; then
    log "Frontend build done"
  else
    log "Frontend build FAILED"
    return 1
  fi

  log "Building API server..."
  if pnpm --filter @workspace/api-server run build 2>&1 | tail -5; then
    log "API build done"
  else
    log "API build FAILED"
    return 1
  fi
}

# ── Capture initial hash (no build on startup — Vite handles dev serving) ─────
LAST_HASH=$(source_hash)
echo "$LAST_HASH" > "$HASH_FILE"
log "Watching for source changes every ${POLL_INTERVAL}s (initial build skipped)..."

# ── Watch loop ────────────────────────────────────────────────────────────────
while true; do
  sleep "$POLL_INTERVAL"
  CURRENT_HASH=$(source_hash)
  if [ "$CURRENT_HASH" != "$LAST_HASH" ]; then
    log "Source changed — rebuilding..."
    if build_all; then
      LAST_HASH="$CURRENT_HASH"
      echo "$LAST_HASH" > "$HASH_FILE"
      log "Rebuild complete"
    else
      log "Rebuild failed — will retry on next change"
    fi
  fi
done
