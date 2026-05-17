#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# Initialize SSL certificates with Let's Encrypt
# Run this once before first deployment
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# Load environment variables
if [ -f .env.production ]; then
    export $(grep -v '^#' .env.production | xargs)
fi

DOMAIN="${DOMAIN:-mydomain.com}"
EMAIL="${ADMIN_EMAIL:-admin@mydomain.com}"

echo "═══════════════════════════════════════════════════════════════════"
echo "  Initializing SSL for ${DOMAIN}"
echo "═══════════════════════════════════════════════════════════════════"

# Check if certificates already exist
if [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
    echo "⚠️  Certificates already exist for ${DOMAIN}"
    echo "   To renew: ./scripts/renew-ssl.sh"
    echo "   To force re-issue: certbot certonly --force-renew -d ${DOMAIN}"
    exit 0
fi

# Step 1: Start nginx with HTTP only (no SSL yet)
echo ""
echo "Step 1/3: Starting temporary nginx for certificate challenge..."

# Create a minimal HTTP-only nginx config for the challenge
cat > /tmp/nginx-challenge.conf <<'NGINX'
server {
    listen 80;
    server_name _;
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 200 "SSL certificate initialization in progress...";
        add_header Content-Type text/plain;
    }
}
NGINX

# Step 2: Obtain certificate
echo ""
echo "Step 2/3: Requesting certificate from Let's Encrypt..."

docker compose run --rm proxy sh -c "\
    mkdir -p /var/www/certbot && \
    certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email ${EMAIL} \
        --agree-tos \
        --no-eff-email \
        -d ${DOMAIN} \
        -d www.${DOMAIN} \
        --staple-ocsp \
        --must-staple \
    "

echo ""
echo "Step 3/3: SSL certificate obtained successfully!"
echo ""
echo "Certificate location: /etc/letsencrypt/live/${DOMAIN}/"
echo ""
echo "Next steps:"
echo "  1. Run: docker compose up -d"
echo "  2. Verify: https://${DOMAIN}/health"
echo ""
echo "Auto-renewal is configured via the certbot-renew service."
