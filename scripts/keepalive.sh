#!/usr/bin/env bash
# Pings API and frontend every 20s to prevent the dev repl from hibernating.
API_PORT="${API_PORT:-3001}"
ARTIFACT_API_PORT="${ARTIFACT_API_PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-5000}"
INTERVAL=20

echo "[keepalive] Starting — pinging API :${API_PORT}, artifact API :${ARTIFACT_API_PORT}, frontend :${FRONTEND_PORT} every ${INTERVAL}s"

wait_for_port() {
  local port=$1
  local max_attempts=20
  local attempt=0
  while ! curl -sf --max-time 3 -o /dev/null "http://localhost:${port}/" 2>/dev/null && \
        ! curl -sf --max-time 3 -o /dev/null "http://localhost:${port}/api/healthz" 2>/dev/null; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "[keepalive] Timed out waiting for port ${port}"
      return 1
    fi
    sleep 5
  done
  echo "[keepalive] Port ${port} is ready"
}

wait_for_port "$API_PORT"
wait_for_port "$FRONTEND_PORT"

while true; do
  sleep "$INTERVAL"
  API_STATUS=$(curl -sf --max-time 5 -o /dev/null -w "%{http_code}" "http://localhost:${API_PORT}/api/healthz" 2>/dev/null || echo "ERR")
  ART_STATUS=$(curl -sf --max-time 5 -o /dev/null -w "%{http_code}" "http://localhost:${ARTIFACT_API_PORT}/api/healthz" 2>/dev/null || echo "ERR")
  FE_STATUS=$(curl -sf --max-time 5 -o /dev/null -w "%{http_code}" "http://localhost:${FRONTEND_PORT}/" 2>/dev/null || echo "ERR")
  echo "[keepalive] api=${API_STATUS}  artifact-api=${ART_STATUS}  frontend=${FE_STATUS}"
done
