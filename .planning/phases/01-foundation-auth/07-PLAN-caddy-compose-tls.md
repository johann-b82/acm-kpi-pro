# Plan 7: Caddy + Docker Compose + TLS + Security Headers + Preflight Checks

**Phase:** 1 — Foundation & Auth
**Depends on:** Plans 2, 3, 4, 5, and 6 — needs all service Dockerfiles + built outputs
**Can run in parallel with:** No — final integration plan; ties everything together
**Requirements covered:** SEC-03 (LDAPS preferred, LDAP_TLS warning), SEC-04 (HSTS, CSP, X-Frame-Options), BRAND-01/02 (logo/favicon served through Caddy), partial DEP-01 (docker compose up works on Linux)

## Goal

After this plan commits, `docker compose up` on a Linux host builds all images and starts four services (caddy, api, frontend, postgres) with Redis scaffolded. Caddy serves HTTPS on port 443 using `tls internal` (self-signed dev certificate). Visiting `https://localhost` redirects unauthenticated users to `/login`. All HTTP responses include HSTS, Content-Security-Policy, and X-Frame-Options headers. An entrypoint preflight script in the API container checks volume permissions and logs a warning if the UID owner of mounted volumes doesn't match the container user. Container users run as non-root UID 1000.

## Assumptions (flag for IT)

- **ASSUMPTION:** Target OS is Ubuntu 22.04 LTS. The `:Z` SELinux labels on volume mounts are included but are no-ops on non-SELinux hosts. If IT confirms SELinux enforcing mode (RHEL/CentOS), these labels are required. **Ask IT: "Is SELinux enforcing on the production host?"**
- **ASSUMPTION:** `tls internal` (Caddy self-signed) is used for Phase 1 development. When IT provides an internal CA certificate, update Caddyfile line `tls internal` to `tls /etc/caddy/certs/cert.pem /etc/caddy/certs/key.pem` and mount the cert files as shown in the comment.
- **ASSUMPTION:** The hostname in the Caddyfile is `:443` (listens on all interfaces). In production, replace with the actual hostname (e.g., `acm-kpi.acm.local`) to get proper SNI.
- **ASSUMPTION:** The frontend is served as static files by Caddy directly (not by a Node.js server). The `apps/frontend/Dockerfile` produces a scratch image with just the `dist/` folder, and Caddy's `file_server` directive serves it.
- **ASSUMPTION:** Redis is included in docker-compose.yml as a named service (for Phase 2 Bull job queue) but is not a hard dependency for Phase 1 health checks.

## Tasks

### Task 1: Dockerfiles for api and frontend

**Files to create:**
- `apps/api/Dockerfile` — multi-stage: node:22-alpine builder → node:22-alpine runtime, non-root user
- `apps/api/entrypoint.sh` — preflight checks + migration runner before starting Fastify
- `apps/frontend/Dockerfile` — multi-stage: node:22-alpine builder → scratch (static files only)

**Action:**

Create `apps/api/Dockerfile`:
```dockerfile
# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace manifests first (layer cache optimization)
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY apps/api/package.json ./apps/api/

# Install all dependencies (includes devDependencies for build)
RUN npm ci

# Copy source code
COPY packages/core/ ./packages/core/
COPY apps/api/ ./apps/api/
COPY tsconfig.json ./

# Build core package first (api depends on it)
RUN npm -w packages/core run build

# Build API
RUN npm -w apps/api run build

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Create non-root user (PITFALL #9: explicit UID for volume permission alignment)
# UID 1000 is conventional for the first non-root user on Linux hosts.
RUN addgroup -g 1000 appuser && \
    adduser -u 1000 -G appuser -s /sbin/nologin -D appuser

# Copy built output + production node_modules from builder
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/apps/api/dist ./dist
COPY --from=builder --chown=appuser:appuser /app/apps/api/package.json ./
COPY --from=builder --chown=appuser:appuser /app/apps/api/drizzle ./drizzle

# Copy entrypoint script
COPY --chown=appuser:appuser apps/api/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/healthz || exit 1

ENTRYPOINT ["./entrypoint.sh"]
```

Create `apps/api/entrypoint.sh`:
```bash
#!/bin/sh
# ACM KPI Pro — API container entrypoint
# Runs preflight checks, then starts the Fastify server.
# (PITFALL #9: Docker volume perms / SELinux preflight)
set -e

echo "[entrypoint] ACM KPI Pro API starting..."

# ── Preflight: PostgreSQL connectivity ────────────────────────────────────────
echo "[preflight] Waiting for PostgreSQL at $DATABASE_URL..."
MAX_TRIES=30
TRIES=0
until node -e "
  import('pg').then(({ default: pg }) => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    pool.query('SELECT 1').then(() => { pool.end(); process.exit(0); }).catch(() => { pool.end(); process.exit(1); });
  });
" 2>/dev/null; do
  TRIES=$((TRIES + 1))
  if [ "$TRIES" -ge "$MAX_TRIES" ]; then
    echo "[preflight] ERROR: PostgreSQL not reachable after $MAX_TRIES attempts. Exiting."
    exit 1
  fi
  echo "[preflight] PostgreSQL not ready, retrying ($TRIES/$MAX_TRIES)..."
  sleep 2
done
echo "[preflight] PostgreSQL is reachable."

# ── Preflight: Volume permissions ─────────────────────────────────────────────
# Check if any mounted volumes have incorrect ownership.
# (PITFALL #9: UID mismatch causes write failures at runtime)
CURRENT_UID=$(id -u)
for VOL_PATH in /app/uploads /mnt/smb-share; do
  if [ -d "$VOL_PATH" ]; then
    OWNER_UID=$(stat -c %u "$VOL_PATH" 2>/dev/null || echo "unknown")
    if [ "$OWNER_UID" != "$CURRENT_UID" ] && [ "$OWNER_UID" != "unknown" ]; then
      echo "[preflight] WARNING: $VOL_PATH is owned by UID $OWNER_UID but container runs as UID $CURRENT_UID."
      echo "[preflight] WARNING: Write operations to $VOL_PATH may fail. Fix with: chown -R $CURRENT_UID:$CURRENT_UID $VOL_PATH on the host."
    fi
  fi
done

# ── Run database migrations ───────────────────────────────────────────────────
echo "[migrate] Running database migrations..."
node dist/db/migrate.js
echo "[migrate] Migrations complete."

# ── Start server ──────────────────────────────────────────────────────────────
echo "[entrypoint] Starting Fastify API on port ${API_PORT:-3000}..."
exec node dist/index.js
```

Create `apps/frontend/Dockerfile`:
```dockerfile
# ── Stage 1: Build React app ──────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY apps/frontend/package.json ./apps/frontend/

RUN npm ci

# Copy source
COPY packages/core/ ./packages/core/
COPY apps/frontend/ ./apps/frontend/
COPY tsconfig.json ./

# Build core first
RUN npm -w packages/core run build

# Build frontend (outputs to apps/frontend/dist/)
RUN npm -w apps/frontend run build

# ── Stage 2: Static files only ────────────────────────────────────────────────
# Caddy serves from a named volume; copy dist into a minimal image
# that docker compose can extract via a volume init container pattern,
# OR mount directly. Simplest: use scratch + COPY pattern.
FROM scratch AS static

COPY --from=builder /app/apps/frontend/dist /dist
```

Note on frontend serving: The `FROM scratch` stage produces a minimal image with just the static files. In `docker-compose.yml`, the `caddy` service mounts a named volume that is pre-populated by the `frontend` service using an init container pattern. Alternatively (simpler for Phase 1), Caddy can mount the built `dist/` directory directly via a bind mount if the build happens outside Docker. The docker-compose.yml Task 2 uses the simpler bind-mount approach for Phase 1.

### Task 2: Caddyfile + docker-compose.yml

**Files to create:**
- `Caddyfile` — reverse proxy config with TLS, security headers, routing
- `docker-compose.yml` — 5-service stack (caddy, api, frontend-build, postgres, redis)
- `docker-compose.override.yml` — dev overrides (bind mounts for hot reload, pino-pretty)

**Action:**

Create `Caddyfile`:
```caddyfile
# ACM KPI Pro — Caddy Reverse Proxy Configuration
# Phase 1: tls internal (self-signed dev cert)
#
# For production with internal CA:
#   Replace `tls internal` with:
#   tls /etc/caddy/certs/cert.pem /etc/caddy/certs/key.pem
#
# ASSUMPTION: hostname `:443` listens on all interfaces.
# In production, set to actual hostname, e.g.: acm-kpi.acm.local

:443 {
    # TLS — self-signed internal CA for development (SEC-03, DEP-05)
    # ASSUMPTION: IT will provide cert.pem + key.pem for production.
    # To switch: comment out `tls internal` and uncomment the two lines below.
    tls internal
    # tls /etc/caddy/certs/cert.pem /etc/caddy/certs/key.pem

    # ── Security Headers (SEC-04) ────────────────────────────────────────────
    header {
        # HSTS: force HTTPS for 1 year, include subdomains
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"

        # Prevent clickjacking
        X-Frame-Options "DENY"

        # MIME sniffing prevention
        X-Content-Type-Options "nosniff"

        # CSP: allow only self-hosted resources (DEP-07: no CDN at runtime)
        # 'unsafe-inline' for style-src is required by Tailwind inline styles.
        # Update in Phase 6 when inline styles are resolved via CSS classes only.
        Content-Security-Policy "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'"

        # Referrer policy
        Referrer-Policy "same-origin"

        # Remove Caddy server header
        -Server
    }

    # ── API proxy: /api/* → Fastify backend ─────────────────────────────────
    handle /api/* {
        reverse_proxy api:3000 {
            header_up X-Forwarded-For {http.request.remote.host}
            header_up X-Forwarded-Proto {http.request.scheme}
            header_up X-Real-IP {http.request.remote.host}
        }
    }

    # ── Frontend: everything else → static React bundle ─────────────────────
    handle {
        root * /srv/frontend
        file_server
        # SPA fallback: route all 404s to index.html for React Router
        try_files {path} /index.html
    }

    # ── Logging (OBS-01: structured JSON to stdout) ──────────────────────────
    log {
        output stdout
        format json
        level INFO
    }
}

# HTTP → HTTPS redirect
:80 {
    redir https://{host}{uri} permanent
}

# Internal health check port (for Docker Compose healthcheck — no TLS needed)
:8080 {
    respond /health "OK" 200
}
```

Create `docker-compose.yml`:
```yaml
# ACM KPI Pro — Docker Compose v2
# Phase 1: caddy + api + postgres + redis (frontend built and served statically)
#
# Usage:
#   cp .env.example .env && vim .env   # fill required values
#   docker compose up --build
#
# ASSUMPTION: Ubuntu 22.04 LTS target. SELinux :Z labels included but no-op on
# non-SELinux hosts. If SELinux enforcing, these labels are required.

services:

  # ── Caddy reverse proxy + TLS ──────────────────────────────────────────────
  caddy:
    image: caddy:2.8-alpine
    container_name: acm-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro,Z
      # Frontend static files (built by the `frontend-build` init service below)
      - frontend_dist:/srv/frontend:ro,Z
      # Caddy data and config persistence
      - caddy_data:/data:Z
      - caddy_config:/config:Z
    networks:
      - acm
    depends_on:
      api:
        condition: service_healthy
      frontend-build:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  # ── Frontend build (init container — builds once, populates volume) ─────────
  # This service runs `npm run build` and writes the output to the shared volume.
  # Caddy then serves from that volume.
  # In production, the build step runs in CI before deployment; replace with a
  # pre-built image and skip this service.
  frontend-build:
    build:
      context: .
      dockerfile: apps/frontend/Dockerfile
      target: builder          # Use the builder stage to get node_modules
    container_name: acm-frontend-build
    command: sh -c "cp -r /app/apps/frontend/dist/. /srv/frontend/"
    volumes:
      - frontend_dist:/srv/frontend:Z
    networks:
      - acm

  # ── Fastify API ─────────────────────────────────────────────────────────────
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: acm-api
    restart: unless-stopped
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      API_PORT: "3000"
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@postgres:5432/acm_kpi
      LDAP_URL: ${LDAP_URL}
      LDAP_BIND_DN: ${LDAP_BIND_DN}
      LDAP_BIND_PASSWORD: ${LDAP_BIND_PASSWORD}
      LDAP_USER_SEARCH_BASE: ${LDAP_USER_SEARCH_BASE}
      LDAP_GROUP_SEARCH_BASE: ${LDAP_GROUP_SEARCH_BASE}
      LDAP_VIEWER_GROUP_DN: ${LDAP_VIEWER_GROUP_DN}
      LDAP_ADMIN_GROUP_DN: ${LDAP_ADMIN_GROUP_DN}
      LDAP_TLS: ${LDAP_TLS:-true}
      LDAP_SKIP_CERT_CHECK: ${LDAP_SKIP_CERT_CHECK:-false}
      SESSION_SECRET: ${SESSION_SECRET}
      LOG_LEVEL: ${LOG_LEVEL:-info}
    expose:
      - "3000"
    networks:
      - acm
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/v1/healthz"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 30s
    # Non-root user (PITFALL #9)
    user: "1000:1000"

  # ── PostgreSQL 16 ──────────────────────────────────────────────────────────
  postgres:
    image: postgres:16-alpine
    container_name: acm-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: acm_kpi
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      # Persistent database data volume
      # :Z label for SELinux compatibility (ASSUMPTION: confirm with IT)
      - postgres_data:/var/lib/postgresql/data:Z
    networks:
      - acm
    # PostgreSQL port NOT exposed to host (DEP-03 equivalent)
    expose:
      - "5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d acm_kpi"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    # postgres official image uses UID 999
    user: "999:999"

  # ── Redis (Phase 2 — Bull job queue scaffold) ──────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: acm-redis
    restart: unless-stopped
    expose:
      - "6379"
    networks:
      - acm
    volumes:
      - redis_data:/data:Z
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

# ── Networks ───────────────────────────────────────────────────────────────────
networks:
  acm:
    driver: bridge
    # Internal network — no external access to postgres/redis
    internal: false   # caddy needs external access for TLS

# ── Volumes ────────────────────────────────────────────────────────────────────
volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
  caddy_data:
    driver: local
  caddy_config:
    driver: local
  frontend_dist:
    driver: local
```

Create `docker-compose.override.yml` (development overrides — not committed to production):
```yaml
# Development overrides — applied automatically by `docker compose up` in development.
# Do NOT use in production (docker compose -f docker-compose.yml up for production).

services:
  api:
    environment:
      NODE_ENV: development
      LOG_LEVEL: debug
    # In dev, rebuild on source change by restarting the container manually.
    # Hot reload with tsx watch is available via: npm -w apps/api run dev

  postgres:
    ports:
      # Expose Postgres in dev for direct access (e.g., drizzle-kit studio)
      - "5432:5432"
```

### Task 3: docker-compose.yml healthcheck verification script

**Files to create:**
- `scripts/check-stack.sh` — smoke-test script that verifies all services are healthy after `docker compose up`

**Action:**

Create `scripts/check-stack.sh`:
```bash
#!/bin/bash
# ACM KPI Pro — Stack smoke test
# Run after `docker compose up -d` to verify all services are healthy.
set -e

BASE_URL="${BASE_URL:-https://localhost}"
INSECURE="--insecure"   # Allow self-signed cert in dev

echo "=== ACM KPI Pro Stack Health Check ==="
echo "Base URL: $BASE_URL"
echo ""

# 1. Check Caddy health port
echo -n "[1/5] Caddy internal health (:8080/health)... "
CADDY_HEALTH=$(docker compose exec caddy wget -qO- http://localhost:8080/health 2>/dev/null || echo "FAIL")
[ "$CADDY_HEALTH" = "OK" ] && echo "OK" || { echo "FAIL: $CADDY_HEALTH"; exit 1; }

# 2. Check API healthz via Caddy
echo -n "[2/5] API /healthz via Caddy (HTTPS)... "
HEALTHZ=$(curl -sf $INSECURE "$BASE_URL/api/v1/healthz" 2>/dev/null || echo "FAIL")
echo "$HEALTHZ" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['db_connected'] == True, f'db_connected is not True: {d}'
print('OK (db_connected=True, ldap_reachable=' + str(d.get('ldap_reachable')) + ')')
" || { echo "FAIL: $HEALTHZ"; exit 1; }

# 3. Check security headers
echo -n "[3/5] Security headers (HSTS, X-Frame-Options, CSP)... "
HEADERS=$(curl -sI $INSECURE "$BASE_URL/" 2>/dev/null)
echo "$HEADERS" | grep -qi "strict-transport-security" || { echo "FAIL: missing HSTS"; exit 1; }
echo "$HEADERS" | grep -qi "x-frame-options" || { echo "FAIL: missing X-Frame-Options"; exit 1; }
echo "$HEADERS" | grep -qi "content-security-policy" || { echo "FAIL: missing CSP"; exit 1; }
echo "OK"

# 4. Check unauthenticated / redirects (React Router serves index.html)
echo -n "[4/5] Frontend accessible at / ... "
STATUS=$(curl -so /dev/null -w "%{http_code}" $INSECURE "$BASE_URL/" 2>/dev/null)
[ "$STATUS" = "200" ] && echo "OK (200)" || { echo "FAIL: HTTP $STATUS"; exit 1; }

# 5. Check unauthenticated /api/v1/auth/me returns 401
echo -n "[5/5] /api/v1/auth/me returns 401 when unauthenticated... "
STATUS=$(curl -so /dev/null -w "%{http_code}" $INSECURE "$BASE_URL/api/v1/auth/me" 2>/dev/null)
[ "$STATUS" = "401" ] && echo "OK (401)" || { echo "FAIL: HTTP $STATUS (expected 401)"; exit 1; }

echo ""
echo "=== All checks passed ==="
```

Make it executable: `chmod +x scripts/check-stack.sh`

## Files Touched

- `apps/api/Dockerfile` — created
- `apps/api/entrypoint.sh` — created
- `apps/frontend/Dockerfile` — created
- `Caddyfile` — created
- `docker-compose.yml` — created
- `docker-compose.override.yml` — created
- `scripts/check-stack.sh` — created

## Exit Criteria

- [ ] `docker compose build` exits 0 (all images build successfully)
- [ ] `docker compose up -d` starts all services; `docker compose ps` shows all as healthy
- [ ] `scripts/check-stack.sh` passes all 5 checks
- [ ] `curl -k https://localhost/api/v1/healthz` returns `{"status":"ok","db_connected":true,...}`
- [ ] Response headers include: `Strict-Transport-Security`, `X-Frame-Options: DENY`, `Content-Security-Policy`
- [ ] HTTP request to port 80 is redirected to HTTPS (301)
- [ ] `curl -k https://localhost/api/v1/auth/me` returns HTTP 401
- [ ] `docker compose exec api id` outputs `uid=1000(appuser)` (non-root)
- [ ] PostgreSQL port 5432 is NOT reachable from host in production mode: `nc -z localhost 5432` fails (only in production override; dev override exposes it)
- [ ] `docker compose logs api` shows structured JSON lines (not plaintext)
- [ ] `docker compose down -v && docker compose up -d` cleanly recreates everything

## Verification

```bash
cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro"

# Ensure .env is filled (copy from .env.example and fill LDAP values)
cp .env.example .env
# Edit .env: set DB_PASSWORD, SESSION_SECRET, LDAP_* values
# For a first smoke test with no real AD: use placeholder LDAP values
# (healthz will show ldap_reachable:false, which is acceptable)

# Build all images
docker compose build
# Expected: exit 0, no build errors

# Start stack
docker compose up -d
# Expected: all containers start

# Wait for healthy status
echo "Waiting for services to be healthy..."
for SERVICE in caddy api postgres redis; do
  until [ "$(docker compose ps -q $SERVICE | xargs docker inspect --format '{{.State.Health.Status}}' 2>/dev/null)" = "healthy" ]; do
    echo "  Waiting for $SERVICE..."; sleep 3
  done
  echo "  $SERVICE: healthy"
done

# Run smoke test
bash scripts/check-stack.sh
# Expected: "=== All checks passed ==="

# Security headers check
curl -skI https://localhost/ | grep -E "strict-transport|x-frame|content-security"
# Expected: all three header lines present

# Non-root user
docker compose exec api id
# Expected: uid=1000(appuser) gid=1000(appuser)

# HTTP redirect
curl -si http://localhost/ | head -2
# Expected: HTTP/1.1 301 and Location: https://...

# Structured JSON logs
docker compose logs api --no-log-prefix 2>/dev/null | head -3 | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if line:
        d = json.loads(line)
        print('OK: JSON log line:', list(d.keys()))
        break
"
# Expected: "OK: JSON log line: ['level', 'time', 'msg', ...]"

# Teardown
docker compose down
```

## Commit

```
feat(01): add Caddy reverse proxy, docker-compose.yml, TLS (tls internal), security headers, non-root containers, preflight checks
```
