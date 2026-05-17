# Testing Checklist — AnkiGen Production Deployment

## Infrastructure Tests

```bash
# 1. All containers running
docker compose ps
# Expected: All 5 services (db, api, frontend, admin, proxy) are "Up" and "healthy"

# 2. No ports exposed except 80/443
docker compose ps --format json | jq '.[].Publishers'
# Expected: Only proxy has PublishedPort 80 and 443

# 3. Networks are isolated
docker network inspect ankigen_backend
# Expected: "Internal: true"
docker network inspect ankigen_proxy
# Expected: "Internal: false"
```

## Routing Tests

```bash
# 4. Frontend serves at /
curl -s -o /dev/null -w "%{http_code}" https://mydomain.com/
# Expected: 200

# 5. API serves at /api
curl -s https://mydomain.com/api/healthz
# Expected: {"status":"ok",...}

# 6. Admin frontend serves at /admin
curl -s -o /dev/null -w "%{http_code}" https://mydomain.com/admin
# Expected: 200

# 7. Admin API serves at /api/admin
curl -s https://mydomain.com/api/admin/health \
  -H "Authorization: Bearer <token>"
# Expected: {"ok":true,"data":{"status":"healthy",...}}

# 8. SPA routing works (deep links)
curl -s -o /dev/null -w "%{http_code}" https://mydomain.com/decks
# Expected: 200 (not 404)

# 9. Admin SPA routing works
curl -s -o /dev/null -w "%{http_code}" https://mydomain.com/admin/providers
# Expected: 200 (not 404)
```

## SSL Tests

```bash
# 10. HTTP redirects to HTTPS
curl -s -o /dev/null -w "%{http_code}" http://mydomain.com/
# Expected: 301

# 11. HTTPS works
curl -s -o /dev/null -w "%{http_code}" https://mydomain.com/
# Expected: 200

# 12. SSL certificate is valid
echo | openssl s_client -servername mydomain.com -connect mydomain.com:443 2>/dev/null | openssl x509 -noout -dates
# Expected: Valid dates, not expired

# 13. HSTS header present
curl -sI https://mydomain.com/ | grep -i strict-transport-security
# Expected: strict-transport-security: max-age=63072000; includeSubDomains; preload

# 14. TLS version (no TLS 1.0/1.1)
echo | openssl s_client -tls1 -connect mydomain.com:443 2>&1 | grep "Protocol"
# Expected: Should NOT connect with TLS 1.0
```

## Security Tests

```bash
# 15. Admin without auth is rejected
curl -s -o /dev/null -w "%{http_code}" https://mydomain.com/api/admin/health
# Expected: 403

# 16. Admin with wrong credentials is rejected
curl -s -X POST https://mydomain.com/api/admin/auth/token \
  -H "Authorization: Basic $(echo -n 'wrong:wrong' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"ttl_minutes": 60}'
# Expected: 403

# 17. Security headers present
curl -sI https://mydomain.com/ | grep -iE "x-content-type|x-frame|x-xss|referrer"
# Expected: All security headers present

# 18. Hidden files blocked
curl -s -o /dev/null -w "%{http_code}" https://mydomain.com/.env
# Expected: 404

# 19. Attack paths blocked
curl -s -o /dev/null -w "%{http_code}" https://mydomain.com/wp-admin
# Expected: 404

# 20. Rate limiting works (send 100 rapid requests)
for i in $(seq 1 100); do
  curl -s -o /dev/null -w "%{http_code}\n" https://mydomain.com/api/healthz &
done | sort | uniq -c
# Expected: Some 429 responses after burst limit
```

## API Functional Tests

```bash
# 21. Health check returns full status
curl -s https://mydomain.com/api/healthz | jq .
# Expected: {"status":"ok","checks":{"database":{"status":"ok"},"ai":{"status":"ok"}}}

# 22. Admin health check (authenticated)
TOKEN=$(curl -s -X POST https://mydomain.com/api/admin/auth/token \
  -H "Authorization: Basic $(echo -n 'admin@mydomain.com:PASSWORD' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"ttl_minutes": 60}' | jq -r '.data.token')

curl -s https://mydomain.com/api/admin/health \
  -H "Authorization: Bearer $TOKEN" | jq .
# Expected: {"ok":true,"data":{"status":"healthy",...}}

# 23. Admin can list providers
curl -s https://mydomain.com/api/admin/providers \
  -H "Authorization: Bearer $TOKEN" | jq .
# Expected: {"ok":true,"data":[...]}

# 24. Admin can list modes
curl -s https://mydomain.com/api/admin/modes \
  -H "Authorization: Bearer $TOKEN" | jq .
# Expected: {"ok":true,"data":[...]}

# 25. Admin can list audit logs
curl -s "https://mydomain.com/api/admin/audit?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq .
# Expected: {"ok":true,"data":[...],"meta":{...}}
```

## WebSocket Tests

```bash
# 26. WebSocket upgrade works (agent streaming)
curl -v -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  https://mydomain.com/api/v2/agents/stream 2>&1 | grep -i "upgrade"
# Expected: 101 Switching Protocols (or 401 if unauthenticated)
```

## Performance Tests

```bash
# 27. Response time < 200ms for health check
curl -s -o /dev/null -w "Time: %{time_total}s\n" https://mydomain.com/api/healthz
# Expected: < 0.2s

# 28. Gzip compression works
curl -s -H "Accept-Encoding: gzip" -o /dev/null -w "Size: %{size_download}\n" https://mydomain.com/
# Expected: Compressed size < uncompressed

# 29. HTTP/2 works
curl -s -o /dev/null -w "HTTP Version: %{http_version}\n" https://mydomain.com/
# Expected: 2
```

## Database Tests

```bash
# 30. Database is accessible
docker compose exec db psql -U ankigen -c "SELECT 1"
# Expected: ?column? | 1

# 31. Tables exist
docker compose exec db psql -U ankigen -c "\dt"
# Expected: decks, cards, qbanks, questions, users, sessions, etc.

# 32. Admin tables exist
docker compose exec db psql -U ankigen -c "\dt" | grep -E "provider|mode|tool|mcp|admin"
# Expected: provider_configs, agent_mode_configs, tool_configs, mcp_server_configs, admin_api_keys, admin_audit_log
```
