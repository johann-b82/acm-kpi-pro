---
phase: 02-csv-ingestion-core
plan: "02-05"
slug: db-writer-atomic-swap
type: execute
wave: 2
depends_on: ["02-02"]
can_run_parallel_with: ["02-04"]
files_modified:
  - apps/api/src/ingest/writer.ts
  - apps/api/src/ingest/__tests__/atomicity.test.ts
autonomous: true
requirements:
  - IN-09
  - IN-10

must_haves:
  truths:
    - "A successful write inserts all rows into stock_rows_staging then atomically replaces stock_rows via TRUNCATE+INSERT in a single Drizzle transaction"
    - "If the DB throws mid-insert (e.g. unique violation), the transaction rolls back and stock_rows is untouched"
    - "insertStockRowsAtomic() accepts batches and handles 500-row batches for IN-12 performance"
    - "updateImportStatus() updates the imports row with status + finishedAt + optional errorMessage"
    - "All writer tests pass without Docker (vi.mock for DB)"
  artifacts:
    - path: apps/api/src/ingest/writer.ts
      provides: "insertStockRowsAtomic(), updateImportStatus(), createImportRecord()"
      exports: ["insertStockRowsAtomic", "updateImportStatus", "createImportRecord"]
    - path: apps/api/src/ingest/__tests__/atomicity.test.ts
      provides: "Rollback tests — mock DB throws mid-insert, asserts stock_rows untouched"
      contains: "rollback"
  key_links:
    - from: apps/api/src/ingest/writer.ts
      to: apps/api/src/db/schema.ts
      via: "imports drizzle stockRows, stockRowsStaging, imports tables"
      pattern: "stockRowsStaging"
    - from: apps/api/src/ingest/writer.ts
      to: apps/api/src/db/index.ts
      via: "imports { db } from '../db/index.js'"
      pattern: "db.transaction"
---

<objective>
Implement the database writer that batches validated rows into `stock_rows_staging` and
performs the atomic swap (`BEGIN; TRUNCATE stock_rows; INSERT INTO stock_rows SELECT * FROM
stock_rows_staging; COMMIT;`). Write rollback unit tests using `vi.mock` — no Docker needed.

Purpose: Pitfall #10 (partial import corruption) is fully gated here. The orchestrator
in Plan 02-06 calls these functions without knowing about transactions.

Output: `apps/api/src/ingest/writer.ts` + `atomicity.test.ts`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/02-csv-ingestion-core/01-RESEARCH.md
@apps/api/src/db/schema.ts
@apps/api/src/db/index.ts

<interfaces>
<!-- From 02-02 (schema.ts): -->
```typescript
// Drizzle table references writer.ts needs:
import { stockRows, stockRowsStaging, imports } from "../db/schema.js";

// Insert type inferred by Drizzle:
type StockRowStagingInsert = typeof stockRowsStaging.$inferInsert;
```

<!-- From 02-04 (schema.ts): -->
```typescript
// StockRow is the Zod-transformed output shape (camelCase fields).
// writer.ts receives StockRow[] and maps to StockRowStagingInsert[].
import type { StockRow } from "./schema.js";
```

<!-- From 02-03 (packages/core): -->
```typescript
import type { IngestResult } from "@acm-kpi/core";
```

<!-- Drizzle transaction pattern (ORM wraps pg): -->
```typescript
import { db } from "../db/index.js";

// db.transaction() auto-rolls back on thrown error:
await db.transaction(async (tx) => {
  await tx.insert(someTable).values([...]);
  throw new Error("oops"); // → automatic ROLLBACK
});
```

<!-- Drizzle raw SQL for TRUNCATE and INSERT … SELECT: -->
```typescript
import { sql } from "drizzle-orm";
await tx.execute(sql`TRUNCATE TABLE stock_rows RESTART IDENTITY CASCADE`);
await tx.execute(sql`
  INSERT INTO stock_rows
  SELECT * FROM stock_rows_staging
`);
```

<!-- mocks.ts is already created by 02-04 Task 1: -->
```typescript
// apps/api/src/ingest/__tests__/mocks.ts exports:
export function createMockTx(overrides?) { ... }
export function createMockDb(txResult?)  { ... }
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write atomicity.test.ts (RED phase — mock DB, no Docker)</name>
  <files>apps/api/src/ingest/__tests__/atomicity.test.ts</files>
  <behavior>
    Tests run and FAIL with "Cannot find module '../writer.js'" until Task 2 creates
    `writer.ts`. After Task 2, ALL tests pass.
  </behavior>
  <action>
    Create `apps/api/src/ingest/__tests__/atomicity.test.ts`:

    ```typescript
    import { describe, test, expect, vi, beforeEach } from "vitest";

    // Mock the DB module so no live Postgres is required (Pitfall #10 test strategy)
    vi.mock("../../../db/index.js", () => ({
      db: {
        transaction: vi.fn(),
        insert: vi.fn(),
      },
    }));

    import { db } from "../../../db/index.js";
    import {
      insertStockRowsAtomic,
      createImportRecord,
      updateImportStatus,
    } from "../writer.js";
    import type { StockRow } from "../schema.js";

    // Minimal valid StockRow for testing
    const makeRow = (artikelnr: string): StockRow => ({
      artikelnr,
      typ: "ART",
      bezeichnung1: "Test",
      bezeichnung2: null,
      bezeichnung3: null,
      bezeichnung4: null,
      bezeichnung5: null,
      bezeichnung6: null,
      wgr: null,
      prodgrp: null,
      wareneingangskonto: null,
      bestandskonto: null,
      lagername: "HAUPTLAGER NEU",
      bestandLagereinheit: 10,
      lagEinh: "STK",
      bestandBasiseinheit: 10,
      einh: "STK",
      preis: 1.5,
      proMenge: 1,
      wert: 15,
      abwertProzent: 0,
      wertMitAbw: 15,
      durchVerbr: 0,
      reichwMon: 0,
      letztZugang: null,
      letztZugangFa: null,
      stammlager: null,
      stammstellplatz: null,
      umsatzMeJ: 0,
      umsatzMeVj: 0,
      lieferant: null,
      lagerbD: 0,
      auftragM: 0,
      reservM: 0,
      bestellM: 0,
      faMenge: 0,
      bedarfM: 0,
      oVerbrauchM: 0,
      lEkAm: null,
      produktgruppe: null,
      stmUniA01: null,
      lagerzugangDat: null,
      lagerabgangDat: null,
      lagerabgangLetztesJahr: 0,
      lagerabgangLetztes12Jahr: 0,
      lagerzugangLetztes12Jahr: 0,
      gelöscht: "N",
      erfDatum: null,
      eingrenzungVon: null,
      eingrenzungBis: null,
      inventurgruppe: null,
      abcKennzVk: "C",
      rawRow: null,
    });

    describe("insertStockRowsAtomic — Pitfall #10 atomicity", () => {
      beforeEach(() => {
        vi.clearAllMocks();
      });

      test("calls db.transaction()", async () => {
        const mockTransaction = vi.fn().mockResolvedValue({ inserted: 2 });
        vi.mocked(db).transaction = mockTransaction;

        const rows = [makeRow("A1"), makeRow("A2")];
        await insertStockRowsAtomic(db as any, 1, rows);

        expect(mockTransaction).toHaveBeenCalledOnce();
      });

      test("on DB error mid-insert, throws and does NOT resolve with success", async () => {
        // Simulate DB throwing inside the transaction callback
        vi.mocked(db).transaction = vi.fn().mockImplementation(async (cb: any) => {
          // Start callback but throw before commit (simulates mid-insert failure)
          const fakeTx = {
            insert: vi.fn().mockReturnValueOnce({
              values: vi.fn().mockResolvedValue([]), // first batch succeeds
            }).mockReturnValueOnce({
              values: vi.fn().mockRejectedValue(new Error("DB constraint violation")), // second fails
            }),
            execute: vi.fn().mockResolvedValue(undefined),
          };
          return cb(fakeTx); // Drizzle propagates the rejection → auto-rollback
        });

        const rows = [makeRow("A1"), makeRow("A2"), makeRow("A3")];
        await expect(insertStockRowsAtomic(db as any, 1, rows)).rejects.toThrow(
          "DB constraint violation"
        );
      });

      test("inserts rows in batches of 500", async () => {
        const insertCalls: number[] = [];
        vi.mocked(db).transaction = vi.fn().mockImplementation(async (cb: any) => {
          const fakeTx = {
            insert: vi.fn().mockReturnValue({
              values: vi.fn().mockImplementation((vals: unknown[]) => {
                insertCalls.push((vals as any[]).length);
                return Promise.resolve([]);
              }),
            }),
            execute: vi.fn().mockResolvedValue(undefined),
          };
          return cb(fakeTx);
        });

        // 1200 rows → expect 3 batches: 500, 500, 200
        const rows = Array.from({ length: 1200 }, (_, i) => makeRow(`ART_${i}`));
        await insertStockRowsAtomic(db as any, 1, rows);

        // First insert call is for staging (3 batches: 500+500+200),
        // then TRUNCATE + INSERT…SELECT (those use execute, not insert).
        // Staging insert calls:
        const stagingBatches = insertCalls.slice(0, 3);
        expect(stagingBatches).toEqual([500, 500, 200]);
      });

      test("zero rows: transaction still runs (truncates staging + live, no insert)", async () => {
        let txCalled = false;
        vi.mocked(db).transaction = vi.fn().mockImplementation(async (cb: any) => {
          txCalled = true;
          const fakeTx = {
            insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
            execute: vi.fn().mockResolvedValue(undefined),
          };
          return cb(fakeTx);
        });

        await insertStockRowsAtomic(db as any, 1, []);
        expect(txCalled).toBe(true);
      });
    });

    describe("createImportRecord", () => {
      test("inserts a 'running' import row and returns its id", async () => {
        const mockInsert = vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 42 }]),
          }),
        });
        vi.mocked(db).insert = mockInsert;

        const id = await createImportRecord(db as any, {
          filename: "LagBes-sample.csv",
          source: "cli",
        });

        expect(id).toBe(42);
        expect(mockInsert).toHaveBeenCalledOnce();
      });
    });

    describe("updateImportStatus", () => {
      test("updates the import row with success status and finishedAt", async () => {
        const mockUpdate = vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        });
        // db.update() mock
        (db as any).update = mockUpdate;

        await updateImportStatus(db as any, 42, {
          status: "success",
          rowCount: 12,
          finishedAt: new Date(),
        });

        expect(mockUpdate).toHaveBeenCalledOnce();
      });
    });
    ```
  </action>
  <verify>
    <automated>npm -w apps/api test -- --reporter=verbose atomicity 2>&1 | grep -E "Cannot find module|FAIL|Error" | head -5 && echo "RED phase — missing writer.ts (expected)"</automated>
  </verify>
  <done>
    `atomicity.test.ts` exists. Test run shows module-not-found error for `../writer.js`
    (correct RED state). No syntax errors in the test file itself.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement writer.ts with batch insert + TRUNCATE+INSERT atomic swap (GREEN phase)</name>
  <files>apps/api/src/ingest/writer.ts</files>
  <behavior>
    After implementation, `npm -w apps/api test -- atomicity` passes all tests.
    The three exported functions behave exactly as tested in Task 1.
  </behavior>
  <action>
    Create `apps/api/src/ingest/writer.ts`. Implement three exported functions:

    **`createImportRecord(db, { filename, source }): Promise<number>`**
    - Inserts a new row into `imports` with `status='running'`, `startedAt=new Date()`,
      `source=source`.
    - Returns the generated `id`.
    - Use `.returning({ id: imports.id })` to get the ID back from Drizzle.

    **`updateImportStatus(db, importId, { status, rowCount, finishedAt, errorMessage? }): Promise<void>`**
    - Updates the `imports` row for `importId` with the new status, rowCount, finishedAt,
      and optional errorMessage.
    - Use Drizzle `db.update(imports).set({...}).where(eq(imports.id, importId))`.

    **`insertStockRowsAtomic(db, importId, rows: StockRow[]): Promise<{ inserted: number }>`**
    - Wraps the entire operation in `db.transaction()`.
    - Inside the transaction (`tx`):
      1. TRUNCATE `stock_rows_staging` (clean slate):
         ```typescript
         await tx.execute(sql`TRUNCATE TABLE stock_rows_staging RESTART IDENTITY`);
         ```
      2. Batch INSERT into `stock_rows_staging` (500 rows per batch):
         ```typescript
         const BATCH = 500;
         for (let i = 0; i < rows.length; i += BATCH) {
           const batch = rows.slice(i, i + BATCH).map(r => toStagingInsert(r, importId));
           if (batch.length > 0) {
             await tx.insert(stockRowsStaging).values(batch);
           }
         }
         ```
      3. Atomic swap — TRUNCATE live table then INSERT from staging:
         ```typescript
         await tx.execute(sql`TRUNCATE TABLE stock_rows RESTART IDENTITY CASCADE`);
         await tx.execute(sql`
           INSERT INTO stock_rows (
             import_id, artikelnr, typ, bezeichnung_1, bezeichnung_2, bezeichnung_3,
             bezeichnung_4, bezeichnung_5, bezeichnung_6, wgr, prodgrp,
             wareneingangskonto, bestandskonto, lagername,
             bestand_lagereinheit, lag_einh, bestand_basiseinheit, einh,
             preis, pro_menge, wert, abwert_prozent, wert_mit_abw,
             durch_verbr, reichw_mon, letzt_zugang, letzt_zugang_fa,
             stammlager, stammstellplatz,
             umsatz_me_j, umsatz_me_vj, lieferant, lagerb_d, auftrag_m, reserv_m,
             bestell_m, fa_menge, bedarf_m, o_verbrauch_m, l_ek_am, produktgruppe,
             stm_uni_a01, lagerzugang_dat, lagerabgang_dat,
             lagerabgang_letztes_jahr, lagerabgang_letztes_12_jahr,
             lagerzugang_letztes_12_jahr, geloescht, erf_datum,
             eingrenzung_von, eingrenzung_bis, inventurgruppe, abc_kennz_vk, raw_row
           )
           SELECT
             import_id, artikelnr, typ, bezeichnung_1, bezeichnung_2, bezeichnung_3,
             bezeichnung_4, bezeichnung_5, bezeichnung_6, wgr, prodgrp,
             wareneingangskonto, bestandskonto, lagername,
             bestand_lagereinheit, lag_einh, bestand_basiseinheit, einh,
             preis, pro_menge, wert, abwert_prozent, wert_mit_abw,
             durch_verbr, reichw_mon, letzt_zugang, letzt_zugang_fa,
             stammlager, stammstellplatz,
             umsatz_me_j, umsatz_me_vj, lieferant, lagerb_d, auftrag_m, reserv_m,
             bestell_m, fa_menge, bedarf_m, o_verbrauch_m, l_ek_am, produktgruppe,
             stm_uni_a01, lagerzugang_dat, lagerabgang_dat,
             lagerabgang_letztes_jahr, lagerabgang_letztes_12_jahr,
             lagerzugang_letztes_12_jahr, geloescht, erf_datum,
             eingrenzung_von, eingrenzung_bis, inventurgruppe, abc_kennz_vk, raw_row
           FROM stock_rows_staging
         `);
         ```
    - Returns `{ inserted: rows.length }`.
    - If any step throws, `db.transaction()` auto-rolls back (Drizzle wraps `pg` ROLLBACK).

    **`toStagingInsert(row: StockRow, importId: number): StockRowStagingInsert`**
    - Private helper that maps a `StockRow` (camelCase) to the Drizzle insert type.
    - Converts `Date` values to ISO string (Drizzle's `date` type takes strings for `pg`).
    - Example:
      ```typescript
      return {
        importId,
        artikelnr: row.artikelnr,
        typ: row.typ,
        bezeichnung1: row.bezeichnung1,
        // ... all 52 fields
        letztZugang: row.letztZugang?.toISOString().split("T")[0] ?? null,
        erfDatum:    row.erfDatum?.toISOString().split("T")[0] ?? null,
        // numeric fields: pass as-is (Drizzle coerces numbers to pg numeric strings)
        bestandLagereinheit: row.bestandLagereinheit?.toString() ?? null,
        preis: row.preis?.toString() ?? null,
        wert: row.wert?.toString() ?? null,
        // ...
      };
      ```

    **Import requirements:**
    ```typescript
    import { eq, sql } from "drizzle-orm";
    import { stockRows, stockRowsStaging, imports } from "../db/schema.js";
    import type { StockRow } from "./schema.js";
    ```

    **Type for db parameter:**
    Use `typeof db` (import the singleton) OR define a minimal interface. Simplest approach:
    ```typescript
    import { db } from "../db/index.js";
    type DB = typeof db;
    ```
    This lets tests pass `any` while production code uses the real `db`.
  </action>
  <verify>
    <automated>npm -w apps/api test -- --reporter=verbose atomicity 2>&1 | tail -20</automated>
  </verify>
  <done>
    `npm -w apps/api test -- atomicity` exits 0, all atomicity tests pass.
    Key verifications:
    - `db.transaction()` is called for every `insertStockRowsAtomic()` call.
    - 1200 rows are split into [500, 500, 200] batch insert calls.
    - Mock DB throwing inside transaction → `insertStockRowsAtomic` rejects (not silently swallowed).
    - `createImportRecord` returns the generated numeric ID.
    - `updateImportStatus` calls `db.update()` with correct status/finishedAt.
    - `npm -w apps/api run build` exits 0 (no TypeScript errors).
  </done>
</task>

</tasks>

<verification>
```bash
# Atomicity tests (no Docker)
npm -w apps/api test -- --reporter=verbose atomicity

# Build check
npm -w apps/api run build

# Confirm writer exports
node --input-type=module <<'EOF'
import { insertStockRowsAtomic, createImportRecord, updateImportStatus }
  from '/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/dist/ingest/writer.js';
console.log(typeof insertStockRowsAtomic, typeof createImportRecord, typeof updateImportStatus);
EOF
```
</verification>

<success_criteria>
- `npm -w apps/api test -- atomicity` exits 0 with all tests passing.
- `npm -w apps/api run build` exits 0.
- `insertStockRowsAtomic`, `createImportRecord`, `updateImportStatus` are named exports.
- Batch size is 500 (tested with 1200-row assertion).
- Transaction rollback propagates throws (mock DB error → rejects, not resolves).
- No live Postgres required for any test in this plan.
</success_criteria>

<output>
After completion, create `.planning/phases/02-csv-ingestion-core/02-05-SUMMARY.md`
</output>
