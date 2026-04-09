# Roadmap: ACM KPI Pro v1

**Phases:** 8
**Granularity:** Standard (6-8 phases per STANDARD mode)
**Total v1 requirements:** 67
**Coverage:** 67/67 requirements mapped (100%)

---

## Phases

- [ ] **Phase 1: Foundation & Auth** — Docker Compose stack, LDAP login, session persistence, role scaffold
- [x] **Phase 2: CSV Ingestion Core** — Parser (decimal-comma fix), validation, atomic DB insert, audit logging (completed 2026-04-08)
- [ ] **Phase 3: KPI Layer & Dashboard** — Materialized view, 7 KPI cards, executive view, polling, stale-data banner
- [ ] **Phase 4: Upload Page** — Browser drag-and-drop, progress, validation error summary, admin-only
- [ ] **Phase 5: SMB Folder Watcher** — Chokidar polling, file-stability check, Bull job convergence
- [ ] **Phase 6: Dark/Light Mode + i18n** — Theme toggle (persisted), DE/EN (CI check), German formatting
- [ ] **Phase 7: User Docs Site** — `/docs` route, end-user + upload + admin guides, changelog, all in DE/EN
- [ ] **Phase 8: Deployment Hardening** — Target OS validation, TLS (internal CA), volume perms, backup runbook

---

## Phase Details

### Phase 1: Foundation & Auth

**Goal:** A working Docker Compose stack with LDAP-gated login serves a static dashboard shell. Authenticated users see a hardcoded KPI card. `/healthz` reports service health.

**Scope:**
- Monorepo scaffold (`apps/{api,frontend,worker}`, `packages/core`)
- Docker Compose with Caddy (TLS), Fastify API, React (Vite), PostgreSQL, Redis
- LDAP authentication via `ldapjs` + `iron-session` (sealed cookies)
- `AuthProvider` interface abstraction (pluggable for Entra/SAML later)
- Two roles: `Viewer` (dashboard + docs) and `Admin` (viewer + upload + settings)
- Role assignment from AD group membership (configurable)
- Session persistence across page reloads and logout mechanism
- Login page UI with language toggle (scaffold only)
- Unauthenticated redirect to login for all protected routes
- LDAP referral following + parameterized filter inputs (LDAP injection prevention)
- `/healthz` endpoint reporting service status
- Base styling scaffold (Tailwind + shadcn/ui)
- Logo in header + favicon setup

**Requirements covered:** AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-08, BRAND-01, BRAND-02, OBS-02, SEC-03, SEC-04

**Pitfalls gated:**
- #5 (LDAP referrals) — `followReferrals: true`, parameterized filters implemented
- #8 (Executive UX / "too much data") — Executive view established from day 1; analyst view deferred to v1.x
- #9 (Docker volume perms / SELinux) — UID/GID explicit, base image hardened

**Exit criteria:**
- [ ] `docker compose up` succeeds on Linux
- [ ] Unauthenticated user redirected to `/login`
- [ ] LDAP bind succeeds with ACM AD credentials (user + role assignment verified)
- [ ] Session cookie persists across page reload; logout clears session
- [ ] `/healthz` responds with JSON including service status
- [ ] Hardcoded "Inventory Value: €0" card displays on dashboard after login
- [ ] ACM logo appears in header; favicon loads
- [ ] Caddy reverse proxy handles TLS (even if self-signed for Phase 1)

**Dependencies:** None

**Can run in parallel with:** No — sequential (required for all following phases)

---

### Phase 2: CSV Ingestion Core

**Goal:** A file can be dropped into the API, parser handles the decimal-comma quirk (re-merged from schema), and atomically replaces stock data in PostgreSQL. All validation errors are surfaced. Audit table records every attempt.

**Scope:**
- PostgreSQL schema for `stock_rows` (article, warehouse, quantities, values, dates as strong types)
- Staging table pattern for atomic replace-on-success
- CSV parser using `csv-parse` + custom decimal-comma re-merge (schema-aware)
- Windows-1252 encoding detection via `iconv-lite`
- `DD.MM.YY` date parsing with century inference
- Negative stock preservation (legit data, not rejected)
- `.csv` and `.txt` file extension handling
- Validation that collects all errors at once (fail-on-all, not fail-on-first)
- Atomic transaction: TRUNCATE → INSERT → REFRESH MATERIALIZED VIEW → COMMIT (rollback on any error)
- `imports` audit table (filename, row count, status, error message, timestamp, operator)
- API endpoint POST `/api/v1/ingest` accepting multipart file upload
- Bull job queue for async parsing/insertion (shared with SMB watcher later)
- Full test coverage: unit tests on parser (golden-file against `samples/LagBes-sample.csv`, encoding, dates, negative stock)
- Performance: typical file (10k rows) under 60 seconds end-to-end

**Requirements covered:** IN-01, IN-03, IN-04, IN-05, IN-06, IN-07, IN-09, IN-10, IN-11, IN-12, IN-13, KPI-01, TEST-01, OBS-01

**Pitfalls gated:**
- #1 (Naive CSV parsing / decimal comma) — Custom numeric-field re-merge with schema awareness; golden-file tests
- #2 (Encoding ambiguity) — Explicit Windows-1252 detection; tests for umlauts, ß, µ
- #10 (Partial import corruption) — Staging table + atomic transaction; rollback on failure

**Exit criteria:**
- [ ] `samples/LagBes-sample.csv` parses without errors and row count matches expected
- [ ] Decimal-comma columns (Preis, Wert, etc.) re-merged correctly; numeric assertions pass
- [ ] Dates parsed as YYYY-MM-DD with correct century inference (2001-2099 for `01-99`)
- [ ] Windows-1252 file with umlauts/ß/µ round-trips without mojibake
- [ ] Negative stock rows preserved in database
- [ ] Atomic replace: bad file upload leaves previous snapshot intact; error logged in `imports`
- [ ] `/api/v1/ingest` POST succeeds with 10k-row file in <60 seconds
- [ ] Validation error message displays all issues (not fail-on-first)
- [ ] Unit tests pass for parser (csv-parse, encoding, dates, negative stock)

**Dependencies:** Phase 1

**Can run in parallel with:** No — depends on Phase 1 API + database

---

### Phase 3: KPI Layer & Dashboard

**Goal:** A materialized view pre-computes 7 core KPIs (inventory value, coverage, slow movers, stockouts, ABC, turnover, devaluation). Dashboard displays 4-6 KPI cards (executive view), 30-second polling, and a stale-data banner. Filter scaffolding is in place.

**Scope:**
- Materialized view `kpi_dashboard_data` with 7 table-stakes KPIs:
  1. Total inventory value (€) — SUM(Wert mit Abw.)
  2. Days-on-hand / coverage — weighted by Reichw.Mon. and Durch.Verbr
  3. Slow-mover / dead-stock aging buckets (0-6mo, 6-12mo, 1-2yr, 2yr+)
  4. Stockouts & low-stock list (Bestand ≤ 0 + threshold)
  5. ABC class distribution (A/B/C from ABC-Kennz. VK)
  6. Inventory turnover ratio (proxy from Umsatz Me J)
  7. Devaluation / write-down summary (€ and % of total from Abwert%)
- Materialized view refreshed in same transaction as ingestion
- Dashboard route displaying 4-6 KPI cards (color-coded: green/yellow/red)
- Each KPI card: value, label, status color, threshold logic
- "Last updated" timestamp on dashboard (refreshed per poll)
- Stale-data warning: YELLOW if data >30 min old, RED if >2 hours
- 30-second polling via `/api/v1/kpi/summary` endpoint
- Manual refresh button for users to force re-poll
- Filter UI scaffolding: warehouse, product group, ABC class, article type (filtering logic deferred to v1.x)
- Executive view enforced as default (no analyst drill-down in v1)
- First contentful paint <2 seconds on target network
- Tests: unit tests on KPI calculation functions

**Requirements covered:** KPI-02, KPI-03, KPI-04, KPI-05, KPI-06, KPI-07, KPI-08, KPI-09, KPI-10, DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08, DASH-09, DASH-10, DASH-11, TEST-02

**Pitfalls gated:**
- #6 (Dashboard freshness ambiguity) — Prominent "Last updated" timestamp, yellow/red stale banner, force-refresh button
- #8 (Executive UX killed by too much data) — Executive view enforced (3-6 cards, no filters required), analyst drill-down deferred

**Exit criteria:**
- [ ] `kpi_dashboard_data` materialized view is queryable and accurate
- [ ] 7 KPI cards display on dashboard with correct calculations
- [ ] "Last updated HH:MM" timestamp displays
- [ ] Yellow warning banner appears after 30 minutes without data refresh
- [ ] Red warning banner appears after 2 hours without data refresh
- [ ] Polling occurs every 30 seconds; KPI cards update without full page reload
- [ ] Manual refresh button forces immediate API call and re-renders KPI cards
- [ ] First contentful paint measured <2 seconds (cold cache, target network)
- [ ] Filter dropdown scaffolding present but non-functional (deferred to v1.x)
- [ ] Unit tests pass for all 7 KPI calculations

**Plans:** 0/1 plans executed

Plans:
- [ ] 03-PLAN.md — Phase 3 index + wave structure + dependency graph
- [ ] 03-02-PLAN-shared-dto-types.md — Shared DTO types in packages/core/src/kpi/types.ts
- [ ] 03-03-PLAN-mv-migration.md — Materialized view SQL migration (0002)
- [ ] 03-04-PLAN-mv-refresh-hook.md — MV refresh hook in writer.ts (Phase 2 file, authorized)
- [ ] 03-05-PLAN-api-endpoints.md — API: /summary, /articles, /meta endpoints + color computation
- [ ] 03-06-PLAN-frontend-skeleton.md — React Query setup + hooks + DashboardPage skeleton
- [x] 03-07-PLAN-kpi-components.md — All KPI UI components (KpiGrid, SlowMoverChart, etc.)

**Dependencies:** Phase 1, Phase 2

**Can run in parallel with:** No — depends on Phase 2 ingestion

---

### Phase 4: Upload Page

**Goal:** A dedicated `/upload` route (reached via icon button in dashboard header) accepts file drag-and-drop and file picker, shows progress during ingestion, and displays success summary or full error list.

**Scope:**
- New route `/upload` reachable via icon button in dashboard top-right corner
- Drag-and-drop file input + file picker fallback
- File type validation: only `.csv` and `.txt` accepted
- Progress indicator during upload and parsing (% of file processed)
- Success summary on completion: row count imported, KPI snapshot delta (before/after key metrics)
- Error summary on failure: all validation issues (human-readable, with row numbers)
- Admin role required (401 if Viewer tries to access)
- POST `/api/v1/upload` endpoint (reuses Phase 2 Bull ingestion job)
- Styled with Tailwind + shadcn/ui components
- Tests: e2e Playwright test (login → upload file → dashboard updates)

**Requirements covered:** UP-01, UP-02, UP-03, UP-04, UP-05, UP-06, UP-07, IN-02, TEST-03

**Pitfalls gated:**
- None directly (inherits Phase 2 safety from atomic transaction)

**Exit criteria:**
- [ ] `/upload` route renders when user navigates to it
- [ ] Drag-and-drop zone accepts files
- [ ] File picker fallback (input type=file) works
- [ ] Only `.csv` and `.txt` files accepted; others show validation error
- [ ] Progress bar shows during upload + parsing
- [ ] Success case shows row count and KPI delta
- [ ] Failure case shows all validation issues in human-readable format
- [ ] 403 Forbidden if logged-in user has Viewer role only
- [ ] Playwright e2e test passes: login → upload → dashboard refreshes with new KPI values

**Dependencies:** Phase 1, Phase 2

**Can run in parallel with:** Phase 5, Phase 6, Phase 7

**Plans:** 5 plans

Plans:
- [x] 04-01-api-endpoint-PLAN.md — Shared DTOs + POST /api/v1/upload endpoint with RBAC + KPI delta
- [x] 04-02-frontend-scaffold-PLAN.md — Upload feature folder + DropZone + role-gated Header + route swap
- [x] 04-03-progress-ui-PLAN.md — ProgressView (determinate + indeterminate) + shadcn progress install
- [ ] 04-04-success-error-views-PLAN.md — SuccessSummary + ErrorSummary + UploadPage full wiring
- [ ] 04-05-e2e-wiring-PLAN.md — Playwright e2e test TEST-03 (admin + viewer flows)

---

### Phase 5: SMB Folder Watcher

**Goal:** A background process watches a mounted SMB share for new `LagBes*` files. On detection (after file-stability check), the file is enqueued to the same Bull job as the upload path. Processed files move to `processed/` folder; failed files move to `failed/` with `.error` log.

**Scope:**
- Chokidar file watcher with `usePolling: true` (inotify doesn't work on SMB)
- Watches mounted SMB directory at path from env var / config file
- File pattern matching: `LagBes*` (configurable)
- File-stability check: size + mtime unchanged for ≥1 second before processing (avoids partial-write ingestion)
- Enqueues Bull job identical to upload path (shares Phase 2 parser + ingestion logic)
- On success: move file to `processed/{YYYY-MM-DD}/` subfolder
- On failure: move file to `failed/{YYYY-MM-DD}/` subfolder with adjacent `.error` log file
- Configuration from environment variables: SMB share path, poll interval (e.g., 5s), file pattern
- `/healthz` endpoint includes last ingestion timestamp and status (for dashboard stale-data banner)
- Tests: unit tests on file-stability logic; mock chokidar events

**Requirements covered:** WAT-01, WAT-02, WAT-03, WAT-04, WAT-05, WAT-06, WAT-07

**Pitfalls gated:**
- #3 (SMB race conditions) — File-stability check (size + mtime unchanged for N seconds); exponential backoff on lock failure
- #4 (Silent SMB credential expiry) — `/healthz` reports last-ingest timestamp and status; dashboard banner relayed from API health

**Exit criteria:**
- [ ] Chokidar configured with polling enabled (inotify not used)
- [ ] New file in monitored SMB directory detected within polling interval
- [ ] File-stability check: file not moved until size + mtime stable for 1+ second
- [ ] Successfully ingested file moved to `processed/2026-04-08/` folder
- [ ] Failed ingestion: file moved to `failed/2026-04-08/` with `.error` log adjacent
- [ ] Bull job reuses Phase 2 parser (no code duplication)
- [ ] `/healthz` returns `last_ingest_ts` and `ingest_status` (success/failure + filename)
- [ ] SMB path and poll interval configurable via env vars

**Dependencies:** Phase 1, Phase 2

**Can run in parallel with:** Phase 4, Phase 6, Phase 7

---

### Phase 6: Dark/Light Mode + i18n

**Goal:** Users toggle between dark and light themes (persisted per user). UI supports German and English with correct localization. Number, currency, and date formatting follows locale (e.g., `1.234.567,89 €` in German, `1,234,567.89 €` in English).

**Scope:**
- Theme toggle control in dashboard header (sun/moon icon)
- Theme choice persisted per user (in DB or cookie)
- Both themes meet WCAG AA contrast for body text and KPI values
- Charts (Recharts) render correctly in both themes with theme-aware colors
- i18n via `i18next` + `react-i18next`
- Language toggle in dashboard header (DE / EN buttons)
- Language choice persisted per user
- Translation files: `de.json`, `en.json` (key parity enforced by CI check)
- All user-facing strings localized: UI buttons, error messages, docs, KPI labels
- Typed translation keys (TypeScript) to prevent missing-key bugs
- `Intl.NumberFormat` for locale-aware number formatting (thousands separator, decimal point)
- `Intl.DateTimeFormat` for date formatting (DD.MM.YYYY in German, YYYY-MM-DD in English)
- German layouts verified to accommodate longer text without truncation
- Screenshot tests in both languages (visual regression)
- Tests: CI check fails if `de.json` and `en.json` key sets diverge

**Requirements covered:** I18N-01, I18N-02, I18N-03, I18N-04, I18N-05, THEME-01, THEME-02, THEME-03, THEME-04, DASH-09, DASH-10, TEST-04

**Pitfalls gated:**
- #7 (i18n key drift) — CI check enforces `en.json` ≡ `de.json` keys; typed translation keys; native speaker review
- #16 (i18n string length breaks layout) — German layout verification; CSS flex wrapping; Tailwind responsive classes

**Exit criteria:**
- [ ] Theme toggle switches dark ↔ light; persists across page reload
- [ ] Dark theme: body text contrast ≥ 4.5:1, KPI card values ≥ 7:1
- [ ] Light theme: same contrast ratios
- [ ] Charts render with theme-aware colors (e.g., dark grid lines on dark theme)
- [ ] Language toggle switches DE ↔ EN; persists across page reload
- [ ] All UI strings pulled from `de.json` / `en.json` (no hard-coded English)
- [ ] CI check fails if key set in `de.json` ≠ `en.json`
- [ ] Number format: German mode shows `1.234.567,89 €`, English shows `1,234,567.89 €`
- [ ] Date format: German mode shows `31.12.2025`, English shows `2025-12-31` (or locale default)
- [ ] Screenshot regression tests pass in both languages (no truncation, no overlaps)

**Dependencies:** Phase 1, Phase 3

**Can run in parallel with:** Phase 4, Phase 5, Phase 7

---

### Phase 7: User Docs Site

**Goal:** A `/docs` route (reached via second icon button in dashboard header) presents four documentation sections (end-user guide, upload guide, admin/deployment guide, changelog) in both German and English.

**Scope:**
- New route `/docs` with navigation to four doc sections
- Icon button in dashboard header top-right (second icon, after upload)
- **End-user guide**: What each KPI means, how to read the dashboard, refresh behavior, filter usage
- **Upload guide**: Expected CSV format, how to upload, troubleshooting (e.g., "encoding error means Windows-1252 required")
- **Admin/deployment guide**: `docker-compose up` steps, environment variables (LDAP_URL, SMB_PATH, etc.), SMB mount configuration, LDAP group names, PostgreSQL backup/restore procedure, TLS cert setup (internal CA)
- **Changelog**: Release notes for v1 (date, features shipped, known issues)
- All four sections rendered in both German and English (from `de.json` / `en.json`)
- Styled with Tailwind + shadcn/ui (consistent with dashboard)
- Table of contents or breadcrumb navigation

**Requirements covered:** DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05, DOCS-06

**Pitfalls gated:**
- None directly (inherits i18n from Phase 6)

**Exit criteria:**
- [ ] `/docs` route renders when user navigates to it
- [ ] Icon button in header reaches `/docs`
- [ ] End-user guide displays with KPI explanations
- [ ] Upload guide explains CSV format and troubleshooting
- [ ] Admin guide lists all env vars and deployment steps
- [ ] Changelog displays v1 release date and feature list
- [ ] All doc text in German matches German UI language setting
- [ ] All doc text in English matches English UI language setting
- [ ] Language toggle on dashboard affects `/docs` without full page reload (if in same session)

**Dependencies:** Phase 1, Phase 6

**Can run in parallel with:** Phase 4, Phase 5

---

### Phase 8: Deployment Hardening

**Goal:** Stack is tested on actual target OS (CentOS/Ubuntu + SELinux mode confirmed). Volume permissions, TLS with internal CA, and backup/restore runbook are validated end-to-end.

**Scope:**
- Target OS identified and tested (CentOS 7/8/9, RHEL, Ubuntu LTS — SELinux enforcing mode)
- Docker image builds with pinned base images (`node:22-alpine` builder → `gcr.io/distroless/nodejs22` runtime)
- Multi-stage Dockerfile, reproducible without internet access after first build
- Explicit UID/GID in containers (no `root`, avoid permission mismatches with mounted volumes)
- SELinux `:Z` label applied to volume mounts (if enforcing)
- Entrypoint preflight checks: SMB share accessible, PostgreSQL connectable, Redis accessible
- TLS certificates configured:
  - Internal CA option: admin provides CA cert + private key
  - Self-signed option: Caddy generates on first run
  - No external ACME calls required
- Container images optimized for on-prem size (~120-180 MB final)
- No external fonts, icons, or scripts loaded at runtime (all bundled)
- PostgreSQL backup runbook documented:
  - Host-level volume snapshot (LVM example)
  - Manual restore procedure
  - Automated daily cron example
- Tests:
  - Full stack deployment on target OS (docker-compose up, healthz passes)
  - Backup + restore tested (export snapshot, stop stack, restore, verify data)
  - TLS handshake verified (cert valid from browser perspective)

**Requirements covered:** DEP-01, DEP-02, DEP-03, DEP-04, DEP-05, DEP-06, DEP-07, DEP-08, DEP-09, OBS-03, SEC-01, SEC-02, SEC-05

**Pitfalls gated:**
- #9 (Docker volume perms / SELinux) — Explicit UID/GID, `:Z` labels, preflight checks, target OS tested
- #11 (On-prem deployment without internet) — All fonts/icons bundled, no CDN, no postinstall package downloads

**Exit criteria:**
- [ ] Target OS (CentOS/Ubuntu version, SELinux enforcing mode) confirmed with ACM IT
- [ ] `docker compose up` succeeds on target OS
- [ ] All containers run as explicit non-root UID
- [ ] SELinux policy (if enforcing) allows volume access (`:Z` labels or custom policies)
- [ ] `/healthz` endpoint returns 200 (all services healthy)
- [ ] TLS certificate (internal CA or self-signed) accepted by browser
- [ ] PostgreSQL backup snapshot created successfully
- [ ] Restore procedure tested: stop stack → restore snapshot → start stack → data verified
- [ ] All assets (fonts, icons, CSS) bundled in container images (no CDN calls)
- [ ] Container images <200 MB each
- [ ] Admin guide includes deployment runbook + backup/restore steps (from Phase 7 docs)

**Dependencies:** Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7

**Can run in parallel with:** No — final integration phase

---

## Coverage Audit

| Requirement ID | Phase |
|---|---|
| IN-01 | Phase 2 |
| IN-02 | Phase 4 |
| IN-03 | Phase 2 |
| IN-04 | Phase 2 |
| IN-05 | Phase 2 |
| IN-06 | Phase 2 |
| IN-07 | Phase 2 |
| IN-08 | Phase 5 |
| IN-09 | Phase 2 |
| IN-10 | Phase 2 |
| IN-11 | Phase 2 |
| IN-12 | Phase 2 |
| IN-13 | Phase 2 |
| KPI-01 | Phase 2 |
| KPI-02 | Phase 3 |
| KPI-03 | Phase 3 |
| KPI-04 | Phase 3 |
| KPI-05 | Phase 3 |
| KPI-06 | Phase 3 |
| KPI-07 | Phase 3 |
| KPI-08 | Phase 3 |
| KPI-09 | Phase 3 |
| KPI-10 | Phase 2 |
| DASH-01 | Phase 3 |
| DASH-02 | Phase 3 |
| DASH-03 | Phase 3 |
| DASH-04 | Phase 3 |
| DASH-05 | Phase 3 |
| DASH-06 | Phase 3 |
| DASH-07 | Phase 3 |
| DASH-08 | Phase 3 |
| DASH-09 | Phase 6 |
| DASH-10 | Phase 6 |
| DASH-11 | Phase 3 |
| UP-01 | Phase 4 |
| UP-02 | Phase 4 |
| UP-03 | Phase 4 |
| UP-04 | Phase 4 |
| UP-05 | Phase 4 |
| UP-06 | Phase 4 |
| UP-07 | Phase 4 |
| WAT-01 | Phase 5 |
| WAT-02 | Phase 5 |
| WAT-03 | Phase 5 |
| WAT-04 | Phase 5 |
| WAT-05 | Phase 5 |
| WAT-06 | Phase 5 |
| WAT-07 | Phase 5 |
| AUTH-01 | Phase 1 |
| AUTH-02 | Phase 1 |
| AUTH-03 | Phase 1 |
| AUTH-04 | Phase 1 |
| AUTH-05 | Phase 1 |
| AUTH-06 | Phase 1 |
| AUTH-07 | Phase 1 |
| AUTH-08 | Phase 1 |
| I18N-01 | Phase 6 |
| I18N-02 | Phase 6 |
| I18N-03 | Phase 6 |
| I18N-04 | Phase 6 |
| I18N-05 | Phase 6 |
| THEME-01 | Phase 6 |
| THEME-02 | Phase 6 |
| THEME-03 | Phase 6 |
| THEME-04 | Phase 6 |
| DOCS-01 | Phase 7 |
| DOCS-02 | Phase 7 |
| DOCS-03 | Phase 7 |
| DOCS-04 | Phase 7 |
| DOCS-05 | Phase 7 |
| DOCS-06 | Phase 7 |
| BRAND-01 | Phase 1 |
| BRAND-02 | Phase 1 |
| BRAND-03 | Phase 1 |
| DEP-01 | Phase 8 |
| DEP-02 | Phase 8 |
| DEP-03 | Phase 8 |
| DEP-04 | Phase 8 |
| DEP-05 | Phase 8 |
| DEP-06 | Phase 8 |
| DEP-07 | Phase 8 |
| DEP-08 | Phase 8 |
| DEP-09 | Phase 8 |
| OBS-01 | Phase 2 |
| OBS-02 | Phase 1 |
| OBS-03 | Phase 8 |
| SEC-01 | Phase 8 |
| SEC-02 | Phase 8 |
| SEC-03 | Phase 1 |
| SEC-04 | Phase 1 |
| SEC-05 | Phase 8 |
| TEST-01 | Phase 2 |
| TEST-02 | Phase 3 |
| TEST-03 | Phase 4 |
| TEST-04 | Phase 6 |

**Coverage status:** ✓ All 67 v1 requirements mapped to exactly one phase

---

## Parallelization Map

```
Phase 1: Foundation & Auth
     │
     ├─→ Phase 2: CSV Ingestion Core
     │        │
     │        ├─→ Phase 3: KPI Layer & Dashboard
     │        │        │
     │        │        └─→ Phase 8: Deployment Hardening (final)
     │        │
     │        ├─→ (Phase 4 + Phase 5 + Phase 6 + Phase 7 can run in parallel)
     │        │    Phase 4: Upload Page
     │        │    Phase 5: SMB Folder Watcher
     │        │    Phase 6: Dark/Light Mode + i18n
     │        │    Phase 7: User Docs Site
     │        │
     │        └─→ Phase 8: Deployment Hardening (final)
```

**Sequential chain (critical path):** Phase 1 → Phase 2 → Phase 3 → Phase 8

**Parallel opportunities:**
- Phases 4, 5, 6, 7 can run concurrently after Phase 2 completes
- Phase 6 (i18n) can start immediately after Phase 1 (only needs header/UI scaffold)
- Phase 7 (docs) is pure content; can start after Phase 1

**Recommended parallelization:**
- **Claude Thread A** (critical path): Phase 1 → Phase 2 → Phase 3
- **Claude Thread B** (parallel content): Phase 4 (upload) + Phase 5 (watcher) + Phase 6 (i18n + dark mode)
- **Claude Thread C** (parallel docs): Phase 7 (user docs site)
- **Final thread** (integration): Phase 8 (hardening + testing)

This allows 4 independent workstreams, significantly compressing wall-clock time while maintaining runnable, testable milestones.

---

## Open Questions for Discuss-Phase

Carried forward from SUMMARY.md + new ones surfaced during roadmap creation:

1. **ACM AD structure** — Single domain or forest with referrals? Impact: LDAP config complexity (Phase 1 planning)
2. **Apollo export cadence** — Hourly / daily / on-demand? Impact: SMB watcher polling interval tuning (Phase 5)
3. **Production file size** — Sample is 900 rows; real file may be 10k–50k+? Impact: ingestion timeout, materialized-view refresh performance budget (Phase 2–3)
4. **Target OS + SELinux mode** — CentOS 7/8/9, RHEL, Ubuntu LTS? SELinux enforcing/permissive? Impact: Dockerfile UID/GID, volume label strategy (Phase 8)
5. **Internal CA certificate** — Does ACM IT have a corporate CA, or do we self-sign? Impact: TLS setup (Phase 8 / Phase 1 bootstrap)
6. **SMB share authentication** — Service account credentials provided by IT? Rotation policy? Impact: env var security, lifecycle (Phase 5)
7. **LDAP service account** — Does ACM have one for automated lookups, or do we bind-as-user? Impact: Auth design (Phase 1)
8. **LDAP TLS/SSL requirement** — LDAPS mandatory, or is plain LDAP acceptable? Impact: cert handling (Phase 1)
9. **PostgreSQL backup infrastructure** — Does ACM IT provide external storage (NAS, S3-compatible, etc.), or are host-level LVM snapshots sufficient? Impact: backup runbook (Phase 8)
10. **User roles granularity** — Are Viewer + Admin the only roles, or do we need Editor / Analyst roles in v1? (Phase 1 planning)
11. **File retention policy** — How long do processed/failed files stay on the SMB share before deletion? Impact: cleanup cron (Phase 5)
12. **Monitoring integration** — Does ACM have Prometheus/Grafana/ELK? Can we export logs there, or is stdout capture sufficient? Impact: observability (Phase 2 / Phase 8)

---

## Pitfall Mapping Summary

| Pitfall | Title | Phase Gated | Mitigation |
|---|---|---|---|
| #1 | Naive CSV parsing (decimal comma) | Phase 2 | Schema-aware numeric re-merge; golden-file tests |
| #2 | Encoding ambiguity (Windows-1252) | Phase 2 | Explicit iconv-lite detection; umlauts/ß/µ tests |
| #3 | SMB race conditions (partial writes) | Phase 5 | File-stability check (1s size+mtime); exponential backoff |
| #4 | Silent SMB credential expiry | Phase 5 | `/healthz` with last_ingest_ts; dashboard stale banner |
| #5 | LDAP referrals / chasing | Phase 1 | `followReferrals: true`; parameterized filters; IT testing |
| #6 | Dashboard freshness ambiguity | Phase 3 | Prominent timestamp; yellow/red stale banner; force-refresh |
| #7 | i18n key drift (EN ≠ DE) | Phase 6 | CI check enforces key parity; typed keys; screenshot tests |
| #8 | Executive UX killed by too much data | Phase 1 + Phase 3 | Executive view enforced (3–6 cards, no filters); analyst deferred |
| #9 | Docker volume perms / SELinux / UID | Phase 1 + Phase 8 | Explicit UID/GID; `:Z` labels; preflight checks; target OS tested |
| #10 | Partial import corruption | Phase 2 | Staging table + atomic TRUNCATE+INSERT; rollback on failure |

---

*Roadmap created: 2026-04-08*
