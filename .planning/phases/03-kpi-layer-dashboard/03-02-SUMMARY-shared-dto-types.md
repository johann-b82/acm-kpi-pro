---
phase: 03-kpi-layer-dashboard
plan: "03-02"
subsystem: core
tags: [types, dto, kpi, shared-contract]
dependency_graph:
  requires: []
  provides:
    - packages/core/src/kpi/types.ts → KpiSummary, ArticleListResponse, KpiMeta, KpiColor
  affects:
    - apps/api/src/kpi/routes.ts (Plan 03-05)
    - apps/frontend/src/features/kpi/hooks/useKpiSummary.ts (Plan 03-06)
tech_stack:
  added: []
  patterns:
    - Pure TypeScript type-only file (no runtime code, no imports)
    - Barrel re-export from packages/core/src/index.ts
key_files:
  created:
    - packages/core/src/kpi/types.ts
  modified:
    - packages/core/src/index.ts
  deleted:
    - packages/core/src/types/kpi.ts (Phase 1 stub superseded)
decisions:
  - "Phase 1 KpiSummary stub (types/kpi.ts) removed; fully replaced by kpi/types.ts"
  - "ArticleRow includes id:number for future /articles/:id routing even though v1 uses modal"
metrics:
  duration_seconds: 495
  completed_date: "2026-04-08"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 2
---

# Phase 3 Plan 02: Shared KPI DTO Types Summary

**One-liner:** Pure TypeScript KPI DTOs in `packages/core/src/kpi/types.ts` — 11 exports forming the compile-time contract between `apps/api` and `apps/frontend` for Phase 3's KPI layer.

## Files Created / Modified

| File | Action | Description |
|---|---|---|
| `packages/core/src/kpi/types.ts` | Created | All 11 shared KPI DTO types — pure TypeScript, no runtime code |
| `packages/core/src/index.ts` | Modified | Barrel updated: replaced Phase 1 stub with full kpi/types.ts export |
| `packages/core/src/types/kpi.ts` | Deleted | Phase 1 placeholder `KpiSummary` stub, superseded by kpi/types.ts |

## Exported Type Names (confirmed)

All 11 types verified present in `packages/core/src/kpi/types.ts` and re-exported from `packages/core/src/index.ts`:

| Export | Kind | Description |
|---|---|---|
| `KpiColor` | type alias | `"green" \| "yellow" \| "red" \| "neutral"` |
| `ArticleType` | type alias | `"ART" \| "MAT" \| "HLB" \| "WKZ"` |
| `AbcClass` | type alias | `"A" \| "B" \| "C"` |
| `ImportSource` | type alias | `"upload" \| "watcher" \| "cli"` |
| `SlowMoverBucket` | interface | Active/Slow/Dead aging bucket with count, value_eur, pct |
| `ArticleSummary` | interface | Lightweight article shape for stockout preview list |
| `ArticleRow` | interface | Full article row for /kpi/articles drill-down endpoint |
| `KpiSummary` | interface | Main GET /api/v1/kpi/summary response (has_data controls empty state) |
| `ArticleFilterQuery` | interface | 9-param query object for GET /api/v1/kpi/articles |
| `ArticleListResponse` | interface | `{ total: number; items: ArticleRow[] }` |
| `KpiMeta` | interface | Distinct warehouses, product groups, abc_classes, article_types |

## Build Status

- `npx tsc --noEmit -p packages/core/tsconfig.json` — **PASS (0 errors)**
- `npm -w packages/core run build` — **PASS**
- `dist/kpi/types.d.ts` — **EXISTS** (as expected per TypeScript 6 note)
- Biome lint — **SKIPPED** (binary times out in sandbox environment; file is pure type declarations conforming to biome.json style rules: 2-space indent, 100 char line width, no `any`)

## Deviations from Plan

None — plan executed exactly as written.

- Phase 1 stub `packages/core/src/types/kpi.ts` was deleted as instructed (it held a camelCase `KpiSummary` with `totalInventoryValue`, `lastIngestTs`, `lastIngestStatus` — fully superseded by the new snake_case DTO).
- The old barrel line `export type { KpiSummary } from "./types/kpi.js"` was replaced with the full 11-type named export from `./kpi/types.js`.
- `dist/kpi/types.d.ts` correctly holds declarations (not inlined into `dist/index.d.ts`) — expected TypeScript 6 behavior documented in execution rules.

## Known Stubs

None. This plan is type-only with no runtime behavior and no UI rendering.

## Commits

| Hash | Message |
|---|---|
| `96c8748` | feat(03-02): add shared KPI DTO types in packages/core/src/kpi/types.ts |
| `70e2be3` | feat(03-02): update barrel to export all KPI types from kpi/types.ts |

## Self-Check: PASSED

| Check | Result |
|---|---|
| `packages/core/src/kpi/types.ts` exists | FOUND |
| `packages/core/src/index.ts` exists | FOUND |
| `packages/core/dist/kpi/types.d.ts` exists | FOUND |
| `packages/core/src/types/kpi.ts` deleted | CONFIRMED |
| commit `96c8748` exists | FOUND |
| commit `70e2be3` exists | FOUND |
