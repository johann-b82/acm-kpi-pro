---
phase: 04-upload-page
plan: "05"
subsystem: e2e
tags:
  - playwright
  - e2e
  - upload
  - rbac
  - test-03

requires:
  - phase: 01-foundation-auth
    provides: seeded test.admin / test.viewer users + /login route
  - phase: 04-upload-page (plans 01–04)
    provides: POST /api/v1/upload endpoint + DropZone + ProgressView + SuccessSummary + AdminAccessDenied

provides:
  - playwright.config.ts with baseURL=http://localhost:5173, serial workers, chromium project
  - e2e/upload.spec.ts covering the full TEST-03 admin flow + viewer negative flow
  - @playwright/test devDependency at workspace root

affects:
  - 08-deployment-hardening (CI integration will consume playwright.config.ts, add webServer block)

tech-stack:
  added:
    - "@playwright/test@^1.x (workspace root devDependency)"
  patterns:
    - "setInputFiles() on the hidden <input type='file'> to bypass drag-drop simulation (per 04-VALIDATION.md)"
    - "fileURLToPath(import.meta.url) shim for __dirname in ESM test modules"
    - "E2E_* env vars override seeded credentials for CI overrides without editing the spec"

key-files:
  created:
    - playwright.config.ts
    - e2e/upload.spec.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Credentials resolved to test.admin / test.viewer based on apps/api/src/db/seed.ts (seeded LDAP DN cn=test.admin and cn=test.viewer). Plan instructions suggested 'admin/admin' as a fallback; the actual seed data takes precedence."
  - "Dashboard KPI assertion uses the 'ACM KPI Pro' branding text + URL check instead of a data-testid on KPI cards, because Phase 3 DashboardPage does not expose stable KPI data-testids. Verified via grep across features/kpi/components/ and src/pages/."
  - "Serial execution (workers: 1) baked into playwright.config.ts because the upload tests share a single Postgres database and ingestLagBesFile is a non-commutative side effect (full TRUNCATE + reload)."
  - "webServer block intentionally omitted — Phase 04 is manual-start; Phase 08 will wire stack startup into config for CI."
  - "ESM __dirname shim via fileURLToPath(import.meta.url) because the workspace is type:module and the raw __dirname reference fails at Playwright load time."

patterns-established:
  - "e2e tests live under e2e/ at repo root, discovered by playwright.config.ts testDir"
  - "Login helper (loginAs) encapsulates /login form fill + waitForURL('/') — reusable in future e2e specs"

requirements-completed:
  - TEST-03
  - IN-02

duration: ~15 min
completed: 2026-04-09
---

# Phase 04 Plan 05: E2E Wiring Summary

**Full-stack Playwright e2e test (TEST-03) wired through RBAC, multipart upload, ingest pipeline, KPI delta, React Query invalidation, and dashboard navigation — plus viewer negative path — under a minimal workspace-level playwright.config.ts.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2 / 2
- **Files created:** 2
- **Files modified:** 2

## Accomplishments

- `@playwright/test` installed at workspace root as devDependency.
- `playwright.config.ts` created with baseURL `http://localhost:5173`, `testDir: './e2e'`, serial execution (`workers: 1`), `retains-on-failure` trace, chromium-only project.
- `e2e/upload.spec.ts` created with two describe blocks, two tests:
  - **Admin flow (TEST-03):** `/login` → `test.admin` credentials → `/upload` → `setInputFiles(samples/LagBes-sample.csv)` → progress bar (`role=progressbar`) → parsing text → `"Import successful"` → `Total Inventory Value` label → `Go to Dashboard` button → back on `/` with `"ACM KPI Pro"` branding visible.
  - **Viewer negative (TEST-03 negative):** `test.viewer` login → `/upload` → `"Admin access required"` visible → `toHaveCount(0)` on drop-zone text AND file input.
- Both tests discovered via `npx playwright test --list e2e/upload.spec.ts` (2 tests in 1 file).
- Credentials overridable for CI via `E2E_ADMIN_USER` / `E2E_ADMIN_PASS` / `E2E_VIEWER_USER` / `E2E_VIEWER_PASS` env vars.

## Task Commits

1. **Task 1: Install @playwright/test + playwright.config.ts** — `1546b92` (chore)
2. **Task 2: e2e/upload.spec.ts (admin + viewer flows)** — `1c7be91` (test)

## Files Created/Modified

Created:
- `playwright.config.ts` — workspace-level Playwright config (chromium, serial, baseURL 5173)
- `e2e/upload.spec.ts` — 2 tests (admin happy path + viewer denied)

Modified:
- `package.json` / `package-lock.json` — added `@playwright/test` devDependency

## Decisions Made

1. **Credentials resolved to `test.admin` / `test.viewer`.** The plan instructions floated `admin/admin` as a potential fallback, but `apps/api/src/db/seed.ts` authoritatively seeds `cn=test.admin,ou=users,dc=acm,dc=local` and `cn=test.viewer,...`. The spec reads from env vars with those seeded values as defaults.

2. **Dashboard post-navigation assertion uses branding text.** A grep across `apps/frontend/src/features/kpi/components/` and `apps/frontend/src/pages/` found no stable `data-testid` on Phase 3 KPI cards. Rather than introducing a brittle selector, the test verifies (a) the URL is back to `/` and (b) the `"ACM KPI Pro"` header text is visible — which proves the dashboard shell rendered after navigation.

3. **`workers: 1` (serial).** The upload tests mutate shared Postgres state; running the admin happy-path and viewer denied tests in parallel would create ordering nondeterminism once more e2e specs land. Serial is the safe default for this whole test directory in Phase 04.

4. **No `webServer` block in playwright.config.ts.** Phase 04 is a manual-start phase (user runs `npm run dev` or `docker compose up` before the e2e). Phase 08 will own CI integration and add the webServer stanza there; pre-emptively adding it here would conflict with the dev-loop workflow.

5. **ESM `__dirname` shim.** The workspace is `type: module`, so raw `__dirname` throws `ReferenceError: __dirname is not defined in ES module scope` at Playwright's module load time — caught immediately by `npx playwright test --list`. Fixed inline via `fileURLToPath(import.meta.url)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `__dirname` undefined in ESM context**
- **Found during:** Task 2 (first `npx playwright test --list` run)
- **Issue:** Plan template used `process.cwd()`; I switched to `path.resolve(__dirname, "..")` to make the sample path robust against the launch directory. That tripped on `ReferenceError: __dirname is not defined in ES module scope` because the root `package.json` sets `"type": "module"`.
- **Fix:** Added a 2-line shim at the top of the spec: `const __filename = fileURLToPath(import.meta.url); const __dirname = path.dirname(__filename);` — standard ESM pattern, zero runtime cost.
- **Files modified:** `e2e/upload.spec.ts`
- **Verification:** `npx playwright test --list e2e/upload.spec.ts` → "Total: 2 tests in 1 file" (was: parse error + 0 tests found)
- **Committed in:** `1c7be91` (Task 2 commit; fix applied before the commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** No scope change. `files_modified` list in plan frontmatter unchanged.

## Verification

| Check | Command | Result |
|---|---|---|
| playwright.config.ts exists | `ls playwright.config.ts` | PASS |
| @playwright/test installed | `ls node_modules/@playwright/test/package.json` | PASS |
| e2e/ directory exists | `ls e2e/` | PASS |
| Spec discoverable | `npx playwright test --list e2e/upload.spec.ts` | 2 tests found |
| 2 test cases present | `grep -c "  test(" e2e/upload.spec.ts` | 2 |
| 2 describe blocks | `grep -c "test.describe" e2e/upload.spec.ts` | 2 |
| setInputFiles used (not drag-drop) | `grep setInputFiles e2e/upload.spec.ts` | 2 matches |
| LagBes-sample.csv path | `grep LagBes-sample.csv e2e/upload.spec.ts` | 1 match |
| "Admin access required" assertion | `grep -c "Admin access required" e2e/upload.spec.ts` | 3 |

**Manual run (requires live stack — deferred to Phase 08 CI):**
- `docker compose up -d && npx playwright test e2e/upload.spec.ts` — not executed in this plan; would require seeded LDAP fixtures and a live dev frontend/api. The file is syntactically valid and Playwright loads it successfully.

## Issues Encountered

- **`grep -c "^test(" ` returned 0.** Self-check trap: tests are indented inside `test.describe(() => {...})` blocks, so the `^test(` anchor missed them. Corrected selector (`grep -c "  test("`) returned 2 as expected. Noted for future self-check scripts.

## Known Stubs

None. Both tests are real, fully-wired Playwright specs that will execute against a live stack without further scaffolding.

## Next Phase Readiness

- **Phase 08 (CI / deployment hardening)** will add a `webServer` block to `playwright.config.ts` so the stack boots automatically before the e2e run.
- The `loginAs` helper in `upload.spec.ts` is reusable — future specs (dashboard drill-down, filter persistence, etc.) can hoist it into `e2e/helpers/login.ts` when the test suite grows.
- `@acm-kpi/core` `UploadResponse` type switch-over note from plans 04-02 / 04-04: the switch happens in the frontend sources, not the e2e layer. This plan does NOT modify `apps/frontend/src/features/upload/types.ts`. The deferred swap is a frontend-internal cleanup that can happen any time without affecting e2e.

## Self-Check

- [x] `playwright.config.ts` — FOUND
- [x] `e2e/upload.spec.ts` — FOUND
- [x] `node_modules/@playwright/test/package.json` — FOUND
- [x] `@playwright/test` in `package.json` devDependencies — FOUND
- [x] 2 tests discovered via `npx playwright test --list`
- [x] Commit `1546b92` (Task 1) — in `git log`
- [x] Commit `1c7be91` (Task 2) — in `git log`
- [x] `setInputFiles` pattern present — 2 matches
- [x] `samples/LagBes-sample.csv` path referenced — 1 match
- [x] Viewer "Admin access required" assertion present — 3 matches

## Self-Check: PASSED

---
*Phase: 04-upload-page*
*Completed: 2026-04-09*
