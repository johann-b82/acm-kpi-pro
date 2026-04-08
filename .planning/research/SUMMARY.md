# Research Summary — ACM KPI Pro

Synthesis of `STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md` for the roadmap agent.

## TL;DR

On-prem executive dashboard that ingests Apollo NTS `LagBes` CSV exports and surfaces warehouse-stock KPIs. Stack and patterns are standard 2026 web app territory. The **one genuinely hard problem** is the CSV file itself (German decimal commas break semicolon delimiting, Windows-1252 encoding, `DD.MM.YY` dates, mixed-language descriptions, negative stock). Everything else is glue.

**Critical risk (EXTREME):** Naive CSV parsing silently corrupts KPI calculations. Must be solved in Phase 1 with schema-aware numeric-field re-merging and tests against `samples/LagBes-sample.csv`.

---

## Recommended Stack (STACK.md)

| Layer | Choice | Version | Notes |
|---|---|---|---|
| Frontend framework | Vite + React + React Router v6 | Vite 8, React 19 | No SSR needed for internal on-prem dashboard. Simpler than Next.js. |
| UI library | TailwindCSS + shadcn/ui | Tailwind 3.4+ | Themeable, ships dark/light for free. |
| Charting | Recharts | 2.12+ | Good React DX for < 2k rows per chart. ECharts is fallback if perf becomes an issue. |
| i18n | i18next + react-i18next | 23.7+ | Mature ecosystem, SSR-agnostic. Reject LinguiJS (smaller but weaker ecosystem). |
| Backend framework | Fastify | 5.8+ | Typed, fast, good file handling. Reject NestJS (over-engineered for this scope). |
| Runtime | Node.js LTS | 22 or 24 | Stick with Node LTS for on-prem stability. No Bun/Deno. |
| ORM | Drizzle ORM + pg | Drizzle 0.45+ | Code-first, excellent bulk-insert ergonomics. Reject Prisma (bundle size, cold starts). |
| Database | PostgreSQL | 16 | |
| CSV parsing | `csv-parse` + `iconv-lite` | csv-parse 5.5+ | **Custom decimal-comma re-merge layer required** — see PITFALLS.md #1. |
| File watcher | Chokidar | 5.0+ | MUST use `usePolling: true` — inotify doesn't work on SMB shares. |
| Job queue | Bull + Redis | 4.x | Async worker for ingestion. Browser upload and SMB watcher both enqueue here. |
| Auth | `ldapjs` + `iron-session` | ldapjs 3.0+ | LDAP bind + sealed cookies. Wrap in an `AuthProvider` interface so Entra/SAML can be added later. |
| Reverse proxy | Caddy | 2.8+ | Automatic TLS, internal-CA friendly, single config file. Reject nginx (cert mgmt hassle) and Traefik (k8s-oriented). |
| Container base | `node:22-alpine` builder → `gcr.io/distroless/nodejs22` runtime | | Multi-stage, ~120-180 MB final. |
| Testing | Vitest + Playwright | Vitest 2.0+, Playwright 1.45+ | |
| Lint/format | Biome | 1.8+ | 10x faster than ESLint+Prettier, one config. |

**Confidence:** HIGH for stack picks; MEDIUM-HIGH for CSV quirk handling (custom logic, must be test-validated against the real file).

---

## Table-Stakes Features (FEATURES.md)

All computable from LagBes columns — formulas documented in FEATURES.md.

**KPIs (must have for v1):**
1. Total inventory value (€) — `SUM(Wert mit Abw.)`
2. Days on hand / coverage — weighted by `Reichw.Mon.` and `Durch.Verbr`
3. Slow movers & dead stock — aging buckets from `Lagerabgang Dat` / `letzt.Zugang`
4. Stockouts & low-stock alerts — `Bestand ≤ 0` and below-threshold
5. ABC distribution — from `ABC-Kennz. VK` column (A/B/C/blank=C)
6. Inventory turnover ratio — proxy from `Umsatz Me J`
7. Devaluation / write-down summary — from `Abwert%` and `Wert mit Abw.`

**Slices / filters:** warehouse (`Lagername`), product group (`WGR`/`ProdGrp`), ABC class, article type (`Typ`: ART/MAT/HLB/WKZ), supplier (`Lieferant`), age bucket.

**UX patterns:**
- Executive view by default: 4-6 top-line KPI cards, color-coded, 5-second rule
- Analyst view / drill-down available but not forced
- Upload: validate entire file + show all errors at once (don't fail-on-first)
- In-app `/docs` with KPI glossary, upload guide, admin guide, changelog
- Dark / light mode + German / English i18n from day 1
- German number format: `1.234.567,89 €` via `Intl.NumberFormat('de-DE')`
- Dates displayed as `DD.MM.YYYY` (source is `DD.MM.YY` — infer century)

**Anti-features (deliberately NOT in v1):**
- Sub-minute live updates (CSV arrival cadence is enough)
- Historical snapshots / trends (v1 replaces latest)
- Custom metric builder (governance nightmare)
- ML forecasting
- Writeback to Apollo NTS

---

## Architecture (ARCHITECTURE.md)

**Topology:** 6-service Docker Compose stack.

```
           ┌──────────────────────────────────────┐
           │             Caddy (TLS)              │
           │     /api → API   /    → frontend     │
           └──────┬──────────────────────┬────────┘
                  │                      │
           ┌──────▼──────┐        ┌──────▼────────┐
           │  Fastify    │        │ React (Vite)  │
           │  API        │        │ static bundle │
           └──┬───┬──────┘        └───────────────┘
              │   │
       bull   │   │  sql
              │   │
        ┌─────▼──┐│┌────────▼────┐
        │ Redis  │││ PostgreSQL  │
        │ queue  │││  (pgdata)   │
        └────▲───┘└─────────────┘
             │            ▲
       ┌─────┴──────┐     │
       │ CSV Worker │─────┘
       │  (Bull)    │
       └────────────┘
             ▲
             │ watch
             │
       ┌─────┴──────┐
       │ SMB share  │
       │ (host mnt) │
       └────────────┘
```

**Services:** `caddy`, `api`, `frontend`, `worker`, `postgres`, `redis`. Postgres + Redis have no exposed ports.

**Ingestion convergence:** Browser upload → API → Bull job. SMB watcher (inside `worker` or a tiny sidecar) → Bull job. Both hit the same `ingestCSV` handler. Flow: validate encoding → detect delimiter → parse → re-merge decimal-comma fields → schema check → insert to staging → atomic `BEGIN; TRUNCATE stock_rows; INSERT ... SELECT FROM stock_staging; REFRESH MATERIALIZED VIEW kpi_dashboard_data; COMMIT;` → record in `imports` audit table.

**Dashboard refresh:** 30-second polling in v1 against `/api/v1/kpi/summary`, which reads from `kpi_dashboard_data` materialized view (pre-computed per import, instant). SSE upgrade path is documented for v2 — contract-compatible.

**Database shape:**
- `stock_rows` — current snapshot, fully replaced per import
- `imports` — append-only audit (filename, row count, status, error, timestamp, operator)
- `users`, `sessions` (or iron-session cookies if preferred)
- `kpi_dashboard_data` — materialized view for fast dashboard reads

**Extensibility:**
- `packages/core/src/feeds/` registry with a `FeedParser` interface → adding scrap-rate feed later = new parser + new table + register, no rewrite
- `AuthProvider` interface wraps LDAP bind → Entra/SAML later

**Repo layout:** monorepo (npm workspaces) with `apps/{api,frontend,worker}` + `packages/core`. One Dockerfile per app, shared TS via workspace references.

**Backup:** host-level volume snapshots of `pgdata`. Flyway or Drizzle-kit migrations, versioned.

**Observability:** structured JSON logs to stdout → `docker logs` → rotated by host. `/healthz` endpoint. Import errors surfaced in `imports.error_message` and shown on dashboard as a banner with last-ingest timestamp.

---

## Top 10 Pitfalls — Phase Mapped (PITFALLS.md)

| # | Pitfall | Severity | Phase | Mitigation |
|---|---|---|---|---|
| 1 | Naive CSV parsing (decimal comma breaks delimiter) | **EXTREME** | Ingestion | Schema-aware numeric-field re-merge. Golden-file tests against `samples/LagBes-sample.csv`. Checksum: post-parse `SUM(Wert)` compared against header or file-total. |
| 2 | Windows-1252 vs UTF-8 ambiguity + BOM | HIGH | Ingestion | Explicit `iconv-lite` decode with detection. Test with `µµµµ`, umlauts, `ß`. Reject files whose encoding can't be confirmed. |
| 3 | SMB race: watcher fires while file still writing | HIGH | Watcher | File-stability check: size + mtime unchanged for N=1s. Try exclusive lock acquire. Exponential backoff. |
| 4 | Silent SMB credential expiry → stale dashboards | HIGH | Watcher + Dashboard | `/healthz` with `last_ingest_ts` + `ingest_status`. Dashboard banner: YELLOW > 30m, RED > 2h. Periodic re-mount check. |
| 5 | LDAP multi-domain referrals fail silently | MED-HIGH | Auth | `followReferrals: true`. Test against real ACM AD (get IT involved early). Parameterized filters (no LDAP injection). |
| 6 | "Real-time" ambiguity — execs see stale numbers | HIGH | Dashboard | Prominent "Last updated at HH:MM" header. Stale banner (#4). Force-refresh button. |
| 7 | i18n key drift (EN ≠ DE), layout break on long German | MEDIUM | Dashboard + i18n | CI check: `en.json` key set == `de.json` key set. Typed translation keys. Screenshot tests in both languages. Native speaker review. |
| 8 | Executive UX killed by too much data / slow first paint | HIGH | Dashboard | Executive view default (3-6 KPI cards, no filters). < 2s FCP budget. Lazy-load analyst view. |
| 9 | Docker on-prem: volume perms, SELinux, UID mismatch | MEDIUM | Deployment | Test on actual target OS (not macOS). Explicit UID/GID. SELinux `:Z` labels. Entrypoint preflight checks. |
| 10 | Partial import corrupts previous snapshot | MED-HIGH | Ingestion | Staging table + atomic TRUNCATE+INSERT in single tx. On failure: rollback, keep previous snapshot, record error in `imports`. |

**Supporting risks (worth noting in planning):**
- On-prem air-gap: no CDN fonts, no postinstall phoning home
- Schema migrations while running imports
- XSS via free-text description columns (DOMPurify + CSP)
- Scope creep from execs asking for "just one more feed" mid-build

---

## Suggested 8-Phase Build Order

From ARCHITECTURE.md's "runnable at each phase" principle.

| # | Phase | Goal — what's runnable when done | Gates pitfalls |
|---|---|---|---|
| 1 | **Foundation & Auth** | Docker-compose up; Caddy serves a React login page behind LDAP; `/healthz` works. Hardcoded KPI card visible after login. | #5, #8 (infra-wise), #9 |
| 2 | **CSV Ingestion Core** | Drop a `LagBes.csv`/`.txt` file via API → worker parses (decimal-comma fix) → inserts into `stock_rows` atomically → audit row in `imports`. Test suite uses real sample. | #1, #2, #10 |
| 3 | **KPI Layer & Dashboard** | Materialized view `kpi_dashboard_data`. Real KPI cards (7 table-stakes). Polling refresh. Stale-data banner. Executive view default. | #6, #8 |
| 4 | **Upload Page** | Browser drag-and-drop route (reached via top-right icon button). Progress bar. Full validation error summary. Admin role required. | — |
| 5 | **SMB Folder Watcher** | Worker (or sidecar) watches mounted SMB dir with chokidar polling; file-stability check; enqueues Bull job identical to upload path. | #3, #4 |
| 6 | **Dark/Light Mode + i18n** | Theme toggle (persisted per user). German + English with CI key-sync check. German number/date formats. | #7 |
| 7 | **User Docs Site** | `/docs` route (icon button top-right). End-user guide, upload guide, admin guide, changelog. All four in DE + EN. | — |
| 8 | **Deployment Hardening** | Target OS tested (CentOS/Ubuntu + SELinux). Volume permissions. TLS with internal CA. Backup runbook. Admin guide for SMB mount. Docker image size budget met. | #9 |

**Why this order:**
- Phase 1 gives a working auth + UI shell on day 1 — every later phase has a place to land
- Phase 2 is the hardest single problem (CSV quirks) — do it early, test thoroughly, don't let the schedule push it
- Phase 3 turns raw data into the dashboard the execs actually care about — earliest demonstrable value
- Phases 4 and 5 are the two ingestion paths — both converge on the Phase 2 worker, so they're cheap and can run in parallel
- Phase 6 layers on top of existing components without structural change
- Phase 7 is largely content work; can run in parallel with 5-6
- Phase 8 catches on-prem-specific gotchas before handoff to IT

**Parallelization opportunities:** Phases 4 + 5, Phases 6 + 7.

---

## Open Questions for Planning

1. **ACM AD structure** — single domain or forest with referrals? Needed for Phase 1 auth scope.
2. **Apollo export cadence** — hourly / daily / on-demand? Affects watcher retry/poll tuning in Phase 5.
3. **Production file size** — sample is 900 rows; real file may be 10k-50k. Needed to size ingestion + materialized-view refresh perf budget.
4. **Target OS** — CentOS 7 / 8 / 9, RHEL, Ubuntu LTS? SELinux enforcing? Needed for Phase 8.
5. **Internal CA** — does ACM IT have one, or do we self-sign? Caddy config depends on this.
6. **Service account for SMB and LDAP** — who provisions, credential rotation policy?

These feed into discuss/plan phase research — not blockers for the roadmap structure.

---

## Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| Stack picks | HIGH | All standard 2026 choices, versions current |
| Feature list | HIGH | Industry-standard KPIs, all computable from sample |
| Architecture | HIGH | Standard patterns; build order produces runnable system at each phase |
| CSV parser approach | MEDIUM-HIGH | Custom re-merge logic untested against real file — must be validated early in Phase 2 |
| SMB watcher reliability | MEDIUM | Depends on ACM's share implementation and network behavior |
| LDAP specifics | MEDIUM | Depends on AD structure — IT involvement needed in Phase 1 |
| On-prem deployment | MEDIUM | Target OS + SELinux policy unknown until IT confirms |

Research is sufficient to drive roadmap creation. Gaps above should be surfaced in discuss-phase questions.
