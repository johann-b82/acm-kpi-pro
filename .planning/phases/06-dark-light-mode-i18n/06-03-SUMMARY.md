---
phase: "06-dark-light-mode-i18n"
plan: "03"
subsystem: frontend
tags: [i18n, theming, recharts, formatting, header, dark-mode]
dependency_graph:
  requires:
    - "06-01"
    - "06-02"
  provides:
    - useThemeColors hook for Recharts theme-correct colors
    - lib/format.ts locale-aware formatting helpers
    - Header with Sun/Moon theme toggle and DE|EN language pills
    - All Phase 3+4 components fully localized (zero hardcoded English strings)
  affects:
    - apps/frontend/src/components/Header.tsx
    - apps/frontend/src/hooks/useThemeColors.ts
    - apps/frontend/src/lib/format.ts
    - apps/frontend/src/features/kpi/components/*
    - apps/frontend/src/features/upload/components/*
    - apps/frontend/src/pages/*
tech_stack:
  added: []
  patterns:
    - useThemeColors() reads CSS variables at render time via getComputedStyle; re-evaluates on next-themes resolvedTheme change via useEffect + requestAnimationFrame
    - lib/format.ts reads i18n.language at call time — single source of truth, no locale prop drilling
    - Header write-through via fetch PATCH /api/me/preferences — fire-and-forget, optimistic UI
    - SuccessSummary uses switch-based kpiLabel() to satisfy typed t() key constraints
key_files:
  created:
    - apps/frontend/src/hooks/useThemeColors.ts
    - apps/frontend/src/lib/format.ts
  modified:
    - apps/frontend/src/components/Header.tsx
    - apps/frontend/src/features/kpi/components/LastUpdatedBadge.tsx
    - apps/frontend/src/features/kpi/components/KpiCard.tsx
    - apps/frontend/src/features/kpi/components/KpiGrid.tsx
    - apps/frontend/src/features/kpi/components/StaleDataBanner.tsx
    - apps/frontend/src/features/kpi/components/FilterBar.tsx
    - apps/frontend/src/features/kpi/components/SlowMoverChart.tsx
    - apps/frontend/src/features/kpi/components/StockoutList.tsx
    - apps/frontend/src/features/kpi/components/ArticleDrilldownModal.tsx
    - apps/frontend/src/pages/DashboardPage.tsx
    - apps/frontend/src/pages/LoginPage.tsx
    - apps/frontend/src/features/upload/components/UploadPage.tsx
    - apps/frontend/src/features/upload/components/DropZone.tsx
    - apps/frontend/src/features/upload/components/SuccessSummary.tsx
    - apps/frontend/src/features/upload/components/ErrorSummary.tsx
decisions:
  - "useThemeColors uses requestAnimationFrame to read CSS variables after next-themes settles class on html"
  - "lib/format.ts reads i18n.language directly (not from hook) so it can be used outside React components"
  - "SuccessSummary uses switch statement instead of t(key as type) cast — satisfies typed i18next TS constraints"
  - "StockoutList and ArticleDrilldownModal swept as Rule 2 deviation — plan verification required 0 toLocaleString matches"
metrics:
  duration: "~9 minutes"
  completed: "2026-04-09"
  tasks: 2
  files_created: 2
  files_modified: 15
---

# Phase 6 Plan 3: Theme + Language Toggles + Format Sweep Summary

**One-liner:** Sun/Moon theme toggle and DE|EN language pills wired in Header with CSS-variable-backed Recharts hook and Intl-based locale formatters sweeping all Phase 3+4 components.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | useThemeColors hook + lib/format.ts helpers | `6bd99a0` | 2 created |
| 2 | Header toggles + component string sweep + format sweep | `b2dedf4` | 15 modified |

## What Was Built

### Task 1: useThemeColors + format.ts

`apps/frontend/src/hooks/useThemeColors.ts`:
- Reads `--kpi-ok`, `--kpi-warn`, `--kpi-critical`, `--primary`, `--border`, `--foreground` from `getComputedStyle(document.documentElement)`
- Returns `hsl(...)` strings re-evaluated on `resolvedTheme` change via `useEffect + requestAnimationFrame`
- SSR-safe light-mode defaults as initial state

`apps/frontend/src/lib/format.ts`:
- `formatNumber(value, opts?)` — Intl.NumberFormat with locale from i18next
- `formatCurrency(value)` — always EUR (D-20); de: `1.234.567,89 €`, en: `€1,234,567.89`
- `formatDate(date)` — de: `31.12.2025`, en: `2025-12-31` (ISO)
- `formatDateTime(date)` — de: `31.12.2025, 14:30`, en: locale datetime
- `formatPercent(value, fractionDigits?)` — value is 0-100 (divided by 100 internally)

### Task 2: Header Toggles + Sweep

**Header.tsx**: Added `useTheme` + `useTranslation` + `i18n` imports. New controls between force-refresh and upload:
- Theme toggle: `Moon` (light mode) / `Sun` (dark mode), calls `setTheme()` and `PATCH /api/me/preferences { theme }`
- Language pills: `DE | EN` with bold active state, calls `i18n.changeLanguage()`, sets `acm_lang` cookie, calls `PATCH /api/me/preferences { locale }`

**Component sweep:**
- `LastUpdatedBadge`: `toLocaleTimeString` → `formatDateTime()`, hardcoded "Last updated:" → `t("dashboard.lastUpdated")`
- `KpiCard`: `value.toLocaleString()` → `formatNumber(value)` (for number values only)
- `KpiGrid`: all 7 card titles via `t("dashboard.kpiLabels.*")`, currency values via `formatCurrency()`
- `StaleDataBanner`: both message strings via `t("dashboard.stale30min")` / `t("dashboard.stale2h")`
- `FilterBar`: all placeholder and label strings via `t("dashboard.filters.*")`
- `SlowMoverChart`: hex color literals `#22c55e`, `#eab308`, `#ef4444` → `colors.kpiOk/kpiWarn/kpiCritical` from `useThemeColors()`; tooltip via `formatCurrency()`
- `LoginPage`: all strings via `t("auth.*")`
- `UploadPage/DropZone/SuccessSummary/ErrorSummary`: all user-visible strings via `t("upload.*")`
- `DashboardPage`: error/retry strings via `t("common.*")`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical localization] Swept StockoutList and ArticleDrilldownModal**
- **Found during:** Task 2 verification (grep toLocaleString)
- **Issue:** Plan files list didn't include StockoutList.tsx or ArticleDrilldownModal.tsx, but plan verification required 0 toLocaleString matches; these two files had 5 remaining instances
- **Fix:** Added `formatNumber/formatCurrency` imports and replaced all `.toLocaleString()` calls; added `useTranslation` to StockoutList for title localization
- **Files modified:** `StockoutList.tsx`, `ArticleDrilldownModal.tsx`
- **Commit:** `b2dedf4`

**2. [Rule 1 - Bug] SuccessSummary labelKey type incompatibility**
- **Found during:** Task 2 typecheck
- **Issue:** Storing `labelKey: string` in KPI_DEFS and casting to `Parameters<typeof t>[0]` fails TypeScript typed i18next — plain string is not assignable to the typed union
- **Fix:** Removed `labelKey` from KpiDef, added `kpiLabel(key: KpiKey): string` switch function with explicit typed `t()` calls
- **Commit:** `b2dedf4`

## Known Stubs

None — all KPI data is live from API, all strings from i18n files, all colors from CSS variables.

## Verification Results

- `grep "useTheme" apps/frontend/src/components/Header.tsx` — PASSES
- `grep "toggleTheme|setLocale" apps/frontend/src/components/Header.tsx` — PASSES
- `grep "formatDateTime" apps/frontend/src/features/kpi/components/LastUpdatedBadge.tsx` — PASSES
- `grep "toLocaleTimeString" apps/frontend/src/features/kpi/components/LastUpdatedBadge.tsx` — returns nothing (PASSES)
- `grep "formatNumber" apps/frontend/src/features/kpi/components/KpiCard.tsx` — PASSES
- `grep "useTranslation" apps/frontend/src/pages/LoginPage.tsx` — PASSES
- `grep '"Sign In"' apps/frontend/src/pages/LoginPage.tsx` — returns nothing (PASSES)
- `grep -r "toLocaleString" apps/frontend/src/` — returns nothing (PASSES)
- `tsc --noEmit` — EXIT 0 (PASSES)

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `apps/frontend/src/hooks/useThemeColors.ts` exists | FOUND |
| `apps/frontend/src/lib/format.ts` exists | FOUND |
| Commit `6bd99a0` exists | FOUND |
| Commit `b2dedf4` exists | FOUND |
