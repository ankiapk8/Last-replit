# AnkiGen — Production Deployment Guide

## Architecture Overview

```
                        ┌─────────────────────────────────────────────────┐
                        │              Docker Host (VPS)                  │
                        │                                                 │
  Internet              │  ┌──────────────────────────────────────────┐   │
      │                 │  │         Nginx Reverse Proxy             │   │
      │  :80, :443      │  │         (SSL Termination)               │   │
      ▼                 │  │         Ports 80/443 exposed            │   │
  ┌────────┐            │  └──────┬──────────┬──────────┬────────────┘   │
  │  DNS   │            │         │          │          │                 │
  │        │            │         ▼          ▼          ▼                 │
  │ mydomain.com       │  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
  │   → VPS IP         │  │ Frontend │ │   API    │ │  Admin   │        │
  └────────┘            │  │  :80     │ │  :3001   │ │  :80     │        │
                        │  │ (static) │ │ (Node.js)│ │ (static) │        │
                        │  └──────────┘ └────┬─────┘ └──────────┘        │
                        │                    │                            │
                        │              ┌─────▼─────┐                      │
                        │              │ PostgreSQL│                      │
                        │              │   :5432   │                      │
                        │              └───────────┘                      │
                        │                                                 │
                        │  ─── Internal Network (backend) ───            │
                        │  ─── Proxy Network (proxy) ───────            │
                        └─────────────────────────────────────────────────┘

  Path Routing:
    /              → Frontend (public SPA)
    /api/*         → Production API (Express.js)
    /admin/*       → Admin Frontend (SPA)
    /api/admin/*   → Admin API (Express.js, protected)
```

## Prerequisites

- Linux VPS (Ubuntu 22.04+ / Debian 12+) with ≥2GB RAM, ≥2 vCPUs
- Docker Engine 24+ and Docker Compose v2+
- Domain name with DNS A record pointing to VPS IP
- SSH access to the VPS

## Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose (if not included)
sudo apt install docker-compose-plugin -y

# Verify
docker --version
docker compose version
```

## Step 2: DNS Setup

Create DNS A records:

| Type | Name | Value       | TTL |
| ---- | ---- | ----------- | --- |
| A    | @    | YOUR_VPS_IP | 300 |
| A    | www  | YOUR_VPS_IP | 300 |

Wait for DNS propagation:

```bash
dig +short mydomain.com
# Should return your VPS IP
```

## Step 3: Deploy Application

```bash
# Clone repository
git clone https://github.com/youruser/ankigen.git /opt/ankigen
cd /opt/ankigen

# Generate secrets
echo "POSTGRES_PASSWORD=$(openssl rand -base64 48)" >> .env.secrets
echo "ADMIN_JWT_SECRET=$(openssl rand -hex 32)" >> .env.secrets
echo "ADMIN_SECRET_KEY=$(openssl rand -hex 32)" >> .env.secrets
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env.secrets
echo "ADMIN_PASSWORD=$(openssl rand -base64 24)" >> .env.secrets

# Create production .env
cp .env.production .env
# Edit .env with your actual values:
# - DOMAIN=mydomain.com
# - OPENROUTER_API_KEY=sk-or-...
# - ADMIN_EMAIL=admin@mydomain.com
# - Plus all secrets from .env.secrets
nano .env

# Build all images
docker compose build

# Initialize SSL certificate (HTTP-only mode first)
chmod +x scripts/init-ssl.sh
./scripts/init-ssl.sh

# Start all services
docker compose up -d

# Verify all services are healthy
docker compose ps
```

## Step 4: Firewall Rules

```bash
# Allow only SSH, HTTP, HTTPS
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (for Let's Encrypt)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Verify
sudo ufw status verbose
```

## Step 5: Create Admin User

```bash
# Connect to the database
docker compose exec db psql -U ankigen -d ankigen

# Insert admin user (generate password hash first)
INSERT INTO public.users (id, email, password_hash, role, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'admin@mydomain.com',
    -- SHA-256 hash of your password
    encode(digest('YOUR_ADMIN_PASSWORD', 'sha256'), 'hex'),
    'admin',
    NOW(),
    NOW()
);
\q
```

## Step 6: Verify Deployment

```bash
# Health checks
curl -s https://mydomain.com/health
# → {"status":"ok","timestamp":"..."}

curl -s https://mydomain.com/api/healthz
# → {"status":"ok","checks":{"database":{"status":"ok"},"ai":{"status":"ok"}}}

# Admin login
curl -s -X POST https://mydomain.com/api/admin/auth/token \
  -H "Authorization: Basic $(echo -n 'admin@mydomain.com:YOUR_PASSWORD' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"ttl_minutes": 60}'
# → {"ok":true,"data":{"token":"eyJ...","expires_in":3600}}

# Admin health (use token from above)
curl -s https://mydomain.com/api/admin/health \
  -H "Authorization: Bearer eyJ..."
# → {"ok":true,"data":{"status":"healthy",...}}
```

## Zero-Downtime Deployment

```bash
# Pull latest code
cd /opt/ankigen
git pull origin main

# Rebuild and restart with zero downtime
docker compose build --no-cache
docker compose up -d --remove-orphans

# Verify
docker compose ps
```

## Backup Strategy

```bash
# Automated daily database backup
cat > /etc/cron.daily/ankigen-backup <<'CRON'
#!/bin/bash
BACKUP_DIR="/opt/ankigen/backups"
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)
docker compose exec -T db pg_dump -U ankigen ankigen | gzip > "$BACKUP_DIR/ankigen_$DATE.sql.gz"
# Keep only last 30 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
CRON
chmod +x /etc/cron.daily/ankigen-backup

# Manual backup
docker compose exec db pg_dump -U ankigen ankigen > backup_$(date +%Y%m%d).sql

# Restore from backup
gunzip -c backups/ankigen_20260517_030000.sql.gz | docker compose exec -T db psql -U ankigen -d ankigen
```

## Rollback Strategy

```bash
# Quick rollback to previous version
cd /opt/ankigen
git log --oneline -5
git revert HEAD
docker compose build
docker compose up -d

# Or rollback a specific service
docker compose up -d --force-recreate api
```

## Monitoring

```bash
# View all service status
docker compose ps

# View logs
docker compose logs -f --tail=100

# View specific service logs
docker compose logs -f api
docker compose logs -f proxy

# Resource usage
docker stats

# Database size
docker compose exec db psql -U ankigen -c "SELECT pg_size_pretty(pg_database_size('ankigen'));"

# Check SSL certificate expiry
docker compose run --rm proxy certbot certificates
```

## SSL Auto-Renewal

```bash
# Add cron job for renewal (runs daily at 3 AM)
(crontab -l 2>/dev/null; echo "0 3 * * * cd /opt/ankigen && ./scripts/renew-ssl.sh >> /var/log/ankigen-ssl.log 2>&1") | crontab -

# Test renewal
docker compose run --rm proxy certbot renew --dry-run
```

## Troubleshooting

### Services won't start

```bash
docker compose logs api
docker compose logs proxy
# Check .env file for missing variables
docker compose config  # Validates config
```

### 502 Bad Gateway

```bash
# Check if backend services are healthy
docker compose ps
docker compose logs api
# Check nginx error log
docker compose logs proxy
```

### SSL certificate issues

```bash
# Re-issue certificate
docker compose run --rm proxy certbot delete -d mydomain.com
./scripts/init-ssl.sh
```

### Database connection issues

```bash
docker compose exec db psql -U ankigen -c "SELECT 1"
docker compose logs db
```

### High memory usage

```bash
docker stats
# Adjust resource limits in docker-compose.yml deploy.resources.limits
```
