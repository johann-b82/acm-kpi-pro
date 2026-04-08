---
phase: 03-kpi-layer-dashboard
plan: "03-04"
subsystem: ingest
tags: [postgresql, materialized-view, transaction, kpi, writer, atomicity]
dependency_graph:
  requires:
    - apps/api/drizzle/0002_add_kpi_dashboard_mv.sql (03-03 — MV + unique index must exist)
    - apps/api/src/ingest/writer.ts (Phase 2 file being extended)
  provides:
    - MV refresh hook inside insertStockRowsAtomic() transaction
    - First-time vs subsequent refresh branching (non-concurrent / CONCURRENTLY)
  affects:
    - apps/api/src/kpi/routes.ts (Plan 03-05 — MV is now always fresh after import)
tech_stack:
  added: []
  patterns:
    - COUNT(*) check before REFRESH to detect first import (empty MV)
    - REFRESH MATERIALIZED VIEW CONCURRENTLY for subsequent imports (Pitfall #6 mitigation)
    - Non-concurrent REFRESH on first import (CONCURRENTLY requires existing row)
    - Drizzle sql`` template extraction via queryChunks for test assertions
key_files:
  created:
    - apps/api/src/ingest/__tests__/mv-refresh.test.ts
  modified:
    - apps/api/src/ingest/writer.ts
    - apps/api/src/ingest/__tests__/atomicity.test.ts
decisions:
  - Used Option A (COUNT check inside tx) for first-time detection — matches RESEARCH.md Section B and 03-03 SUMMARY pattern exactly
  - Placed COUNT + REFRESH inside the transaction (Step 5) so a refresh failure rolls back the entire import (Pitfall #10 preserved)
  - Updated existing atomicity.test.ts mocks from mockResolvedValue(undefined) to mockResolvedValue({ rows: [] }) to match actual Drizzle tx.execute() return shape
  - Added extractSql() helper in tests to read SQL text from Drizzle sql`` queryChunks (not .sql property — Drizzle stores text in queryChunks[].value[])
metrics:
  duration: "~25 minutes"
  completed: "2026-04-08"
  tasks_completed: 1
  files_created: 1
  files_modified: 2
---

# Phase 3 Plan 04: MV Refresh Hook Summary

**One-liner:** Atomic KPI MV refresh wired into `insertStockRowsAtomic()` transaction — non-concurrent on first import, CONCURRENTLY on all subsequent imports, both inside the Drizzle transaction.

## What Was Built

`apps/api/src/ingest/writer.ts` now has a Step 5 block inside the `db.transaction(async (tx) => { ... })` callback, added after the existing Step 4 (`INSERT INTO stock_rows SELECT ... FROM stock_rows_staging`).

### Exact Diff Applied to writer.ts

**Location:** Lines 314–335 (after the INSERT INTO stock_rows SELECT block, before the transaction closes)

**Before** (line 313, end of transaction):
```typescript
      FROM stock_rows_staging
    `);
  });

  return { inserted: rows.length };
```

**After:**
```typescript
      FROM stock_rows_staging
    `);

    // Step 5: Refresh the KPI materialized view (Phase 3 — KPI-02)
    // CONCURRENTLY requires the MV to have at least one existing row + a unique index.
    // On first import the MV is empty — use non-concurrent refresh.
    // On subsequent imports use CONCURRENTLY so dashboard reads are never blocked.
    const mvCountResult = await tx.execute(
      sql`SELECT COUNT(*)::int AS count FROM kpi_dashboard_data`,
    );
    const mvRowCount = Number(
      (mvCountResult.rows[0] as { count: number } | undefined)?.count ?? 0,
    );

    if (mvRowCount === 0) {
      // First-time initialisation: MV is empty, CONCURRENTLY is not available yet.
      await tx.execute(sql`REFRESH MATERIALIZED VIEW kpi_dashboard_data`);
    } else {
      // Subsequent refresh: CONCURRENTLY so dashboard reads are never blocked
      // (Pitfall #6 mitigation — dashboard freshness is unambiguous).
      await tx.execute(
        sql`REFRESH MATERIALIZED VIEW CONCURRENTLY kpi_dashboard_data`,
      );
    }
  });

  return { inserted: rows.length };
```

### First-time Refresh Pattern Chosen

**Option A: COUNT check inside the transaction.**

The writer executes `SELECT COUNT(*)::int AS count FROM kpi_dashboard_data` inside the same transaction, before the REFRESH call. If count = 0, uses non-concurrent form. If count ≥ 1, uses CONCURRENTLY.

**Why Option A?** It matches the RESEARCH.md Section B prescription and the 03-03 SUMMARY exactly. Option B (always non-concurrent) would have been simpler but wastes the Pitfall #6 mitigation for all imports after the first. Option C (try CONCURRENTLY, fall back on error) adds unnecessary error-handling complexity for a case that only happens once per fresh deployment.

### Cross-phase Touch

`apps/api/src/ingest/writer.ts` is a **Phase 2 file** extended in Phase 3 as authorized by `CONTEXT.md` (section "Where the hook lives: `apps/api/src/ingest/writer.ts`"). The function signature, return type, and all existing behavior are unchanged. One logical block (Step 5) was appended inside the transaction.

## Test Coverage

### New tests in `atomicity.test.ts` (Phase 2 regression file)

| Test name | Status |
|---|---|
| `MV refresh hook > uses non-concurrent refresh when MV has 0 rows (first import)` | PASSED |
| `MV refresh hook > uses concurrent refresh when MV has rows (subsequent import)` | PASSED |
| `MV refresh hook > propagates error if MV refresh throws (rolls back transaction)` | PASSED |
| `MV refresh hook > REFRESH is called after INSERT...SELECT (call order check)` | PASSED |

The call-order test records `INSERT_PROMOTE` and `REFRESH_MV` labels as execute calls arrive, then asserts `refreshIdx > insertIdx` — proving REFRESH happens strictly after the promote.

### New file `mv-refresh.test.ts` (dedicated MV branching tests)

| Test name | Status |
|---|---|
| `emits non-concurrent REFRESH when MV row count is 0 (first import)` | PASSED |
| `COUNT query targets kpi_dashboard_data (not another view)` | PASSED |
| `emits CONCURRENTLY REFRESH when MV row count is 1 (subsequent import)` | PASSED |
| `emits CONCURRENTLY REFRESH for any positive row count (e.g. 42)` | PASSED |
| `emits exactly one REFRESH per call regardless of row count` | PASSED |
| `refresh failure propagates — does not swallow the error` | PASSED |

### Phase 2 regression (atomicity tests)

All 5 original Phase 2 atomicity tests still pass. The existing mocks were updated from `mockResolvedValue(undefined)` to `mockResolvedValue({ rows: [] })` to match the actual Drizzle `tx.execute()` return shape — this is the correct mock shape and does not change the test assertions.

### Test count change

| Before plan | After plan |
|---|---|
| 89 tests (10 test files) | 99 tests (11 test files) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing Phase 2 test mocks to return `{ rows: [] }` instead of `undefined`**
- **Found during:** GREEN phase — after adding Step 5, 4 existing Phase 2 tests broke
- **Issue:** Tests used `execute: vi.fn().mockResolvedValue(undefined)`. Step 5 reads `mvCountResult.rows[0]`, causing `TypeError: Cannot read properties of undefined (reading 'rows')` when the mock returns `undefined`
- **Fix:** Updated 4 existing mocks to `mockResolvedValue({ rows: [] })`. With an empty `rows` array, the `?? 0` fallback in writer.ts produces `mvRowCount = 0`, taking the non-concurrent path. The test assertions are unchanged; only the mock return shape was corrected to match reality.
- **Files modified:** `apps/api/src/ingest/__tests__/atomicity.test.ts`
- **Commit:** `0913a58`

**2. [Rule 2 - Missing critical functionality] Added `extractSql()` helper for correct SQL text extraction from Drizzle template objects**
- **Found during:** RED → GREEN — new tests were passing 0 REFRESH calls
- **Issue:** Drizzle `sql\`...\`` produces an object with `queryChunks[].value[]`, not a `.sql` string property. `String(sqlObj?.sql ?? sqlObj)` yields `[object Object]` for all SQL objects, so filter predicates like `.includes("REFRESH MATERIALIZED VIEW")` never matched.
- **Fix:** Added `extractSql()` helper that walks `queryChunks[].value[]` to reconstruct the raw SQL string. Used in both `atomicity.test.ts` (new MV tests) and `mv-refresh.test.ts`.
- **Files modified:** `atomicity.test.ts`, `mv-refresh.test.ts`
- **Commit:** `0913a58`

### Out-of-scope Discovery (Deferred)

Pre-existing TypeScript build errors in `apps/api/src/services/ldap.service.ts` (`userEntry possibly undefined`, `tlsOptions` type mismatch). These existed before this plan and are unrelated to the MV refresh hook. Logged in `deferred-items.md`.

## Pitfall Mitigation Status

| Pitfall | Status |
|---|---|
| **Pitfall #6** — Dashboard freshness ambiguity | **MITIGATED** — CONCURRENTLY refresh means readers never observe a stale/locked MV during refresh |
| **Pitfall #10** — Partial import committed to live table | **PRESERVED** — refresh failure rolls back entire transaction; stock_rows left untouched |

## Self-Check: PASSED

- `apps/api/src/ingest/writer.ts` — FOUND, contains `REFRESH MATERIALIZED VIEW` (2 forms)
- `apps/api/src/ingest/__tests__/atomicity.test.ts` — FOUND, contains 4 new MV refresh tests
- `apps/api/src/ingest/__tests__/mv-refresh.test.ts` — FOUND
- Commit `0913a58` — FOUND
- `npm -w apps/api run test` → 99 tests pass, 0 failures
