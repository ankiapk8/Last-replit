# Render.com Deployment — Step by Step

## Architecture on Render

Since Render assigns each service its own `*.onrender.com` URL, we use a **unified single-container approach**:

```
mydomain.com/       → served by the API container (public frontend static files)
mydomain.com/api/*  → served by the API container (Express.js routes)
mydomain.com/admin  → served by the API container (admin frontend static files)
```

The root `Dockerfile` builds ALL three codebases into one image. The API server (`app.ts`) serves the static frontend at `/` and admin at `/admin`.

---

## Step 1: Push Code to GitHub

```bash
cd /root/Last-replit
git add .
git commit -m "feat: unified production build for Render deployment"
git push origin main
```

---

## Step 2: Create Render Account

1. Go to https://dashboard.render.com
2. Sign up / log in
3. Click **New +** → **Blueprint**

---

## Step 3: Connect Repository

1. Connect your GitHub account
2. Select the repository
3. Render reads `render.yaml` automatically
4. Click **Apply**

This creates:
- **1 Web Service:** `ankigen-api` (Docker)
- **1 Database:** `ankigen-db` (PostgreSQL 16)

---

## Step 4: Set Secret Environment Variables

In the Render dashboard, go to **ankigen-api → Environment → Add Secret File** or set individually:

| Variable | How to Generate |
|----------|----------------|
| `OPENROUTER_API_KEY` | Get from https://openrouter.ai/keys |
| `ADMIN_JWT_SECRET` | `openssl rand -hex 32` |
| `ADMIN_SECRET_KEY` | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `ADMIN_EMAIL` | Your admin email |
| `ADMIN_PASSWORD` | Strong password (16+ chars) |
| `STRIPE_SECRET_KEY` | (optional) From Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | (optional) From Stripe webhooks |

Generate secrets:
```bash
echo "ADMIN_JWT_SECRET=$(openssl rand -hex 32)"
echo "ADMIN_SECRET_KEY=$(openssl rand -hex 32)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

---

## Step 5: Configure Custom Domain

### 5a: Add Domain in Render

1. Go to **ankigen-api → Settings → Custom Domains**
2. Add `mydomain.com`
3. Render shows you a DNS target (e.g., `ankigen-api.onrender.com`)

### 5b: Configure DNS

In your domain registrar (GoDaddy, Cloudflare, etc.):

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | @ | ankigen-api.onrender.com | 300 |
| CNAME | www | ankigen-api.onrender.com | 300 |

### 5c: Enable HTTPS

1. In Render: **ankigen-api → Settings → HTTPS**
2. Click **Verify DNS** — Render auto-provisions Let's Encrypt
3. Enable **Force HTTPS** (redirect HTTP → HTTPS)

Wait 5-10 minutes for SSL provisioning.

---

## Step 6: Wait for First Deploy

Render auto-deploys when you click Apply. Monitor progress:

1. Go to **ankigen-api → Deploys**
2. Watch the build logs
3. Build takes ~5-10 minutes (installs deps, builds all 3 codebases)

---

## Step 7: Create Admin User

Connect to the database and create your admin user:

```bash
# In Render dashboard → ankigen-db → Connect → External Connection
# Copy the external connection string, then:
psql "<EXTERNAL_CONNECTION_STRING>"

# Insert admin user (SHA-256 hash of your password)
INSERT INTO public.users (id, email, password_hash, role, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'admin@mydomain.com',
    encode(digest('YOUR_ADMIN_PASSWORD', 'sha256'), 'hex'),
    'admin',
    NOW(),
    NOW()
);
\q
```

Or use the Render Shell:
1. Go to **ankigen-api → Shell**
2. Run: `node -e "const crypto = require('crypto'); console.log(crypto.createHash('sha256').update('YOUR_PASSWORD').digest('hex'))"`
3. Copy the hash and use it in the SQL above

---

## Step 8: Verify Deployment

```bash
# 1. Health check
curl https://mydomain.com/api/healthz
# Expected: {"status":"ok","checks":{"database":{"status":"ok"},"ai":{"status":"ok"}}}

# 2. Frontend loads
curl -I https://mydomain.com/
# Expected: 200, content-type: text/html

# 3. Admin frontend loads
curl -I https://mydomain.com/admin
# Expected: 200, content-type: text/html

# 4. Admin login
curl -s -X POST https://mydomain.com/api/admin/auth/token \
  -H "Authorization: Basic $(echo -n 'admin@mydomain.com:YOUR_PASSWORD' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"ttl_minutes": 60}'
# Expected: {"ok":true,"data":{"token":"eyJ...","expires_in":3600}}

# 5. Admin health (use token from above)
curl -s https://mydomain.com/api/admin/health \
  -H "Authorization: Bearer <TOKEN>"
# Expected: {"ok":true,"data":{"status":"healthy",...}}
```

---

## Step 9: Update CORS Origins

The API's CORS is configured via env vars. Make sure these are set in Render:

```
APP_URL=https://mydomain.com
ADMIN_URL=https://mydomain.com/admin
```

If you need to add more origins, update the `APP_URL` and `ADMIN_URL` in Render dashboard.

---

## Step 10: Set Up Monitoring

### View Logs
- Render dashboard → **ankigen-api → Logs**
- Or: **ankigen-api → Shell** → `tail -f /app/logs/server.log`

### Health Monitoring
- Render auto-pings `/api/healthz` every 30s
- If unhealthy, Render auto-restarts the service

### Database Backups
- Render Postgres has automatic daily backups
- Go to **ankigen-db → Backups** to configure

---

## Updating / Redeploying

```bash
# Push changes → Render auto-deploys
git add .
git commit -m "update: description"
git push origin main
```

Render detects the push and rebuilds automatically.

---

## Rollback

```bash
# Option 1: Git revert
git revert HEAD
git push origin main

# Option 2: Render dashboard
# ankigen-api → Deploys → find previous deploy → "Redeploy"
```

---

## Troubleshooting

### Build fails
- Check build logs in Render dashboard
- Common issue: `pnpm-lock.yaml` out of sync → run `pnpm install` locally and commit

### 502 error
- Check if the service is running: **ankigen-api → Metrics**
- Check logs for startup errors
- Verify all env vars are set

### Database connection error
- Verify `DATABASE_URL` is set (auto-injected from the database)
- Check **ankigen-db** is running

### Admin login fails
- Verify admin user exists in database
- Check `ADMIN_JWT_SECRET` is set
- Check `ADMIN_PASSWORD` matches the SHA-256 hash in DB

### Static files not loading
- Check that the build completed successfully
- Verify `admin-frontend/dist` and `artifacts/anki-generator/dist/public` exist in the image
