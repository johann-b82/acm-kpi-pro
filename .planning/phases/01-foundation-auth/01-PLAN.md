# Plan 1: Phase 1 Index — Foundation & Auth

**Phase:** 1 — Foundation & Auth
**Type:** Index (this file is a map, not executable)

## Phase Goal

After Phase 1, `docker compose up` on a Linux host produces a working minimal stack. A user visits the site (HTTPS, via Caddy), gets redirected to a login page, authenticates against LDAP/AD, and lands on a protected dashboard route showing the ACM logo in the header and a placeholder "Total inventory value — loading…" KPI card. Two icon buttons (upload + docs) are visible top-right but route to "coming soon" stubs. The Admin role vs Viewer role distinction is enforced at the router level. `/api/v1/healthz` returns DB connectivity and LDAP reachability.

## Requirements Covered

AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-08,
BRAND-01, BRAND-02, BRAND-03,
OBS-02,
SEC-03, SEC-04

## Pitfalls Gated

- **#5** LDAP multi-domain referrals — `referral: true`, parameterized filter builders (EqualityFilter from ldapts)
- **#8** Executive UX overload — single hardcoded KPI card on first paint; no analyst drilldown
- **#9** Docker volume perms / SELinux — explicit UID 1000:1000, `:Z` volume labels in compose

## Plan Files

| Plan | File | Goal | Wave |
|------|------|------|------|
| **Plan 2** | `02-PLAN-monorepo-scaffold.md` | npm workspaces, tsconfig project refs, Biome, .nvmrc, placeholder logo asset | 1 |
| **Plan 3** | `03-PLAN-postgres-drizzle.md` | PostgreSQL service, Drizzle schema, drizzle-kit migration, dev seed | 1 (parallel with Plan 2) |
| **Plan 4** | `04-PLAN-api-skeleton.md` | Fastify API: /healthz, /me, config (Zod), pino, error handler, graceful shutdown | 2 (needs Plan 3) |
| **Plan 5** | `05-PLAN-ldap-auth-session.md` | ldapts service, /auth/login + /logout, iron-session, RBAC middleware, /admin/ping, unit tests | 3 (needs Plan 4) |
| **Plan 6** | `06-PLAN-frontend-shell.md` | Vite+React 19+Router+Tailwind+shadcn/ui, login page, protected layout, dashboard stub, KPI card | 2 (parallel with Plan 4, needs Plan 2) |
| **Plan 7** | `07-PLAN-caddy-compose-tls.md` | Caddyfile, docker-compose.yml (4 services), security headers, UID/GID, SELinux :Z, preflight script | 4 (needs all previous plans) |

## Dependency Graph

```
Plan 2 (scaffold) ─────────────────────────────────────────┐
                                                           │
Plan 3 (postgres+drizzle) ──→ Plan 4 (api skeleton) ──→ Plan 5 (auth)
                                                           │
Plan 2 ──→ Plan 6 (frontend shell) ────────────────────────┤
                                                           │
                                            Plan 7 (caddy+compose) ← all above
```

## Wave Structure

- **Wave 1** (parallel): Plan 2 + Plan 3
- **Wave 2** (parallel): Plan 4 + Plan 6 (Plan 4 needs Plan 3; Plan 6 needs Plan 2)
- **Wave 3** (sequential): Plan 5 (needs Plan 4)
- **Wave 4** (final): Plan 7 (needs all above)

## Phased Exit Criteria

After all plans complete:

- [ ] `docker compose up` succeeds with no errors on Linux
- [ ] Unauthenticated request to `/` redirects to `/login`
- [ ] Valid AD credentials → dashboard loads, ACM logo visible in header
- [ ] Session cookie persists across page reload; logout destroys session
- [ ] Viewer-role user receives 403 on `GET /api/v1/admin/ping`
- [ ] Admin-role user receives 200 on `GET /api/v1/admin/ping`
- [ ] `GET /api/v1/healthz` returns JSON with `db_connected: true` and `ldap_reachable: true/false`
- [ ] Dashboard shows one KPI card: "Total inventory value — loading…"
- [ ] Upload icon button and docs icon button visible in top-right header, route to "coming soon" stubs
- [ ] Caddy serves HTTPS (self-signed via `tls internal` in dev)
- [ ] HSTS, X-Frame-Options, CSP headers present on all responses

## Open IT Questions (Assumptions in Sub-Plans)

1. **AD domain structure** — Single domain vs forest with referrals? Plans assume single-domain `acm.local`; referral=true handles multi-domain automatically but group DNs must be reconfigured if multi-domain.
2. **Target OS** — Plans assume Ubuntu 22.04 LTS. SELinux `:Z` labels are included but no-op on non-SELinux hosts.
3. **Internal CA** — Plans default to `tls internal` (Caddy self-signed). When IT provides a cert, swap `tls internal` for `tls /etc/caddy/certs/cert.pem /etc/caddy/certs/key.pem`.
4. **LDAP service account** — Plans use a service account (bind-DN) for initial user lookup. If ACM uses bind-as-user only, the two-step search+bind flow in ldap.service.ts must be adapted.
5. **User identifier attribute** — Plans assume `sAMAccountName`. If ACM uses `uid` or `userPrincipalName`, change one constant in `ldap.service.ts`.
