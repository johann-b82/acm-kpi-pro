# ACM KPI Pro

## What This Is

A React web application that gives ACM executives a real-time view of operational KPIs derived from Apollo NTS (the ERP/ERP system in use at ACM). CSV exports from Apollo NTS are loaded into a PostgreSQL database — either via browser upload or an automated SMB folder watcher — and surfaced as charts and metrics across the organisation. V1 targets warehouse stock (`LagBes`) with an architecture designed to accept additional data feeds later (e.g. scrap/quality).

## Core Value

Executives see the health of ACM's inventory and production at a glance — on a single dashboard — without touching Apollo NTS.

## Requirements

### Validated

- [x] **Upload page** — separate route, reached via an icon button in the top-right corner of the main dashboard. Drag-and-drop + file picker. *Validated in Phase 4: Upload Page (2026-04-09) — pending live-stack human UAT.*

### Active

- [ ] **CSV ingestion (warehouse stock)** — browser upload + SMB folder watcher accept `LagBes` CSV/TXT files from Apollo NTS. Handles the German decimal-comma-breaks-semicolon-delimiter quirk (see `samples/README.md`). Parses Windows-1252 encoding. Import replaces the latest snapshot (no history in v1).
- [ ] **PostgreSQL data model** — schema captures article/stock rows with strong types (numeric for quantities, dates parsed from `DD.MM.YY`) and preserves the raw row for audit.
- [ ] **Dashboard KPIs (warehouse stock)** — at a glance:
  - Total inventory value (€) — sum of `Wert` / `Wert mit Abw.`
  - Coverage / days-on-hand — derived from `Reichw.Mon.` and `Durch.Verbr`
  - Slow movers & dead stock — aging buckets based on `Lagerabgang Dat` / `letzt.Zugang`
  - Stockouts & low-stock alerts — rows with ≤ 0 stock or below computed thresholds
- [ ] **Slice & filter** — by warehouse (`Lagername`), product group (`WGR` / `ProdGrp`), ABC class, article type (`Typ`: ART/MAT/HLB/WKZ).
- [ ] **User docs site** — separate route, reached via a second icon button in the top-right corner. Covers:
  - End-user guide (how to read the dashboard, what each KPI means)
  - Upload guide (how to upload a CSV, expected format, troubleshooting)
  - Admin / deployment guide (docker compose, env vars, SMB config, backup)
  - Changelog / release notes (in-app)
- [ ] **Folder watcher** — container watches a mounted SMB share; new files trigger ingestion + dashboard refresh.
- [ ] **Dark / light mode** — user-selectable, persisted per user.
- [ ] **Internationalization (i18n)** — German + English, toggle in UI.
- [ ] **SSO via on-prem LDAP / Active Directory** — bind via LDAP(S). Pluggable auth layer so Entra ID / SAML can be added later.
- [ ] **Role-based access** — two roles for v1: `Viewer` (dashboards only) and `Admin` (upload, settings, user management).
- [ ] **Dockerized deployment** — `docker-compose.yml` ships the full stack (app, PostgreSQL, reverse proxy with TLS) for on-prem Linux. SMB share mounted as a volume.

### Out of Scope

- **Scrap / quality KPIs** — deferred; architecture must allow adding later feeds, but v1 is warehouse-only to keep scope shippable.
- **Live streaming updates (sub-minute)** — "real-time" in v1 means "updates when a new CSV arrives." No websockets/push for the first version.
- **Historical snapshots / trends across imports** — v1 replaces the latest snapshot. Trend views require snapshot history and are a separate effort.
- **Writeback to Apollo NTS** — read-only. Apollo remains the source of truth.
- **Mobile-native app** — responsive web only.
- **Entra ID / SAML** — designed-for but not implemented in v1 (LDAP-only).
- **Multi-tenant / multi-site** — single ACM deployment. Other sites would be separate installations.

## Context

- **Predecessor project:** A sibling directory `../acm-kpi/` exists with an earlier iteration. Treated as **unrelated** per user direction — do not reuse code. This project is a fresh start.
- **Data source:** Apollo NTS (ERP system in use at ACM). Primary export is a **warehouse stock** CSV (`LagBes`) with ~thousands of rows and significant data-quality quirks. See `samples/README.md` and `samples/LagBes-sample.csv` for details.
- **Domain:** Aerospace interiors. ACM builds seat covers, mattresses, curtains, carpets for Airbus A350/A380, Diamond DA40/DA42, etc. The stock file reflects this (parts, leathers, fabrics, foams, hardware).
- **CSV quirks** (critical for the parser):
  - Semicolon-delimited, Windows-1252 encoding
  - German decimal comma (`112,532`) is **not quoted** → splits numeric fields across two columns. The parser must re-merge using a known numeric-column schema.
  - Dates are `DD.MM.YY` with 2-digit years
  - Many mixed-language descriptions (German + English)
  - Negative stock values exist and are legitimate (corrections, reservations)
- **Users:** ACM executives. Internal use only, behind ACM's firewall on an on-prem Linux host.
- **Brand assets:** Logo provided (blue propeller/swoosh mark). No formal color palette — UI designer proposes one that complements the logo. Logo doubles as the favicon. See `assets/README.md`.
- **Language:** UI and user documentation in **both German and English** (i18n). Prompt from user mixed both — confirmed.

## Constraints

- **Tech stack**: React frontend + PostgreSQL — mandated by user. Backend framework is open (to be decided in discovery/research).
- **Deployment**: On-prem Linux server via `docker-compose up`. No cloud dependencies. IT team provides the host and the SMB share path.
- **Auth**: Must integrate with on-prem Active Directory via LDAP(S). Credentials live in ACM's AD, not in the app.
- **Data size**: Thousands of rows per import (sample shows 900+). Must ingest a file in well under a minute so the dashboard feels "live on CSV arrival."
- **Read-only source of truth**: The app never writes back to Apollo NTS.
- **Offline / air-gapped tolerance**: Must function without internet access after deployment (no CDN-hosted fonts, icons, or libraries at runtime).
- **File format**: Accept both `.csv` and `.txt` extensions — Apollo's raw export is `.txt`.
- **Accessibility**: Dashboard must be legible in both dark and light mode; target WCAG AA contrast.
- **Compliance / privacy**: Data stays on-prem. No telemetry to third parties.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| V1 data source is `LagBes` (warehouse stock), not scrap rate | User has a real sample and clear KPIs for stock; scrap can come later | — Pending |
| Successor to `../acm-kpi` but **unrelated** (no code reuse) | Fresh start — prior project is parallel, not a base | — Pending |
| Replace latest snapshot (no history) in v1 | Keeps v1 scope shippable; trend views deferred | — Pending |
| SMB share mount for the folder watcher | Matches where Apollo drops exports; simplest integration | — Pending |
| LDAP-only for auth in v1, pluggable for Entra/SAML later | ACM currently runs on-prem AD; keep abstraction clean for later | — Pending |
| Viewer + Admin roles only | Minimal RBAC that covers executive viewing + admin upload | — Pending |
| React + PostgreSQL + Docker Compose | User-mandated stack; well-understood; on-prem friendly | — Pending |
| Build everything (dashboard, upload, watcher, docs, i18n, SSO, dark/light) in v1 | User explicitly chose "everything in one go" over incremental slice | — Pending |
| Accept `.csv` and `.txt` uploads | Apollo NTS raw export is `.txt` — must not reject by extension | — Pending |
| Parser must handle decimal-comma / semicolon conflict | Sample file contains this quirk; naive CSV libraries will mis-parse | — Pending |
| Logo doubles as favicon | User directive; simplifies asset pipeline | — Pending |
| Use `ui-ux-pro-max` skill for UI design | User directive | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-09 after Phase 4 (upload page) completion*
