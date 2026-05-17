# Troubleshooting Guide — AnkiGen Production

## Quick Diagnostics

```bash
# Full system status
echo "=== Containers ===" && docker compose ps && \
echo "=== Networks ===" && docker network ls | grep ankigen && \
echo "=== Volumes ===" && docker volume ls | grep ankigen && \
echo "=== Disk ===" && df -h / && \
echo "=== Memory ===" && free -h && \
echo "=== SSL ===" && docker compose run --rm proxy certbot certificates 2>/dev/null
```

## Common Issues

### Containers won't start

```bash
# Check logs
docker compose logs api
docker compose logs proxy
docker compose logs db

# Validate config
docker compose config

# Check for port conflicts
sudo ss -tlnp | grep -E '80|443|3001|5432'

# Rebuild from scratch
docker compose down
docker compose build --no-cache
docker compose up -d
```

### 502 Bad Gateway

```bash
# Check if backend is running
docker compose ps api
docker compose ps frontend

# Check nginx error log
docker compose logs proxy | tail -50

# Test backend directly
docker compose exec api curl -f http://localhost:3001/api/healthz

# Check nginx config
docker compose exec proxy nginx -t

# Restart proxy
docker compose restart proxy
```

### Database connection failures

```bash
# Check if DB is healthy
docker compose ps db
docker compose logs db

# Test connection
docker compose exec db psql -U ankigen -c "SELECT 1"

# Check connection string
docker compose exec api node -e "console.log(process.env.DATABASE_URL?.replace(/:[^:]*@/, ':***@'))"

# Reset DB (WARNING: data loss)
docker compose down
docker volume rm ankigen_postgres_data
docker compose up -d
```

### SSL certificate issues

```bash
# Check certificate status
docker compose run --rm proxy certbot certificates

# Test renewal
docker compose run --rm proxy certbot renew --dry-run

# Re-issue certificate
docker compose run --rm proxy certbot delete -d mydomain.com
./scripts/init-ssl.sh

# Check cert files exist
docker compose exec proxy ls -la /etc/letsencrypt/live/
```

### High resource usage

```bash
# Check container resource usage
docker stats

# Check memory
free -h
docker compose exec api node -e "console.log(process.memoryUsage())"

# Check disk
df -h
docker system df

# Clean up unused resources
docker system prune -a --volumes
docker compose down && docker compose up -d
```

### Admin access denied

```bash
# Check admin auth middleware logs
docker compose logs api | grep -i "admin.*denied"

# Verify admin user exists
docker compose exec db psql -U ankigen -c "SELECT id, email, role FROM public.users WHERE role='admin'"

# Check IP allowlist
docker compose exec api node -e "console.log(process.env.ADMIN_IP_ALLOWLIST)"

# Test admin login
curl -v -X POST https://mydomain.com/api/admin/auth/token \
  -H "Authorization: Basic $(echo -n 'admin@mydomain.com:PASSWORD' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"ttl_minutes": 60}'
```

### WebSocket/streaming not working

```bash
# Check nginx WebSocket config
docker compose exec proxy cat /etc/nginx/conf.d/default.conf | grep -A5 "Upgrade"

# Test WebSocket upgrade
curl -v -H "Connection: Upgrade" -H "Upgrade: websocket" \
  https://mydomain.com/api/v2/agents/stream

# Check API stream endpoint
docker compose logs api | grep -i "stream\|websocket"
```

### Frontend shows blank page

```bash
# Check if assets exist
docker compose exec frontend ls -la /usr/share/nginx/html/

# Check nginx config
docker compose exec frontend cat /etc/nginx/conf.d/frontend.conf

# Check browser console for 404s
# Usually means base path mismatch — rebuild with correct BASE_PATH
```

### API returns CORS errors

```bash
# Check CORS env vars
docker compose exec api node -e "console.log({APP_URL: process.env.APP_URL, ADMIN_URL: process.env.ADMIN_URL})"

# Verify origin matches exactly (including protocol and port)
curl -v -H "Origin: https://mydomain.com" https://mydomain.com/api/healthz

# Check response headers for Access-Control-Allow-Origin
curl -sI -H "Origin: https://mydomain.com" https://mydomain.com/api/healthz | grep -i access-control
```

### Rate limiting too aggressive

```bash
# Check current rate limit zones in nginx config
docker compose exec proxy cat /etc/nginx/conf.d/default.conf | grep -A2 "limit_req_zone"

# Adjust rates in docker/proxy/nginx.conf, then:
docker compose exec proxy nginx -s reload
```

### Logs not appearing

```bash
# Check log volumes
docker volume inspect ankigen_api_logs

# Check pino file transport
docker compose exec api ls -la /app/logs/

# Check DB logs
docker compose exec db psql -U ankigen -c "SELECT COUNT(*) FROM server_logs"

# View container stdout logs
docker compose logs --tail=100 api
```

## Emergency Procedures

### Complete reset (data preserved)

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Complete reset (data lost)

```bash
docker compose down -v
docker compose build --no-cache
docker compose up -d
# Re-create admin user
```

### Rollback to previous version

```bash
cd /opt/ankigen
git log --oneline -5
git revert HEAD
docker compose build
docker compose up -d
```

### Emergency maintenance mode

```bash
# Stop all except DB
docker compose stop frontend admin proxy
# API remains accessible via internal network for debugging
docker compose exec api node -e "console.log('API still running')"
```
