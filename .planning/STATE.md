---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-04-08T17:21:10.619Z"
progress:
  total_phases: 8
  completed_phases: 1
  total_plans: 3
  completed_plans: 1
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-08)

**Core value:** Executives see the health of ACM's inventory and production at a glance — on a single dashboard — without touching Apollo NTS.

**Current focus:** Phase 1 — Foundation & Auth

## Status

- **Milestone:** v1 (initial release)
- **Phases completed:** 0 / 8
- **Phase in progress:** Phase 1 — Foundation & Auth (Plans 4, 5, 6, 7 complete)
- **Last completed plan:** 01-07 Caddy reverse proxy + docker-compose + TLS + security headers
- **Next action:** Phase 1 verification (all 7 plans complete)

## Artifacts

| File | Purpose |
|---|---|
| `.planning/PROJECT.md` | Project context, core value, constraints, decisions |
| `.planning/REQUIREMENTS.md` | 67 v1 requirements + traceability to phases |
| `.planning/ROADMAP.md` | 8-phase roadmap with parallelization map and pitfall gating |
| `.planning/config.json` | Workflow settings (YOLO, standard granularity, budget model, research-on) |
| `.planning/research/STACK.md` | Recommended technology stack with versions |
| `.planning/research/FEATURES.md` | Table-stakes vs differentiators vs anti-features |
| `.planning/research/ARCHITECTURE.md` | Container topology, ingestion pipeline, DB schema |
| `.planning/research/PITFALLS.md` | Top pitfalls with phase mapping |
| `.planning/research/SUMMARY.md` | Research synthesis consumed by roadmap |
| `samples/README.md` | CSV quirk documentation (critical for parser) |
| `samples/LagBes-sample.csv` | Golden-file fixture for parser tests |
| `samples/LagBes.txt` | **Expected** — full production sample (not yet provided) |
| `assets/acm-logo.png` | **Expected** — brand logo + favicon source (not yet provided) |

## Open Dependencies on External Input

Non-blocking, but needed before implementation of the relevant phase:

1. **Full `samples/LagBes.txt`** — real 10k+ row export. Needed before/during Phase 2 (parser stress testing).
2. **`assets/acm-logo.png`** — actual logo file. Needed before/during Phase 1 (UI shell + favicon).
3. **AD structure and service account** — needed during Phase 1 discuss phase (for LDAP integration scope).
4. **Target OS + SELinux mode** — needed during Phase 8 (deployment hardening).
5. **Internal CA cert** (or go/no-go on self-signed) — needed during Phase 1 or Phase 8 depending on when TLS is wired up.

## Git

- Repository initialized: yes
- `.planning/` tracked in git: yes (per config `commit_docs: true`)
- Recent commits:
  - `318b2cd` docs: add roadmap and phase traceability
  - `ee3bc5b` feat(01-07): Caddy, docker-compose.yml, Caddyfile, TLS, security headers, smoke test
  - `5059494` feat(01-07): multi-stage Dockerfiles (api, frontend), entrypoint.sh
  - `b1d2944` docs(01-05): complete LDAP auth + session plan SUMMARY
  - `a302252` feat(01-05): LDAP auth, iron-session, RBAC
  - `4aa4209` feat(01): React frontend shell

## Workflow Configuration

From `.planning/config.json`:

- Mode: YOLO (auto-advance plan → execute → verify)
- Granularity: standard (6–8 phases, 3–5 plans each)
- Parallelization: enabled
- Commit planning docs: yes
- Model profile: budget (Haiku-preferred)
- Research before each phase: yes
- Plan checker agent: yes
- Verifier agent: yes
- Nyquist validation: yes

## Decisions

| Phase | Decision |
|-------|----------|
| 01-04 | /healthz ldap_reachable returns boolean false stub (not object) until Plan 05 wires ldapts |
| 01-04 | LOG_LEVEL enum extended with "silent" to support Vitest runs |
| 01-04 | pino-pretty transport applied only in development; production uses plain pino JSON |
| 01-05 | EqualityFilter (not string concat) used for LDAP search — prevents injection (AUTH-08) |
| 01-05 | iron-session stateless sealed cookies; logout is client-side (maxAge=0 header), no server-side session table |
| 01-05 | vitest forks pool + setup file required to resolve Node 25 CJS circular dep issue with fastify deps |
| 01-05 | safe-stable-stringify@2.5.0 patched in node_modules to restore named exports on Node 25 |
| 01-06 | Vite 8 uses rolldown; manualChunks must be a function — object form raises TypeError |
| 01-06 | vite-env.d.ts required for tsc to accept CSS side-effect imports in strict mode |
| 01-06 | POST /api/v1/auth/login now live-testable (Plan 05 complete) |
| 01-07 | Referrer-Policy: strict-origin-when-cross-origin (stronger than plan draft's same-origin) |
| 01-07 | entrypoint.sh pg check uses ESM (--input-type=module) — apps/api type:module, require() would fail |
| 01-07 | HSTS preload omitted — requires hstspreload.org registration; not for internal on-prem app |
| 01-07 | Docker network internal:false — Caddy tls internal needs external CA resolution; set true in air-gapped prod |

- [Phase 02]: article_type enum created as pgEnum (not text) — DB-level type safety on Typ column
- [Phase 02]: stock_rows_staging has no FK/indexes — bulk insert performance during atomic swap
- [Phase 02]: drizzle-kit generate bypassed for column renames (requires TTY in v0.31.x); migration SQL written manually and verified
- [02-03]: ParsedRow uses index signature ([key: string]: unknown) — feed-agnostic, Zod narrows in apps/api
- [02-03]: FeedParser.db typed as unknown — keeps @acm-kpi/core dep-free (no drizzle import)
- [02-03]: FeedRegistry = Map<string, FeedParser> type alias; callers instantiate with new Map()
- [02-03]: tsc --build --force needed after manual dist cleanup in TypeScript 6.0.2 (incremental cache mismatch)
- [Phase 02]: surplus-aware decimal-comma re-merge with per-column maxFractionalDigits prevents greedy merges on zero-value rows
- [Phase 02]: CP1252 binary test fixture (LagBes-sample-cp1252.csv) required because UTF-8 sample mojibakes through cp1252 decode pipeline
- [Phase 02-05]: Batch size fixed at 500 rows per INSERT (IN-12); tested with 1200-row assertion
- [Phase 02-05]: Date fields serialised to YYYY-MM-DD strings for Drizzle pg-core date columns
- [Phase 02-05]: Mid-swap atomicity test uses execute() failure — simulates TRUNCATE stock_rows failure with 3 rows
- [Phase 02-csv-ingestion-core]: ingestLagBesFile opts.db injection pattern — avoids DATABASE_URL throw at module load; enables Vitest test isolation without mock hoisting issues in forks pool
- [Phase 02-csv-ingestion-core]: FeedRegistry as Map singleton in registry.ts — Phase 3+ adds feeds via feedRegistry.set() without modifying existing ingest code (KPI-10)
- [Phase 03-kpi-layer-dashboard]: Phase 1 KpiSummary stub (types/kpi.ts) removed; replaced by kpi/types.ts with full Phase 3 DTO set
- [Phase 03-03]: Fixed research SQL bug: importId → import_id; fixed jsonb_agg LIMIT syntax; scoped items_preview correlated subquery to same import_id

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01 | 04 | ~25 min | 2/2 | 5 |
| 01 | 05 | ~90 min | 2/2 | 11 |
| 01 | 06 | ~15 min | 2/2 | 20 |
| 01 | 07 | ~25 min | 3/3 | 8 |

---
*Last updated: 2026-04-08 after 02-03 FeedParser interface and ingest types*
| Phase 02-csv-ingestion-core P02-02 | 45 | 2 tasks | 6 files |
| 02 | 03 | ~10 min | 2/2 | 2 |
| Phase 02 P02-04 | 50 | 2 tasks | 10 files |
| Phase 02-csv-ingestion-core P02-05 | 5 | 2 tasks | 2 files |
| Phase 02-csv-ingestion-core P02-06 | 11 | 2 tasks | 6 files |
| Phase 03-kpi-layer-dashboard P03-02 | 495 | 2 tasks | 3 files |
| Phase 03-kpi-layer-dashboard P03-03 | 35 | 1 tasks | 1 files |
