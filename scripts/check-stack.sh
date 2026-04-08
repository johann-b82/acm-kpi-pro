#!/bin/bash
# ACM KPI Pro — Stack smoke test
# Run AFTER `docker compose up -d` to verify all services are healthy.
#
# Usage:
#   bash scripts/check-stack.sh
#   BASE_URL=https://acm-kpi.acm.local bash scripts/check-stack.sh
#
# Requirements: docker (compose), curl, python3 (stdlib only)
set -e

BASE_URL="${BASE_URL:-https://localhost}"
INSECURE="--insecure"   # Allow self-signed cert in dev (tls internal)

echo "=== ACM KPI Pro Stack Health Check ==="
echo "Base URL: $BASE_URL"
echo ""

# 1. Check Caddy internal health endpoint (:8080 — no TLS)
echo -n "[1/5] Caddy internal health (:8080/health)... "
CADDY_HEALTH=$(docker compose exec caddy wget -qO- http://localhost:8080/health 2>/dev/null || echo "FAIL")
[ "$CADDY_HEALTH" = "OK" ] && echo "OK" || { echo "FAIL: $CADDY_HEALTH"; exit 1; }

# 2. Check API /healthz through Caddy (HTTPS → reverse proxy → Fastify)
echo -n "[2/5] API /api/v1/healthz via Caddy (HTTPS)... "
HEALTHZ=$(curl -sf $INSECURE "$BASE_URL/api/v1/healthz" 2>/dev/null || echo "FAIL")
echo "$HEALTHZ" | python3 -c "
import sys, json
data = json.load(sys.stdin)
assert data.get('status') == 'ok', f'status is not ok: {data}'
assert data.get('db_connected') == True, f'db_connected is not True: {data}'
ldap = data.get('ldap_reachable')
print('OK (status=ok, db_connected=True, ldap_reachable=' + str(ldap) + ')')
" || { echo "FAIL: $HEALTHZ"; exit 1; }

# 3. Verify security headers are present
echo -n "[3/5] Security headers (HSTS, X-Frame-Options, CSP)... "
HEADERS=$(curl -sI $INSECURE "$BASE_URL/" 2>/dev/null)
echo "$HEADERS" | grep -qi "strict-transport-security" || { echo "FAIL: missing Strict-Transport-Security"; exit 1; }
echo "$HEADERS" | grep -qi "x-frame-options" || { echo "FAIL: missing X-Frame-Options"; exit 1; }
echo "$HEADERS" | grep -qi "content-security-policy" || { echo "FAIL: missing Content-Security-Policy"; exit 1; }
echo "$HEADERS" | grep -qi "x-content-type-options" || { echo "FAIL: missing X-Content-Type-Options"; exit 1; }
echo "OK"

# 4. Frontend root returns 200 (React SPA index.html)
echo -n "[4/5] Frontend accessible at / (HTTP 200)... "
STATUS=$(curl -so /dev/null -w "%{http_code}" $INSECURE "$BASE_URL/" 2>/dev/null)
[ "$STATUS" = "200" ] && echo "OK (200)" || { echo "FAIL: HTTP $STATUS (expected 200)"; exit 1; }

# 5. Protected API route returns 401 when called without session cookie
echo -n "[5/5] /api/v1/auth/me returns 401 when unauthenticated... "
STATUS=$(curl -so /dev/null -w "%{http_code}" $INSECURE "$BASE_URL/api/v1/auth/me" 2>/dev/null)
[ "$STATUS" = "401" ] && echo "OK (401)" || { echo "FAIL: HTTP $STATUS (expected 401)"; exit 1; }

echo ""
echo "=== All checks passed ==="
echo ""
echo "Optional verification commands:"
echo "  # HTTP → HTTPS redirect"
echo "  curl -si http://localhost/ | head -3"
echo ""
echo "  # Non-root user inside container"
echo "  docker compose exec api id"
echo "  # Expected: uid=1000(appuser) gid=1000(appuser)"
echo ""
echo "  # Structured JSON logs"
echo "  docker compose logs api --no-log-prefix 2>/dev/null | head -3"
