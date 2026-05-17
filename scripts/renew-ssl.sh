#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# Renew Let's Encrypt SSL certificates
# Run via cron: 0 3 * * * /root/Last-replit/scripts/renew-ssl.sh
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — Checking SSL certificate renewal..."

# Renew certificates
docker compose run --rm proxy certbot renew \
    --quiet \
    --deploy-hook "nginx -s reload"

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — SSL renewal check complete."
