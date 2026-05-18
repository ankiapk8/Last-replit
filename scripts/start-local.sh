#!/bin/bash
# Start both API server and admin frontend for local development
# Usage: bash scripts/start-local.sh

# Kill any existing processes
pkill -f "dist/index.mjs" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 1

# Start API server
echo "Starting API server on port 3001..."
cd /root/Last-replit/api-new-server
node --env-file=/root/Last-replit/.env --enable-source-maps ./dist/index.mjs > /tmp/api-server.log 2>&1 &
API_PID=$!
echo "API PID: $API_PID"

# Start admin frontend
echo "Starting admin frontend on port 5174..."
cd /root/Last-replit/admin-frontend
pnpm dev > /tmp/admin-frontend.log 2>&1 &
ADMIN_PID=$!
echo "Admin PID: $ADMIN_PID"

# Wait for servers to start
sleep 5

# Verify
echo ""
echo "=== API Health ==="
curl -s http://localhost:3001/api/healthz 2>&1
echo ""
echo "=== Admin Frontend ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:5174/
echo ""
echo "=== Admin Login Test ==="
curl -s -X POST http://localhost:3001/api/admin/auth/token \
  -H "Authorization: Basic $(echo -n 'admin@localhost:devpassword123' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"ttl_minutes": 60}' 2>&1
echo ""
echo ""
echo "Servers started. Press Ctrl+C to stop."
wait
