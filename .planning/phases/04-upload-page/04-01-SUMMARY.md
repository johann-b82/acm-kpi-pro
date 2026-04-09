---
phase: 04-upload-page
plan: "01"
subsystem: api

tags:
  - fastify
  - multipart
  - upload
  - rbac
  - kpi-delta
  - ingest
  - typescript

requires:
  - phase: 01-foundation-auth
    provides: requireRole RBAC middleware + iron-session cookie auth
  - phase: 02-csv-ingestion-core
    provides: ingestLagBesFile orchestrator with opts.db injection + imports audit table
  - phase: 03-kpi-layer-dashboard
    provides: kpi_dashboard_data materialised view with total_value_eur / days_on_hand / stockouts / devaluation columns

provides:
  - POST /api/v1/upload endpoint (Admin-only, multipart, 10 MB limit)
  - UploadSuccessResponse / UploadErrorResponse / UploadResponse DTOs shared via @acm-kpi/core
  - HeadlineKpis / KpiDeltaField / UploadKpiDelta DTOs for before/after delta contract
  - getHeadlineKpis(db) helper for upload + future diagnostic endpoints
  - 409 concurrency guard against imports.status='running'
  - Wave 0 test stubs (vi.todo) for file_too_large + success/failure shapes (plan 05)

affects:
  - 04-02-frontend-scaffold (consumes UploadResponse DTOs in Upload page)
  - 04-03-progress-ui (needs backend endpoint online for manual testing)
  - 04-04-success-error-views (renders UploadKpiDelta + UploadErrorResponse.errors[])
  - 04-05-e2e-wiring (writes the success_response/failure_response e2e tests)
  - 05-smb-folder-watcher (shares ingestLagBesFile concurrency pattern)

tech-stack:
  added:
    - "@fastify/multipart@^9.4.0"
  patterns:
    - "Shared DTO contract in @acm-kpi/core consumed by both apps/api and apps/frontend"
    - "Concurrency guard via SELECT imports WHERE status='running' before body parsing"
    - "Before/after KPI snapshot pattern for delta computation without touching MV refresh logic"
    - "@fastify/multipart auto-cleanup of temp files (no explicit finally block required in v9)"

key-files:
  created:
    - packages/core/src/upload/types.ts
    - apps/api/src/routes/upload.ts
    - apps/api/src/routes/upload.test.ts
    - apps/api/src/kpi/helpers.ts
  modified:
    - packages/core/src/index.ts
    - apps/api/src/server.ts
    - apps/api/package.json
    - package-lock.json

key-decisions:
  - "Multipart plugin registered globally in server.ts (not per-route) so the 10 MB fileSize limit applies uniformly and @fastify/multipart v9 auto-cleans temp files"
  - "KPI delta computed in the handler (not inside ingest) to keep ingestLagBesFile feed-agnostic and avoid coupling Phase 2 to Phase 3 MV shape"
  - "Viewer 403 test sends empty body (content-length:0) instead of a real multipart payload because RBAC preHandler runs before body parsing and a streaming body would hang fastify.inject after the short-circuit"
  - "getHeadlineKpis lives in apps/api/src/kpi/helpers.ts (not kpi/routes.ts) to avoid a circular import when the upload route imports it alongside db"
  - "Pre-existing tsc errors in ldap.service.ts + ldap.service.test.ts + ingest/__tests__/* are OUT OF SCOPE; logged to deferred-items.md. Vitest passes because it skips unrelated files in targeted runs."

patterns-established:
  - "Pattern: Shared contract DTOs live in packages/core/src/<feature>/types.ts and are re-exported from index.ts as `export type { ... } from './<feature>/types.js'`"
  - "Pattern: Upload-style routes register as `registerXxxRoutes(server, config)` after existing route registrations in server.ts"
  - "Pattern: Fastify multipart tests use hand-crafted RFC 7578 bodies (no form-data dev-dep) and mock db.select via a thenable chain helper"

requirements-completed:
  - UP-07
  - IN-02

duration: ~30 min
completed: 2026-04-09
---

# Phase 04 Plan 01: API Endpoint Summary

**POST /api/v1/upload Fastify route with Admin RBAC, imports.running concurrency guard, @fastify/multipart 10 MB file-size gate, and before/after headline-KPI delta computation — all wired through shared @acm-kpi/core DTOs.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-04-09T13:20:00Z
- **Completed:** 2026-04-09T13:51:00Z
- **Tasks:** 2 / 2
- **Files created:** 4
- **Files modified:** 4

## Accomplishments

- `POST /api/v1/upload` endpoint returns 403 for Viewer (RBAC short-circuits before body parse), 409 when an import is already running, 400 + `UploadErrorResponse` on ingest validation failure, and 200 + `UploadSuccessResponse` with a full before/after `UploadKpiDelta` on success.
- `packages/core/src/upload/types.ts` establishes the authoritative contract shared with the frontend (`UploadSuccessResponse`, `UploadErrorResponse`, `UploadResponse`, `HeadlineKpis`, `KpiDeltaField`, `UploadKpiDelta`).
- `apps/api/src/kpi/helpers.ts` provides a narrow `getHeadlineKpis(db)` reader against `kpi_dashboard_data` MV that returns `null` on first import and otherwise maps the 4 headline numbers safely across string/number/jsonb Postgres returns.
- `@fastify/multipart@^9.4.0` registered globally in `server.ts` with `{ fileSize: 10 MB, files: 1 }` — upload handler relies on plugin-level throws for oversize bodies and auto-cleanup of temp files.
- Vitest integration tests for `admin_required`, `concurrent_rejected`, and `ingest_source` all pass (3 green, 3 `vi.todo` for plan 05 e2e).
- Pino structured audit logs emitted at `upload_received` / `upload_rejected_concurrent` / `upload_rejected_too_large` / `upload_done` / `upload_failed` with `correlationId` + `filename` + `durationMs` + `rowsInserted`/`errorCount` (OBS-01).

## Task Commits

1. **Task 1: Wave 0 — Install deps + shared DTOs + test stubs** — `fdf5ac6` (feat)
2. **Task 2: Upload route handler + KPI helper + server registration** — `253b1ce` (feat)

## Files Created/Modified

- `packages/core/src/upload/types.ts` (created) — 6 shared DTOs for the upload contract.
- `packages/core/src/index.ts` (modified) — re-exports all upload types from `@acm-kpi/core`.
- `apps/api/src/kpi/helpers.ts` (created) — `getHeadlineKpis(db)` MV reader returning `HeadlineKpis | null`.
- `apps/api/src/routes/upload.ts` (created) — `registerUploadRoutes()` with RBAC, concurrency guard, ingest call, KPI delta, pino logs.
- `apps/api/src/routes/upload.test.ts` (created) — 3 real integration tests + 3 `vi.todo` stubs.
- `apps/api/src/server.ts` (modified) — register `@fastify/multipart` plugin + call `registerUploadRoutes`.
- `apps/api/package.json` / `package-lock.json` (modified) — new `@fastify/multipart@^9.4.0` dep.

## Decisions Made

- **Multipart registered globally, not per-route.** Mirrors the existing `fastifyCookie` pattern, keeps the 10 MB limit applied everywhere upload flows land, and lets the plugin's v9 auto-cleanup do its job without an explicit `finally` block in the handler.
- **KPI delta computed in the handler.** `ingestLagBesFile` stays feed-agnostic per the Phase 2 contract; the handler snapshots before + after via `getHeadlineKpis(db)` and constructs `UploadKpiDelta` locally.
- **`getHeadlineKpis` in `kpi/helpers.ts`, not `kpi/routes.ts`.** Importing from `routes.ts` would drag the whole route registration into `upload.ts` and risk a circular module graph.
- **Viewer 403 test uses empty body.** RBAC preHandler short-circuits before `saveRequestFiles()`. Sending a real multipart body made `fastify.inject` hang waiting for the stream to drain (5 s timeout). An empty POST with a `multipart/form-data` header is enough to prove role enforcement.
- **Hand-crafted multipart body in tests.** Avoids pulling in `form-data` as a dev-dep for a single use case. RFC 7578 format is short enough to inline.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Viewer 403 test hung when posting a real multipart body**
- **Found during:** Task 2 (test implementation)
- **Issue:** `admin_required` test timed out at 5 s. Root cause: the RBAC `preHandler` short-circuits with 403 before `@fastify/multipart` consumes the body, leaving the inject stream unread. Fastify then waits for the body to drain and never resolves.
- **Fix:** Viewer test now sends `payload: ""` with `content-length: 0`. This still exercises the route (Fastify still dispatches to the handler) but avoids the stream-drain deadlock. Documented in inline comment.
- **Files modified:** `apps/api/src/routes/upload.test.ts`
- **Verification:** `npm -w apps/api run test -- src/routes/upload.test.ts` → 3 passed, 3 todo, 0 failed.
- **Committed in:** `253b1ce` (Task 2 commit)

**2. [Rule 3 - Blocking] Removed bogus `multipart.ajvFilePlugin` type-guard**
- **Found during:** Task 2 (upload.ts initial draft)
- **Issue:** Initial draft referenced `multipart.ajvFilePlugin` in an `instanceof` check for `RequestFileTooLargeError`. `ajvFilePlugin` is not a constructor — it would have blown up at runtime.
- **Fix:** Replaced with `e.constructor?.name === "RequestFileTooLargeError"` fallback alongside the `FST_REQ_FILE_TOO_LARGE` / `FST_FILES_LIMIT` error codes. Dropped the unused `multipart` default import.
- **Files modified:** `apps/api/src/routes/upload.ts`
- **Verification:** `upload.ts` imports build cleanly under vitest; no references to `ajvFilePlugin`.
- **Committed in:** `253b1ce` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes strictly correctness. No scope creep — `files_modified` list in plan frontmatter unchanged.

## Issues Encountered

- **Pre-existing tsc errors in unrelated files.** `npx tsc --build` surfaces 22 errors across `src/services/ldap.service.ts`, `src/__tests__/ldap.service.test.ts`, `src/ingest/__tests__/atomicity.test.ts`, and `src/ingest/__tests__/mv-refresh.test.ts`. None of these files are in the `files_modified` list of this plan, and `grep "upload\|helpers\|server.ts" tsc-output` returns zero hits. Logged to `.planning/phases/04-upload-page/deferred-items.md`. Vitest runs for the upload route pass because they target the file directly and Vite's resolver does not traverse these broken modules.
- **Background `tsc --build` process hung once.** A stale `tsc --build` process from an earlier Claude Code session held a lock on `tsconfig.tsbuildinfo`. Killed the stuck PIDs, removed the tsbuildinfo file, re-ran cleanly.

## Known Stubs

- `apps/api/src/routes/upload.test.ts` — 3 `vi.todo` cases (`file_too_large`, `success_response`, `failure_response`) intentionally deferred to plan 05 per Task 2 `<action>` guidance. They require a real fixture file + the live ingest pipeline which is outside this plan's scope.

## Next Phase Readiness

- **Plan 04-02** (`frontend-scaffold`) can now import `UploadResponse`, `UploadSuccessResponse`, `UploadErrorResponse`, `HeadlineKpis`, and `UploadKpiDelta` from `@acm-kpi/core` without any further backend work.
- **Plan 04-03 / 04-04** (UI plans) can hit `POST /api/v1/upload` against a running `apps/api` dev server as soon as the frontend scaffold is in place.
- **Plan 04-05** (e2e wiring) will replace the 3 `vi.todo` stubs with real integration tests using a LagBes fixture.
- **Blocker on unrelated tsc errors:** tracked in `deferred-items.md`; does not block phase 04 because `apps/api` is executed via `tsx` (dev) + vitest (tests), both of which bypass the broken files.

## Self-Check

- [x] `packages/core/src/upload/types.ts` — FOUND
- [x] `packages/core/src/index.ts` re-export lines — FOUND
- [x] `apps/api/src/kpi/helpers.ts` — FOUND
- [x] `apps/api/src/routes/upload.ts` — FOUND
- [x] `apps/api/src/routes/upload.test.ts` — FOUND
- [x] `apps/api/src/server.ts` multipart + registerUploadRoutes — FOUND
- [x] Commit `fdf5ac6` (Task 1) — FOUND
- [x] Commit `253b1ce` (Task 2) — FOUND
- [x] `npm -w packages/core run build` — exit 0
- [x] `npm -w apps/api run test -- src/routes/upload.test.ts` — 3 passed, 3 todo

## Self-Check: PASSED

---
*Phase: 04-upload-page*
*Completed: 2026-04-09*
