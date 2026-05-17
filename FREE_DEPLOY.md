# Free Tier Deployment — Detailed Step by Step ($0/month)

## Architecture Overview

```
                    ┌─────────────────────────────────────────────────┐
                    │              Cloudflare (Free)                  │
                    │         mydomain.com (SSL + Proxy)             │
                    └──────┬──────────────┬──────────────┬───────────┘
                           │              │              │
              ┌────────────▼───┐  ┌───────▼──────┐  ┌───▼────────────┐
              │ Render Static  │  │   Railway    │  │  Render Static │
              │ Public         │  │   Docker     │  │  Admin         │
              │ Frontend       │  │   API        │  │  Frontend      │
              │ (Free)         │  │   (Free)     │  │  (Free)        │
              └────────────────┘  └──────┬───────┘  └────────────────┘
                                         │
                                  ┌──────▼───────┐
                                  │    Neon      │
                                  │  PostgreSQL  │
                                  │   (Free)     │
                                  └──────────────┘
```

**Total cost: $0/month. No credit card needed anywhere.**

---

## STEP 1: Create Neon Database (Free PostgreSQL)

### 1a. Sign Up
1. Open https://neon.tech
2. Click **"Sign Up"**
3. Choose **"Continue with GitHub"** (easiest)
4. Authorize Neon to access your GitHub

### 1b. Create Project
1. Click **"New Project"**
2. **Project name:** `ankigen`
3. **Region:** Select `US East (Ohio)` (closest to Render/Railway)
4. **PostgreSQL version:** 16
5. Click **"Create Project"**

### 1c. Get Connection String
1. On the project dashboard, find **"Connection string"**
2. Click the copy icon next to it
3. It looks like:
   ```
   postgresql://user:randompassword@ep-something-123456.us-east-2.aws.neon.tech/ankigen?sslmode=require
   ```
4. **Save this somewhere** — you'll paste it into Railway later

### 1d. Create Admin User
1. In Neon dashboard, click **"SQL Editor"** (left sidebar)
2. Paste this SQL and click **"Run"**:

```sql
-- Create the users table
CREATE TABLE IF NOT EXISTS public.users (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    email varchar UNIQUE,
    first_name varchar,
    last_name varchar,
    profile_image_url varchar,
    stripe_customer_id varchar,
    stripe_subscription_id varchar,
    role varchar NOT NULL DEFAULT 'user',
    manual_pro varchar DEFAULT 'false',
    password_hash varchar,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
```

3. Now generate your password hash. On your local machine, run:
```bash
node -e "console.log(require('crypto').createHash('sha256').replace('YOUR_ADMIN_PASSWORD','MyStr0ng!Pass').digest('hex'))"
```
Replace `MyStr0ng!Pass` with your actual admin password. Copy the output hash.

4. Insert the admin user (replace `<HASH>` with the hash from step 3):
```sql
INSERT INTO public.users (id, email, password_hash, role, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'admin@mydomain.com',
    '<HASH>',
    'admin',
    NOW(),
    NOW()
);
```

5. Click **"Run"**. You should see "Success. No rows returned."

---

## STEP 2: Deploy API to Railway (Free Docker)

### 2a. Sign Up
1. Open https://railway.app
2. Click **"Login"** → **"Login with GitHub"**
3. Authorize Railway

### 2b. Create Project from GitHub
1. Click **"New Project"** (big button in dashboard)
2. Select **"Deploy from GitHub repo"**
3. If prompted, install Railway GitHub app → select your repo
4. Select `ankiapk8/Last-replit`
5. Railway detects `railway.toml` and starts building

### 2c. Set Environment Variables
1. In Railway dashboard, click on your project
2. Click the **"Variables"** tab
3. Click **"New Variable"** for each of these:

```
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/ankigen?sslmode=require
OPENROUTER_API_KEY=sk-or-your-actual-key-here
ADMIN_JWT_SECRET=<run: openssl rand -hex 32>
ADMIN_SECRET_KEY=<run: openssl rand -hex 32>
ENCRYPTION_KEY=<run: openssl rand -hex 32>
ADMIN_EMAIL=admin@mydomain.com
ADMIN_PASSWORD=your-strong-password
APP_URL=https://mydomain.com
ADMIN_URL=https://mydomain.com/admin
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_RETENTION_DAYS=30
```

**To generate the random secrets, run these locally:**
```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

4. After adding all variables, Railway auto-redeploys

### 2d. Get Railway Public URL
1. Click **"Settings"** tab
2. Scroll to **"Networking"** → **"Public Networking"**
3. Click **"Generate Domain"**
4. You get a URL like: `ankigen-production-abc123.up.railway.app`
5. **Save this URL** — you'll need it for Cloudflare

### 2e. Verify Railway Deploy
1. Click **"Deployments"** tab
2. Wait for the latest deploy to show **"Active"** (green)
3. Click on the deploy → **"Logs"** to see it running
4. Test the health endpoint:
```bash
curl https://ankigen-production-abc123.up.railway.app/api/healthz
```
Expected output:
```json
{"status":"ok","checks":{"database":{"status":"ok"},"ai":{"status":"ok"}},"uptimeSeconds":...}
```

---

## STEP 3: Deploy Frontends to Render (Free Static Sites)

### 3a. Sign Up / Log In
1. Go to https://dashboard.render.com
2. Sign up with GitHub (no card needed for static sites)

### 3b. Create Blueprint
1. Click **"New +"** (top right) → **"Blueprint"**
2. Connect your GitHub account if prompted
3. Select repository: `ankiapk8/Last-replit`
4. Render reads `render.yaml` and shows:
   - **ankigen-public-frontend** (Static Site)
   - **ankigen-admin-frontend** (Static Site)
5. Click **"Apply"**

### 3c. Wait for Builds
1. Go to **"Dashboard"** → click each service
2. Wait for both to show **"Live"** (green)
3. Each gets a URL like:
   - Public: `ankigen-public-frontend-xyz.onrender.com`
   - Admin: `ankigen-admin-frontend-abc.onrender.com`
4. **Save both URLs** — you'll need them for Cloudflare

### 3d. Test the Static Sites
```bash
# Public frontend
curl -I https://ankigen-public-frontend-xyz.onrender.com
# → HTTP/2 200

# Admin frontend
curl -I https://ankigen-admin-frontend-abc.onrender.com
# → HTTP/2 200
```

---

## STEP 4: Set Up Cloudflare (Free Reverse Proxy + SSL)

This is the glue that makes everything work on one domain.

### 4a. Add Domain to Cloudflare
1. Go to https://dash.cloudflare.com
2. Sign up (free, no card)
3. Click **"Add a Site"**
4. Enter your domain: `mydomain.com`
5. Select **"Free"** plan → **"Continue"**
6. Cloudflare scans your existing DNS records
7. **Change your domain's nameservers** to the two Cloudflare nameservers shown:
   - Example: `ns1.cloudflare.com` and `ns2.cloudflare.com`
8. Go to your domain registrar (GoDaddy, Namecheap, etc.)
9. Find **"Nameservers"** or **"DNS Settings"**
10. Replace existing nameservers with Cloudflare's two
11. Click **"Continue"** on Cloudflare
12. Wait 5-30 minutes for propagation (Cloudflare will email you)

### 4b. Add DNS Records
In Cloudflare dashboard → **DNS** → **Records** → **Add Record**:

**Record 1 — Public Frontend (root domain):**
| Field | Value |
|-------|-------|
| Type | CNAME |
| Name | @ |
| Target | ankigen-public-frontend-xyz.onrender.com |
| Proxy status | Proxied (orange cloud ON) |
| TTL | Auto |

**Record 2 — Admin Frontend:**
| Field | Value |
|-------|-------|
| Type | CNAME |
| Name | admin |
| Target | ankigen-admin-frontend-abc.onrender.com |
| Proxy status | Proxied (orange cloud ON) |
| TTL | Auto |

**Record 3 — API:**
| Field | Value |
|-------|-------|
| Type | CNAME |
| Name | api |
| Target | ankigen-production-abc123.up.railway.app |
| Proxy status | Proxied (orange cloud ON) |
| TTL | Auto |

### 4c. Enable HTTPS
1. Go to **SSL/TLS** → **Overview**
2. Set encryption mode to **"Full (strict)"**

### 4d. Enable Always Use HTTPS
1. Go to **SSL/TLS** → **Edge Certificates**
2. Toggle **"Always Use HTTPS"** → ON
3. Toggle **"HTTP Strict Transport Security (HSTS)"** → ON
   - Max-Age: 6 months
   - Include subdomains: ON
   - Preload: ON

### 4e. Add Page Rules (Path-Based Routing)
1. Go to **Rules** → **Page Rules**
2. Click **"Create Page Rule"**

**Page Rule 1 — API routing:**
| Field | Value |
|-------|-------|
| URL | `mydomain.com/api/*` |
| Setting | Forward URL |
| Status | 301 - Permanent Redirect |
| Destination | `https://api.mydomain.com/$1` |

Click **"Save and Deploy"**

**Page Rule 2 — Admin routing:**
| Field | Value |
|-------|-------|
| URL | `mydomain.com/admin/*` |
| Setting | Forward URL |
| Status | 301 - Permanent Redirect |
| Destination | `https://admin.mydomain.com/$1` |

Click **"Save and Deploy"**

### 4f. Add Caching Rules
1. Go to **Rules** → **Cache Rules** → **Create Rule**
2. **Rule name:** "Cache static assets"
3. **If:** URI Path contains `/assets/`
4. **Then:** Cache eligibility → Eligible for cache
5. **Edge TTL:** 1 month
6. **Browser TTL:** 1 year
7. Click **"Deploy"**

### 4g. Add Security Settings
1. Go to **Security** → **Settings**
2. **Security Level:** Medium
3. **Challenge Passage:** 30 minutes
4. Scroll down → **"Bot Fight Mode"** → ON

---

## STEP 5: Update Railway CORS

The API needs to accept requests from your domain.

1. Go to https://railway.app → your project
2. Click **"Variables"** tab
3. Make sure these are set exactly:
```
APP_URL=https://mydomain.com
ADMIN_URL=https://mydomain.com/admin
```
4. Railway auto-redeploys when you change variables

---

## STEP 6: Verify Everything Works

### 6a. Check DNS Propagation
```bash
# Should return Cloudflare IPs (not your registrar's)
dig +short mydomain.com
dig +short admin.mydomain.com
dig +short api.mydomain.com
```

### 6b. Test Public Frontend
```bash
curl -I https://mydomain.com/
# Expected: HTTP/2 200, content-type: text/html
```

### 6c. Test API
```bash
curl https://mydomain.com/api/healthz
# Expected: {"status":"ok","checks":{"database":{"status":"ok"},"ai":{"status":"ok"}}}
```

### 6d. Test Admin Frontend
```bash
curl -I https://mydomain.com/admin
# Expected: HTTP/2 200, content-type: text/html
```

### 6e. Test Admin Login
```bash
curl -s -X POST https://mydomain.com/api/admin/auth/token \
  -H "Authorization: Basic $(echo -n 'admin@mydomain.com:YOUR_PASSWORD' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"ttl_minutes": 60}'
# Expected: {"ok":true,"data":{"token":"eyJ...","expires_in":3600}}
```

### 6f. Test Admin API (use token from 6e)
```bash
curl -s https://mydomain.com/api/admin/health \
  -H "Authorization: Bearer <TOKEN_FROM_6E>"
# Expected: {"ok":true,"data":{"status":"healthy",...}}
```

### 6g. Test SSL
```bash
# Should show Cloudflare certificate
echo | openssl s_client -servername mydomain.com -connect mydomain.com:443 2>/dev/null | openssl x509 -noout -issuer -dates
```

---

## STEP 7: Set Up Uptime Monitor (Prevent Railway Sleep)

Railway's free tier sleeps after 30 minutes of inactivity. A free uptime monitor pings your API to keep it awake.

1. Go to https://uptimerobot.com → Sign up (free)
2. Click **"Add New Monitor"**
3. **Monitor Type:** HTTP(s)
4. **Friendly Name:** AnkiGen API
5. **URL:** `https://mydomain.com/api/healthz`
6. **Monitoring Interval:** 5 minutes
7. Click **"Create Monitor"**

This pings your API every 5 minutes, preventing it from sleeping.

---

## Updating Your App

```bash
# Make changes locally
git add .
git commit -m "update: description"
git push origin main
```

All three services auto-deploy on push:
- **Render** detects the push → rebuilds static sites
- **Railway** detects the push → rebuilds Docker container
- **Neon** (database) doesn't change — no action needed

---

## Cost Summary

| Service | Provider | Plan | Monthly Cost |
|---------|----------|------|-------------|
| Public frontend | Render | Static (free) | $0 |
| Admin frontend | Render | Static (free) | $0 |
| API server | Railway | Free (500 hrs) | $0 |
| Database | Neon | Free (512MB) | $0 |
| Reverse proxy + SSL | Cloudflare | Free | $0 |
| Uptime monitor | UptimeRobot | Free | $0 |
| **Total** | | | **$0.00/month** |

---

## Troubleshooting

### "Site not reachable" after Cloudflare setup
- Nameservers haven't propagated yet. Wait up to 24 hours (usually 5-30 min)
- Verify at https://www.whatsmydns.net — check that your domain shows Cloudflare IPs

### API returns 502 or "Service Unavailable"
- Railway free tier is sleeping. Wait 10 seconds and try again
- Set up UptimeRobot (Step 7) to prevent this
- Check Railway logs: railway.app → project → Deployments → click latest → Logs

### CORS error in browser console
- Verify `APP_URL` and `ADMIN_URL` in Railway match your domain exactly
- Check that Cloudflare isn't blocking the `Origin` header
- Try: `curl -H "Origin: https://mydomain.com" -I https://mydomain.com/api/healthz`

### Admin login returns 403
- Verify admin user exists in Neon SQL Editor:
  ```sql
  SELECT id, email, role FROM public.users;
  ```
- Verify password hash matches:
  ```bash
  node -e "console.log(require('crypto').createHash('sha256').update('YOUR_PASSWORD').digest('hex'))"
  ```
- Check `ADMIN_JWT_SECRET` is set in Railway

### Page Rules not working
- Cloudflare free tier allows 3 page rules — you only need 2
- Make sure the rules are in the right order (API first, then admin)
- Clear Cloudflare cache: Caching → Configuration → Purge Everything

### Neon database pauses
- Neon free tier pauses after 7 days of inactivity
- UptimeRobot pings the API which queries the DB, keeping it active
- If paused, first request will be slow (10-15 sec) while it wakes up
