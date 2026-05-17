# ══════════════════════════════════════════════════════════════════════════════
# Reverse Proxy — Nginx with Let's Encrypt support
# Only publicly exposed container
# ══════════════════════════════════════════════════════════════════════════════

FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="AnkiGen Proxy"
LABEL org.opencontainers.image.description="Reverse proxy with SSL termination"

# Install certbot for Let's Encrypt
RUN apk add --no-cache certbot certbot-nginx openssl

# Remove default config
RUN rm -f /etc/nginx/conf.d/default.conf

# Copy main nginx configuration
COPY docker/proxy/nginx.conf /etc/nginx/conf.d/default.conf

# Create directories for Let's Encrypt and certbot challenges
RUN mkdir -p /var/www/certbot /etc/letsencrypt /var/log/nginx && \
    chown -R nginx:nginx /var/www/certbot /var/log/nginx /var/run

# Create non-root user setup
RUN addgroup -g 1001 -S proxygroup && \
    adduser -u 1001 -S proxyuser -G proxygroup

EXPOSE 80 443

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
