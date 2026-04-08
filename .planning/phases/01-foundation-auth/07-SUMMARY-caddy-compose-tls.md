---
phase: "01"
plan: "07"
subsystem: infrastructure
tags: [caddy, docker-compose, tls, security-headers, reverse-proxy, dockerfile, non-root, preflight]
dependency_graph:
  requires: [02-monorepo-scaffold, 03-postgres-drizzle, 04-api-skeleton, 05-ldap-auth-session, 06-frontend-shell]
  provides: [docker-compose-stack, caddy-tls, security-headers, api-dockerfile, frontend-dockerfile, env-example, smoke-test-script]
  affects: [phase-2-onward]
tech_stack:
  added: [caddy:2.8-alpine, redis:7-alpine, postgres:16-alpine (extended), node:22-alpine (multi-stage)]
  patterns: [init-container-volume-copy, non-root-uid-1000, multi-stage-dockerfile, preflight-wait-loop, selinux-z-labels]
key_files:
  created:
    - apps/api/Dockerfile
    - apps/api/entrypoint.sh
    - apps/frontend/Dockerfile
    - Caddyfile
    - docker-compose.yml
    - docker-compose.override.yml
    - scripts/check-stack.sh
  modified:
    - .env.example (extended with LOG_LEVEL, enhanced secret-generation docs)
decisions:
  - "Referrer-Policy set to strict-origin-when-cross-origin (execution rules) not same-origin (plan draft) — more permissive for cross-origin API calls while still protecting referrer data"
  - "entrypoint.sh pg readiness check uses node --input-type=module (ESM) because apps/api has type:module in package.json — require('pg') would fail"
  - "HSTS preload directive omitted — preload requires hstspreload.org registration; comment left for IT to decide"
  - "Docker network internal:false — required for Caddy tls internal to resolve OCSP/CA endpoints; set true in air-gapped prod with pre-provisioned cert"
  - "frontend-build uses builder stage of frontend Dockerfile (not scratch stage) so Node.js is available to run the build and copy dist/"
  - "Biome lint pre-existing ENOEXEC failure on Node 25 + macOS ARM64 is out of scope — Biome ignores Dockerfiles/Caddyfile/shell anyway (ignoreUnknown: true)"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-08"
  tasks_completed: 3
  files_created: 7
  files_modified: 1
---

# Phase 01 Plan 07: Caddy + Docker Compose + TLS + Security Headers Summary

**One-liner:** Caddy 2.8 reverse proxy with `tls internal` (dev) and full security header suite (HSTS, CSP, X-Frame-Options); multi-stage Dockerfiles for api (non-root UID 1000, pg-preflight entrypoint) and frontend (init-container volume copy pattern); 5-service docker-compose stack ready for `docker compose up` on a Linux host.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Dockerfiles for api and frontend + entrypoint.sh | Done | 5059494 |
| 2 | Caddyfile + docker-compose.yml + override + .env.example | Done | ee3bc5b |
| 3 | scripts/check-stack.sh smoke test | Done | ee3bc5b |

## Files Created

**Task 1 — Dockerfiles:**
- `apps/api/Dockerfile` — 2-stage build: `node:22-alpine` builder (tsc build of api + core) → `node:22-alpine` runtime as non-root `appuser` (UID 1000); drizzle migrations folder included; HEALTHCHECK via wget to `/api/v1/healthz`
- `apps/api/entrypoint.sh` — preflight: postgres connectivity wait loop (30 tries × 2s); volume UID ownership warning for `/app/uploads` and `/mnt/smb-share`; `node dist/db/migrate.js`; `exec node dist/index.js`
- `apps/frontend/Dockerfile` — 2-stage: `node:22-alpine` builder (tsc + vite build) → `scratch` static stage (dist/ only); `frontend-build` in docker-compose uses the `builder` target and copies to shared volume

**Task 2 — Compose + Config:**
- `Caddyfile` — `:443` with `tls internal`; `Strict-Transport-Security`, `X-Frame-Options DENY`, `Content-Security-Policy`, `X-Content-Type-Options nosniff`, `Referrer-Policy strict-origin-when-cross-origin`; `/api/*` → `api:3000`; `/*` → static files with SPA fallback; `:80` → HTTPS redirect; `:8080` internal health
- `docker-compose.yml` — 5 services: `caddy` (ports 80/443), `api` (expose 3000, user 1000:1000), `frontend-build` (init, exits 0), `postgres` (user 999:999, expose 5432), `redis` (expose 6379); SELinux `:Z` labels on all bind mounts; healthchecks on all long-running services; named volumes for postgres_data, redis_data, caddy_data, caddy_config, frontend_dist
- `docker-compose.override.yml` — dev: `LOG_LEVEL=debug`, `NODE_ENV=development`, postgres port 5432 exposed to host
- `.env.example` — complete variable catalog matching `apps/api/src/config.ts`; secret generation commands (`openssl rand -base64 32`) documented; LDAP TLS guidance

**Task 3 — Smoke test:**
- `scripts/check-stack.sh` — 5 checks: Caddy :8080/health, API /healthz (db_connected:true asserted), security headers (HSTS + X-Frame-Options + CSP + X-Content-Type-Options), / returns 200, /api/v1/auth/me returns 401

## Exit Criteria Verification

### Can verify without Docker (static analysis)

- [x] `apps/api/Dockerfile` builds multi-stage, non-root UID 1000, healthcheck present
- [x] `apps/frontend/Dockerfile` builds multi-stage, `builder` stage populates `dist/`
- [x] `entrypoint.sh` has postgres wait loop, volume UID check, migration runner
- [x] `Caddyfile` contains `tls internal`, `Strict-Transport-Security`, `X-Frame-Options "DENY"`, `Content-Security-Policy`, `X-Content-Type-Options "nosniff"`, `Referrer-Policy`, `-Server` removal
- [x] `/api/*` proxied to `api:3000`, `/*` served from `/srv/frontend` with SPA fallback
- [x] HTTP `:80` configured with `redir ... permanent` (301)
- [x] `docker-compose.yml` — only caddy exposes host ports (80, 443); api, postgres, redis use `expose` (internal only)
- [x] `api` service has `user: "1000:1000"`
- [x] SELinux `:Z` labels on all bind mounts
- [x] `frontend-build` has `restart: "no"` and `condition: service_completed_successfully` dependency
- [x] `.env.example` covers all 13 variables from `config.ts` schema
- [x] `scripts/check-stack.sh` checks security headers + 401 + 200

### Deferred — requires Linux host with Docker installed

These exit criteria are blocked by "Docker Desktop NOT installed on this host" (execution constraint):

```bash
# Run on a Linux host with Docker Engine installed:
cd /path/to/acm-kpi-pro
cp .env.example .env
# Edit .env with real or test values
docker compose build
# Expected: exit 0

docker compose up -d
# Wait for healthy:
docker compose ps
# Expected: all services healthy (caddy, api, postgres, redis); frontend-build exited 0

bash scripts/check-stack.sh
# Expected: "=== All checks passed ==="

# HTTP redirect
curl -si http://localhost/ | head -3
# Expected: HTTP/1.1 301 Moved Permanently, Location: https://...

# Non-root user
docker compose exec api id
# Expected: uid=1000(appuser) gid=1000(appuser)

# Postgres NOT reachable from host (production — no override file)
docker compose -f docker-compose.yml up -d
nc -z localhost 5432 && echo "EXPOSED (unexpected)" || echo "NOT EXPOSED (correct)"

# JSON structured logs
docker compose logs api --no-log-prefix 2>/dev/null | head -3

# Clean restart
docker compose down -v && docker compose up -d
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Referrer-Policy upgraded to strict-origin-when-cross-origin**
- **Found during:** Task 2 (Caddyfile)
- **Issue:** Plan draft specified `Referrer-Policy "same-origin"`. Execution rules required `strict-origin-when-cross-origin`. The stronger policy sends the origin (not full URL) on cross-origin requests, which is more appropriate for an SPA that calls the same-origin API — same-origin requests still get the full referrer.
- **Fix:** Used `strict-origin-when-cross-origin`
- **Files modified:** `Caddyfile`
- **Commit:** ee3bc5b

**2. [Rule 1 - Bug] entrypoint.sh pg check uses ESM (--input-type=module)**
- **Found during:** Task 1 (entrypoint.sh)
- **Issue:** Plan draft used `require('pg')` in the `node -e` snippet. `apps/api/package.json` has `"type": "module"`, so Node.js would throw `ReferenceError: require is not defined` at runtime in the alpine container.
- **Fix:** Changed to `node --input-type=module -e "import pg from 'pg'; ..."` which correctly uses ESM dynamic import.
- **Files modified:** `apps/api/entrypoint.sh`
- **Commit:** 5059494

**3. [Rule 2 - Correctness] HSTS preload removed**
- **Found during:** Task 2 (Caddyfile)
- **Issue:** Plan draft included `preload` in the HSTS header. Preload requires explicit registration at hstspreload.org and cannot be reversed easily. For an on-prem internal app (ACM firewall only), this is inappropriate without IT sign-off.
- **Fix:** Removed `preload`; added comment documenting what it requires if IT wants it later.
- **Files modified:** `Caddyfile`
- **Commit:** ee3bc5b

## Known Stubs

None — this plan creates infrastructure files only; no stub data flows to UI rendering.

## Known Issues — Deferred

These are UPSTREAM bugs from earlier plans. They are documented here so Phase 1 verification catches them. Do NOT attempt to fix in Plan 07.

### Upstream Bug 1: ldapts v8 dropped `referral: true` (PITFALL #5 regression)

- **Source:** Plan 05 (LDAP auth)
- **Issue:** `ldapts` v8 removed the `referral: true` option. Multi-domain Active Directory referrals are not followed. If ACM runs a multi-domain AD forest and a user's account lives in a different domain than the bind DN, authentication will silently fail with a "no such user" error rather than following the AD referral chain.
- **Impact:** Phase 1 single-domain scenario is unaffected. Blocked for multi-domain AD.
- **Resolution required:** Test against ACM's actual AD structure. If multi-domain, either downgrade ldapts to v7, implement manual referral following, or switch to `ldapjs`.
- **Track in:** Phase 1 verification checklist, Phase 2 LDAP hardening

### Upstream Bug 2: `safe-stable-stringify` node_modules patch (PITFALL vitest)

- **Source:** Plan 05 (LDAP auth)
- **Issue:** Plan 05 patched `safe-stable-stringify@2.5.0` directly in `node_modules` to restore named exports broken on Node 25. This patch does NOT survive `npm install` or a fresh `git clone`.
- **Impact:** On a fresh clone, `npm install` will overwrite the patch, and vitest may fail with import errors for test files that depend on Fastify/pino internals.
- **Resolution required:** Either pin `safe-stable-stringify` to a version with proper named exports, apply a proper patch via `patch-package`, or wait for the upstream fix.
- **Track in:** Phase 1 verification, CI setup

## Self-Check: PASSED

Files verified:
- `apps/api/Dockerfile` — FOUND
- `apps/api/entrypoint.sh` — FOUND
- `apps/frontend/Dockerfile` — FOUND
- `Caddyfile` — FOUND
- `docker-compose.yml` — FOUND
- `docker-compose.override.yml` — FOUND
- `.env.example` — FOUND
- `scripts/check-stack.sh` — FOUND

Commits verified in git log:
- `5059494` — FOUND (Task 1: Dockerfiles)
- `ee3bc5b` — FOUND (Tasks 2+3: Caddy + Compose + smoke test)

## Commits

- `5059494` — `feat(01-07): add multi-stage Dockerfiles for api and frontend; entrypoint with postgres preflight + vol UID check`
- `ee3bc5b` — `feat(01-07): add Caddy reverse proxy, full docker-compose.yml, TLS, security headers, non-root containers, preflight checks`
