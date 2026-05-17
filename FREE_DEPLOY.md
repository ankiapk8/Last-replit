# Free Tier Deployment — 100% Free, No Card Required

## Architecture

```
mydomain.com/       → Render Static Site (public frontend) — FREE
mydomain.com/api/*  → Railway Docker Container (API) — FREE
mydomain.com/admin  → Render Static Site (admin frontend) — FREE
Database            → Neon PostgreSQL — FREE
```

## Step 1: Create Neon Database (Free PostgreSQL)

1. Go to https://neon.tech → Sign up (GitHub login)
2. Create a new project → Region: US East (Ohio)
3. Copy the **Connection String** (looks like):
   ```
   postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/ankigen?sslmode=require
   ```
4. Save this — you'll need it for Railway

### Create Admin User in Neon

In Neon dashboard → SQL Editor:

```sql
-- Create tables (the API will auto-create these, but do it manually for the admin user)
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

-- Insert admin user
-- Generate hash locally: node -e "console.log(require('crypto').createHash('sha256').update('YOUR_PASSWORD').digest('hex'))"
INSERT INTO public.users (id, email, password_hash, role, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'admin@mydomain.com',
    '<SHA256_HASH>',
    'admin',
    NOW(),
    NOW()
);
```

---

## Step 2: Deploy API to Railway (Free Docker)

1. Go to https://railway.app → Sign up (GitHub login)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `ankiapk8/Last-replit` repo
4. Railway detects `railway.toml` automatically

### Set Environment Variables in Railway

Go to your project → **Variables** tab, add:

```bash
# Generate secrets:
# openssl rand -hex 32 (run 3 times)

NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/ankigen?sslmode=require
OPENROUTER_API_KEY=sk-or-your-key-here
ADMIN_JWT_SECRET=<openssl rand -hex 32>
ADMIN_SECRET_KEY=<openssl rand -hex 32>
ENCRYPTION_KEY=<openssl rand -hex 32>
ADMIN_EMAIL=admin@mydomain.com
ADMIN_PASSWORD=your-strong-password
APP_URL=https://mydomain.com
ADMIN_URL=https://mydomain.com/admin
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_RETENTION_DAYS=30
```

### Get Railway URL

After deploy, go to **Settings → Networking → Public Networking**:
- Railway gives you a URL like: `ankigen-api-production.up.railway.app`
- Save this — you'll need it for Render

---

## Step 3: Deploy Frontends to Render (Free Static Sites)

1. Go to https://dashboard.render.com
2. Click **New +** → **Blueprint**
3. Connect your GitHub repo `ankiapk8/Last-replit`
4. Render reads `render.yaml` → shows 2 static sites (no card needed!)
5. Click **Apply**

This creates:
- **ankigen-public-frontend** → `ankigen-public-frontend.onrender.com`
- **ankigen-admin-frontend** → `ankigen-admin-frontend.onrender.com`

### Add Custom Domains in Render

1. **ankigen-public-frontend** → Settings → Custom Domains → Add `mydomain.com`
2. **ankigen-admin-frontend** → Settings → Custom Domains → Add `mydomain.com/admin`

Wait — Render doesn't support path-based routing on static sites. Instead, use **Cloudflare** (free) as a reverse proxy.

---

## Step 4: Set Up Cloudflare (Free Reverse Proxy)

This is the glue that makes everything work on one domain.

1. Go to https://cloudflare.com → Sign up
2. Add your domain `mydomain.com`
3. Update your domain's nameservers to Cloudflare's (Cloudflare tells you which)
4. Wait for DNS to propagate (5-30 min)

### Add DNS Records in Cloudflare

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| CNAME | @ | ankigen-public-frontend.onrender.com | Proxied |
| CNAME | admin | ankigen-admin-frontend.onrender.com | Proxied |
| CNAME | api | your-railway-url.up.railway.app | Proxied |

### Add Cloudflare Page Rules (Free)

Go to **Rules → Page Rules**:

**Rule 1:** URL: `mydomain.com/api/*`
- Setting: **Forward URL** (301) → `https://api.mydomain.com/$1`

**Rule 2:** URL: `mydomain.com/admin/*`
- Setting: **Forward URL** (301) → `https://admin.mydomain.com/$1`

### Enable HTTPS in Cloudflare

Go to **SSL/TLS** → Set to **Full (Strict)**

### Enable Security Headers in Cloudflare

Go to **SSL/TLS → Edge Certificates**:
- Enable **Always Use HTTPS**
- Enable **HTTP Strict Transport Security (HSTS)**

Go to **Security → Settings**:
- Security Level: **Medium**
- Challenge Passage: **30 minutes**

### Enable Caching

Go to **Caching → Configuration**:
- Caching Level: **Standard**
- Browser Cache TTL: **4 hours**

Go to **Rules → Cache Rules**:

**Rule:** URL: `mydomain.com/assets/*`
- Cache: **Cache Everything**
- Edge TTL: **1 month**
- Browser TTL: **1 year**

---

## Step 5: Update CORS on Railway

In Railway dashboard → **Variables**, update:

```
APP_URL=https://mydomain.com
ADMIN_URL=https://mydomain.com/admin
```

Railway auto-redeploys on variable change.

---

## Step 6: Verify Everything

```bash
# 1. Public frontend
curl -I https://mydomain.com/
# → 200, content-type: text/html

# 2. API health
curl https://mydomain.com/api/healthz
# → {"status":"ok","checks":{"database":{"status":"ok"},"ai":{"status":"ok"}}}

# 3. Admin frontend
curl -I https://mydomain.com/admin
# → 200, content-type: text/html

# 4. Admin login
curl -s -X POST https://mydomain.com/api/admin/auth/token \
  -H "Authorization: Basic $(echo -n 'admin@mydomain.com:YOUR_PASSWORD' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"ttl_minutes": 60}'
# → {"ok":true,"data":{"token":"eyJ..."}}

# 5. Admin health (use token from above)
curl -s https://mydomain.com/api/admin/health \
  -H "Authorization: Bearer <TOKEN>"
# → {"ok":true,"data":{"status":"healthy",...}}
```

---

## Updating

```bash
# Push changes → all services auto-deploy
git add .
git commit -m "update: description"
git push origin main
```

---

## Cost Summary

| Service | Provider | Cost |
|---------|----------|------|
| Public frontend | Render static | **$0** |
| Admin frontend | Render static | **$0** |
| API server | Railway | **$0** (500 hrs/month free) |
| Database | Neon | **$0** (512MB free) |
| Reverse proxy + SSL | Cloudflare | **$0** |
| **Total** | | **$0/month** |

---

## Troubleshooting

### Cloudflare shows "Too Many Redirects"
- Check SSL/TLS mode: should be **Full (Strict)**
- Check Page Rules don't conflict

### API returns CORS error
- Verify `APP_URL` and `ADMIN_URL` in Railway match your domain exactly
- Check Cloudflare isn't stripping headers

### Railway shows "Service Unavailable"
- Railway free tier sleeps after 30 min inactivity
- First request wakes it up (5-10 sec delay)
- Consider a free uptime monitor (https://uptimerobot.com) to ping every 10 min

### Neon database connection fails
- Verify connection string includes `?sslmode=require`
- Check Neon project isn't paused (free tier pauses after inactivity)
