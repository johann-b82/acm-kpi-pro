---
phase: "06"
plan: "04"
subsystem: "CI / Testing"
tags: [i18n, playwright, visual-regression, ci, parity-check]
dependency_graph:
  requires: ["06-03"]
  provides: ["TEST-04", "I18N-04"]
  affects: ["CI pipeline", "playwright e2e suite"]
tech_stack:
  added: []
  patterns:
    - "Node ESM script for CI key-parity enforcement"
    - "Playwright toHaveScreenshot for visual regression"
    - "Loop-based test matrix (locale x theme)"
key_files:
  created:
    - scripts/check-i18n-parity.mjs
    - e2e/i18n-theme.spec.ts
  modified:
    - package.json
    - playwright.config.ts
decisions:
  - "check-i18n-parity.mjs uses flattenKeys recursion — handles arbitrary nesting depth without third-party libs"
  - "toHaveScreenshot calls are loop-body (3 lines × 4 iterations = 12 runtime assertions) not unrolled — idiomatic Playwright"
  - "snapshotDir set to ./e2e/snapshots so baselines are tracked in git, not lost between runs"
  - "viewport explicitly set to 1280×720 to ensure German text (25-40% longer) renders without truncation"
metrics:
  duration_seconds: 106
  completed_date: "2026-04-09"
  tasks_completed: 2
  tasks_total: 3
  files_created: 2
  files_modified: 2
---

# Phase 06 Plan 04: CI Parity Check + Playwright Visual Regression Summary

CI i18n key-parity enforcement script (TEST-04) integrated into the lint step, plus 12-screenshot Playwright visual regression test suite covering all three main pages in both locales and both themes (I18N-04).

## Tasks Completed

### Task 1: CI parity check script + package.json integration
- **Commit:** `842a3c7`
- **Files:** `scripts/check-i18n-parity.mjs`, `package.json`
- Created `scripts/check-i18n-parity.mjs` with `flattenKeys` recursion, `process.exit(1)` on key-set divergence
- Added `check:i18n` script to `package.json`
- Extended `lint` script: `biome check . && node scripts/check-i18n-parity.mjs`
- Verified: exits 0 with "i18n keys match (53 keys)" on current matching locales; exits 1 with "ERROR: i18n key mismatch" on simulated mismatch (test key added then reverted)

### Task 2: Playwright visual regression tests
- **Commit:** `9a83cf0`
- **Files:** `e2e/i18n-theme.spec.ts`, `playwright.config.ts`
- Created `e2e/i18n-theme.spec.ts` with 12 visual assertions (3 pages × 2 locales × 2 themes)
- Helpers: `loginAs`, `setLocale` (acm_lang cookie), `setTheme` (next-themes html class), `assertGermanStrings`, `assertEnglishStrings`, `assertNoTruncation`
- `assertNoTruncation` checks no button scrollWidth > clientWidth (I18N-04 enforcement)
- Updated `playwright.config.ts`: added `snapshotDir: './e2e/snapshots'`, set `viewport: { width: 1280, height: 720 }`
- Stack must be running; first run requires `--update-snapshots` to generate the 12 PNG baselines

### Task 3: Human verification (checkpoint — pending)
- Full Phase 6 feature set: dark/light theme persistence, DE/EN locale toggle, German formatting, no layout truncation, dark mode contrast

## Deviations from Plan

None — plan executed exactly as written. The loop-based test structure was specified in the plan's action template.

## Known Stubs

None. The parity script operates on real locale files. Screenshot tests require a live stack for baseline generation — this is intentional per plan design (Phase 08 will add webServer for CI automation).

## Self-Check: PASSED

- `scripts/check-i18n-parity.mjs` exists and contains `process.exit(1)` and `flattenKeys`
- `node scripts/check-i18n-parity.mjs` exits 0 (verified)
- `package.json` contains `"check:i18n"` and updated `"lint"` script
- `e2e/i18n-theme.spec.ts` exists with 3 `toHaveScreenshot` calls (12 runtime assertions via loops)
- `playwright.config.ts` has `snapshotDir` and `viewport: { width: 1280, height: 720 }`
- Commits 842a3c7 and 9a83cf0 exist in git log
