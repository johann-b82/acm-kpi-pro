# Requirements: ACM KPI Pro

**Defined:** 2026-04-08
**Core Value:** Executives see the health of ACM's inventory and production at a glance — on a single dashboard — without touching Apollo NTS.

## v1 Requirements

### Ingestion (IN)

- [ ] **IN-01**: The system accepts CSV/TXT exports of the Apollo NTS `LagBes` warehouse stock file via browser upload (drag-and-drop + file picker).
- [ ] **IN-02**: The system accepts the same file via an SMB folder watcher that watches a mounted share and processes new files automatically.
- [x] **IN-03**: Browser upload and folder watcher converge on a single ingestion code path (same parser, same validation, same DB write).
- [x] **IN-04**: The parser correctly handles Windows-1252 encoding and round-trips umlauts, ß, and `µ` characters without mojibake.
- [x] **IN-05**: The parser correctly handles the German-decimal-comma-breaks-semicolon-delimiter quirk documented in `samples/README.md`, and passes a golden-file test against `samples/LagBes-sample.csv`.
- [x] **IN-06**: The parser correctly interprets `DD.MM.YY` dates, inferring the century sensibly.
- [x] **IN-07**: The parser accepts both `.csv` and `.txt` file extensions.
- [ ] **IN-08**: The folder watcher detects new files only after they are stable (size + mtime unchanged for ≥1 second) to avoid ingesting partially-written files.
- [x] **IN-09**: A new import replaces the previous snapshot atomically — if parsing or validation fails, the previous snapshot remains untouched.
- [x] **IN-10**: Every import attempt (success or failure) is recorded in an `imports` audit table with filename, row count, status, operator (if via upload), timestamp, and any error message.
- [x] **IN-11**: Validation errors in the CSV are collected and reported *all at once* (not fail-on-first), with row numbers and a human-readable reason.
- [x] **IN-12**: The ingestion pipeline completes a typical-size file (10k rows) in under 60 seconds end-to-end on the target host.
- [x] **IN-13**: Negative stock values are preserved as legitimate data, not rejected or zeroed.

### Data Model & KPI Layer (KPI)

- [x] **KPI-01**: PostgreSQL schema stores parsed stock rows with strong types (numeric for quantities and values, parsed dates, enums for `Typ`).
- [x] **KPI-02**: A materialized view pre-computes dashboard KPIs and is refreshed in the same transaction as an import.
- [x] **KPI-03**: Total inventory value (€) — sum of `Wert mit Abw.` — is computed and queryable.
- [x] **KPI-04**: Days-on-hand / coverage is computed from `Reichw.Mon.` and `Durch.Verbr`.
- [x] **KPI-05**: Slow-mover / dead-stock aging buckets (0-6mo, 6-12mo, 1-2yr, 2yr+) are computed from `Lagerabgang Dat` / `letzt.Zugang`.
- [x] **KPI-06**: Stockout and low-stock list is computed from `Bestand ≤ 0` and below-threshold stock.
- [x] **KPI-07**: ABC class distribution is derived from `ABC-Kennz. VK`, treating blank as C.
- [x] **KPI-08**: Inventory turnover ratio is computed from `Umsatz Me J` against current stock.
- [x] **KPI-09**: Devaluation / write-down summary (€ and % of total value) is computed from `Abwert%`.
- [ ] **KPI-10**: The KPI layer is extensible — adding a future feed (e.g. scrap rate) does not require rewriting the existing ingestion or dashboard code, only registering a new feed + tables + KPI definitions.

### Dashboard (DASH)

- [x] **DASH-01**: Dashboard route shows a default "Executive view" with 4-6 KPI cards above the fold, no filters required.
- [x] **DASH-02**: Each KPI card shows the value, a label, and a color-coded status (green / yellow / red) based on thresholds.
- [ ] **DASH-03**: Dashboard shows a prominent "Last updated" timestamp and warns with a visible banner if data is older than 30 minutes (yellow) or 2 hours (red).
- [ ] **DASH-04**: Dashboard polls for new data every 30 seconds and refreshes without a full page reload.
- [ ] **DASH-05**: Users can slice and filter by warehouse (`Lagername`), product group (`WGR`/`ProdGrp`), ABC class, and article type (`Typ`).
- [ ] **DASH-06**: Dashboard shows a slow-mover / dead-stock chart (aging buckets).
- [ ] **DASH-07**: Dashboard shows a stockout / low-stock list with drill-down to row detail.
- [ ] **DASH-08**: First contentful paint is under 2 seconds on the target network from a cold cache.
- [ ] **DASH-09**: All numbers displayed on the dashboard use German formatting (`1.234.567,89 €`) when the UI language is German, and English formatting otherwise.
- [ ] **DASH-10**: Dates are displayed as `DD.MM.YYYY` in German and `YYYY-MM-DD` (or locale default) in English.
- [ ] **DASH-11**: A refresh button lets users force a re-poll without waiting for the polling interval.

### Upload Page (UP)

- [ ] **UP-01**: The upload page is a separate route reachable via an icon button in the top-right corner of the main dashboard.
- [ ] **UP-02**: The upload page supports drag-and-drop and a file picker fallback.
- [ ] **UP-03**: The upload page accepts `.csv` and `.txt` files.
- [ ] **UP-04**: The upload page shows a progress indicator during upload and parsing.
- [ ] **UP-05**: The upload page shows a success summary (rows imported, KPI snapshot delta) on completion.
- [ ] **UP-06**: The upload page shows an error summary with all validation issues when a file fails.
- [ ] **UP-07**: Only users with the Admin role can upload.

### Folder Watcher (WAT)

- [ ] **WAT-01**: A background watcher polls a mounted SMB share for new files matching the `LagBes*` pattern (configurable).
- [ ] **WAT-02**: Watcher uses chokidar with polling enabled (inotify does not work on SMB).
- [ ] **WAT-03**: Detected files are enqueued to the same Bull job the upload path uses.
- [ ] **WAT-04**: After successful ingestion, the file is moved to a `processed/` subfolder (dated) to avoid re-ingestion.
- [ ] **WAT-05**: After failed ingestion, the file is moved to a `failed/` subfolder with an adjacent `.error` log file.
- [ ] **WAT-06**: The `/healthz` endpoint reports the last ingestion timestamp and status so monitoring tools and the dashboard banner can surface stale data.
- [ ] **WAT-07**: Watcher configuration (share path, poll interval, file pattern) is read from environment variables or a config file.

### Authentication & Authorization (AUTH)

- [x] **AUTH-01**: Users authenticate against on-prem Active Directory via LDAP (LDAPS supported).
- [x] **AUTH-02**: The auth layer is abstracted behind an `AuthProvider` interface so Entra ID / SAML can be added later without changing API code.
- [x] **AUTH-03**: Sessions persist across page reloads until explicitly logged out or expired.
- [x] **AUTH-04**: Two roles exist: `Viewer` (read-only dashboard + docs) and `Admin` (Viewer + upload + settings).
- [x] **AUTH-05**: Role assignment is based on an AD group membership (configurable group name per role).
- [x] **AUTH-06**: Unauthenticated users are redirected to a login page on any protected route.
- [x] **AUTH-07**: LDAP referrals are followed correctly (multi-domain AD support) and credentials are never logged.
- [x] **AUTH-08**: LDAP filter inputs are parameterized to prevent LDAP injection.

### Internationalization (I18N)

- [ ] **I18N-01**: The UI supports German and English.
- [ ] **I18N-02**: Users can toggle language via a control in the app header; selection is persisted per user.
- [ ] **I18N-03**: All user-facing strings (UI, error messages, docs) are localized; a CI check fails the build if `de.json` and `en.json` key sets diverge.
- [ ] **I18N-04**: German layouts are verified to accommodate longer text without truncation.
- [ ] **I18N-05**: Number, currency, and date formatting uses `Intl.NumberFormat` / `Intl.DateTimeFormat` with the appropriate locale.

### Theme (THEME)

- [ ] **THEME-01**: Users can toggle between dark mode and light mode.
- [ ] **THEME-02**: Theme preference is persisted per user across sessions.
- [ ] **THEME-03**: Both themes meet WCAG AA contrast for body text and KPI values.
- [ ] **THEME-04**: Charts render correctly in both themes with theme-aware colors.

### User Documentation Site (DOCS)

- [ ] **DOCS-01**: A separate `/docs` route is reachable via a second icon button in the top-right corner of the main dashboard.
- [ ] **DOCS-02**: Docs site contains an **end-user guide** explaining what each KPI means and how to read the dashboard.
- [ ] **DOCS-03**: Docs site contains an **upload guide** describing the expected CSV format, how to upload, and troubleshooting.
- [ ] **DOCS-04**: Docs site contains an **admin / deployment guide** covering docker-compose usage, environment variables, SMB share configuration, LDAP configuration, backup / restore.
- [ ] **DOCS-05**: Docs site contains an in-app **changelog / release notes** page.
- [ ] **DOCS-06**: All docs pages are available in both German and English.

### Branding (BRAND)

- [ ] **BRAND-01**: The ACM logo (`assets/acm-logo.png`) is shown in the app header.
- [ ] **BRAND-02**: The same logo is served as the browser favicon.
- [ ] **BRAND-03**: UI uses a color palette that complements the logo (designed by the ui-ux-pro-max skill).

### Deployment (DEP)

- [ ] **DEP-01**: The entire stack is deployable via `docker compose up` on an on-prem Linux host with no internet dependency at runtime.
- [ ] **DEP-02**: A `docker-compose.yml` ships the full stack: reverse proxy (Caddy) with TLS, React frontend, Fastify API, CSV worker, PostgreSQL, Redis.
- [ ] **DEP-03**: PostgreSQL and Redis are not exposed on host ports — only the reverse proxy is.
- [ ] **DEP-04**: The SMB share is mounted into the worker container as a read-write volume (path configurable).
- [ ] **DEP-05**: TLS certificates are sourced from an internal CA or self-signed via Caddy config; no external CDN or ACME call required.
- [ ] **DEP-06**: Container images are built multi-stage, use pinned base images, and are reproducible without internet access after first build (images cached locally or in an internal registry).
- [ ] **DEP-07**: No external fonts, icons, or scripts are loaded at runtime — everything is bundled.
- [ ] **DEP-08**: Deployment is tested on the target OS (Linux distribution + SELinux mode to be confirmed with ACM IT) before handoff.
- [ ] **DEP-09**: The admin guide contains a step-by-step deployment runbook and backup / restore procedure for the PostgreSQL volume.

### Observability (OBS)

- [x] **OBS-01**: All services log structured JSON to stdout (Docker captures + rotates).
- [ ] **OBS-02**: A `/healthz` endpoint on the API reports service health plus last-ingest timestamp and status.
- [ ] **OBS-03**: Import errors are visible to admins via the dashboard (banner / error log page) — not only in container logs.

### Security (SEC)

- [ ] **SEC-01**: All free-text description fields are sanitized before rendering (no XSS).
- [ ] **SEC-02**: File uploads are size-limited and content-type checked.
- [x] **SEC-03**: LDAP credentials are bound via LDAPS when available; plaintext LDAP is an opt-in fallback with a clear admin warning.
- [ ] **SEC-04**: The reverse proxy sets HSTS, CSP, X-Frame-Options headers.
- [ ] **SEC-05**: No telemetry or analytics beacons leave the host.

### Testing (TEST)

- [x] **TEST-01**: The CSV parser has unit tests covering the decimal-comma quirk, encoding, dates, and negative stock, with `samples/LagBes-sample.csv` as the golden fixture.
- [x] **TEST-02**: Core KPI calculation functions have unit tests.
- [ ] **TEST-03**: At least one end-to-end Playwright test covers: login → upload file → dashboard shows updated KPI.
- [ ] **TEST-04**: A CI check fails the build when `de.json` and `en.json` diverge.

## v2 Requirements (Deferred)

### Historical Snapshots & Trends

- **HIST-01**: Each import is stored as a dated snapshot alongside the current state.
- **HIST-02**: Dashboard shows trend lines for each top-line KPI (week-over-week, month-over-month).
- **HIST-03**: Users can compare two snapshots side by side.

### Additional Feeds

- **FEED-01**: Scrap / quality rate KPIs from an Apollo NTS quality export (parser + schema + dashboard additions).
- **FEED-02**: Supplier risk scorecard (A-class items with a single source).

### Live Updates

- **LIVE-01**: Dashboard receives server-sent events on import completion instead of polling.

### Alternative Auth

- **AUTH2-01**: Entra ID / Azure AD via OIDC.
- **AUTH2-02**: ADFS / SAML 2.0.

### Advanced Dashboard

- **DASH2-01**: Pareto 80/20 chart for inventory value concentration.
- **DASH2-02**: Warehouse × product-group heatmap with drill-down.
- **DASH2-03**: Printable / PDF export of the dashboard.

## Out of Scope

| Feature | Reason |
|---|---|
| Writeback to Apollo NTS | Read-only by design; Apollo is the system of record. |
| Sub-minute live streaming updates | Not justified given CSV import cadence; polling is sufficient for v1. |
| Custom metric builder | Leads to inconsistent KPI definitions; needs governance before it's a feature. |
| ML demand forecasting | Requires historical data and ML infrastructure; not the core value. |
| Mobile-native app | Responsive web covers the need; no separate mobile app. |
| Multi-tenant / multi-site | Single ACM deployment per instance; other sites get their own installation. |
| External (internet-facing) access | Internal tool only, behind ACM firewall. |
| OAuth social login | Not applicable — internal users authenticate via AD only. |

## Traceability

| Requirement | Phase | Status |
|---|---|---|
| IN-01 | Phase 4 | Pending |
| IN-02 | Phase 5 | Pending |
| IN-03 | Phase 2 | Complete |
| IN-04 | Phase 2 | Complete |
| IN-05 | Phase 2 | Complete |
| IN-06 | Phase 2 | Complete |
| IN-07 | Phase 2 | Complete |
| IN-08 | Phase 5 | Pending |
| IN-09 | Phase 2 | Complete |
| IN-10 | Phase 2 | Complete |
| IN-11 | Phase 2 | Complete |
| IN-12 | Phase 2 | Complete |
| IN-13 | Phase 2 | Complete |
| KPI-01 | Phase 2 | Complete |
| KPI-02 | Phase 3 | Complete |
| KPI-03 | Phase 3 | Complete |
| KPI-04 | Phase 3 | Complete |
| KPI-05 | Phase 3 | Complete |
| KPI-06 | Phase 3 | Complete |
| KPI-07 | Phase 3 | Complete |
| KPI-08 | Phase 3 | Complete |
| KPI-09 | Phase 3 | Complete |
| KPI-10 | Phase 2 | Pending |
| DASH-01 | Phase 3 | Complete |
| DASH-02 | Phase 3 | Complete |
| DASH-03 | Phase 3 | Pending |
| DASH-04 | Phase 3 | Pending |
| DASH-05 | Phase 3 | Pending |
| DASH-06 | Phase 3 | Pending |
| DASH-07 | Phase 3 | Pending |
| DASH-08 | Phase 3 | Pending |
| DASH-09 | Phase 6 | Pending |
| DASH-10 | Phase 6 | Pending |
| DASH-11 | Phase 3 | Pending |
| UP-01 | Phase 4 | Pending |
| UP-02 | Phase 4 | Pending |
| UP-03 | Phase 4 | Pending |
| UP-04 | Phase 4 | Pending |
| UP-05 | Phase 4 | Pending |
| UP-06 | Phase 4 | Pending |
| UP-07 | Phase 4 | Pending |
| WAT-01 | Phase 5 | Pending |
| WAT-02 | Phase 5 | Pending |
| WAT-03 | Phase 5 | Pending |
| WAT-04 | Phase 5 | Pending |
| WAT-05 | Phase 5 | Pending |
| WAT-06 | Phase 5 | Pending |
| WAT-07 | Phase 5 | Pending |
| AUTH-01 | Phase 1 | Complete (01-05) |
| AUTH-02 | Phase 1 | Complete (01-05) |
| AUTH-03 | Phase 1 | Complete (01-05) |
| AUTH-04 | Phase 1 | Complete (01-05) |
| AUTH-05 | Phase 1 | Complete (01-05) |
| AUTH-06 | Phase 1 | Complete (01-05) |
| AUTH-07 | Phase 1 | Complete (01-05) |
| AUTH-08 | Phase 1 | Complete (01-05) |
| I18N-01 | Phase 6 | Pending |
| I18N-02 | Phase 6 | Pending |
| I18N-03 | Phase 6 | Pending |
| I18N-04 | Phase 6 | Pending |
| I18N-05 | Phase 6 | Pending |
| THEME-01 | Phase 6 | Pending |
| THEME-02 | Phase 6 | Pending |
| THEME-03 | Phase 6 | Pending |
| THEME-04 | Phase 6 | Pending |
| DOCS-01 | Phase 7 | Pending |
| DOCS-02 | Phase 7 | Pending |
| DOCS-03 | Phase 7 | Pending |
| DOCS-04 | Phase 7 | Pending |
| DOCS-05 | Phase 7 | Pending |
| DOCS-06 | Phase 7 | Pending |
| BRAND-01 | Phase 1 | Pending |
| BRAND-02 | Phase 1 | Pending |
| BRAND-03 | Phase 1 | Pending |
| DEP-01 | Phase 8 | Pending |
| DEP-02 | Phase 8 | Pending |
| DEP-03 | Phase 8 | Pending |
| DEP-04 | Phase 8 | Pending |
| DEP-05 | Phase 8 | Pending |
| DEP-06 | Phase 8 | Pending |
| DEP-07 | Phase 8 | Pending |
| DEP-08 | Phase 8 | Pending |
| DEP-09 | Phase 8 | Pending |
| OBS-01 | Phase 2 | Complete |
| OBS-02 | Phase 1 | Pending |
| OBS-03 | Phase 8 | Pending |
| SEC-01 | Phase 8 | Pending |
| SEC-02 | Phase 8 | Pending |
| SEC-03 | Phase 1 | Complete (01-05) |
| SEC-04 | Phase 1 | Pending |
| SEC-05 | Phase 8 | Pending |
| TEST-01 | Phase 2 | Complete |
| TEST-02 | Phase 3 | Complete |
| TEST-03 | Phase 4 | Pending |
| TEST-04 | Phase 6 | Pending |

**Coverage:** 67/67 v1 requirements mapped — 100% ✓

---
*Requirements defined: 2026-04-08*
*Last updated: 2026-04-08 after roadmap creation*
