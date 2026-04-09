---
phase: 04-upload-page
plan: "02"
subsystem: ui
tags: [react, vitest, xhr, drag-drop, rbac, shadcn, lucide]

requires:
  - phase: 01-foundation
    provides: useAuth hook, ProtectedRoute, Header, shadcn Card
  - phase: 03-kpi-layer-dashboard
    provides: features/kpi folder pattern, vitest forks-pool setup
provides:
  - /upload route wired to the real UploadPage (UploadStubPage retired)
  - Role-gated upload icon in the top-bar Header
  - DropZone with extension + 10 MB size + multi-drop guards
  - useUpload XHR state machine (idle → uploading → parsing → success|error)
  - AdminAccessDenied viewer fallback card
  - Placeholder slot divs for ProgressView / SuccessSummary / ErrorSummary
  - 11 passing Vitest cases covering UP-01, UP-02, UP-03, UP-07 (frontend half)
affects: [04-03-progress-ui, 04-04-success-error-views, 04-05-e2e-wiring]

tech-stack:
  added: []
  patterns:
    - "features/upload/ folder mirrors features/kpi/ (components/ + hooks/ + __tests__/)"
    - "Local UploadResponse DTO in features/upload/types.ts to break cross-plan race with 04-01"
    - "XHR upload (not fetch) so upload.progress is observable"
    - "Role gate inside UploadPage (not ProtectedRoute) — ProtectedRoute authenticates, UploadPage authorises"
    - "data-testid slot divs so 04-03 / 04-04 can swap in real views without touching state machine"

key-files:
  created:
    - apps/frontend/src/features/upload/types.ts
    - apps/frontend/src/features/upload/hooks/useUpload.ts
    - apps/frontend/src/features/upload/components/AdminAccessDenied.tsx
    - apps/frontend/src/features/upload/components/DropZone.tsx
    - apps/frontend/src/features/upload/components/UploadPage.tsx
    - apps/frontend/src/features/upload/__tests__/Header.test.tsx
    - apps/frontend/src/features/upload/__tests__/DropZone.test.tsx
    - apps/frontend/src/features/upload/__tests__/UploadPage.test.tsx
  modified:
    - apps/frontend/src/components/Header.tsx
    - apps/frontend/src/main.tsx

key-decisions:
  - "Local UploadResponse types.ts in features/upload/ instead of importing @acm-kpi/core — plan 04-01 runs in parallel; switching to shared type is deferred to plan 04-05 once 04-01 has landed."
  - "DropZone validateFile runs before onFileSelected — extension + size checks never reach the server, matching the error-copy contract in UI-SPEC."
  - "useUpload keeps xhrRef in a useRef so reset() can abort an in-flight request without resurrecting a React state setter during unmount."
  - "UploadPage embeds Header itself (matching DashboardPage / UploadStubPage pattern) so the top-bar stays consistent between dashboard and upload."

patterns-established:
  - "Feature-scoped DTO types live in features/<feature>/types.ts until the shared package export is stable."
  - "Role gating: ProtectedRoute handles auth (redirect to /login); individual pages handle authorisation (render AdminAccessDenied)."
  - "Vitest file-level tests use vi.mock() on relative hook paths ('../../../hooks/useAuth.js') to mirror the production import path."

requirements-completed:
  - UP-01
  - UP-02
  - UP-03
  - UP-07

duration: ~50 min
completed: 2026-04-09
---

# Phase 04 Plan 02: Frontend Scaffold Summary

**Upload feature scaffold — role-gated DropZone, XHR state machine, and AdminAccessDenied fallback; 11 Vitest cases green.**

## Performance

- **Duration:** ~50 min (includes ~6 min of vitest / tsc wall-clock for the initial spin-up)
- **Started:** 2026-04-09T15:12Z
- **Completed:** 2026-04-09T15:58Z
- **Tasks:** 2/2
- **Files created:** 8
- **Files modified:** 2

## Accomplishments

- `/upload` route now renders the real `UploadPage`; `UploadStubPage` no longer imported.
- Header upload icon is gated by `user?.role === "Admin"` — Viewers no longer see the control (UP-01).
- `DropZone` enforces the exact copywriting contract from `04-UI-SPEC.md` for wrong extension, oversize, and multi-drop cases (UP-02, UP-03).
- `useUpload` implements the XHR state machine (idle → uploading → parsing → success | error) with explicit handling for HTTP 403 and 409 status codes (D-01).
- `AdminAccessDenied` card satisfies the Viewer-forbidden branch of UP-07.
- All three Wave 0 Vitest stubs (Header, DropZone, UploadPage) were converted from `it.todo()` placeholders into real passing tests.

## Task Commits

1. **Task 1: Wave 0 frontend test stubs** — `a764abb` (test)
2. **Task 2: Feature folder + Header role gate + route swap + test conversion** — `a5eac2c` (feat)

## Files Created/Modified

Created:
- `apps/frontend/src/features/upload/types.ts` — local `UploadResponse`, `UploadState`, `DropZoneProps`
- `apps/frontend/src/features/upload/hooks/useUpload.ts` — XHR state machine
- `apps/frontend/src/features/upload/components/AdminAccessDenied.tsx` — Viewer fallback card
- `apps/frontend/src/features/upload/components/DropZone.tsx` — drag-drop + picker + guards
- `apps/frontend/src/features/upload/components/UploadPage.tsx` — page wrapper + role gate + placeholder slots
- `apps/frontend/src/features/upload/__tests__/Header.test.tsx` — Admin/Viewer icon visibility (2 tests)
- `apps/frontend/src/features/upload/__tests__/DropZone.test.tsx` — extension, size, multi-drop, click (6 tests)
- `apps/frontend/src/features/upload/__tests__/UploadPage.test.tsx` — role routing (3 tests)

Modified:
- `apps/frontend/src/components/Header.tsx` — wrapped Upload `<Link>` in `{user?.role === "Admin" && ...}`
- `apps/frontend/src/main.tsx` — swapped `UploadStubPage` import + route element for `UploadPage`

## Decisions Made

- **Local `UploadResponse` type.** Plan 04-01 creates `packages/core/src/upload/types.ts`, but it runs in parallel with 04-02. Pulling in a type that does not yet exist on disk would break `tsc --noEmit`. We re-declare a structural copy under `features/upload/types.ts`; plan 04-05 (e2e wiring) can switch to the canonical import once 04-01 has merged.
- **UploadPage renders its own `<Header />`.** Matches `UploadStubPage` and `DashboardPage` — keeps the top-bar consistent and avoids touching the router layout.
- **State variable `error` is independent of `result.errors`.** When the server returns a 400 with a structured `UploadErrorResponse`, we stash the body in `result` and leave `error` null so that plan 04-04 can render either the placeholder diagnostic string or the detailed error table without contradictions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Local `UploadResponse` DTO instead of `@acm-kpi/core` import**
- **Found during:** Task 2 (useUpload implementation)
- **Issue:** Plan 04-02 instructed to `import type { UploadResponse } from "@acm-kpi/core"`, but plan 04-01 (which adds that export) had not yet landed — running in parallel wave 1.
- **Fix:** Declared `UploadResponse`, `UploadSuccessResponse`, `UploadErrorResponse`, `UploadKpiDelta` locally in `features/upload/types.ts` with a clear header comment marking the switch-point for plan 04-05.
- **Files modified:** `apps/frontend/src/features/upload/types.ts`
- **Verification:** `tsc --noEmit` exits 0; vitest green.
- **Committed in:** `a5eac2c` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope change. Switching to `@acm-kpi/core` is a one-line import swap tracked for plan 04-05.

## Issues Encountered

- **Vitest pool spin-up latency.** Initial `npx vitest run` invocations sat idle for 3+ minutes in the default pool; switching to `--pool=forks` (matching the STATE.md note from Phase 1) unblocked the run. Two zombie vitest processes from a prior session (`UE` state, unkillable) were ignored. Final test run: 11/11 green, 216s wall-clock dominated by `collect` time.

## User Setup Required

None.

## Next Phase Readiness

- Plan 04-03 (ProgressView): slot into the `data-testid="progress-placeholder"` div inside `UploadPage` when `state === "uploading" || state === "parsing"`. Props available from `useUpload()` return: `{ state, uploadPercent }`.
- Plan 04-04 (SuccessSummary / ErrorSummary): slot into the `success-placeholder` and `error-placeholder` divs respectively. SuccessSummary reads from `result.kpiDelta`; ErrorSummary reads from `result.errors` when `result.status === "failed"` or from the local `error` string for 403/409 paths.
- Plan 04-05 (e2e wiring): swap the local `UploadResponse` import in `features/upload/types.ts` for `@acm-kpi/core` once 04-01 is merged; add Playwright coverage for the admin-happy-path and viewer-forbidden branches.

## Self-Check

- [x] `apps/frontend/src/features/upload/types.ts` exists
- [x] `apps/frontend/src/features/upload/hooks/useUpload.ts` exists
- [x] `apps/frontend/src/features/upload/components/AdminAccessDenied.tsx` exists
- [x] `apps/frontend/src/features/upload/components/DropZone.tsx` exists
- [x] `apps/frontend/src/features/upload/components/UploadPage.tsx` exists
- [x] 3 test files in `apps/frontend/src/features/upload/__tests__/` exist
- [x] `apps/frontend/src/components/Header.tsx` contains `user?.role === "Admin"` gate
- [x] `apps/frontend/src/main.tsx` imports `UploadPage` (not `UploadStubPage`)
- [x] commit `a764abb` present in `git log`
- [x] commit `a5eac2c` present in `git log`
- [x] `npx vitest run src/features/upload/__tests__/` → 11 passed (0 failed)
- [x] `npx tsc --noEmit` → exit 0

## Self-Check: PASSED

---
*Phase: 04-upload-page*
*Completed: 2026-04-09*
