---
phase: 04-upload-page
verified: 2026-04-09T17:00:00Z
status: human_needed
score: 9/9 automated must-haves verified
human_verification:
  - test: "Run end-to-end upload flow against live stack"
    expected: "docker compose up -d && npx playwright test e2e/upload.spec.ts — both tests pass: admin upload→progress→success→dashboard, viewer denied"
    why_human: "Spec file exists and type-checks, but the plan 05 SUMMARY confirms it was never executed against a live stack. Ingest pipeline, KPI delta computation, MV refresh, and dashboard cache invalidation must be confirmed end-to-end on a running database."
  - test: "Upload a real LagBes file as Admin via browser"
    expected: "Progress bar animates 0→100, parsing spinner appears, SuccessSummary shows KPI delta with Before/After/Change columns, 'Go to Dashboard' refreshes KPIs"
    why_human: "Visual progression, React Query refetch timing, and real KPI delta values cannot be verified by grep — only by running the stack."
  - test: "Upload an invalid CSV and verify ErrorSummary"
    expected: "ErrorSummary card renders with grouped field list, scrollable detail table, 'Copy all errors' copies TSV to clipboard"
    why_human: "Clipboard API and scrollable table behavior need real browser execution."
---

# Phase 4: Upload Page Verification Report

**Phase Goal:** A dedicated `/upload` route (reached via icon button in dashboard header) accepts file drag-and-drop and file picker, shows progress during ingestion, and displays success summary or full error list.

**Verified:** 2026-04-09T17:00:00Z
**Status:** human_needed — all automated checks pass, live-stack e2e run still required
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                      | Status     | Evidence |
| -- | ---------------------------------------------------------------------------------------------------------- | ---------- | -------- |
| 1  | POST /api/v1/upload exists with Admin RBAC, concurrency guard, KPI delta                                   | ✓ VERIFIED | `apps/api/src/routes/upload.ts` lines 79–218: `requireRole('Admin', config)` preHandler, `db.select().from(imports).where(eq(imports.status,'running'))` concurrency check, `getHeadlineKpis` before/after, `buildKpiDelta` construction |
| 2  | Upload endpoint registered in Fastify server with multipart plugin                                         | ✓ VERIFIED | `apps/api/src/server.ts:2,9,34,80` — `fastifyMultipart` imported + registered with `{ fileSize: 10MB, files: 1 }`; `registerUploadRoutes(server, config)` called |
| 3  | /upload route wired to UploadPage (not UploadStubPage)                                                     | ✓ VERIFIED | `apps/frontend/src/main.tsx:12,33–36` — imports `UploadPage`, route `path="/upload"` renders `<UploadPage />`; no `UploadStubPage` reference remains |
| 4  | Header admin-only upload icon                                                                              | ✓ VERIFIED | `apps/frontend/src/components/Header.tsx:62–65` — upload `<Link to="/upload">` wrapped in `{user?.role === "Admin" && ...}` |
| 5  | DropZone with extension + size + multi-drop guards                                                         | ✓ VERIFIED | `apps/frontend/src/features/upload/components/DropZone.tsx` — `validateFile` rejects non-csv/txt with exact copy, rejects >10MB, multi-drop uses first file with warning; drag + click + keyboard handlers |
| 6  | useUpload XHR state machine (idle → uploading → parsing → success/error)                                   | ✓ VERIFIED | `apps/frontend/src/features/upload/hooks/useUpload.ts` — XHR (not fetch), upload.progress + upload.load → parsing, 403/409 branches, onerror → error state |
| 7  | ProgressView, SuccessSummary, ErrorSummary exist and are wired into UploadPage                             | ✓ VERIFIED | All three components exist; `UploadPage.tsx:17–19` imports all three; lines 70–90 render conditionally on state; no `placeholder` references remain |
| 8  | Shared DTOs in `@acm-kpi/core`                                                                             | ✓ VERIFIED | `packages/core/src/upload/types.ts` exports `UploadSuccessResponse`, `UploadErrorResponse`, `UploadResponse`, `HeadlineKpis`, `KpiDeltaField`, `UploadKpiDelta`; re-exported from `packages/core/src/index.ts`; API handler and UploadPage.tsx import from `@acm-kpi/core` |
| 9  | React Query cache invalidation on dashboard navigation with matching key                                   | ✓ VERIFIED | `SuccessSummary.tsx:108` calls `queryClient.invalidateQueries({ queryKey: ['kpi','summary'] })`; `features/kpi/queries.ts:12` defines `kpiKeys.summary() => ['kpi','summary']` — keys match exactly |
| 10 | Playwright e2e spec `e2e/upload.spec.ts` covers TEST-03 admin + viewer paths                               | ✓ VERIFIED (static) | 2 tests present (admin + viewer); `setInputFiles` used; `samples/LagBes-sample.csv` referenced; playwright.config.ts exists with baseURL 5173, testDir './e2e'; @playwright/test in root package.json |

**Score:** 10/10 automated truths verified

### Required Artifacts

| Artifact                                                              | Expected                                      | Status     | Details |
| --------------------------------------------------------------------- | --------------------------------------------- | ---------- | ------- |
| `packages/core/src/upload/types.ts`                                   | 6 exported DTOs                               | ✓ VERIFIED | 6 types exported, re-exported from `index.ts` |
| `apps/api/src/routes/upload.ts`                                       | `registerUploadRoutes` handler                | ✓ VERIFIED | Full handler with RBAC/concurrency/delta |
| `apps/api/src/routes/upload.test.ts`                                  | Integration tests                             | ⚠️ PARTIAL | 3 passing (admin_required, concurrent_rejected, ingest_source) + 3 `it.todo` (file_too_large, success_response, failure_response) deferred to e2e TEST-03 |
| `apps/api/src/kpi/helpers.ts`                                         | `getHeadlineKpis(db)`                         | ✓ VERIFIED | Exists, exports HeadlineKpis \| null reader |
| `apps/api/src/server.ts`                                              | Multipart plugin + upload route registered    | ✓ VERIFIED | Both present |
| `apps/frontend/src/features/upload/types.ts`                          | Local `UploadState`, `DropZoneProps`          | ✓ VERIFIED | Deferred switch to @acm-kpi/core noted; structurally identical |
| `apps/frontend/src/features/upload/hooks/useUpload.ts`                | XHR state machine hook                        | ✓ VERIFIED | Full implementation |
| `apps/frontend/src/features/upload/components/DropZone.tsx`           | Drag-drop + picker + guards                   | ✓ VERIFIED | All guards + a11y + keyboard |
| `apps/frontend/src/features/upload/components/UploadPage.tsx`         | Page host with state-driven rendering         | ✓ VERIFIED | Wires all 5 child components |
| `apps/frontend/src/features/upload/components/AdminAccessDenied.tsx`  | Viewer fallback card                          | ✓ VERIFIED | Exists |
| `apps/frontend/src/features/upload/components/ProgressView.tsx`       | Two-state progress (determinate + spinner)    | ✓ VERIFIED | Exists, tests green |
| `apps/frontend/src/features/upload/components/SuccessSummary.tsx`     | Green KPI delta card                          | ✓ VERIFIED | Exists, invalidates `['kpi','summary']` |
| `apps/frontend/src/features/upload/components/ErrorSummary.tsx`       | Red grouped error card                        | ✓ VERIFIED | Exists, `th scope="col"`, copy TSV |
| `apps/frontend/src/components/ui/progress.tsx`                        | shadcn progress primitive                     | ✓ VERIFIED | Exists |
| `apps/frontend/src/components/Header.tsx`                             | Admin role gate on upload Link                | ✓ VERIFIED | `user?.role === "Admin"` wrapper present |
| `apps/frontend/src/main.tsx`                                          | `/upload` → UploadPage                        | ✓ VERIFIED | UploadPage imported; UploadStubPage removed |
| `e2e/upload.spec.ts`                                                  | Playwright TEST-03 spec                       | ✓ VERIFIED | 2 tests, setInputFiles, sample file path |
| `playwright.config.ts`                                                | baseURL + testDir                             | ✓ VERIFIED | Exists |
| 6 frontend test files in `features/upload/__tests__/`                 | Unit tests                                    | ✓ VERIFIED | Header, DropZone, UploadPage, ProgressView, SuccessSummary, ErrorSummary all present |

### Key Link Verification

| From                           | To                                          | Via                                                               | Status | Details |
| ------------------------------ | ------------------------------------------- | ----------------------------------------------------------------- | ------ | ------- |
| `apps/api/src/server.ts`       | `apps/api/src/routes/upload.ts`             | `registerUploadRoutes(server, config)`                            | ✓ WIRED | Line 80 |
| `apps/api/src/server.ts`       | `@fastify/multipart`                        | `server.register(fastifyMultipart, { limits: ... })`              | ✓ WIRED | Lines 2, 34–39 |
| `apps/api/src/routes/upload.ts`| `apps/api/src/ingest/index.ts`              | `ingestLagBesFile(tmpPath, 'upload', { db, correlationId })`      | ✓ WIRED | Line 150 |
| `apps/api/src/routes/upload.ts`| `apps/api/src/kpi/helpers.ts`               | `getHeadlineKpis(db)` before + after                              | ✓ WIRED | Lines 147, 177 |
| `apps/frontend/src/main.tsx`   | `UploadPage`                                | `<Route path="/upload" element={<ProtectedRoute><UploadPage/>}`   | ✓ WIRED | Lines 12, 33–36 |
| `Header.tsx`                   | `user.role`                                 | `{user?.role === "Admin" && <Link to="/upload"...>}`              | ✓ WIRED | Lines 62–65 |
| `UploadPage.tsx`               | `user.role`                                 | `if (user.role !== 'Admin') return <AdminAccessDenied/>`          | ✓ WIRED | Lines 42–51 |
| `UploadPage.tsx`               | `DropZone` / `ProgressView` / `SuccessSummary` / `ErrorSummary` | Conditional renders on useUpload state              | ✓ WIRED | Lines 62–90 |
| `useUpload.ts`                 | `POST /api/v1/upload`                       | `xhr.open('POST', '/api/v1/upload', true); xhr.withCredentials`   | ✓ WIRED | Lines 64–65 |
| `SuccessSummary.tsx`           | `apps/frontend/src/lib/queryClient.ts`      | `queryClient.invalidateQueries({ queryKey: ['kpi','summary'] })`  | ✓ WIRED | Lines 13, 108 — key exactly matches `kpiKeys.summary()` in `features/kpi/queries.ts:12` |
| `e2e/upload.spec.ts`           | `DropZone` hidden input                     | `page.locator('input[type="file"]').setInputFiles(SAMPLE_FILE)`   | ✓ WIRED | Lines 72–73 |
| `e2e/upload.spec.ts`           | `POST /api/v1/upload`                       | Real HTTP POST via browser form submission (live stack required) | ? UNCERTAIN | Spec structure correct; live run deferred |

### Data-Flow Trace (Level 4)

| Artifact               | Data Variable           | Source                                                               | Produces Real Data | Status     |
| ---------------------- | ----------------------- | -------------------------------------------------------------------- | ------------------ | ---------- |
| `SuccessSummary.tsx`   | `result.kpiDelta`       | `UploadPage` → `useUpload.result` → XHR response → `upload.ts` handler → `buildKpiDelta(getHeadlineKpis before, after)` → Postgres MV | ✓ FLOWING (static trace) | Real SQL query path exists; requires live run to confirm MV yields non-null after first ingest |
| `ErrorSummary.tsx`     | `result.errors`         | `useUpload.result` → XHR 400 body → `upload.ts` → `ingestLagBesFile().errors` (Phase 2 pipeline) | ✓ FLOWING (static trace) | Phase 2 ingest pipeline populates errors[] on validation failure |
| `ProgressView.tsx`     | `percent`, `state`      | `useUpload.uploadPercent` via `xhr.upload.progress` event + `xhr.upload.load` → `setState('parsing')` | ✓ FLOWING | Real XHR events, not hardcoded |
| `UploadPage.tsx`       | `currentFilename`       | `handleFileSelected(file)` → `setCurrentFilename(file.name)` before `uploadFile` | ✓ FLOWING | Flows from DropZone → state → ProgressView |

### Behavioral Spot-Checks

| Behavior                                                | Command                                                       | Result                             | Status |
| ------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------- | ------ |
| e2e spec has exactly 2 tests                            | `grep -c "test(" e2e/upload.spec.ts`                          | 2                                  | ✓ PASS |
| Upload route registered                                 | `grep "registerUploadRoutes\|fastifyMultipart" server.ts`     | 4 matches                          | ✓ PASS |
| Header role gate present                                | `grep "user\?\.role.*Admin" Header.tsx`                       | 1 match                            | ✓ PASS |
| Main route swap                                         | `grep "UploadPage\|UploadStubPage" main.tsx`                  | UploadPage 2 matches, Stub 0       | ✓ PASS |
| React Query invalidation matches `kpiKeys.summary()`    | Grep `queryKey.*kpi.*summary` + kpiKeys definition            | `['kpi','summary']` in both        | ✓ PASS |
| Full upload flow against live stack (admin + viewer)    | `docker compose up -d && npx playwright test e2e/upload.spec.ts` | Not executed (plan 05 SUMMARY §"Manual run") | ? SKIP |
| API upload.test.ts suite                                | `npm -w apps/api run test -- src/routes/upload.test.ts`       | Per 04-01 SUMMARY: 3 passed, 3 todo | ✓ PASS (historical) |
| Frontend upload feature suite                           | `npm -w apps/frontend run test -- features/upload/`           | Per 04-03/04 SUMMARY: 29/29 green  | ✓ PASS (historical) |

### Requirements Coverage

| Requirement | Source Plan(s)      | Description                                                      | Status       | Evidence |
| ----------- | ------------------- | ---------------------------------------------------------------- | ------------ | -------- |
| UP-01       | 04-02               | Upload page is a separate route reachable via icon in header     | ✓ SATISFIED  | Header.tsx admin-gated Link to /upload; main.tsx /upload route |
| UP-02       | 04-02               | Drag-and-drop + file picker fallback                             | ✓ SATISFIED  | DropZone.tsx drag handlers + hidden input click |
| UP-03       | 04-02               | Accepts `.csv` and `.txt` files                                  | ✓ SATISFIED  | DropZone validateFile accepts csv/txt only; input accept=".csv,.txt" |
| UP-04       | 04-03               | Progress indicator during upload and parsing                     | ✓ SATISFIED  | ProgressView two-stage (Progress bar + Loader2 spinner) |
| UP-05       | 04-04               | Success summary with rows imported + KPI snapshot delta          | ✓ SATISFIED  | SuccessSummary with Before/After/Change grid, rows imported, duration |
| UP-06       | 04-04               | Error summary with all validation issues                         | ✓ SATISFIED  | ErrorSummary grouped list + full scrollable detail table |
| UP-07       | 04-01, 04-02        | Admin-only upload                                                | ✓ SATISFIED  | API `requireRole('Admin', config)`; frontend `user.role !== 'Admin'` → AdminAccessDenied; Header role gate |
| IN-02       | 04-01, 04-05        | SMB folder watcher (partial: shared concurrency pattern)         | ⚠️ PARTIAL  | REQUIREMENTS.md maps IN-02 → Phase 5 primarily. Phase 4 contribution is the `imports.status='running'` concurrency guard in upload.ts which the SMB watcher will reuse. Full SMB watcher behaviour is Phase 5 scope. Acceptable partial. |
| TEST-03     | 04-05               | Playwright e2e: login → upload → dashboard refresh               | ? NEEDS HUMAN | Spec exists, type-checks, discoverable via `playwright test --list`. Never executed against live stack (plan 05 SUMMARY acknowledges this; deferred to Phase 08 CI). |

All 9 declared requirement IDs accounted for. No orphaned requirements.

### Anti-Patterns Found

| File                                                 | Line    | Pattern                                                                | Severity | Impact |
| ---------------------------------------------------- | ------- | ---------------------------------------------------------------------- | -------- | ------ |
| `apps/api/src/routes/upload.test.ts`                 | 256–260 | 3 `it.todo()` stubs: file_too_large, success_response, failure_response | ℹ️ Info   | Acknowledged in 04-01 SUMMARY as deferred to e2e TEST-03 (plan 05); covered functionally by the e2e spec once executed. Not blocker because route-level tests for admin_required/concurrent_rejected/ingest_source already pass. |
| `apps/frontend/src/features/upload/types.ts`         | —       | Local `UploadResponse` DTO duplicating `@acm-kpi/core` shape            | ⚠️ Warning | Documented in 04-02 and 04-04 SUMMARYs as intentional parallel-race break. UploadPage imports the canonical types from `@acm-kpi/core` for the Success/Error summary props via `as unknown as` casts, so the contract is still satisfied at the UI boundary. Cleanup scheduled but deferred. Not a blocker. |
| `apps/frontend/src/features/upload/components/UploadPage.tsx` | 80, 87 | `as unknown as UploadSuccessResponse` / `UploadErrorResponse` double-casts | ℹ️ Info | Tied to the local-DTO decision above. Shapes are structurally identical; safe today but leaves a latent divergence risk. |

**Zero blocker anti-patterns found.** No hardcoded empty returns, no stub components, no disconnected props.

### Human Verification Required

#### 1. Playwright TEST-03 against live stack

**Test:** `docker compose up -d` (or `npm run dev`), then `npx playwright test e2e/upload.spec.ts`
**Expected:**
- Admin path: login with `test.admin` → `/upload` → DropZone visible → file input receives `samples/LagBes-sample.csv` → `role="progressbar"` becomes visible → "Parsing & validating…" text appears → "Import successful" card appears → "Total Inventory Value" label visible → "Go to Dashboard" click navigates to `/` → "ACM KPI Pro" branding visible
- Viewer path: login with `test.viewer` → `/upload` → "Admin access required" visible → no DropZone text, no file input
**Why human:** Plan 05 SUMMARY explicitly states "Manual run … not executed in this plan; would require seeded LDAP fixtures and a live dev frontend/api." Ingest → MV refresh → KPI delta → React Query invalidation chain is wired in code but has never been exercised end-to-end. Seeded LDAP credentials, database state, and timing all need a live environment.

#### 2. Visual Success/Error Summary review

**Test:** Upload a good file (Admin) and then a bad file (tamper the CSV with a non-numeric value in "Wert mit Abw." column).
**Expected:**
- Success card shows four KPI rows with green/red arrows, inverted sign for Dead Stock %
- Error card shows grouped field list sorted descending, scrollable detail table, "Copy all errors" button flips to "Copied!" for 2 s
**Why human:** Visual assertions (colors, arrow direction, scrollbar behavior, clipboard contents) cannot be verified via static grep; a real browser is needed.

#### 3. First-import null-before path

**Test:** With an empty database (no prior imports), upload the first file as Admin.
**Expected:** SuccessSummary shows only After + Change columns (Before column hidden) because `kpiBefore === null`. Dashboard navigation then displays populated KPIs.
**Why human:** The null-before branch in `SuccessSummary.tsx` and the `kpiBefore === null` branch in `upload.ts` are unit-tested in isolation, but the full first-import flow with MV refresh is end-to-end behavior.

### Gaps Summary

**No automated gaps found.** All 10 derived truths are verified at the file/wiring level:

- POST /api/v1/upload exists with full RBAC + concurrency + KPI delta implementation.
- Multipart plugin registered globally with 10 MB limit.
- /upload route wired to real UploadPage (UploadStubPage fully retired).
- Header upload icon correctly role-gated.
- All five UploadPage child components (DropZone, ProgressView, SuccessSummary, ErrorSummary, AdminAccessDenied) exist and are wired conditionally based on the useUpload state machine.
- useUpload hook correctly uses XHR (not fetch) per D-01, with proper 403/409 handling.
- Shared DTOs in `@acm-kpi/core` are imported at the API handler and UploadPage boundary.
- React Query invalidation key `['kpi','summary']` exactly matches `kpiKeys.summary()` in the dashboard query hook.
- Playwright spec exists with correct structure, setInputFiles pattern, and sample file reference.

**The only outstanding work is the live-stack execution of TEST-03 and manual visual verification of the UI flows.** This is acknowledged in the plan 05 SUMMARY and deferred per the phase-04-as-manual-start convention (Phase 08 will add a playwright webServer block for CI).

**Minor technical debt (non-blocking):**

1. Three `it.todo` stubs in `apps/api/src/routes/upload.test.ts` (file_too_large / success_response / failure_response) — acceptable because TEST-03 e2e covers the success path and the error path can be hand-tested.
2. Local `UploadResponse` DTO in `apps/frontend/src/features/upload/types.ts` still exists alongside the canonical `@acm-kpi/core` types. UploadPage already imports from `@acm-kpi/core` and casts via `as unknown as` — the cleanup is a one-file import swap scheduled but deferred.

Neither item blocks the phase goal. Recommend closing them during Phase 5 or Phase 8 hardening.

---

*Verified: 2026-04-09T17:00:00Z*
*Verifier: Claude (gsd-verifier)*
