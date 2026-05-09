# Plan: Frontend Port 5000 + Docker Configuration Update

## Summary

Standardize the frontend dev server to port 5000 across all configuration files, and update Docker Compose to support the full-stack development workflow with the frontend on port 5000.

## Current State

- Vite config already defaults to port 5000
- `scripts/start-all.sh` already uses `PORT=5000`
- `.replit` already waits for port 5000
- **Inconsistency:** `package.json` `web:dev` uses `PORT=5173`
- **Docker:** `docker-compose.yml` only exposes port 8080 (production API), no frontend dev server

## Changes

### 1. Fix `package.json` `web:dev` script

**File:** `package.json`

- Change `PORT=5173` → `PORT=5000` in the `web:dev` script

### 2. Update `docker-compose.yml` for full-stack dev

**File:** `docker-compose.yml`

- Keep the existing `app` service (API server, port 8080) for production-style runs
- Add a `frontend` service that runs the Vite dev server on port 5000
- Expose port 5000 for the frontend dev server
- Both services share the same network so the frontend can proxy API calls to the backend

### 3. Update `.env.example`

**File:** `.env.example`

- Add a comment documenting that the frontend dev server runs on port 5000
- Clarify that `PORT=3001` is for the API server, frontend uses its own port

### 4. Verify consistency

- All scripts, configs, and docs should reference port 5000 for frontend
- Production Docker/Dockerfile stays at port 8080 (no change needed there)

## Files to Modify

1. `package.json` — Fix `web:dev` script port
2. `docker-compose.yml` — Add frontend service, expose port 5000
3. `.env.example` — Document frontend port

## Files NOT Modified (already correct)

- `artifacts/anki-generator/vite.config.ts` — Already defaults to 5000
- `scripts/start-all.sh` — Already uses 5000
- `.replit` — Already uses 5000
- `Dockerfile` — Production build stays at 8080
- `render.yaml` — Production deploy stays at 8080
- `.devcontainer/devcontainer.json` — Already forwards 5000
- `scripts/keepalive.sh` — Already pings 5000
