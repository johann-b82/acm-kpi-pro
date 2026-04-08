import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock the DB module so no live Postgres is required (Pitfall #10 test strategy)
vi.mock("../../../db/index.js", () => ({
  db: {
    transaction: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
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
  geloescht: "N",
  erfDatum: null,
  eingrenzungVon: null,
  eingrenzungBis: null,
  inventurgruppe: null,
  abcKennzVk: "C",
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
    // Simulate DB throwing during the atomic swap (TRUNCATE stock_rows execute call).
    // The staging INSERT resolves but the swap step throws, simulating a mid-swap
    // failure. Drizzle propagates the rejection → auto-rollback → stock_rows untouched.
    let executeCallCount = 0;
    vi.mocked(db).transaction = vi.fn().mockImplementation(async (cb: any) => {
      const fakeTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]), // staging batch insert succeeds
        }),
        execute: vi.fn().mockImplementation(() => {
          executeCallCount++;
          // execute #1: TRUNCATE stock_rows_staging → succeeds
          // execute #2: TRUNCATE stock_rows (the swap) → throws (simulates mid-swap)
          if (executeCallCount === 2) {
            return Promise.reject(new Error("DB constraint violation"));
          }
          return Promise.resolve(undefined);
        }),
      };
      return cb(fakeTx); // Drizzle propagates the rejection → auto-rollback
    });

    const rows = [makeRow("A1"), makeRow("A2"), makeRow("A3")];
    await expect(insertStockRowsAtomic(db as any, 1, rows)).rejects.toThrow(
      "DB constraint violation",
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
        // Return { rows: [] } so the MV COUNT check finds no rows (non-concurrent path)
        execute: vi.fn().mockResolvedValue({ rows: [] }),
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
        insert: vi
          .fn()
          .mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
        // Return { rows: [] } so the MV COUNT check finds no rows (non-concurrent path)
        execute: vi.fn().mockResolvedValue({ rows: [] }),
      };
      return cb(fakeTx);
    });

    await insertStockRowsAtomic(db as any, 1, []);
    expect(txCalled).toBe(true);
  });

  test("returns inserted count matching input rows", async () => {
    vi.mocked(db).transaction = vi.fn().mockImplementation(async (cb: any) => {
      const fakeTx = {
        insert: vi
          .fn()
          .mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
        // Return { rows: [] } so the MV COUNT check finds no rows (non-concurrent path)
        execute: vi.fn().mockResolvedValue({ rows: [] }),
      };
      return cb(fakeTx);
    });

    const rows = [makeRow("A1"), makeRow("A2"), makeRow("A3")];
    const result = await insertStockRowsAtomic(db as any, 1, rows);
    expect(result.inserted).toBe(3);
  });

  test("executes TRUNCATE statements via tx.execute (not tx.insert)", async () => {
    const executeCalls: string[] = [];
    vi.mocked(db).transaction = vi.fn().mockImplementation(async (cb: any) => {
      const fakeTx = {
        insert: vi
          .fn()
          .mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
        execute: vi.fn().mockImplementation((sqlObj: any) => {
          // Capture the SQL string representation
          const sqlStr = String(sqlObj?.sql ?? sqlObj ?? "");
          executeCalls.push(sqlStr);
          // Return { rows: [] } so the MV COUNT check defaults to 0 (non-concurrent path)
          return Promise.resolve({ rows: [] });
        }),
      };
      return cb(fakeTx);
    });

    await insertStockRowsAtomic(db as any, 1, [makeRow("A1")]);

    // Should have at least 3 execute calls: TRUNCATE staging, TRUNCATE live, INSERT…SELECT
    expect(executeCalls.length).toBeGreaterThanOrEqual(3);
  });
});

/**
 * Extracts the raw SQL text from a Drizzle `sql` template object.
 * Drizzle stores text chunks in `queryChunks[].value[]`. This helper
 * is used in MV-refresh tests so we can assert on the actual SQL strings.
 */
function extractSql(sqlObj: unknown): string {
  if (typeof sqlObj === "string") return sqlObj;
  const obj = sqlObj as Record<string, unknown>;
  if (Array.isArray(obj?.queryChunks)) {
    return (obj.queryChunks as Array<{ value?: unknown }>)
      .map((c) => {
        if (!c.value) return "";
        return Array.isArray(c.value) ? c.value.join("") : String(c.value);
      })
      .join("");
  }
  return String(sqlObj ?? "");
}

describe("MV refresh hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("uses non-concurrent refresh when MV has 0 rows (first import)", async () => {
    const executeCalls: string[] = [];
    vi.mocked(db).transaction = vi.fn().mockImplementation(async (cb: any) => {
      const fakeTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
        execute: vi.fn().mockImplementation((sqlObj: any) => {
          const sqlStr = extractSql(sqlObj);
          executeCalls.push(sqlStr);
          // COUNT query returns 0 rows → first import (non-concurrent path)
          if (sqlStr.toUpperCase().includes("COUNT")) {
            return Promise.resolve({ rows: [{ count: 0 }] });
          }
          return Promise.resolve({ rows: [] });
        }),
      };
      return cb(fakeTx);
    });

    await insertStockRowsAtomic(db as any, 1, []);

    const refreshCalls = executeCalls.filter((s) =>
      s.toUpperCase().includes("REFRESH MATERIALIZED VIEW"),
    );
    expect(refreshCalls).toHaveLength(1);
    expect(refreshCalls[0]!.toUpperCase()).not.toContain("CONCURRENTLY");
    expect(refreshCalls[0]!.toLowerCase()).toContain("kpi_dashboard_data");
  });

  test("uses concurrent refresh when MV has rows (subsequent import)", async () => {
    const executeCalls: string[] = [];
    vi.mocked(db).transaction = vi.fn().mockImplementation(async (cb: any) => {
      const fakeTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
        execute: vi.fn().mockImplementation((sqlObj: any) => {
          const sqlStr = extractSql(sqlObj);
          executeCalls.push(sqlStr);
          // COUNT query returns 1 row → subsequent import (concurrent path)
          if (sqlStr.toUpperCase().includes("COUNT")) {
            return Promise.resolve({ rows: [{ count: 1 }] });
          }
          return Promise.resolve({ rows: [] });
        }),
      };
      return cb(fakeTx);
    });

    await insertStockRowsAtomic(db as any, 1, []);

    const refreshCalls = executeCalls.filter((s) =>
      s.toUpperCase().includes("REFRESH MATERIALIZED VIEW"),
    );
    expect(refreshCalls).toHaveLength(1);
    expect(refreshCalls[0]!.toUpperCase()).toContain("CONCURRENTLY");
    expect(refreshCalls[0]!.toLowerCase()).toContain("kpi_dashboard_data");
  });

  test("propagates error if MV refresh throws (rolls back transaction)", async () => {
    vi.mocked(db).transaction = vi.fn().mockImplementation(async (cb: any) => {
      const fakeTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
        execute: vi.fn().mockImplementation((sqlObj: any) => {
          const sqlStr = extractSql(sqlObj);
          // COUNT query returns 0 → non-concurrent path
          if (sqlStr.toUpperCase().includes("COUNT")) {
            return Promise.resolve({ rows: [{ count: 0 }] });
          }
          // REFRESH call → throw to simulate PG error
          if (sqlStr.toUpperCase().includes("REFRESH MATERIALIZED VIEW")) {
            return Promise.reject(
              new Error("materialized view refresh failed"),
            );
          }
          return Promise.resolve({ rows: [] });
        }),
      };
      return cb(fakeTx);
    });

    await expect(
      insertStockRowsAtomic(db as any, 1, []),
    ).rejects.toThrow("materialized view refresh failed");
  });

  test("REFRESH is called after INSERT...SELECT (call order check)", async () => {
    const callOrder: string[] = [];
    vi.mocked(db).transaction = vi.fn().mockImplementation(async (cb: any) => {
      const fakeTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
        execute: vi.fn().mockImplementation((sqlObj: any) => {
          const sqlStr = extractSql(sqlObj);
          if (sqlStr.toUpperCase().includes("INSERT INTO STOCK_ROWS")) {
            callOrder.push("INSERT_PROMOTE");
          } else if (sqlStr.toUpperCase().includes("REFRESH MATERIALIZED VIEW")) {
            callOrder.push("REFRESH_MV");
          } else if (sqlStr.toUpperCase().includes("COUNT")) {
            return Promise.resolve({ rows: [{ count: 0 }] });
          }
          return Promise.resolve({ rows: [] });
        }),
      };
      return cb(fakeTx);
    });

    await insertStockRowsAtomic(db as any, 1, [makeRow("A1")]);

    const insertIdx = callOrder.indexOf("INSERT_PROMOTE");
    const refreshIdx = callOrder.indexOf("REFRESH_MV");
    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(refreshIdx).toBeGreaterThan(insertIdx);
  });
});

describe("createImportRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("updates the import row with success status and finishedAt", async () => {
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
    // db.update() mock
    (db as any).update = mockUpdate;

    await updateImportStatus(db as any, 42, {
      status: "success",
      rowCount: 12,
      finishedAt: new Date(),
    });

    expect(mockUpdate).toHaveBeenCalledOnce();
    expect(mockSet).toHaveBeenCalledOnce();
    expect(mockWhere).toHaveBeenCalledOnce();
  });

  test("updates the import row with failed status and errorMessage", async () => {
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
    (db as any).update = mockUpdate;

    await updateImportStatus(db as any, 99, {
      status: "failed",
      rowCount: 0,
      finishedAt: new Date(),
      errorMessage: "Parse error on row 42",
    });

    expect(mockUpdate).toHaveBeenCalledOnce();
    // Verify the set call includes the errorMessage
    const setCallArgs = mockSet.mock.calls[0][0];
    expect(setCallArgs.errorMessage).toBe("Parse error on row 42");
    expect(setCallArgs.status).toBe("failed");
  });
});
