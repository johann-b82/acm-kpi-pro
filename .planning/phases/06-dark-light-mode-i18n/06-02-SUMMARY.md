---
phase: 06-dark-light-mode-i18n
plan: "02"
subsystem: frontend-styling-i18n
tags: [css, dark-mode, i18n, i18next, wcag, fouc]
dependency_graph:
  requires: []
  provides: [dark-palette-css, kpi-status-tokens, i18next-init, locale-files-de-en, fouc-prevention]
  affects: [apps/frontend]
tech_stack:
  added: [i18next@23, react-i18next@15]
  patterns: [css-custom-properties, typed-i18next, next-themes-class-strategy]
key_files:
  created:
    - apps/frontend/src/i18n.ts
    - apps/frontend/src/locales/de.json
    - apps/frontend/src/locales/en.json
    - apps/frontend/src/__tests__/i18n.test.ts
  modified:
    - apps/frontend/src/styles/global.css
    - apps/frontend/index.html
    - apps/frontend/src/main.tsx
    - apps/frontend/package.json
decisions:
  - "i18next fallbackLng stored as array ['de'] internally — test normalizes before assertion"
  - "pnpm install ran but i18next was not hoisted to root node_modules; npm --legacy-peer-deps install required"
  - "TDD: test for fallbackLng adjusted from toBe('de') to handle array form after observing i18next internals"
metrics:
  duration_minutes: 25
  completed_date: "2026-04-10"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 8
---

# Phase 06 Plan 02: Dark palette CSS + i18next scaffold Summary

Dark mode CSS palette refined with WCAG-tuned KPI status tokens (--kpi-ok/warn/critical in both :root and .dark), FOUC prevention inline script added to index.html, i18next initialized with typed resources and feature-namespaced de.json/en.json, ThemeProvider wrapping the app root.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Dark palette CSS + KPI status tokens | `31133b6` | global.css, index.html |
| 2 | i18next scaffold + translation files + typed keys | `ecb9c09` | i18n.ts, de.json, en.json, main.tsx, package.json, i18n.test.ts |

## Verification

- `grep -c "--kpi-ok" global.css` → 2 (one in :root, one in .dark) ✓
- `grep "prefers-color-scheme" index.html` → FOUC prevention script present ✓
- Key parity check: de.json and en.json top-level keys match ✓
- `tsc --noEmit` exits 0 (typed i18next keys compile-enforced) ✓
- 8/8 vitest tests pass ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] i18next fallbackLng test expected string but received array**
- **Found during:** Task 2 TDD GREEN phase
- **Issue:** i18next normalizes `fallbackLng: "de"` to `['de']` array internally; initial test used `toBe("de")` which failed
- **Fix:** Updated test to normalize array before assertion: `const normalized = Array.isArray(fallback) ? fallback[0] : fallback`
- **Files modified:** `apps/frontend/src/__tests__/i18n.test.ts`
- **Commit:** `ecb9c09`

**2. [Rule 3 - Blocking] pnpm install did not hoist i18next to root node_modules**
- **Found during:** Task 2 GREEN phase (vitest could not resolve `i18next` import)
- **Issue:** Running `pnpm install` from workspace root did not install i18next despite it being listed in apps/frontend/package.json
- **Fix:** Ran `npm -w apps/frontend install --legacy-peer-deps` which installed into root node_modules correctly
- **Files modified:** package-lock changes (not committed — gitignored)
- **Commit:** N/A (install side-effect)

## Known Stubs

None. All locale keys have real values. No hardcoded placeholder text in the created files.

## Self-Check: PASSED

- [x] `apps/frontend/src/styles/global.css` — exists with KPI tokens
- [x] `apps/frontend/index.html` — exists with FOUC script
- [x] `apps/frontend/src/i18n.ts` — exists with typed resources
- [x] `apps/frontend/src/locales/de.json` — exists with 5 namespaces
- [x] `apps/frontend/src/locales/en.json` — exists with 5 namespaces
- [x] commit `31133b6` — verified in git log
- [x] commit `ecb9c09` — verified in git log
