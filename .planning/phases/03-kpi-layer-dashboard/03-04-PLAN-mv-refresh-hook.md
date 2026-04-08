---
phase: 03-kpi-layer-dashboard
plan: "03-04"
type: execute
wave: 2
depends_on: ["03-03"]
can_run_parallel_with: ["03-05", "03-06"]
files_modified:
  - apps/api/src/ingest/writer.ts
  - apps/api/src/ingest/writer.test.ts
autonomous: true
requirements:
  - KPI-02
  - TEST-02

must_haves:
  truths:
    - "After insertStockRowsAtomic() completes successfully, the kpi_dashboard_data MV has been refreshed atomically in the same transaction"
    - "If this is the first import (MV has 0 rows), uses non-concurrent REFRESH; for subsequent imports uses REFRESH CONCURRENTLY"
    - "If the MV refresh fails, the entire transaction rolls back and stock_rows is left untouched (Pitfall #10 still holds)"
    - "All existing writer.test.ts tests pass after the addition (regression check)"
  artifacts:
    - path: apps/api/src/ingest/writer.ts
      provides: "MV refresh hook inside insertStockRowsAtomic() transaction"
      contains: "REFRESH MATERIALIZED VIEW"
    - path: apps/api/src/ingest/writer.test.ts
      provides: "Tests asserting the refresh SQL was executed"
      exports: ["tests for mv refresh called", "tests for non-concurrent on first import"]
  key_links:
    - from: apps/api/src/ingest/writer.ts
      to: apps/api/drizzle/0002_add_kpi_dashboard_mv.sql
      via: "REFRESH MATERIALIZED VIEW kpi_dashboard_data executed on the tx handle"
---

<objective>
Wire the materialized view refresh into the existing `insertStockRowsAtomic()` function in `apps/api/src/ingest/writer.ts`. This is a Phase 2 file being extended with one logical addition authorized by CONTEXT.md.

The addition adds MV refresh as the final step inside the Drizzle transaction, after the `INSERT INTO stock_rows SELECT * FROM stock_rows_staging` promote. Because it runs inside the same transaction, a refresh failure rolls back the entire import — stock_rows and the MV remain in sync (never diverge).

The first-time pattern is critical: `REFRESH MATERIALIZED VIEW CONCURRENTLY` requires an existing unique index AND at least one row in the MV. On a fresh deployment the MV is empty, so the first refresh must use the non-concurrent form. The writer detects "first import" by checking whether the MV currently has any rows before deciding which form to use.

Purpose: Atomic KPI freshness — dashboard always reflects the latest successful import, never a prior state.

Output: Modified `apps/api/src/ingest/writer.ts` + updated `apps/api/src/ingest/writer.test.ts` with regression + new MV-refresh assertions.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-kpi-layer-dashboard/03-CONTEXT.md
@.planning/phases/03-kpi-layer-dashboard/01-RESEARCH.md

<interfaces>
<!-- Current insertStockRowsAtomic() signature — DO NOT CHANGE the public API -->
From apps/api/src/ingest/writer.ts (existing):

```typescript
export async function insertStockRowsAtomic(
  dbClient: DB,
  importId: number,
  rows: StockRow[],
): Promise<AtomicInsertResult>
```

The function currently ends with:
```typescript
  await dbClient.transaction(async (tx) => {
    // Step 1: TRUNCATE staging
    // Step 2: Batch INSERT into staging
    // Step 3: TRUNCATE live table
    // Step 4: INSERT INTO stock_rows SELECT * FROM stock_rows_staging
    await tx.execute(sql`INSERT INTO stock_rows (...) SELECT ... FROM stock_rows_staging`);
    // <-- ADD MV REFRESH HERE
  });

  return { inserted: rows.length };
```

The `sql` import already exists: `import { eq, sql } from "drizzle-orm";`

The DB type alias: `type DB = typeof db;` (injectable for tests)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add MV refresh step to insertStockRowsAtomic()</name>
  <files>apps/api/src/ingest/writer.ts, apps/api/src/ingest/writer.test.ts</files>
  <behavior>
    - Test: When insertStockRowsAtomic() is called and MV has 0 rows → tx.execute is called with SQL containing "REFRESH MATERIALIZED VIEW kpi_dashboard_data" (non-concurrent form, no CONCURRENTLY keyword)
    - Test: When insertStockRowsAtomic() is called and MV has >= 1 row → tx.execute is called with SQL containing "REFRESH MATERIALIZED VIEW CONCURRENTLY kpi_dashboard_data"
    - Test: All existing writer tests continue to pass (regression)
    - Test: If tx.execute for the MV refresh throws, insertStockRowsAtomic() propagates the error (does not swallow it)
  </behavior>
  <action>
**Step 1: Write the failing tests first (RED)**

Locate `apps/api/src/ingest/writer.test.ts`. It currently tests `createImportRecord`, `updateImportStatus`, and `insertStockRowsAtomic` with `vi.mock` for the DB.

Add a new describe block `"MV refresh hook"` with the following test cases. The tests mock the DB client and spy on `tx.execute` calls:

```typescript
describe("MV refresh hook", () => {
  it("uses non-concurrent refresh on first import (MV empty)", async () => {
    const executeCalls: string[] = [];
    const mockTx = {
      execute: vi.fn(async (sqlQuery) => {
        executeCalls.push(String(sqlQuery));
        return { rows: [] };
      }),
      insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
    };
    const mockDb = {
      transaction: vi.fn(async (fn) => fn(mockTx)),
      // Simulate MV has 0 rows (first import)
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };

    await insertStockRowsAtomic(mockDb as any, 1, []);

    const refreshCalls = executeCalls.filter(s => s.includes('REFRESH MATERIALIZED VIEW'));
    expect(refreshCalls).toHaveLength(1);
    expect(refreshCalls[0]).not.toContain('CONCURRENTLY');
    expect(refreshCalls[0]).toContain('kpi_dashboard_data');
  });

  it("uses concurrent refresh on subsequent imports (MV has rows)", async () => {
    const executeCalls: string[] = [];
    const mockTx = {
      execute: vi.fn(async (sqlQuery) => {
        executeCalls.push(String(sqlQuery));
        // Simulate MV row count check returning 1 row
        if (String(sqlQuery).includes('COUNT')) return { rows: [{ count: '1' }] };
        return { rows: [] };
      }),
      insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
    };
    const mockDb = {
      transaction: vi.fn(async (fn) => fn(mockTx)),
    };

    await insertStockRowsAtomic(mockDb as any, 1, []);

    const refreshCalls = executeCalls.filter(s => s.includes('REFRESH MATERIALIZED VIEW'));
    expect(refreshCalls).toHaveLength(1);
    expect(refreshCalls[0]).toContain('CONCURRENTLY');
    expect(refreshCalls[0]).toContain('kpi_dashboard_data');
  });
});
```

Run `cd apps/api && npm test` — tests should FAIL (RED phase).

**Step 2: Implement the MV refresh hook (GREEN)**

In `apps/api/src/ingest/writer.ts`, inside `insertStockRowsAtomic()`, add these lines after Step 4's INSERT (before the transaction closes):

```typescript
    // Step 5: Refresh the KPI materialized view (Phase 3 — KPI-02)
    // CONCURRENTLY requires the MV to have at least one row + a unique index.
    // On first import, the MV is empty — use non-concurrent refresh.
    // On subsequent imports, use concurrent so dashboard reads are not blocked.
    const mvCountResult = await tx.execute(
      sql`SELECT COUNT(*)::int AS count FROM kpi_dashboard_data`
    );
    const mvRowCount = Number((mvCountResult.rows[0] as { count: number })?.count ?? 0);

    if (mvRowCount === 0) {
      // First-time initialization: MV empty, cannot use CONCURRENTLY
      await tx.execute(sql`REFRESH MATERIALIZED VIEW kpi_dashboard_data`);
    } else {
      // Subsequent refresh: use CONCURRENTLY so dashboard reads are never blocked
      await tx.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY kpi_dashboard_data`);
    }
```

Run `cd apps/api && npm test` — all tests should PASS (GREEN phase).

**Important note on the Phase 2 file touch:** This change adds exactly one logical block (Step 5) to the existing transaction. It does NOT change the function's signature, return type, or any existing behavior. The transaction rollback guarantee (Pitfall #10) is preserved — if the MV refresh fails, the transaction rolls back and `stock_rows` is left untouched.
  </action>
  <verify>
    <automated>cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api" && npm test 2>&1 | tail -20</automated>
  </verify>
  <done>All writer tests pass including the 2 new MV refresh tests; `npm test` in apps/api exits 0; the REFRESH MATERIALIZED VIEW lines exist in writer.ts inside the transaction block</done>
</task>

</tasks>

<verification>
```bash
# Confirm the MV refresh lines are present in writer.ts
grep "REFRESH MATERIALIZED VIEW" \
  "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/src/ingest/writer.ts"
# Expected: 2 lines — one without CONCURRENTLY, one with CONCURRENTLY

# Confirm the COUNT check is present
grep "kpi_dashboard_data" \
  "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/src/ingest/writer.ts"

# Run full API test suite (regression check for Phase 2 tests)
cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api" && npm test
# Expected: All tests pass (including pre-existing Phase 2 tests)
```
</verification>

<success_criteria>
- `apps/api/src/ingest/writer.ts` contains the MV refresh block inside `insertStockRowsAtomic()`
- Both refresh forms are present: without CONCURRENTLY (first import) and with CONCURRENTLY (subsequent)
- `apps/api/src/ingest/writer.test.ts` has 2 new tests for the refresh behavior
- `cd apps/api && npm test` exits 0 (all tests pass — no Phase 2 regressions)
- The public API of `insertStockRowsAtomic()` is unchanged (same signature, same return type)
</success_criteria>

<output>
After completion, create `.planning/phases/03-kpi-layer-dashboard/03-04-SUMMARY-mv-refresh-hook.md` with:
- Exact lines added to writer.ts (line numbers)
- Number of new tests added
- Confirmation that pre-existing writer tests still pass
- Cross-phase touch documented: "writer.ts (Phase 2 file) extended in Phase 3 as authorized by CONTEXT.md"
</output>
