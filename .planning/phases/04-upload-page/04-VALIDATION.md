---
phase: 4
slug: upload-page
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit/integration) + Playwright (e2e) |
| **Config file** | `apps/api/vitest.config.ts`, `apps/frontend/vitest.config.ts`, `playwright.config.ts` (root) |
| **Quick run command** | `npm -w apps/api run test -- src/routes/upload.test.ts && npm -w apps/frontend run test -- features/upload/` |
| **Full suite command** | `npm test` |
| **E2E command** | `npx playwright test e2e/upload.spec.ts` |
| **Estimated runtime** | ~45 seconds (unit+integration) + ~20 seconds (e2e) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command for the touched workspace (api or frontend).
- **After every plan wave:** Run the full suite command (`npm test`) plus `npx playwright test e2e/upload.spec.ts` when any wave touches routes or the upload page.
- **Before `/gsd:verify-work`:** Full suite + Playwright e2e must be green.
- **Max feedback latency:** 60 seconds per task commit (quick), 120 seconds per wave (full + e2e).

---

## Per-Task Verification Map

> Task IDs will be finalised by the planner. This map binds each phase requirement to its test contract so every plan task can point at a row below.

| Req ID | Plan (expected) | Wave | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|-----------------|------|----------|-----------|-------------------|-------------|--------|
| UP-01 | 02 (frontend shell) | 1 | Upload icon rendered in `Header.tsx` only for Admin role | unit | `npm -w apps/frontend run test -- Header.test.tsx -t upload-icon` | ❌ W0 | ⬜ pending |
| UP-02 | 02 (frontend shell) | 1 | `DropZone` accepts drag-drop and click-to-browse | unit | `npm -w apps/frontend run test -- DropZone.test.tsx` | ❌ W0 | ⬜ pending |
| UP-03 | 02 (frontend shell) | 1 | Only `.csv` / `.txt` accepted; other extensions rejected inline | unit | `npm -w apps/frontend run test -- DropZone.test.tsx -t extension` | ❌ W0 | ⬜ pending |
| UP-04 | 03 (progress UI) | 2 | Determinate upload bar → indeterminate "Parsing…" spinner | unit | `npm -w apps/frontend run test -- ProgressView.test.tsx` | ❌ W0 | ⬜ pending |
| UP-05 | 04 (success view) | 2 | Success card shows row count + 4-KPI delta grid (handles null pre-import) | unit | `npm -w apps/frontend run test -- SuccessSummary.test.tsx` | ❌ W0 | ⬜ pending |
| UP-06 | 04 (error view) | 2 | Error card shows grouped list + full detail table + "Copy all errors" | unit | `npm -w apps/frontend run test -- ErrorSummary.test.tsx` | ❌ W0 | ⬜ pending |
| UP-07 | 01 (API handler) + 02 (frontend shell) | 1 | `POST /api/v1/upload` rejects Viewers with 403; `/upload` renders "Admin access required" card | integration + unit | `npm -w apps/api run test -- src/routes/upload.test.ts -t admin_required` + `npm -w apps/frontend run test -- UploadPage.test.tsx -t viewer-forbidden` | ❌ W0 | ⬜ pending |
| IN-02 | 01 (API handler) | 1 | Handler calls `ingestLagBesFile(tmpPath, 'upload')` with temp file cleanup | integration | `npm -w apps/api run test -- src/routes/upload.test.ts -t ingest_source` | ❌ W0 | ⬜ pending |
| TEST-03 | 05 (e2e + wiring) | 3 | Playwright: Admin login → drop sample file → progress → success → dashboard KPIs refresh | e2e | `npx playwright test e2e/upload.spec.ts` | ❌ W0 | ⬜ pending |
| — (concurrency) | 01 (API handler) | 1 | Second upload while `imports.status='running'` returns 409 Conflict | integration | `npm -w apps/api run test -- src/routes/upload.test.ts -t concurrent_rejected` | ❌ W0 | ⬜ pending |
| — (file size) | 01 (API handler) | 1 | >10 MB body rejected by `@fastify/multipart` limits before ingest | integration | `npm -w apps/api run test -- src/routes/upload.test.ts -t file_too_large` | ❌ W0 | ⬜ pending |
| — (a11y) | 03/04 | 2 | Progress bar has `role=progressbar` + `aria-valuenow`/`aria-busy`; cards have `aria-live=polite` | unit | `npm -w apps/frontend run test -- features/upload/ -t a11y` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Every test file referenced above is missing today. Wave 0 of Phase 4 must land:

- [ ] `apps/api/src/routes/upload.test.ts` — stubs covering UP-07, IN-02, concurrency (409), file-size (413), response DTO shape
- [ ] `apps/frontend/src/features/upload/__tests__/Header.test.tsx` — stub for UP-01 admin-only icon render
- [ ] `apps/frontend/src/features/upload/__tests__/DropZone.test.tsx` — stubs for UP-02, UP-03
- [ ] `apps/frontend/src/features/upload/__tests__/ProgressView.test.tsx` — stub for UP-04 two-stage state + a11y
- [ ] `apps/frontend/src/features/upload/__tests__/SuccessSummary.test.tsx` — stub for UP-05 (including null-before branch)
- [ ] `apps/frontend/src/features/upload/__tests__/ErrorSummary.test.tsx` — stub for UP-06 grouped list + detail table
- [ ] `apps/frontend/src/features/upload/__tests__/UploadPage.test.tsx` — stub for viewer-forbidden branch (UP-07 frontend half)
- [ ] `e2e/upload.spec.ts` — Playwright stub for TEST-03 (login → upload → dashboard refresh) + viewer negative test
- [ ] Install `@fastify/multipart@^9.4.0` in `apps/api` (Wave 0 dep)
- [ ] Install shadcn progress primitive via `npx shadcn add progress` (from `apps/frontend`) (Wave 0 dep)
- [ ] Verify `@playwright/test` is installed at repo root (install if missing)

*Vitest itself is already present in both workspaces per Phase 1–3.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drop-zone visual hover/drag states (dashed border intensity) | UI-SPEC | Subjective visual QA not worth snapshot testing | Load `/upload` as Admin, drag a file over the zone, confirm border highlights and copy changes per UI-SPEC |
| Keyboard activation of drop zone (Enter/Space opens file picker) | A11y | Playwright `setInputFiles` bypasses the button; manual keyboard check is the only honest validation | Tab to drop zone, press Enter → system file picker opens |
| "Copy all errors" clipboard integration | UP-06 | `navigator.clipboard` is flaky under headless Playwright; manual check is faster | Trigger a failing upload, click Copy, paste into a scratch buffer, confirm tab-separated rows |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
