---
status: partial
phase: 04-upload-page
source: [04-VERIFICATION.md]
started: 2026-04-09T17:00:00Z
updated: 2026-04-09T17:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Run end-to-end upload flow against live stack
expected: `docker compose up -d && npx playwright test e2e/upload.spec.ts` — both tests pass: admin upload → progress → success → dashboard, viewer denied
result: [pending]

### 2. Upload a real LagBes file as Admin via browser
expected: Progress bar animates 0→100, parsing spinner appears, SuccessSummary shows KPI delta with Before/After/Change columns, "Go to Dashboard" refreshes KPIs
result: [pending]

### 3. Upload an invalid CSV and verify ErrorSummary
expected: ErrorSummary card renders with grouped field list, scrollable detail table, "Copy all errors" copies TSV to clipboard
result: [pending]

### 4. First-import null-before path
expected: Upload into an empty DB — SuccessSummary hides the Before column (null-before handling)
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
