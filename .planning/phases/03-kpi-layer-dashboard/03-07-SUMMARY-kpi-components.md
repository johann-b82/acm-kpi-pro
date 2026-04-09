---
phase: 03-kpi-layer-dashboard
plan: "03-07"
subsystem: frontend-kpi-components
tags: [react, recharts, shadcn, kpi-dashboard, rtl-tests]
dependency_graph:
  requires:
    - 03-06  # DashboardPage skeleton + hooks
    - 03-05  # API endpoints + KpiColor type
    - 03-02  # Shared DTO types (KpiSummary, ArticleSummary, KpiMeta)
  provides:
    - apps/frontend/src/features/kpi/components/ (all 9 components)
    - apps/frontend/src/lib/kpiColors.ts
    - Updated DashboardPage.tsx (real components, no slot stubs)
    - Updated Header.tsx (LastUpdatedBadge + force-refresh button)
  affects:
    - 04 (upload page — EmptyState CTA links to /upload)
tech_stack:
  added:
    - shadcn/ui components: card, dialog, table, select, badge, tooltip, button, input
    - class-variance-authority: ^0.7.1 (shadcn/button dependency, added to package.json)
    - Recharts 3.8.1 stacked horizontal bar (layout="vertical")
  patterns:
    - shadcn CLI install with src/ alias (not @/ which caused literal dir creation)
    - kpiColorToClasses() + kpiColorToLabel() for WCAG AA color-plus-text pattern
    - vi.mock("recharts") in DashboardPage test to avoid ETIMEDOUT in jsdom
    - FilterBar uses empty-spread pattern for exactOptionalPropertyTypes compat
key_files:
  created:
    - apps/frontend/src/features/kpi/components/KpiCard.tsx            # 71 lines
    - apps/frontend/src/features/kpi/components/KpiGrid.tsx             # 106 lines
    - apps/frontend/src/features/kpi/components/SlowMoverChart.tsx      # 85 lines
    - apps/frontend/src/features/kpi/components/StockoutList.tsx        # 81 lines
    - apps/frontend/src/features/kpi/components/ArticleDrilldownModal.tsx # 178 lines
    - apps/frontend/src/features/kpi/components/FilterBar.tsx           # 115 lines
    - apps/frontend/src/features/kpi/components/StaleDataBanner.tsx     # 45 lines
    - apps/frontend/src/features/kpi/components/EmptyState.tsx          # 60 lines
    - apps/frontend/src/features/kpi/components/LastUpdatedBadge.tsx    # 26 lines
    - apps/frontend/src/lib/kpiColors.ts                                # 45 lines
    - apps/frontend/src/components/ui/ (8 shadcn components)
    - RTL test files (4 new): KpiCard, StaleDataBanner, EmptyState, ArticleDrilldownModal
  modified:
    - apps/frontend/src/pages/DashboardPage.tsx  (replaced all slot stubs with real components)
    - apps/frontend/src/components/Header.tsx    (wired LastUpdatedBadge + force-refresh)
    - apps/frontend/src/features/kpi/__tests__/DashboardPage.test.tsx (updated for real components)
    - apps/frontend/components.json  (fixed aliases: src/ not @/)
    - apps/frontend/package.json     (added class-variance-authority)
    - apps/frontend/tsconfig.json    (added baseUrl + paths for @/ and src/ aliases)
    - apps/frontend/vitest.config.ts (added resolve.alias for @/ and src/)
decisions:
  - "shadcn CLI uses literal alias paths: components.json must use 'src/components/ui' not '@/components/ui'"
  - "Recharts must be vi.mock'd in DashboardPage tests — Funnel.js triggers ETIMEDOUT from esm.sh import in jsdom"
  - "FilterBar uses empty-object spread to pass 'unset filter' with exactOptionalPropertyTypes:true"
  - "StaleDataBanner accepts pre-computed StalenessLevel from useStalenessAlert() hook (not lastUpdatedAt timestamp)"
  - "tsconfig needs ignoreDeprecations:'6.0' for baseUrl + paths in TypeScript 6"
metrics:
  duration_minutes: 65
  completed: "2026-04-09"
  tasks_completed: 2
  files_created: 23
  files_modified: 7
---

# Phase 3 Plan 07: KPI Components Summary

One-liner: 9 production-ready React KPI dashboard components with Recharts 3 stacked bar, shadcn/ui Dialog drill-down modal, WCAG-compliant color+label cards, and 45 passing RTL tests.

## Components Created

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| `KpiCard` | features/kpi/components/KpiCard.tsx | 71 | Color-coded card with dot + text label |
| `KpiGrid` | features/kpi/components/KpiGrid.tsx | 106 | 7-card 3-col grid (all above fold) |
| `SlowMoverChart` | features/kpi/components/SlowMoverChart.tsx | 85 | Recharts stacked horizontal bar |
| `StockoutList` | features/kpi/components/StockoutList.tsx | 81 | Top-5 preview table with row click |
| `ArticleDrilldownModal` | features/kpi/components/ArticleDrilldownModal.tsx | 178 | Dialog: 8 essentials + toggle for all |
| `FilterBar` | features/kpi/components/FilterBar.tsx | 115 | 4 select dropdowns (DASH-05 scaffold) |
| `StaleDataBanner` | features/kpi/components/StaleDataBanner.tsx | 45 | Yellow/red banner for stale data |
| `EmptyState` | features/kpi/components/EmptyState.tsx | 60 | Role-aware onboarding card |
| `LastUpdatedBadge` | features/kpi/components/LastUpdatedBadge.tsx | 26 | "Last updated HH:MM" in header |
| `kpiColors.ts` | lib/kpiColors.ts | 45 | Color utility functions |

## shadcn/ui Components Installed

All 8 via `npx shadcn@latest add`:
`card`, `dialog`, `table`, `select`, `badge`, `tooltip`, `button`, `input`

**Deviation from expected install location:** The shadcn CLI interprets alias values literally. When `components.json` had `"ui": "@/components/ui"`, it created a literal `@/components/ui/` directory at the project root. Fixed by changing to `"ui": "src/components/ui"`. Same fix applied to vitest and tsconfig for `@/` → `src/` resolution.

## Recharts 3 API Caveats

Research examples used Recharts 2 syntax; Recharts 3.8.1 has minor type differences:

- `Tooltip formatter` type changed: `ValueType | undefined` for value param — used `Number(value)` cast instead of typed `(value: number) =>` signature
- `Funnel.js` in Recharts 3 makes a dynamic ESM import from esm.sh at module load time, causing `ETIMEDOUT` in jsdom tests — mitigated with `vi.mock("recharts")` in `DashboardPage.test.tsx`
- All other Recharts 3 API (`BarChart`, `Bar`, `XAxis`, `YAxis`, `ResponsiveContainer`, `Legend`, `Tooltip`, `CartesianGrid`) matched the research spec exactly

## DashboardPage Final Structure

```tsx
<Header lastUpdatedAt={summary.last_updated_at} onForceRefresh={handleForceRefresh} isRefreshing={isFetching} />
<main>
  <StaleDataBanner level={stalenessLevel} />           // Pitfall #6
  <FilterBar meta={meta} ... onChange={handleFilterChange} />  // DASH-05 scaffold
  <KpiGrid summary={summary} />                        // 7 cards, Pitfall #8
  <SlowMoverChart buckets={...} clutterCount={...} samplesCount={...} />  // DASH-06
  <StockoutList items={items_preview} onRowClick={handleRowClick} />      // DASH-07
  <ArticleDrilldownModal isOpen={modalOpen} onClose={...} article={selectedArticle} />
</main>
```

Empty state path renders `<EmptyState />` which uses role from `useAuth()` to show admin CTA or viewer message.

## Test Results

| Before Plan 03-07 | After Plan 03-07 |
|-------------------|------------------|
| 19 tests (3 files) | 45 tests (7 files) |

Test files added:
- `KpiCard.test.tsx` — 9 tests (all 4 colors, title/value/unit, dot classes)
- `StaleDataBanner.test.tsx` — 5 tests (none/warning/critical variants)
- `EmptyState.test.tsx` — 4 tests (admin CTA, viewer message, null user)
- `ArticleDrilldownModal.test.tsx` — 5 tests (open/close/toggle/onClose)

DashboardPage.test.tsx updated from slot-testid assertions to real component text assertions (8 tests).

All 45 tests pass: `Test Files 7 passed (7) | Tests 45 passed (45)`

## Build Status

- `tsc --noEmit`: 0 errors (added `ignoreDeprecations: "6.0"` + `baseUrl`/`paths` for alias resolution)
- `vite build`: SUCCESS — 2218 modules, built in ~4 min
  - `vendor.js`: 329.92 kB (gzip: 105 kB) — React, React Router
  - `index.js`: 416.55 kB (gzip: 122 kB) — app + Recharts + shadcn

## Pitfall Mitigations

**Pitfall #6 (Freshness Ambiguity):**
- `StaleDataBanner` renders yellow after 30 min, red after 2h (uses pre-computed `StalenessLevel` from `useStalenessAlert`)
- `LastUpdatedBadge` in header shows last import time as "HH:MM"
- Force-refresh button (RefreshCw icon) in header calls `refetch()` with spinner while loading

**Pitfall #8 (Executive UX Overload):**
- 7 KPI cards in a 3-col grid — all visible above the fold on desktop
- No required filters (all default to "All")
- FilterBar scaffold is present but data filtering is deferred to v1.x (DASH-05)
- Modal drill-down keeps the main dashboard clean

## Accessibility

Every color-coded KPI card shows:
1. A colored dot (visual)
2. A text badge (`kpiColorToLabel()`) — "Healthy" / "Watch" / "Action Required" / "Info"

Color is never the sole indicator (WCAG AA). Implemented via `kpiColorToClasses()` + `kpiColorToLabel()` in `lib/kpiColors.ts`.

## German Formatting

No `Intl.NumberFormat('de-DE')` anywhere in Phase 3 frontend code. All numbers use `toLocaleString()` (browser default). Dates use `toLocaleTimeString()`. Phase 6 will replace both with locale-specific formatting.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shadcn CLI created literal @/ directory**
- **Found during:** Task 1
- **Issue:** `components.json` had `"ui": "@/components/ui"` — shadcn CLI created `apps/frontend/@/components/ui/` literally
- **Fix:** Changed `components.json` aliases to use `src/` prefix, reinstalled components, removed the `@/` directory
- **Files modified:** `components.json`

**2. [Rule 1 - Bug] class-variance-authority not installed**
- **Found during:** Task 2 (first test run)
- **Issue:** shadcn button.tsx imports `class-variance-authority` which wasn't in package.json
- **Fix:** Added `"class-variance-authority": "^0.7.1"` to package.json, ran npm install
- **Files modified:** `package.json`, `package-lock.json`

**3. [Rule 1 - Bug] vitest/tsc couldn't resolve @/ and src/ aliases**
- **Found during:** Task 2 (tests failing with module resolution errors)
- **Fix:** Added `resolve.alias` to `vitest.config.ts`, added `baseUrl` + `paths` to `tsconfig.json` with `ignoreDeprecations: "6.0"` for TypeScript 6 compat
- **Files modified:** `vitest.config.ts`, `tsconfig.json`

**4. [Rule 1 - Bug] FilterBar crashed when meta was undefined**
- **Found during:** Task 2 (DashboardPage test TypeError)
- **Issue:** `meta?.warehouses.map()` — even with optional chaining, called `.map()` on undefined when `meta` was an object but `warehouses` was not populated
- **Fix:** Changed to `(meta?.warehouses ?? []).map()` with explicit fallback
- **Files modified:** `FilterBar.tsx`

**5. [Rule 1 - Bug] Recharts Funnel.js ETIMEDOUT in jsdom**
- **Found during:** Task 2 (DashboardPage test timeout)
- **Issue:** Recharts 3 Funnel.js makes a dynamic network import from esm.sh at module load time, which times out in jsdom
- **Fix:** Added `vi.mock("recharts")` stub in DashboardPage.test.tsx
- **Files modified:** `DashboardPage.test.tsx`

**6. [Rule 1 - Bug] DashboardPage tests checked for removed data-testid slots**
- **Found during:** Task 2 (test failures after replacing stubs with real components)
- **Issue:** Existing DashboardPage.test.tsx from Plan 03-06 asserted `data-testid="kpi-grid-slot"` etc. which no longer exist
- **Fix:** Rewrote test assertions to match real component text + added mockFetch helper for multiple endpoints
- **Files modified:** `DashboardPage.test.tsx`

**7. [Rule 2 - Missing critical] StaleDataBanner API mismatch**
- **Found during:** Task 2 (plan described passing `lastUpdatedAt` but hook already provides `StalenessLevel`)
- **Issue:** Plan 03-07 spec says `StaleDataBanner` takes `lastUpdatedAt: string | null`, but `useStalenessAlert` hook in Plan 03-06 already computes the staleness level
- **Fix:** Changed StaleDataBanner to accept `level: StalenessLevel` (avoids duplicate staleness computation). DashboardPage already had `useStalenessAlert` computed and passes the level.
- **Files modified:** `StaleDataBanner.tsx`, `StaleDataBanner.test.tsx`

## Self-Check: PASSED

Files verified:
- `apps/frontend/src/features/kpi/components/KpiCard.tsx` — FOUND
- `apps/frontend/src/features/kpi/components/KpiGrid.tsx` — FOUND
- `apps/frontend/src/features/kpi/components/SlowMoverChart.tsx` — FOUND
- `apps/frontend/src/features/kpi/components/StockoutList.tsx` — FOUND
- `apps/frontend/src/features/kpi/components/ArticleDrilldownModal.tsx` — FOUND
- `apps/frontend/src/features/kpi/components/FilterBar.tsx` — FOUND
- `apps/frontend/src/features/kpi/components/StaleDataBanner.tsx` — FOUND
- `apps/frontend/src/features/kpi/components/EmptyState.tsx` — FOUND
- `apps/frontend/src/features/kpi/components/LastUpdatedBadge.tsx` — FOUND
- `apps/frontend/src/lib/kpiColors.ts` — FOUND

Commits verified:
- `0cdb6b1` feat(03-07): install shadcn/ui components and create kpiColors utility — FOUND
- `bcb4227` feat(03-07): build 9 KPI dashboard components and wire DashboardPage — FOUND

Test run: 45/45 passed
Build: SUCCESS (exit 0)
TypeScript: 0 errors (exit 0)
