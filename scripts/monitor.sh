#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# AnkiGen — Production Monitoring Script
# Run via cron: */5 * * * * /opt/ankigen/scripts/monitor.sh
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="/var/log/ankigen-monitor.log"
ALERT_EMAIL="${ADMIN_EMAIL:-admin@mydomain.com}"
DOMAIN="${DOMAIN:-mydomain.com}"

log() {
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $1" | tee -a "$LOG_FILE"
}

alert() {
    log "ALERT: $1"
    # Uncomment to enable email alerts:
    # echo "$1" | mail -s "AnkiGen Alert" "$ALERT_EMAIL" 2>/dev/null || true
}

# ── Check container health ──────────────────────────────────────────────────
check_containers() {
    log "Checking container health..."
    
    UNHEALTHY=$(docker compose -f "$PROJECT_DIR/docker-compose.yml" ps --format json 2>/dev/null | \
        jq -r 'select(.Health == "unhealthy" or .State != "running") | .Name' 2>/dev/null || true)
    
    if [ -n "$UNHEALTHY" ]; then
        alert "Unhealthy containers detected: $UNHEALTHY"
        # Attempt auto-restart
        docker compose -f "$PROJECT_DIR/docker-compose.yml" restart
        log "Auto-restart triggered for unhealthy containers"
    else
        log "All containers healthy"
    fi
}

# ── Check disk space ─────────────────────────────────────────────────────────
check_disk() {
    USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
    if [ "$USAGE" -gt 85 ]; then
        alert "Disk usage is at ${USAGE}%"
    else
        log "Disk usage: ${USAGE}%"
    fi
}

# ── Check SSL certificate expiry ─────────────────────────────────────────────
check_ssl() {
    if [ -f "/var/lib/docker/volumes/ankigen_letsencrypt/_data/live/${DOMAIN}/cert.pem" ]; then
        EXPIRY=$(openssl x509 -enddate -noout \
            -in "/var/lib/docker/volumes/ankigen_letsencrypt/_data/live/${DOMAIN}/cert.pem" 2>/dev/null | \
            cut -d= -f2)
        EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$EXPIRY" +%s 2>/dev/null)
        NOW_EPOCH=$(date +%s)
        DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
        
        if [ "$DAYS_LEFT" -lt 14 ]; then
            alert "SSL certificate expires in ${DAYS_LEFT} days!"
        else
            log "SSL certificate valid for ${DAYS_LEFT} days"
        fi
    else
        log "SSL certificate not found (may not be initialized yet)"
    fi
}

# ── Check API health ─────────────────────────────────────────────────────────
check_api() {
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time 10 "https://${DOMAIN}/api/healthz" 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" != "200" ]; then
        alert "API health check failed with HTTP ${HTTP_CODE}"
    else
        log "API health check: OK"
    fi
}

# ── Check memory usage ───────────────────────────────────────────────────────
check_memory() {
    MEM_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')
    if [ "$MEM_USAGE" -gt 90 ]; then
        alert "Memory usage is at ${MEM_USAGE}%"
    else
        log "Memory usage: ${MEM_USAGE}%"
    fi
}

# ── Rotate log file ──────────────────────────────────────────────────────────
rotate_log() {
    if [ -f "$LOG_FILE" ] && [ "$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)" -gt 10485760 ]; then
        mv "$LOG_FILE" "${LOG_FILE}.1"
        log "Log rotated"
    fi
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
    log "=== Monitoring check started ==="
    rotate_log
    check_containers
    check_disk
    check_ssl
    check_api
    check_memory
    log "=== Monitoring check complete ==="
}

main "$@"
