# Security Checklist — AnkiGen Production Deployment

## Pre-Deployment

- [ ] `ADMIN_JWT_SECRET` is ≥ 32 characters, randomly generated
- [ ] `ADMIN_PASSWORD` is strong (≥16 chars, mixed case, numbers, symbols)
- [ ] `ADMIN_SECRET_KEY` is randomly generated
- [ ] `ENCRYPTION_KEY` is 32-byte hex, randomly generated
- [ ] `POSTGRES_PASSWORD` is strong and unique
- [ ] `NODE_ENV=production` on all services
- [ ] `LOCAL_DEV_IS_PRO` is NOT set in production
- [ ] All placeholder values in `.env` have been replaced
- [ ] `.env` file has `chmod 600` permissions
- [ ] `.env` is in `.gitignore`

## Network Security

- [ ] Only ports 80 and 443 are publicly exposed
- [ ] API port 3001 is NOT exposed to host
- [ ] Frontend port 80 is NOT exposed to host
- [ ] Admin port 80 is NOT exposed to host
- [ ] Database port 5432 is NOT exposed to host
- [ ] UFW firewall is enabled with deny-default policy
- [ ] Docker internal networks are used (no host networking)

## SSL/TLS

- [ ] Let's Encrypt certificate is issued and valid
- [ ] HTTP → HTTPS redirect is working
- [ ] HSTS header is present with `max-age=63072000`
- [ ] TLS 1.2+ only (no TLS 1.0/1.1)
- [ ] OCSP stapling is enabled
- [ ] Auto-renewal cron job is configured
- [ ] SSL certificate expiry monitoring is set up

## Admin Security

- [ ] `/admin` path requires authentication
- [ ] JWT tokens expire (default 60 minutes)
- [ ] API keys are hashed before storage
- [ ] Provider API keys are encrypted at rest
- [ ] IP allowlist is configured (if applicable)
- [ ] Rate limiting is active on `/api/admin/*` (10 req/s)
- [ ] Brute-force protection on `/api/admin/auth` (5 req/min)
- [ ] Admin frontend has `X-Robots-Tag: noindex, nofollow`
- [ ] Admin frontend has `noindex, nofollow` meta tag
- [ ] CORS only allows the configured `APP_URL` and `ADMIN_URL`
- [ ] Audit logging is enabled for all admin actions
- [ ] Role-based access control is enforced (admin/owner/developer)

## Application Security

- [ ] Helmet.js security headers are active
- [ ] CORS is properly configured
- [ ] Request body size limits are set (1mb default, 50mb uploads)
- [ ] SQL injection prevention (parameterized queries via drizzle-orm)
- [ ] XSS protection headers are set
- [ ] Content-Security-Policy headers are configured
- [ ] File upload validation is in place
- [ ] Error messages don't leak stack traces in production

## Container Security

- [ ] All containers run as non-root users
- [ ] Multi-stage builds minimize image size
- [ ] Production dependencies only (no devDependencies)
- [ ] Health checks are configured for all services
- [ ] Resource limits are set (memory, CPU)
- [ ] Container images are built from specific versions (not `latest`)
- [ ] Log rotation is configured (json-file with max-size)

## Database Security

- [ ] Database password is strong
- [ ] Database is not publicly accessible
- [ ] Database backups are encrypted
- [ ] Log retention policy is configured (30 days)
- [ ] User roles are properly assigned

## Monitoring & Alerting

- [ ] Health endpoints are accessible
- [ ] Logs are being collected and rotated
- [ ] Container restart policies are set (`unless-stopped`)
- [ ] SSL expiry alerts are configured
- [ ] Disk space monitoring is set up
