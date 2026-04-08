---
phase: 03-kpi-layer-dashboard
plan: "03-05"
subsystem: api
tags: [kpi, fastify, routes, zod, vitest, colors, auth]
dependency_graph:
  requires: ["03-02", "03-03"]
  provides: ["GET /api/v1/kpi/summary", "GET /api/v1/kpi/articles", "GET /api/v1/kpi/meta"]
  affects: ["apps/api/src/server.ts", "apps/frontend (consumer of these endpoints in 03-06)"]
tech_stack:
  added: []
  patterns:
    - "Pure color-computation functions (no DB) isolated in colors.ts"
    - "Zod .safeParse() for query validation (400 on invalid params)"
    - "Drizzle raw SQL via db.execute(sql`...`) for materialized view reads"
    - "Thenable mock chain pattern for Drizzle query builder in Vitest"
key_files:
  created:
    - apps/api/src/kpi/colors.ts
    - apps/api/src/kpi/schemas.ts
    - apps/api/src/kpi/routes.ts
    - apps/api/src/kpi/__tests__/colors.test.ts
    - apps/api/src/kpi/__tests__/routes.test.ts
  modified:
    - apps/api/src/server.ts
decisions:
  - "Color computation lives exclusively in API layer (colors.ts) — frontend receives pre-computed color strings"
  - "JSONB MV columns cast via 'as MvRow[field]' type assertions (unknown from db.execute)"
  - "Thenable chain pattern (not mockReturnThis) for Drizzle query builder mocks — avoids infinite recursion with recursive makeChain()"
  - "articleResponseSchema uses z.number() for numeric fields — mock data must use JS numbers not strings"
metrics:
  duration: ~45 minutes
  completed: 2026-04-08
  tasks_completed: 2
  files_created: 5
  files_modified: 1
  tests_added: 69
  total_tests_after: 168
---

# Phase 3 Plan 05: KPI API Endpoints Summary

**One-liner:** Three Fastify KPI routes (summary/articles/meta) with Zod validation, requireAuth guard, and pure color computation in the API layer — 69 new tests, all 168 passing.

## What Was Built

### Files Created

| File | Purpose |
| ---- | ------- |
| `apps/api/src/kpi/colors.ts` | Pure color functions: `daysOnHandColor`, `stockoutCountColor`, `deadStockShareColor`, `computeKpiColors`. No DB dependency. |
| `apps/api/src/kpi/schemas.ts` | Zod schemas: `kpiSummaryResponseSchema`, `articleQuerySchema`, `articleResponseSchema`, `kpiMetaResponseSchema` |
| `apps/api/src/kpi/routes.ts` | `registerKpiRoutes()` — 3 endpoints with `requireAuth()` preHandler |
| `apps/api/src/kpi/__tests__/colors.test.ts` | 47 tests covering all boundary values for 3 color-coded KPIs |
| `apps/api/src/kpi/__tests__/routes.test.ts` | 22 route-level tests with vi.mock DB |

### File Modified

- `apps/api/src/server.ts` — added import + `await registerKpiRoutes(server, config)` after admin routes

### Endpoints

| Endpoint | Auth | Description |
| -------- | ---- | ----------- |
| `GET /api/v1/kpi/summary` | requireAuth | Reads MV + latest import, returns `KpiSummary` with computed colors. Returns `has_data: false` when no successful import exists. |
| `GET /api/v1/kpi/articles` | requireAuth | Filtered drill-down from `stock_rows`. 8 query params: filter/bucket/warehouse/wgr/abc/typ/q/limit/offset. Zod validated (400 on bad params). |
| `GET /api/v1/kpi/meta` | requireAuth | Distinct warehouses and product groups for filter dropdowns. Static abc_classes and article_types. |

### Color Thresholds (locked in CONTEXT.md)

| KPI | Green | Yellow | Red |
| --- | ----- | ------ | --- |
| Days-on-hand | >= 90 days | 30-89 days | < 30 days |
| Stockouts count | 0 | 1-10 | > 10 |
| Dead-stock % of total value | < 5% | 5-15% | > 15% |
| Total value / turnover / devaluation | always neutral | — | — |

## Test Coverage

- **47 colors.test.ts tests:** All boundary values tested (29/30/89/90, 0/1/10/11, 4.9/5.0/15.0/15.1), empty state, `computeKpiColors` integration
- **22 routes.test.ts tests:** 401 for all 3 endpoints without auth, empty state (`has_data: false`), data state with colors, 9 color threshold scenarios via route, query validation (400), articles data, meta response

**Test totals:** 168 passing (was 99 before Phase 3 KPI plans; 03-05 added 69)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed infinite recursion in Drizzle mock chain**
- **Found during:** Task 2 (routes.test.ts)
- **Issue:** The plan's suggested `makeChain()` recursive function called itself eagerly in `chain.where = vi.fn().mockReturnValue(makeChain(resolveValue))`, causing a stack overflow when the mock was constructed.
- **Fix:** Replaced with a flat chain where all methods return the same chain object (thenable). Both count query (`await chain.where(...)`) and items query (`await chain.offset(...)`) resolve with the correct mock values.
- **Files modified:** `apps/api/src/kpi/__tests__/routes.test.ts`

**2. [Rule 2 - Missing validation] Fixed type annotation on colors.ts**
- **Found during:** Task 1 (TypeScript check)
- **Issue:** `KpiSummary["last_import"]["source"]` cannot be accessed on a nullable type. 
- **Fix:** Import `ImportSource` directly from `@acm-kpi/core` and use `lastImport.source as ImportSource`.
- **Files modified:** `apps/api/src/kpi/colors.ts`

**3. [Rule 2 - Missing validation] Fixed mock item numeric types in routes.test.ts**
- **Found during:** Task 2 debugging (500 on articles data test)
- **Issue:** Mock article items used string values for `bestand_basiseinheit` and `wert_mit_abw` (e.g. `"100.0000"`), but `articleResponseSchema` expects `z.number()`. Zod validation threw, caught by global error handler as 500.
- **Fix:** Changed mock values to JS numbers (`100`, `5000`).
- **Files modified:** `apps/api/src/kpi/__tests__/routes.test.ts`

### Prior Failed Run

The prior execution attempt left two partially-created files (`colors.ts`, `schemas.ts`) as untracked in the working tree. Both files were complete and correct, so they were committed as-is at the start of this run. No orphan commits were found in git history.

## Architecture Notes

- **Color in API layer:** `computeKpiColors()` runs in `routes.ts` before `kpiSummaryResponseSchema.parse()`. Frontend receives `"green" | "yellow" | "red" | "neutral"` strings — no threshold logic needed client-side.
- **JSONB from MV:** `db.execute(sql\`SELECT * FROM kpi_dashboard_data LIMIT 1\`)` returns columns typed as `unknown`. Explicit `as MvRow[field]` casts needed.
- **Null-safe empty state:** `computeKpiColors(null, null)` returns a fully valid `KpiSummary` with `has_data: false` and all zeros/nulls. No special frontend null-checking needed for individual fields.

## Known Stubs

None — all three endpoints are fully wired. The `kpi_dashboard_data` materialized view is read via raw SQL (created in plan 03-03). Filter conditions in `/articles` exactly match the museum/deleted exclusion rules from CONTEXT.md.

## Self-Check

Files created:
- apps/api/src/kpi/colors.ts: exists
- apps/api/src/kpi/schemas.ts: exists
- apps/api/src/kpi/routes.ts: exists
- apps/api/src/kpi/__tests__/colors.test.ts: exists
- apps/api/src/kpi/__tests__/routes.test.ts: exists

Commits:
- 41fb6a0: feat(03-05): add KPI color computation and Zod schemas
- 3e57c47: feat(03-05): add KPI route handlers and mount in server.ts
- ad3c1c1: test(03-05): add KPI color threshold and route unit tests
