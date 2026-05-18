# Deployment Guide — AnkiGen Three-Service Architecture

## Architecture Overview

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  public-frontend     │     │  agent-api           │     │  admin-frontend      │
│  app.<domain>        │────▶│  api.<domain>        │◀────│  admin.<domain>      │
│  (Static Site)       │     │  (Docker Web Service)│     │  (Static Site)       │
└─────────────────────┘     └──────────┬──────────┘     └─────────────────────┘
                                       │
                              ┌────────▼──────────┐
                              │  ankigen-db        │
                              │  (Postgres 16)     │
                              └───────────────────┘
```

## Prerequisites

- GitHub account with the repository pushed
- Render account (https://dashboard.render.com)
- Custom domain configured in Render

## Step 1: Push to GitHub

```bash
git add .
git commit -m "refactor: three-service architecture for Render"
git push origin main
```

## Step 2: Create the Blueprint on Render

1. Log in to [dashboard.render.com](https://dashboard.render.com)
2. Click **New → Blueprint**
3. Connect your GitHub account and select this repository
4. Render reads `render.yaml` and proposes three services + one database
5. **Before clicking Apply**, set the domain placeholders:
   - Replace `<DOMAIN>` in `render.yaml` with your actual domain (e.g., `ankigen.com`)
6. Click **Apply**

## Step 3: Configure Custom Domains

In the Render dashboard, for each service:

### agent-api (api.<domain>)
1. Go to agent-api → Settings → Custom Domains
2. Add `api.<yourdomain.com>`
3. Update DNS: Create a CNAME record pointing `api` → `agent-api.onrender.com`

### public-frontend (app.<domain>)
1. Go to public-frontend → Settings → Custom Domains
2. Add `app.<yourdomain.com>`
3. Update DNS: Create a CNAME record pointing `app` → `public-frontend.onrender.com`

### admin-frontend (admin.<domain>)
1. Go to admin-frontend → Settings → Custom Domains
2. Add `admin.<yourdomain.com>`
3. Update DNS: Create a CNAME record pointing `admin` → `admin-frontend.onrender.com`

## Step 4: Set Secret Environment Variables

In the Render dashboard, go to **agent-api → Environment** and set these as secrets:

| Variable | How to Get |
|----------|-----------|
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys |
| `ADMIN_JWT_SECRET` | `openssl rand -hex 32` |
| `ADMIN_EMAIL` | Your admin email |
| `ADMIN_PASSWORD` | A strong password |
| `GROQ_API_KEY` | (optional) https://console.groq.com/keys |
| `STRIPE_SECRET_KEY` | (optional) https://dashboard.stripe.com/apikeys |
| `STRIPE_WEBHOOK_SECRET` | (optional) Stripe webhook endpoint secret |

## Step 5: Create Admin User

The first time you deploy, you need to create the admin user in the database:

```bash
# Connect to the Render Postgres database
# From Render dashboard → ankigen-db → Connect → External Connection
psql $DATABASE_URL

# Insert admin user
INSERT INTO public.users (id, email, password_hash, role, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'admin@yourdomain.com',
  -- Use bcrypt hash of your password
  '$2b$10$...',
  'admin',
  NOW(),
  NOW()
);
```

Or use the API after deployment:
```bash
curl -X POST https://api.<domain>/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"your-password"}'
```

Then set the role via database or admin panel.

## Step 6: Verify Deployment

```bash
# Test 1: Public frontend loads
curl -I https://app.<domain>

# Test 2: API health check
curl https://api.<domain>/api/healthz

# Test 3: Admin login
curl -X POST https://api.<domain>/api/admin/auth/token \
  -H "Authorization: Basic $(echo -n 'admin@yourdomain.com:password' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"ttl_minutes": 60}'

# Test 4: Admin health (use token from above)
curl https://api.<domain>/api/admin/health \
  -H "Authorization: Bearer <token>"

# Test 5: Admin frontend loads
curl -I https://admin.<domain>
```

## Step 7: Run Automated Tests

```bash
# Set environment variables
export API_URL=https://api.<domain>
export ADMIN_EMAIL=admin@yourdomain.com
export ADMIN_PASSWORD=your-password

# Run tests
pnpm test
```

## Render Service Details

### Service 1: agent-api (Docker Web Service)
- **Plan:** Starter (minimum for Docker)
- **Region:** Oregon
- **Health Check:** `GET /api/healthz` every 30s
- **Auto-deploy:** On push to main
- **Port:** 8080 (from PORT env var)

### Service 2: public-frontend (Static Site)
- **Build:** `pnpm install && pnpm --filter @workspace/anki-generator run build`
- **Publish:** `./artifacts/anki-generator/dist`
- **SPA routing:** All routes → `/index.html`

### Service 3: admin-frontend (Static Site)
- **Build:** `pnpm install && pnpm --filter @workspace/admin-frontend run build`
- **Publish:** `./admin-frontend/dist`
- **SPA routing:** All routes → `/index.html`
- **Security:** `noindex, nofollow` meta tag

## Rollback Plan

If deployment fails:

1. **Revert to previous commit:**
   ```bash
   git revert HEAD
   git push origin main
   ```
   Render auto-deploys on push.

2. **Rollback via Render dashboard:**
   - Go to the service → Deploys
   - Find the previous working deploy
   - Click "Rollback to this deploy"

3. **Database rollback:**
   - Render Postgres has automatic daily backups
   - Go to ankigen-db → Backups → Restore

4. **Emergency single-service mode:**
   - If the three-service setup has issues, the original monolith Dockerfile still works
   - Switch `render.yaml` to use the root Dockerfile with a single service

## Monitoring

- **Logs:** Render dashboard → each service → Logs
- **Health:** `GET https://api.<domain>/api/healthz`
- **Admin:** `GET https://api.<domain>/api/admin/health` (requires auth)
- **Metrics:** Render dashboard → each service → Metrics

## Security Checklist

- [ ] `ADMIN_JWT_SECRET` is ≥ 32 characters
- [ ] `ADMIN_PASSWORD` is strong
- [ ] `NODE_ENV=production` on all services
- [ ] CORS only allows `app.<domain>` and `admin.<domain>`
- [ ] Admin frontend has `noindex, nofollow`
- [ ] No secrets in frontend builds
- [ ] Database IP allowlist is empty (allows Render internal)
- [ ] Stripe webhook secret is set (if using payments)
