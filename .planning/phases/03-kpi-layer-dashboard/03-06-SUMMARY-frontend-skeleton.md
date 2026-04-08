---
phase: 03-kpi-layer-dashboard
plan: "03-06"
subsystem: frontend
tags: [react-query, hooks, dashboard, skeleton, polling]
dependency_graph:
  requires:
    - packages/core/src/kpi/types.ts (Plan 03-02 — KpiSummary, ArticleFilterQuery, KpiMeta types)
    - apps/api/src/kpi/routes.ts (Plan 03-05 — /api/v1/kpi/summary, /articles, /meta endpoints)
  provides:
    - apps/frontend/src/lib/queryClient.ts → queryClient singleton
    - apps/frontend/src/features/kpi/queries.ts → kpiKeys, fetchKpiSummary, fetchArticles, fetchKpiMeta
    - apps/frontend/src/features/kpi/hooks/useKpiSummary.ts → useKpiSummary
    - apps/frontend/src/features/kpi/hooks/useArticles.ts → useArticles
    - apps/frontend/src/features/kpi/hooks/useStalenessAlert.ts → useStalenessAlert, StalenessLevel
    - apps/frontend/src/features/kpi/hooks/useKpiMeta.ts → useKpiMeta
    - apps/frontend/src/pages/DashboardPage.tsx → full layout skeleton (replaces Phase 1 stub)
  affects:
    - apps/frontend/src/main.tsx (QueryClientProvider wrapping)
    - apps/frontend/src/components/Header.tsx (optional props added for Plan 03-07)
    - Plan 03-07 (fills in component slots)
tech_stack:
  added:
    - "@tanstack/react-query@5.96.2"
    - "@tanstack/react-query-devtools@5.96.2"
    - "recharts@3.8.1 (plan specified 2.12.0 — upgraded, see deviations)"
    - "date-fns@3.6.0"
    - "@testing-library/react (devDep)"
    - "jsdom (devDep)"
  patterns:
    - React Query useQuery with refetchInterval polling
    - Query key factories for cache invalidation
    - useStalenessAlert pure hook with setInterval re-evaluation
    - Data-testid slots for progressive component replacement
key_files:
  created:
    - apps/frontend/src/lib/queryClient.ts
    - apps/frontend/src/features/kpi/queries.ts
    - apps/frontend/src/features/kpi/hooks/useKpiSummary.ts
    - apps/frontend/src/features/kpi/hooks/useArticles.ts
    - apps/frontend/src/features/kpi/hooks/useStalenessAlert.ts
    - apps/frontend/src/features/kpi/hooks/useKpiMeta.ts
    - apps/frontend/src/features/kpi/__tests__/queries.test.ts
    - apps/frontend/src/features/kpi/__tests__/useStalenessAlert.test.ts
    - apps/frontend/src/features/kpi/__tests__/DashboardPage.test.tsx
    - apps/frontend/vitest.config.ts
  modified:
    - apps/frontend/package.json (4 deps + 3 devDeps added)
    - apps/frontend/src/main.tsx (QueryClientProvider + ReactQueryDevtools)
    - apps/frontend/src/pages/DashboardPage.tsx (full replacement)
    - apps/frontend/src/components/Header.tsx (optional props added)
    - package-lock.json
decisions:
  - "recharts upgraded from 2.12.0 to 3.8.1 — 2.12.0 does not support React 19 (peer dep conflict)"
  - "refetchOnReconnect changed from 'stale' to true — 'stale' not a valid value in React Query 5.x types"
  - "vitest.config.ts css.postcss:{} disables PostCSS processing in tests to avoid ts-node requirement for postcss.config.ts"
  - "Header.tsx receives optional props (lastUpdatedAt, onForceRefresh, isRefreshing) as no-ops — Plan 03-07 renders them"
  - "DashboardPage uses data-testid slots (kpi-grid-slot, slow-mover-chart-slot, stockout-list-slot, filter-bar-slot) for Plan 03-07 component swap-in"
metrics:
  duration_seconds: 1200
  completed_date: "2026-04-08"
  tasks_completed: 2
  tasks_total: 2
  files_created: 10
  files_modified: 5
---

# Phase 3 Plan 06: React Query Setup + KPI Hooks + DashboardPage Skeleton Summary

**One-liner:** React Query client with 30s polling, 4 typed KPI hooks (useKpiSummary/useArticles/useStalenessAlert/useKpiMeta), QueryClientProvider wrap in main.tsx, and full DashboardPage skeleton replacing the Phase 1 stub — 19 unit tests passing.

## Files Created

| File | Purpose |
|---|---|
| `apps/frontend/src/lib/queryClient.ts` | Singleton QueryClient — 25s staleTime, 30s polling, retry:1 |
| `apps/frontend/src/features/kpi/queries.ts` | kpiKeys factory + fetchKpiSummary/fetchArticles/fetchKpiMeta |
| `apps/frontend/src/features/kpi/hooks/useKpiSummary.ts` | 30s polling hook for GET /api/v1/kpi/summary (DASH-04) |
| `apps/frontend/src/features/kpi/hooks/useArticles.ts` | User-triggered hook for GET /api/v1/kpi/articles |
| `apps/frontend/src/features/kpi/hooks/useStalenessAlert.ts` | Pure hook: none/warning/critical based on last_updated_at age |
| `apps/frontend/src/features/kpi/hooks/useKpiMeta.ts` | 5min-cached hook for GET /api/v1/kpi/meta |
| `apps/frontend/vitest.config.ts` | Vitest config with jsdom environment, PostCSS disabled |
| `apps/frontend/src/features/kpi/__tests__/queries.test.ts` | 7 tests — fetch URL, 401 redirect, error throws |
| `apps/frontend/src/features/kpi/__tests__/useStalenessAlert.test.ts` | 7 tests — threshold logic, interval, cleanup |
| `apps/frontend/src/features/kpi/__tests__/DashboardPage.test.tsx` | 5 tests — loading/error/empty/data/fresh states |

## Files Modified

| File | Change |
|---|---|
| `apps/frontend/package.json` | Added @tanstack/react-query, react-query-devtools, recharts, date-fns, testing-library, jsdom |
| `apps/frontend/src/main.tsx` | Wrapped BrowserRouter in QueryClientProvider; ReactQueryDevtools in dev mode |
| `apps/frontend/src/pages/DashboardPage.tsx` | Full replacement of Phase 1 stub with layout skeleton |
| `apps/frontend/src/components/Header.tsx` | Added optional props interface (no-ops until Plan 03-07) |
| `package-lock.json` | Updated for new packages |

## Packages Installed (exact resolved versions)

| Package | Requested | Resolved | Notes |
|---|---|---|---|
| @tanstack/react-query | 5.96.2 | 5.96.2 | Exact match |
| @tanstack/react-query-devtools | 5.96.2 | 5.96.2 | Exact match |
| recharts | 2.12.0 (plan) | 3.8.1 | UPGRADED — 2.12.0 has React 16/17/18 peer dep only |
| date-fns | 3.6.0 | 3.6.0 | Exact match |

## Hook Exports Confirmed

| Hook | File | Exports |
|---|---|---|
| useKpiSummary | hooks/useKpiSummary.ts | `useKpiSummary` |
| useArticles | hooks/useArticles.ts | `useArticles` |
| useStalenessAlert | hooks/useStalenessAlert.ts | `useStalenessAlert`, `StalenessLevel` |
| useKpiMeta | hooks/useKpiMeta.ts | `useKpiMeta` |

## main.tsx Wrapping

QueryClientProvider is the outermost wrapper (outside React.StrictMode), with ReactQueryDevtools mounted outside StrictMode inside the provider, guarded by `import.meta.env.DEV`:

```tsx
<QueryClientProvider client={queryClient}>
  <React.StrictMode>
    <BrowserRouter>...</BrowserRouter>
  </React.StrictMode>
  {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
</QueryClientProvider>
```

## Test Count

- Before: 0 tests in apps/frontend
- After: 19 tests in apps/frontend (3 files, all passing)

## DashboardPage Slot Architecture

The new DashboardPage.tsx uses `data-testid` attributes to define named slots that Plan 03-07 will swap with real components:

| Slot | data-testid | Plan 03-07 replaces with |
|---|---|---|
| Empty state | `empty-state-slot` | `<EmptyState>` component |
| Stale banner | `stale-banner-slot` | `<StaleDataBanner>` component |
| KPI grid | `kpi-grid-slot` | `<KpiGrid summary={summary}>` |
| Slow-mover chart | `slow-mover-chart-slot` | `<SlowMoverChart>` (Recharts) |
| Stockout list | `stockout-list-slot` | `<StockoutList>` |
| Filter bar | `filter-bar-slot` | `<FilterBar>` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] recharts@2.12.0 incompatible with React 19**
- **Found during:** Task 1 — npm install
- **Issue:** recharts@2.12.0 declares peer dependency `react: "^16.0.0 || ^17.0.0 || ^18.0.0"` — React 19 (installed) causes npm ERESOLVE conflict
- **Fix:** Upgraded to recharts@3.8.1 (latest stable, first version with React 19 support in peer deps)
- **Impact:** Recharts 3 has API changes from 2.x — Plan 03-07 must use the Recharts 3 API for chart components. The core chart components (BarChart, Bar, XAxis, YAxis) remain compatible.
- **Files modified:** apps/frontend/package.json, package-lock.json

**2. [Rule 1 - Bug] refetchOnReconnect: "stale" is invalid in React Query 5**
- **Found during:** Task 1 — tsc --noEmit check
- **Issue:** React Query 5 types `refetchOnReconnect` as `boolean | "always" | ((query) => boolean | "always")` — the value "stale" was in the plan's code block but not in the type definition
- **Fix:** Changed to `refetchOnReconnect: true` (equivalent behavior — refetch on reconnect if data is stale)
- **Files modified:** apps/frontend/src/lib/queryClient.ts

**3. [Rule 3 - Blocking] vitest.config.ts required for test environment**
- **Found during:** Test execution
- **Issue:** No vitest.config existed; Vitest's default Vite config loaded postcss.config.ts, which requires ts-node (not installed)
- **Fix:** Created vitest.config.ts with jsdom environment and `css.postcss: {}` to disable PostCSS processing in tests
- **Files modified:** apps/frontend/vitest.config.ts (new)

**4. [Rule 2 - Missing critical] @testing-library/react and jsdom not installed**
- **Found during:** Writing tests
- **Issue:** Tests required React Testing Library and a DOM environment; neither was in package.json
- **Fix:** Installed @testing-library/react, @testing-library/user-event, jsdom as devDependencies
- **Files modified:** apps/frontend/package.json, package-lock.json

## Known Stubs

The following placeholder slots in DashboardPage.tsx contain stub text — intentional, tracked for Plan 03-07:

| Stub | File | Slot data-testid | Resolved by |
|---|---|---|---|
| "KPI grid coming in Plan 03-07" | DashboardPage.tsx | kpi-grid-slot | Plan 03-07 |
| "SlowMoverChart coming in Plan 03-07" | DashboardPage.tsx | slow-mover-chart-slot | Plan 03-07 |
| "StockoutList coming in Plan 03-07" | DashboardPage.tsx | stockout-list-slot | Plan 03-07 |
| "FilterBar coming in Plan 03-07" | DashboardPage.tsx | filter-bar-slot | Plan 03-07 |
| "EmptyState component coming in Plan 03-07" | DashboardPage.tsx | empty-state-slot | Plan 03-07 |

These stubs are intentional per the plan objective ("In this plan the component slots use placeholder stubs") and do NOT prevent the plan's goal (establishing the data layer and page skeleton). The stubs track the boundary between this plan and Plan 03-07.

## Reminder for Plan 03-07

- **recharts 3 API** — use Recharts 3.x API (not 2.x). Main breaking changes: `Tooltip` now uses `content` prop differently; `Legend` layout changed. Core charts (BarChart, Bar, XAxis, YAxis, CartesianGrid) are compatible.
- **Header props** — `lastUpdatedAt`, `onForceRefresh`, `isRefreshing` are accepted but currently no-ops in Header.tsx. Plan 03-07 renders the LastUpdatedBadge and Refresh button using these props.
- **StalenessLevel type** — exported from useStalenessAlert.ts as `"none" | "warning" | "critical"`

## Commits

| Hash | Message |
|---|---|
| `935b184` | feat(03-06): install React Query + Recharts + date-fns, add KPI query factories and hooks |
| `f89e734` | feat(03-06): wrap app in QueryClientProvider, replace DashboardPage with full layout skeleton |
| `ac8e0ab` | test(03-06): add Vitest unit tests for queries, useStalenessAlert, and DashboardPage |

## Self-Check: PASSED

| Check | Result |
|---|---|
| `apps/frontend/src/lib/queryClient.ts` exists | FOUND |
| `apps/frontend/src/features/kpi/queries.ts` exists | FOUND |
| `apps/frontend/src/features/kpi/hooks/useKpiSummary.ts` exists | FOUND |
| `apps/frontend/src/features/kpi/hooks/useArticles.ts` exists | FOUND |
| `apps/frontend/src/features/kpi/hooks/useStalenessAlert.ts` exists | FOUND |
| `apps/frontend/src/features/kpi/hooks/useKpiMeta.ts` exists | FOUND |
| `apps/frontend/src/pages/DashboardPage.tsx` replaced (no "loading…") | CONFIRMED |
| QueryClientProvider in main.tsx | FOUND |
| 19 tests pass | CONFIRMED |
| tsc --noEmit exits 0 | CONFIRMED |
| commit 935b184 exists | FOUND |
| commit f89e734 exists | FOUND |
| commit ac8e0ab exists | FOUND |
