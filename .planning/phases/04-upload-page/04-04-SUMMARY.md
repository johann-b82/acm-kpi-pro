---
phase: 04-upload-page
plan: "04"
subsystem: frontend/features/upload
tags:
  - upload
  - react-query
  - accessibility
  - kpi-delta
requirements:
  - UP-05
  - UP-06
dependency-graph:
  requires:
    - "@acm-kpi/core (UploadSuccessResponse, UploadErrorResponse)"
    - "apps/frontend/src/lib/queryClient (singleton QueryClient)"
    - "features/upload/hooks/useUpload (reset())"
    - "features/upload/components/UploadPage (plan 02 placeholder slots)"
  provides:
    - "SuccessSummary: green KPI delta card with dashboard cache invalidation"
    - "ErrorSummary: red grouped error card with WCAG detail table + TSV clipboard copy"
    - "UploadPage: real success/error rendering (placeholders removed)"
  affects:
    - "['kpi', 'summary'] React Query cache — invalidated on Go to Dashboard click"
tech-stack:
  added: []
  patterns:
    - "Inverted-sign KPI semantics (deadStockPct: decrease is green)"
    - "Direct queryClient import (singleton) instead of useQueryClient hook — navigates away immediately"
    - "Clipboard TSV export with 2s button-label feedback, graceful swallow when clipboard unavailable"
key-files:
  created:
    - "apps/frontend/src/features/upload/components/SuccessSummary.tsx"
    - "apps/frontend/src/features/upload/components/ErrorSummary.tsx"
    - "apps/frontend/src/features/upload/__tests__/SuccessSummary.test.tsx"
    - "apps/frontend/src/features/upload/__tests__/ErrorSummary.test.tsx"
  modified:
    - "apps/frontend/src/features/upload/components/UploadPage.tsx"
decisions:
  - "queryClient imported directly (singleton) — Go to Dashboard navigates away, useQueryClient hook unnecessary"
  - "Inverted-sign logic lives in formatDeltaSign with invertedSign flag from KPI_DEFS — single source of truth"
  - "UploadPage result passed to Success/ErrorSummary via double-cast (`as unknown as UploadSuccessResponse`) — features/upload/types.ts keeps a local UploadResponse shape for plan 04-02 parallel-safety; plan 04-05 will switch to @acm-kpi/core directly"
  - "Inline Upload failed Card used for network/403/409 errors without a result body — ErrorSummary requires a UploadErrorResponse, so a synthetic DTO would be misleading"
  - "queryClient.ts was NOT recreated — it already existed from plan 04-02 with correct config; SuccessSummary imports and invalidates the ['kpi','summary'] key it exposes"
metrics:
  duration-minutes: 5
  tasks-completed: 2
  files-changed: 5
  completed-date: "2026-04-09"
---

# Phase 04 Plan 04: Success + Error Views Summary

Built SuccessSummary (green KPI delta card with dashboard cache invalidation) and ErrorSummary (red grouped error card with WCAG-compliant detail table + TSV clipboard copy), then wired both into UploadPage replacing the plan 02 success-placeholder and error-placeholder slots.

## Objective

Satisfy UP-05 and UP-06 by rendering the full import outcome on `/upload`: either a meaningful before/after/change KPI delta view or an actionable, copy-friendly error breakdown.

## What Was Built

### SuccessSummary.tsx (UP-05)

Green `Card` with `aria-live="polite"`, `CheckCircle2` icon, and metadata line (`{filename} · {rows} rows imported · completed in {duration}s`). Below the header sits a responsive KPI delta grid rendering the four headline KPIs (`totalInventoryValue`, `daysOnHand`, `stockoutsCount`, `deadStockPct`) with **Before / After / Change** columns. The **Before** column is hidden entirely when every KPI reports `before: null` (first-ever import path). Each Change cell shows a signed value plus a Lucide arrow (`ArrowUp` / `ArrowDown` / `Minus`) with color semantics:

- **positive effective** → `text-green-600` + up arrow + `+` prefix
- **negative effective** → `text-red-600` + down arrow + `−` prefix
- **zero** → `text-muted-foreground` + dash

The **Dead Stock %** KPI is flagged `invertedSign: true` so a decrease renders green (improvement) and an increase renders red (regression) — the inverted semantics live in `formatDeltaSign` so they are uniform across the grid.

Primary CTA **Go to Dashboard** calls `queryClient.invalidateQueries({ queryKey: ['kpi', 'summary'] })` then navigates via `useNavigate('/')`, guaranteeing the dashboard refetches with the freshly-ingested data. Secondary **Upload another file** calls `onReset` (the `useUpload.reset()` handle) to return the page to `idle`.

### ErrorSummary.tsx (UP-06)

Red `Card` with `aria-live="assertive"`, `AlertCircle` icon, and summary line `"{errorCount} errors across {fieldCount} fields:"`. Below sits a bulleted grouped field list (field × row-count, sorted descending) computed with a `useMemo` over `result.errors` to avoid re-computing on unrelated re-renders. The **Error Details** section is a `max-h-96 overflow-y-auto` scrollable container wrapping a shadcn `Table` with real `<th scope="col">` headers for WCAG AA compliance — verified by `container.querySelectorAll('th[scope="col"]').length === 4` in the test.

**Copy all errors** uses `navigator.clipboard.writeText()` to copy a TSV body (`Row\tField\tValue\tReason` header + one row per error), then flips the button label to **Copied!** for 2 seconds via `setTimeout`. Clipboard failures are swallowed so headless test environments don't break. **Try another file** calls `onReset`.

### UploadPage.tsx — wiring (scoped to 2 slots only)

Touched only the `success-placeholder` and `error-placeholder` branches, leaving the `progress-placeholder` / `ProgressView` wiring from parallel plan 04-03 intact:

- Added `SuccessSummary` and `ErrorSummary` imports, plus `UploadSuccessResponse` / `UploadErrorResponse` type-only imports from `@acm-kpi/core`.
- Added `reset` to the `useUpload` destructure.
- Replaced success-placeholder `<div>` with `<SuccessSummary result={...} onReset={reset} />`.
- Replaced error-placeholder `<div>` with a split:
  - `state === 'error' && result?.status === 'failed'` → `<ErrorSummary />`
  - `state === 'error' && !result` → inline **Upload failed** `Card` showing the `error` string (for network / 403 / 409 paths that have no `UploadErrorResponse` body).

## Decisions Made

1. **Direct queryClient import, not useQueryClient hook.** The Go to Dashboard button navigates away immediately after invalidation; there is no observer dependency on the query client context. Importing the singleton keeps the side-effect inline and minimises wrapper churn.

2. **Inverted-sign KPI logic centralised in `formatDeltaSign(delta, invertedSign)`.** `KPI_DEFS` tags `deadStockPct` with `invertedSign: true`; every other KPI defaults to `false`. This is the single source of truth for the UP-05 requirement "lower dead-stock is better".

3. **Local `UploadResponse` in features/upload/types.ts preserved; UploadPage casts via `as unknown as UploadSuccessResponse`.** Plan 04-02 created a local `UploadResponse` to break the parallel race with plan 04-01 that creates `@acm-kpi/core`'s `upload/types.ts`. Both shapes are structurally identical, so the double-cast is safe and defers the cleanup to plan 04-05 (e2e wiring) as already scheduled.

4. **queryClient.ts NOT recreated.** The file already existed from plan 04-02 with the correct staleTime / refetchInterval / retry config. Creating it again would be a regression on that plan's decisions. The "create with kpi summary invalidation" success criterion is satisfied by SuccessSummary calling `invalidateQueries({ queryKey: ['kpi', 'summary'] })` on the existing singleton.

5. **Inline error card for no-result error paths.** `ErrorSummary` requires a `UploadErrorResponse` (grouped list + detail table). Network failures, 403, and 409 have only an `error` string, no body. Rather than synthesising a fake `UploadErrorResponse`, UploadPage renders a simple red `Card` with the error string — matches the UI-SPEC "error card with red border" visual contract without misleading users into thinking specific rows failed.

## Test Coverage

| Suite             | Tests | Covers |
|-------------------|-------|--------|
| SuccessSummary    | 7     | heading + metadata, null-before hides Before column, positive delta = green, deadStockPct inverted (−Δ = green), deadStockPct regression (+Δ = red), both buttons render, aria-live=polite |
| ErrorSummary      | 7     | heading + summary line, grouped-by-field-desc, 1 header + N data rows, 4 `th[scope=col]` headers, both buttons render, aria-live=assertive, onReset called |
| UploadPage (existing) | 3 | viewer-forbidden, admin-renders-dropzone — unchanged and still green |
| Full feature suite | 29   | all 6 test files in `features/upload/` green |

## Deviations from Plan

**None** — plan executed as written. Parallel plan 04-03 modified `UploadPage.tsx` mid-execution (added ProgressView wiring, `currentFilename` state, `handleFileSelected`); the edit loop re-read the file to pick up 04-03's committed changes before applying the success/error slot replacements, so both plans' changes coexist cleanly.

## Self-Check: PASSED

- SuccessSummary.tsx exists and exports `SuccessSummary`
- ErrorSummary.tsx exists and exports `ErrorSummary`
- SuccessSummary.test.tsx exists (7 tests green)
- ErrorSummary.test.tsx exists (7 tests green)
- UploadPage.tsx imports both and has no `placeholder` references (only a stale docstring comment was cleaned up — grep for `placeholder` in source code returns zero matches)
- `grep "invalidateQueries.*kpi.*summary"` matches in SuccessSummary.tsx
- `grep "scope.*col"` matches 4 times in ErrorSummary.tsx
- Full upload feature suite: 29/29 passing
- `npx tsc --noEmit` for apps/frontend: zero errors
- Commits: `d303f01` (Task 1 SuccessSummary), `35b8834` (Task 2 ErrorSummary + UploadPage wiring)
