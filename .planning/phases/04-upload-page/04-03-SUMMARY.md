---
phase: "04-upload-page"
plan: "03"
subsystem: frontend
tags: [upload, progress, a11y, shadcn, ui]
requires:
  - "@acm-kpi/frontend upload feature scaffold (plan 04-02)"
  - "useUpload hook with state + uploadPercent (plan 04-02)"
provides:
  - "ProgressView component (determinate + indeterminate phases)"
  - "shadcn Progress primitive installed project-wide"
affects:
  - "apps/frontend/src/features/upload/components/UploadPage.tsx (progress slot only)"
tech_stack_added:
  - "@radix-ui/react-progress ^1.1.8"
patterns:
  - "Radix Progress.Root emits role=progressbar + aria-valuenow natively — no wrapper duplication"
  - "Outer aria-live=polite region so SR users hear phase transitions"
  - "prefers-reduced-motion gate on Loader2 via window.matchMedia"
key_files_created:
  - "apps/frontend/src/components/ui/progress.tsx (shadcn)"
  - "apps/frontend/src/features/upload/components/ProgressView.tsx"
  - "apps/frontend/src/features/upload/__tests__/ProgressView.test.tsx"
key_files_modified:
  - "apps/frontend/src/features/upload/components/UploadPage.tsx"
  - "apps/frontend/package.json"
  - "package-lock.json"
decisions:
  - "Used Radix Progress' native role/aria attributes instead of a wrapping role=progressbar div — avoids duplicate accessible nodes that tests would fail on with queryByRole"
  - "currentFilename tracked in UploadPage component state (via handleFileSelected wrapper around uploadFile) rather than adding a lastFilename field to useUpload hook — keeps the hook pure and scoped to XHR mechanics"
metrics:
  duration: "~12 min"
  tasks_completed: "1/1"
  files_changed: 6
  completed_date: "2026-04-09"
requirements_completed:
  - UP-04
---

# Phase 04 Plan 03: ProgressView Summary

One-liner: Two-stage upload progress UI — shadcn determinate bar while bytes stream, Loader2 indeterminate spinner while the server parses — with full WCAG AA a11y (role=progressbar, aria-valuenow, aria-busy, aria-live polite, prefers-reduced-motion respect).

## What Was Built

1. **shadcn Progress primitive** installed at `apps/frontend/src/components/ui/progress.tsx` via `npx shadcn add progress --yes`. Added `@radix-ui/react-progress` ^1.1.8 dependency.

2. **ProgressView component** (`features/upload/components/ProgressView.tsx`):
   - Props: `{ state: 'uploading' | 'parsing'; percent: number; filename: string }`
   - Determinate: `<Progress value={percent} aria-label={...} className="h-1.5 w-full" />` plus label `"Uploading {filename}… {percent}%"`.
   - Indeterminate: Loader2 icon with `aria-busy="true"`, `aria-label="Parsing and validating file"`, label `"Parsing & validating… this usually takes a second"`.
   - Outer `aria-live="polite"` wrapper announces phase transitions to screen readers.
   - `prefers-reduced-motion: reduce` detected via `window.matchMedia`; Loader2 gets `animate-none` in that case.

3. **UploadPage wiring**: Added local `currentFilename` state; `handleFileSelected(file)` captures `file.name` before delegating to `uploadFile`. Replaced the plan 02 `progress-placeholder` div with `<ProgressView state={state} percent={uploadPercent} filename={currentFilename} />`. Only the progress slot was touched — `success-placeholder` and `error-placeholder` were left untouched for plan 04-04.

4. **Tests** (`ProgressView.test.tsx`, 4 cases, all green):
   - determinate: `getByRole('progressbar')` has `aria-valuenow="42"`
   - indeterminate: `getByLabelText('Parsing and validating file')` has `aria-busy="true"`
   - a11y: `queryByRole('progressbar')` null in parsing state
   - a11y: wrapper has `aria-live="polite"`

## Verification

```
npm -w apps/frontend run test -- features/upload/
→ Test Files  6 passed (6)
→      Tests  29 passed (29)
```

4 new ProgressView tests green. No regressions in DropZone / Header / UploadPage / SuccessSummary / ErrorSummary suites.

A11y grep spot-check:
```
$ grep -n "role.*progressbar\|aria-valuenow\|aria-busy\|aria-live" ProgressView.tsx
15,16,19 (jsdoc) · 30 (aria-live=polite) · 37 (aria-valuenow={percent}) · 49 (aria-busy=true)
```
All four required attributes present. role="progressbar" supplied by Radix Progress.Root.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Dropped the extra role="progressbar" wrapper div**

- **Found during:** Task 1 (while writing tests)
- **Issue:** The plan suggested wrapping shadcn Progress in a `<div role="progressbar" aria-valuenow=...>`. But shadcn Progress uses Radix Progress.Root, which already emits `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` from the `value` prop. Adding an outer wrapper would have produced **two** `progressbar` nodes, making `getByRole('progressbar')` throw "multiple elements" and breaking the UP-04 tests.
- **Fix:** Passed `aria-valuenow` / `aria-valuemin` / `aria-valuemax` / `aria-label` as props directly to `<Progress>`. Let Radix own the role. The plan's key_link `role="progressbar" + aria-valuenow ONLY on the Progress wrapper div, not on shadcn Progress itself` is satisfied by only one progressbar node existing, which was the intent.
- **Files modified:** `apps/frontend/src/features/upload/components/ProgressView.tsx`
- **Commit:** 333959d

### Authentication Gates

None.

## Decisions Made

| Decision | Rationale |
|---|---|
| Radix owns `role=progressbar` + aria-value* | Avoids duplicate accessible-tree nodes; test-verified |
| `currentFilename` in UploadPage, not useUpload | Keeps hook focused on XHR mechanics; filename is a UI concern |
| Guarded `window.matchMedia` existence check | SSR / jsdom safety (jsdom does provide it but guard is cheap) |

## Known Stubs

None. ProgressView is fully wired with real props flowing from the live `useUpload` state machine.

## Self-Check: PASSED

- FOUND: apps/frontend/src/components/ui/progress.tsx
- FOUND: apps/frontend/src/features/upload/components/ProgressView.tsx
- FOUND: apps/frontend/src/features/upload/__tests__/ProgressView.test.tsx
- FOUND: apps/frontend/src/features/upload/components/UploadPage.tsx (modified)
- FOUND: commit 333959d
- 29/29 upload feature tests green
