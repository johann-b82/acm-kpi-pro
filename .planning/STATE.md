---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Executing Phase 05
last_updated: "2026-04-09T15:16:10.396Z"
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 11
  completed_plans: 9
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-08)

**Core value:** Executives see the health of ACM's inventory and production at a glance — on a single dashboard — without touching Apollo NTS.

**Current focus:** Phase 05 — smb-folder-watcher

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
- [Phase 03-kpi-layer-dashboard]: Option A (COUNT check inside tx) used for first-time MV refresh detection — matches RESEARCH.md prescription
- [Phase 03-kpi-layer-dashboard]: Color computation lives exclusively in API layer (colors.ts) — frontend receives pre-computed color strings in JSON response
- [Phase 03-kpi-layer-dashboard]: Thenable chain pattern used for Drizzle query builder mocks in Vitest (not recursive makeChain)
- [Phase 03-kpi-layer-dashboard]: recharts upgraded from 2.12.0 to 3.8.1 — 2.12.0 does not support React 19 peer dep
- [Phase 03-kpi-layer-dashboard]: DashboardPage uses data-testid slot divs — Plan 03-07 swaps in real components without changing prop types
- [03-07]: shadcn CLI aliases must use src/ prefix (not @/) to avoid literal "@/" directory creation
- [03-07]: Recharts 3 Funnel.js triggers ETIMEDOUT in jsdom — vi.mock("recharts") required in integration tests
- [03-07]: StaleDataBanner accepts pre-computed StalenessLevel (not timestamp) — avoids duplicate staleness computation
- [03-07]: FilterBar uses empty-object spread for exactOptionalPropertyTypes:true compat when clearing filters
- [Phase 04-upload-page]: 04-01: Multipart plugin registered globally in server.ts with 10 MB limit; auto-cleanup of temp files relied upon (no finally block in handler)
- [Phase 04-upload-page]: 04-01: UploadKpiDelta computed in upload route (not ingest) — keeps Phase 2 feed-agnostic
- [Phase 04-upload-page]: 04-01: Viewer 403 test uses empty body (RBAC runs before body parse — real multipart body causes fastify.inject deadlock)
- [Phase 04-02]: Local UploadResponse in features/upload/types.ts to break cross-plan race with 04-01; plan 04-05 will switch to @acm-kpi/core import
- [Phase 04-02]: Role gate lives in UploadPage (not ProtectedRoute); ProtectedRoute = auth, UploadPage = authorisation (Viewer sees AdminAccessDenied)
- [Phase 04-upload-page]: 04-03: Radix Progress owns role=progressbar/aria-valuenow — no wrapper div (avoids duplicate a11y nodes)
- [Phase 04-upload-page]: 04-03: currentFilename tracked in UploadPage local state (not useUpload hook) to keep hook focused on XHR mechanics
- [Phase 04-upload-page]: 04-04: queryClient imported directly as singleton (not useQueryClient hook) — SuccessSummary invalidates ['kpi','summary'] then navigates away
- [Phase 04-upload-page]: 04-04: Dead Stock % inversion flagged via invertedSign in KPI_DEFS — formatDeltaSign is single source of truth for sign semantics
- [Phase 04-upload-page]: 04-05: Credentials resolved to test.admin/test.viewer from seed.ts (plan fallback admin/admin ignored)
- [Phase 04-upload-page]: 04-05: playwright.config.ts uses workers=1 (serial) because upload tests share Postgres state
- [Phase 04-upload-page]: 04-05: ESM __dirname shim via fileURLToPath(import.meta.url) required — workspace is type:module
- [Phase 04-upload-page]: 04-05: webServer block deferred to Phase 08 CI wiring; Phase 04 e2e is manual-start
- [Phase 05]: D-01 honored: ingestLagBesFile called in-process — no Bull/Redis
- [Phase 05]: D-03 honored: ignoreInitial:false explicit for startup catch-up
- [Phase 05]: matchesPattern() uses prefix/suffix split — avoids CJS picomatch interop in ESM workspace
- [Phase 05]: Dynamic import of db inside onReady hook keeps module-load side effects isolated from test environments
- [Phase 05]: Module-level _watcher handle (FSWatcher|null) acceptable for single-process production; tests mock watcher via vi.mock
- [Phase 05]: smb_share docker volume uses driver:local as dev stub; CIFS production override documented in YAML comment for ops
- [Phase 05]: WatcherErrorLog defined in both path-resolver.ts and packages/core/src/ingest/error.ts to avoid circular dep; @acm-kpi/core is canonical export
- [Phase 05]: Test 6 (D-03 startup catch-up) proves ignoreInitial:false fires add for pre-existing files — same handler processes both new and pre-existing files with no extra code

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01 | 04 | ~25 min | 2/2 | 5 |
| 01 | 05 | ~90 min | 2/2 | 11 |
| 01 | 06 | ~15 min | 2/2 | 20 |
| 01 | 07 | ~25 min | 3/3 | 8 |

---
*Last updated: 2026-04-09 after 03-07 KPI dashboard components complete*
| Phase 02-csv-ingestion-core P02-02 | 45 | 2 tasks | 6 files |
| 02 | 03 | ~10 min | 2/2 | 2 |
| Phase 02 P02-04 | 50 | 2 tasks | 10 files |
| Phase 02-csv-ingestion-core P02-05 | 5 | 2 tasks | 2 files |
| Phase 02-csv-ingestion-core P02-06 | 11 | 2 tasks | 6 files |
| Phase 03-kpi-layer-dashboard P03-02 | 495 | 2 tasks | 3 files |
| Phase 03-kpi-layer-dashboard P03-03 | 35 | 1 tasks | 1 files |
| Phase 03-kpi-layer-dashboard P03-04 | 25 | 1 tasks | 3 files |
| Phase 03-kpi-layer-dashboard P03-05 | 45m | 2 tasks | 6 files |
| Phase 03-kpi-layer-dashboard P03-06 | 1200 | 2 tasks | 15 files |
| Phase 03-kpi-layer-dashboard P03-07 | 65 | 2 tasks | 23 files |
| Phase 04-upload-page P01 | 30 | 2 tasks | 8 files |
| Phase 04 P02 | 50 | 2 tasks | 10 files |
| Phase 04-upload-page P03 | 12 | 1 tasks | 6 files |
| Phase 04-upload-page P04 | 5 | 2 tasks | 5 files |
| Phase 04-upload-page P05 | 15 | 2 tasks | 4 files |
| Phase 05-smb-folder-watcher P01 | 417 | 2 tasks | 11 files |
| Phase 05-smb-folder-watcher P03 | 163 | 2 tasks | 3 files |
| Phase 05 P02 | 277 | 2 tasks | 5 files |
