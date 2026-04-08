# Phase 3: KPI Layer & Dashboard — Context

**Gathered:** 2026-04-08
**Status:** Ready for research and planning
**Source:** /gsd:discuss-phase interactive session

<domain>
## Phase Boundary

**In scope:**
- PostgreSQL materialized view `kpi_dashboard_data` pre-computing all 7 table-stakes KPIs from `stock_rows`
- Refresh hook wired into the ingestion orchestrator (inside the same transaction)
- `GET /api/v1/kpi/summary` endpoint (reads MV, very fast)
- `GET /api/v1/kpi/articles?filter=...` endpoint (drill-down rows from `stock_rows` with filters)
- React `DashboardPage` that replaces the Phase 1 placeholder KPI card with the full layout: 7 KPI cards + slow-mover chart + stockout list + slice/filter controls + drill-down modal
- First-paint empty state when no import has ever run
- Unit tests (Vitest for API handlers with `vi.mock` DB; React Testing Library for dashboard components)

**Out of scope:**
- Browser upload UI (Phase 4)
- SMB folder watcher (Phase 5)
- Dark/light theme + i18n + German number formatting (Phase 6) — v1 Phase 3 uses English + default browser formatting, deferred to Phase 6 to localize
- `/docs` user documentation site (Phase 7)
- Historical snapshots / trend charts (v2 — no history in v1)
- Pareto 80/20 chart, warehouse × product-group heatmap (v2 differentiators)
- CSV export of dashboard (v2, unless trivial)
- Custom metric builder (v2)

</domain>

<decisions>
## Implementation Decisions

### KPI set (locked — from FEATURES.md research)

Seven KPIs, each backed by a materialized view column (or a small number of columns):

1. **Total inventory value** — `SUM(wert_mit_abw)` across all `stock_rows` where `geloescht != 'J'`
2. **Days-on-hand / coverage** — weighted average of `reichw_mon * 30` (from pre-computed `Reichw.Mon.`), weighted by `wert_mit_abw` so high-value items dominate
3. **Slow movers & dead stock** — **3 buckets weighted by value** (see below)
4. **Stockouts & low-stock** — rows where `bestand_lagereinheit <= 0 OR reichw_mon < 1` (see below)
5. **ABC distribution** — count + value sum grouped by `abc_kennz_vk` (null → 'C')
6. **Inventory turnover ratio** — proxy: `SUM(umsatz_me_j) / AVG(bestand_basiseinheit)` per `wgr` group, aggregated
7. **Devaluation / write-down summary** — `SUM(wert - wert_mit_abw)` (€ and % of total value)

### Slow-mover rule (user decision)

**3 buckets weighted by value:**
- **Active**: last outflow (`lagerabgang_dat` or `letzt_zugang` if null) within last 6 months
- **Slow**: last outflow 6-12 months ago
- **Dead**: last outflow more than 12 months ago OR never
- **Each bucket reports `COUNT`, `SUM(wert_mit_abw)` (€ value), and `pct_of_total_value`**
- **Low-value dead stock (< €100 per item) is collapsed into a "clutter" subtotal** so tiny museum/sample rows don't dominate the story
- **Museum exclusion:** rows with `typ = 'WKZ'` OR `lagername LIKE 'MUSTERRAUM%'` are excluded from slow-mover analysis entirely (they're reference samples, not operational inventory). Counted separately as "Samples" for transparency.

### Stockout / low-stock rule (user decision)

**Trigger on any of:**
- `bestand_lagereinheit <= 0` (out of stock or over-committed)
- `reichw_mon < 1` AND `reichw_mon IS NOT NULL` (less than 1 month coverage)

**Excluded from this list:**
- Museum rows (`typ = 'WKZ'` OR `lagername LIKE 'MUSTERRAUM%'`)
- Rows marked deleted (`geloescht = 'J'`)

### Color-code thresholds (user decision: static)

**Days-on-hand card:**
- `>= 90 days` → green
- `30-89 days` → yellow
- `< 30 days` → red

**Stockouts & low-stock card:**
- `0 items` → green
- `1-10 items` → yellow
- `> 10 items` → red

**Slow/dead stock card (% of total value in dead bucket):**
- `< 5%` → green
- `5-15%` → yellow
- `> 15%` → red

**ABC distribution:** neutral (informational only)

**Total inventory value** and **Devaluation summary** and **Turnover ratio:** neutral blue in v1 — no history to compare against so color-coding would be arbitrary. Becomes meaningful in v2 when snapshots exist.

### Drill-down (user decision)

**Modal** with row detail, triggered from:
- Clicking any row in the slow-mover/dead-stock list
- Clicking any row in the stockout list

**Modal shows 8-10 essentials by default:**
`Artikelnr`, `Bezeichnung 1`, `Typ`, `Lagername`, `Bestand + Einh`, `Wert mit Abw.`, `letzt_zugang`, `lagerabgang_dat`, `abc_kennz_vk`

A "Show all columns" toggle reveals all 52 stock_rows fields in a scrollable table inside the modal. Read-only. No pagination (one article = one row). Close via X, Escape, or backdrop click.

No dedicated `/articles/:id` route in v1 — modal is sufficient for "look it up in Apollo NTS for more detail" workflow.

### Materialized view refresh strategy (user decision)

**Inside the import transaction, using `REFRESH MATERIALIZED VIEW CONCURRENTLY kpi_dashboard_data`.**

Implications:
- Atomic with the ingest: if refresh fails, the whole import rolls back and `stock_rows` is untouched (consistent with Phase 2's Pitfall #10 guarantee)
- `CONCURRENTLY` requires the MV to have a `UNIQUE INDEX` — Phase 3 migration must create it
- Dashboard reads are never blocked during refresh
- Small trade-off: CONCURRENTLY takes ~2x as long as non-concurrent (~100ms instead of ~50ms for 10k rows) — well under any user-facing budget

**Where the hook lives:** `apps/api/src/ingest/writer.ts` — add one line after the `INSERT INTO stock_rows SELECT ...` inside the transaction. This touches a Phase 2 file, but it's a single-line addition and doesn't change semantics.

### Empty state (user decision)

Before the first import runs, the dashboard shows an **onboarding card**:

- Centered card with the ACM logo
- Heading: "No data yet"
- Body: "Upload your first Apollo NTS warehouse stock export to see KPIs."
- Admin users see a primary button → `/upload` (Phase 4 route; for now a stub that says "Upload page coming in Phase 4")
- Viewer users see: "Contact your admin to load data."

Detection: `GET /api/v1/kpi/summary` returns `{ has_data: false }` when `imports` table has no rows with `status = 'success'`. Frontend checks this flag and renders the onboarding card instead of the KPI grid.

### Scope confirmation (user decision)

Phase 3 does NOT include: upload UI, watcher, theming, i18n, German number formatting, docs site, CSV export of dashboard, pareto chart, heatmap. All deferred to their respective phases per the roadmap.

### Technical decisions (researcher will refine if needed)

- **Materialized view definition lives in** `apps/api/drizzle/0002_add_kpi_dashboard_mv.sql` (manual SQL — drizzle-kit doesn't model materialized views cleanly)
- **MV refresh hook** is called from the writer in the same Drizzle transaction via `sql\`REFRESH MATERIALIZED VIEW CONCURRENTLY kpi_dashboard_data\`` on the tx handle
- **API endpoints:**
  - `GET /api/v1/kpi/summary` — reads the MV, returns a typed `KpiSummary` DTO
  - `GET /api/v1/kpi/articles?filter=slow|stockout|search&bucket=...&warehouse=...&typ=...` — filtered drill-down rows from `stock_rows`
  - `GET /api/v1/kpi/meta` — distinct warehouses, product groups, etc. for filter dropdowns (alternatively inlined into summary)
- Both endpoints are `requireAuth()` (any logged-in user, Viewer or Admin)
- **Recharts** for the slow-mover chart (stacked bar or horizontal bar — researcher's call)
- **Polling:** React Query `useQuery` with `refetchInterval: 30_000` for both summary and filtered articles queries
- **First contentful paint budget** for dashboard: < 2 seconds (DASH-08)
- **DTO location:** shared types go in `packages/core/src/kpi/types.ts` and are imported by both API and frontend — keeps the contract in one place

### Claude's Discretion

Downstream researcher/planner may refine:
- Exact SQL of the materialized view (query plan + index strategy)
- Exact Drizzle-to-raw-SQL boundaries (Drizzle's MV support is limited — likely raw SQL via `sql\`...\`` template)
- Whether `GET /api/v1/kpi/meta` is a separate endpoint or folded into the summary response
- Whether to add an `imports_latest` endpoint for the "Last updated" timestamp or include it in the summary response (preferred: include in summary to avoid an extra round-trip)
- Which shadcn/ui primitives map cleanly to the layout (Card, Dialog, Table, Select, Badge probably)
- Whether the slow-mover chart is a stacked bar (active/slow/dead horizontal) or a treemap (more visual punch but harder to scan)
- Layout grid: 3 columns on desktop, collapse to 1 on tablet/mobile
- Error boundary strategy for the dashboard route

</decisions>

<canonical_refs>
## Canonical References

Downstream agents MUST read these before researching or planning:

### Phase 3 inputs

- `.planning/PROJECT.md` — project context, constraints, decisions
- `.planning/REQUIREMENTS.md` — DASH-01..11, KPI-02..09 (KPI-01 and KPI-10 done in Phase 2)
- `.planning/ROADMAP.md` — phase 3 entry + dependency on Phase 2 MV hook
- `.planning/research/FEATURES.md` — KPI formulas and LagBes column mappings
- `.planning/research/ARCHITECTURE.md` — materialized view pattern, polling vs SSE tradeoff, build order rationale
- `.planning/research/PITFALLS.md` — #6 (freshness ambiguity), #8 (exec UX overload)

### Phase 3 depends on Phase 2 artifacts

- `apps/api/src/db/schema.ts` — `stockRows` (52 columns), `stockRowsStaging`, `imports`
- `apps/api/src/ingest/writer.ts` — Phase 3 hooks the MV refresh into this file's transaction
- `apps/api/src/ingest/index.ts` — orchestrator; reads imports to determine "has any successful import"
- `apps/api/drizzle/0001_expand_stock_rows_schema.sql` — the schema the MV sits on top of

### Phase 3 depends on Phase 1 artifacts

- `apps/api/src/server.ts` — Fastify factory; Phase 3 adds the `/api/v1/kpi/*` routes here
- `apps/api/src/middleware/rbac.ts` — `requireAuth()` for the new endpoints
- `apps/frontend/src/pages/DashboardPage.tsx` — Phase 3 REPLACES the placeholder KPI card with the full layout
- `apps/frontend/src/components/KpiCard.tsx` — Phase 1 primitive, Phase 3 may extend or replace
- `apps/frontend/src/components/Header.tsx` — Phase 1 shell; Phase 3 adds "Last updated: HH:MM" to the header, and the stale-data banner hooks into the layout above the dashboard content

### Samples & fixtures

- `samples/LagBes-sample.csv` — continues to be the golden fixture; Phase 3 dashboard integration tests should ingest this file (mocked DB), query the MV, and assert the KPI summary matches hand-computed expected values
- `samples/README.md` — CSV quirk doc

</canonical_refs>

<specifics>
## Specific Ideas & Constraints

### KPI summary response shape (draft — researcher may refine)

```json
{
  "has_data": true,
  "last_updated_at": "2026-04-08T12:34:56Z",
  "last_import": {
    "filename": "LagBes-20260408.csv",
    "row_count": 12345,
    "source": "cli"
  },
  "total_inventory_value": { "value_eur": 54_200_000.00, "color": "neutral" },
  "days_on_hand":          { "days": 67, "color": "yellow" },
  "slow_dead_stock": {
    "buckets": [
      { "label": "active", "count": 1230, "value_eur": 48_000_000.00, "pct": 88.5 },
      { "label": "slow",   "count": 410,  "value_eur": 4_200_000.00,  "pct": 7.7 },
      { "label": "dead",   "count": 680,  "value_eur": 2_000_000.00,  "pct": 3.7 }
    ],
    "clutter_excluded_count": 1400,
    "samples_excluded_count": 180,
    "color": "green"
  },
  "stockouts": {
    "count": 7,
    "items_preview": [ /* top 5 by value */ ],
    "color": "yellow"
  },
  "abc_distribution": {
    "a": { "count": 245, "value_eur": 40_000_000.00 },
    "b": { "count": 520, "value_eur": 10_500_000.00 },
    "c": { "count": 1870, "value_eur": 3_700_000.00 }
  },
  "inventory_turnover": { "ratio": 4.2, "color": "neutral" },
  "devaluation": { "total_eur": 850_000.00, "pct_of_value": 1.6, "color": "neutral" }
}
```

### Performance budget

- `GET /api/v1/kpi/summary` — < 50ms p95 (reads MV, should be a few-row query)
- `GET /api/v1/kpi/articles?filter=...` — < 200ms p95 for up to 1000 rows returned
- Materialized view refresh — < 500ms for 10k rows (not user-facing; happens inside import tx)
- Frontend first contentful paint — < 2 seconds on cold cache

### German formatting note

Phase 3 ships with **default browser formatting** (numbers as `54,200,000.00`, dates as `YYYY-MM-DD`). Phase 6 localizes these to German format. Do NOT add `Intl.NumberFormat('de-DE')` in Phase 3 — that's Phase 6's work. Keep Phase 3 concerned with correctness, Phase 6 with presentation.

### Accessibility

- KPI cards must be keyboard-navigable (Tab order logical)
- Color must NOT be the only signal — every color-coded card also shows a directional arrow or text label (e.g. "Low", "OK", "Critical") alongside the color
- Contrast meets WCAG AA for both themes (Phase 6 will handle dark mode)

### Known data quality gotchas (surfaced in Phase 2)

- Negative stock values exist (e.g. article 174: `-18414,25`) — preserved as-is, counted as stockouts
- `ABC-Kennz. VK` can be blank — treat as 'C'
- `Reichw.Mon.` can be null for museum/sample items — exclude from days-on-hand calculation
- `wert_mit_abw` falls back to `wert` if devaluation columns are missing (rare)
- Some rows have `Artikelnr` with letters (e.g. `H0001`, `K 7154`) — not a problem, treated as strings

</specifics>

<deferred>
## Deferred Ideas

- **Historical snapshots / trend lines** — v2; requires snapshot history in the DB (v1 replaces latest per Phase 2)
- **Pareto 80/20 chart** — v2 differentiator from FEATURES.md
- **Warehouse × product-group heatmap** — v2 differentiator
- **Supplier risk scorecard** — v2 differentiator, requires a master supplier table
- **CSV export of dashboard** — v2 if users request it; trivial to add later
- **Configurable thresholds via `.env` or admin UI** — v1 uses static hard-coded thresholds per this CONTEXT
- **Dedicated `/articles/:id` page with printable URL** — v1 uses modal
- **PDF export / print stylesheet** — v2
- **Server-sent events / websockets for real-time updates** — v2 per ARCHITECTURE.md upgrade path
- **Alert subscriptions / email digests** — v2 at earliest

</deferred>

---

*Phase: 03-kpi-layer-dashboard*
*Context gathered: 2026-04-08 via interactive discussion*
