# Plan 03: Phase 3 Index — KPI Layer & Dashboard

**Phase:** 3 — KPI Layer & Dashboard
**Type:** Index (this file is a map, not executable)

## Phase Goal

After Phase 3, logging into ACM KPI Pro takes an authenticated user to the full executive dashboard: 7 KPI cards with color-coded thresholds (days-on-hand, stockouts, dead-stock each green/yellow/red; value, turnover, devaluation, ABC as neutral-blue), a slow-mover stacked bar chart (Recharts, horizontal), a top-5 stockout preview list, slice/filter controls (warehouse, product group, ABC class, article type), and a drill-down modal showing 8–10 essentials with a "Show all 52 columns" toggle.

Before any successful import, the dashboard renders an onboarding empty-state card. After an import, the dashboard polls every 30 seconds and a stale-data banner warns when data is old (yellow > 30 min, red > 2 h). A force-refresh button in the header lets users skip the wait. KPI numbers are pre-computed in the `kpi_dashboard_data` materialized view, refreshed atomically inside the import transaction.

## Requirements Covered

KPI-02, KPI-03, KPI-04, KPI-05, KPI-06, KPI-07, KPI-08, KPI-09,
DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08, DASH-11,
TEST-02

**Explicitly deferred to Phase 6 (NOT in scope here):** DASH-09, DASH-10 (German/English number and date formatting via `Intl.NumberFormat` / `Intl.DateTimeFormat`). Phase 3 uses default `toLocaleString()`.

## Pitfalls Gated

- **#6** Dashboard freshness ambiguity — `last_updated_at` timestamp in every summary response, yellow/red stale banner (`StaleDataBanner`), force-refresh button (`DASH-11`), `DASH-03`
- **#8** Executive UX overload — 7 cards above the fold in a 3-col grid (desktop), lean default view, no analyst drill-down required; filter scaffolding present but not user-blocking

## Scope Anti-Checklist (DO NOT implement in Phase 3)

- [ ] Browser upload UI → Phase 4
- [ ] SMB folder watcher → Phase 5
- [ ] Dark / light theme, i18n, German number formatting → Phase 6
- [ ] `/docs` site → Phase 7
- [ ] Historical snapshots / trend lines → v2
- [ ] Pareto chart, heatmap → v2
- [ ] CSV export of dashboard → v2
- [ ] Custom metric builder → v2
- [ ] Configurable thresholds via `.env` or admin UI → v2 (static thresholds in Phase 3)
- [ ] `Intl.NumberFormat('de-DE')` / `Intl.DateTimeFormat('de-DE')` → Phase 6

## Plan Files

| Plan | File | Goal | Wave |
|------|------|------|------|
| **Plan 03-02** | `03-02-PLAN-shared-dto-types.md` | `packages/core/src/kpi/types.ts` — KpiSummary, ArticleSummary, KpiColor, SlowMoverBucket, ArticleFilterQuery, ArticleListResponse, KpiMeta; barrel export | 1 |
| **Plan 03-03** | `03-03-PLAN-mv-migration.md` | `apps/api/drizzle/0002_add_kpi_dashboard_mv.sql` — SQL for helper functions + full MV + unique index | 1 (parallel with 03-02) |
| **Plan 03-04** | `03-04-PLAN-mv-refresh-hook.md` | `apps/api/src/ingest/writer.ts` one-line MV refresh hook with first-time/concurrent pattern; updated `writer.test.ts` | 2 (needs 03-03) |
| **Plan 03-05** | `03-05-PLAN-api-endpoints.md` | `apps/api/src/kpi/routes.ts`, mounted in `server.ts`; `/summary`, `/articles`, `/meta`; Zod schemas; color computation; Vitest unit tests | 2 (needs 03-02 + 03-03, parallel with 03-04) |
| **Plan 03-06** | `03-06-PLAN-frontend-skeleton.md` | Install React Query + Recharts + date-fns; `lib/queryClient.ts`; `QueryClientProvider` in `main.tsx`; hooks (`useKpiSummary`, `useArticles`, `useStalenessAlert`, `useKpiMeta`); `features/kpi/queries.ts`; `DashboardPage.tsx` skeleton (layout + routing, component placeholders) | 2 (needs 03-02, parallel with 03-04 + 03-05) |
| **Plan 03-07** | `03-07-PLAN-kpi-components.md` | All KPI components: `KpiGrid`, upgraded `KpiCard`, `SlowMoverChart`, `StockoutList`, `ArticleDrilldownModal`, `FilterBar`, `StaleDataBanner`, `EmptyState`, `LastUpdatedBadge`; `lib/kpiColors.ts`; shadcn/ui installs; RTL tests | 3 (needs 03-05 + 03-06) |

## Dependency Graph

```
Plan 03-02 (DTO types) ─────────────────────────┐
                                                 │
Plan 03-03 (MV migration) ──→ Plan 03-04 ─────┐ │
                           (writer hook)       │ │
                                               ▼ ▼
Plan 03-02 ──────────────→ Plan 03-05 ────────────→ Plan 03-07
                           (API endpoints)         (KPI components)
                                               ▲
Plan 03-02 ──────────────→ Plan 03-06 ─────────┘
                           (frontend skeleton)
```

## Wave Structure

- **Wave 1** (parallel): Plan 03-02 + Plan 03-03
- **Wave 2** (parallel): Plan 03-04 + Plan 03-05 + Plan 03-06
- **Wave 3** (final): Plan 03-07

## Phase Exit Criteria

After all plans complete:

```bash
# API: MV queryable
psql $DATABASE_URL -c "SELECT id, total_value_eur, days_on_hand FROM kpi_dashboard_data;"
# Expected: 1 row

# API: summary endpoint returns 200 with has_data=true after ingest
curl -s -b "$SESSION_COOKIE" http://localhost:3000/api/v1/kpi/summary | jq '.has_data'
# Expected: true

# API: summary returns has_data=false when no import exists
# (tested in unit tests with vi.mock)

# API: articles endpoint returns 200
curl -s -b "$SESSION_COOKIE" "http://localhost:3000/api/v1/kpi/articles?filter=stockout&limit=5" | jq '.total'

# API: meta endpoint returns warehouses
curl -s -b "$SESSION_COOKIE" http://localhost:3000/api/v1/kpi/meta | jq '.warehouses'

# API tests pass (Vitest, no Docker required)
cd apps/api && npm test
# Expected: All KPI route + writer tests pass

# Frontend tests pass
cd apps/frontend && npm test
# Expected: All RTL tests pass (KpiCard, StaleDataBanner, EmptyState, modal open/close)

# Frontend builds without TypeScript errors
cd apps/frontend && npm run build
# Expected: 0 errors
```

## Phase Notes

- Plan 03-04 touches `apps/api/src/ingest/writer.ts` (Phase 2 file). This is authorized per CONTEXT.md. The plan explicitly runs `apps/api/npm test` to confirm the Phase 2 writer tests still pass after the addition.
- Color computation lives in the API (`apps/api/src/kpi/routes.ts`) — not in the frontend. Frontend receives `color: "green" | "yellow" | "red" | "neutral"` in the JSON response and renders accordingly (per CONTEXT.md and research recommendation).
- All Zod schemas for request/response live in `apps/api/src/kpi/schemas.ts`. Frontend imports types from `packages/core/src/kpi/types.ts` only.
- Phase 3 ships with English strings and default browser formatting. `Intl.NumberFormat('de-DE')` is Phase 6.
