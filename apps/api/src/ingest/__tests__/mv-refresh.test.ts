/**
 * apps/api/src/ingest/__tests__/mv-refresh.test.ts
 *
 * Dedicated tests for the MV refresh hook behaviour inside
 * insertStockRowsAtomic() (Plan 03-04, KPI-02).
 *
 * Focuses on the first-time / subsequent branching logic:
 *  - MV has 0 rows → non-concurrent REFRESH (CONCURRENTLY requires ≥1 row)
 *  - MV has ≥1 row → REFRESH MATERIALIZED VIEW CONCURRENTLY (Pitfall #6 mitigation)
 *
 * No live Postgres required — all DB calls are mocked via vi.mock.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock the DB module (same pattern as atomicity.test.ts)
vi.mock("../../../db/index.js", () => ({
  db: {
    transaction: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

import { db } from "../../../db/index.js";
import { insertStockRowsAtomic } from "../writer.js";

// ─── SQL extraction helper ────────────────────────────────────────────────────
// Drizzle sql`` template objects store SQL text in queryChunks[].value[].
// We extract it here so tests can assert on the actual SQL strings sent to pg.
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

// ─── Factory helpers ──────────────────────────────────────────────────────────

/**
 * Creates a minimal fake transaction that records all execute() call SQL texts.
 * The mvCount parameter controls what the COUNT(*) FROM kpi_dashboard_data
 * query returns — simulating either an empty MV (first import) or a populated
 * MV (subsequent import).
 */
function makeFakeTx(mvCount: number, executeCalls: string[]) {
  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
    execute: vi.fn().mockImplementation((sqlObj: unknown) => {
      const sqlStr = extractSql(sqlObj);
      executeCalls.push(sqlStr);
      if (sqlStr.toUpperCase().includes("COUNT")) {
        return Promise.resolve({ rows: [{ count: mvCount }] });
      }
      return Promise.resolve({ rows: [] });
    }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MV refresh — first-time vs subsequent branching (KPI-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // First-import path: MV is empty → non-concurrent refresh required
  // -------------------------------------------------------------------------

  test("emits non-concurrent REFRESH when MV row count is 0 (first import)", async () => {
    const executeCalls: string[] = [];
    vi.mocked(db).transaction = vi.fn().mockImplementation(async (cb: any) => {
      return cb(makeFakeTx(0, executeCalls));
    });

    await insertStockRowsAtomic(db as any, 1, []);

    const refreshCalls = executeCalls.filter((s) =>
      s.toUpperCase().includes("REFRESH MATERIALIZED VIEW"),
    );
    expect(refreshCalls).toHaveLength(1);
    // Non-concurrent: must NOT contain CONCURRENTLY keyword
    expect(refreshCalls[0]!.toUpperCase()).not.toContain("CONCURRENTLY");
    expect(refreshCalls[0]!.toLowerCase()).toContain("kpi_dashboard_data");
  });

  test("COUNT query targets kpi_dashboard_data (not another view)", async () => {
    const executeCalls: string[] = [];
    vi.mocked(db).transaction = vi.fn().mockImplementation(async (cb: any) => {
      return cb(makeFakeTx(0, executeCalls));
    });

    await insertStockRowsAtomic(db as any, 1, []);

    const countCall = executeCalls.find((s) =>
      s.toUpperCase().includes("COUNT"),
    );
    expect(countCall).toBeDefined();
    expect(countCall!.toLowerCase()).toContain("kpi_dashboard_data");
  });

  // -------------------------------------------------------------------------
  // Subsequent-import path: MV has rows → concurrent refresh
  // -------------------------------------------------------------------------

  test("emits CONCURRENTLY REFRESH when MV row count is 1 (subsequent import)", async () => {
    const executeCalls: string[] = [];
    vi.mocked(db).transaction = vi.fn().mockImplementation(async (cb: any) => {
      return cb(makeFakeTx(1, executeCalls));
    });

    await insertStockRowsAtomic(db as any, 1, []);

    const refreshCalls = executeCalls.filter((s) =>
      s.toUpperCase().includes("REFRESH MATERIALIZED VIEW"),
    );
    expect(refreshCalls).toHaveLength(1);
    expect(refreshCalls[0]!.toUpperCase()).toContain("CONCURRENTLY");
    expect(refreshCalls[0]!.toLowerCase()).toContain("kpi_dashboard_data");
  });

  test("emits CONCURRENTLY REFRESH for any positive row count (e.g. 42)", async () => {
    const executeCalls: string[] = [];
    vi.mocked(db).transaction = vi.fn().mockImplementation(async (cb: any) => {
      return cb(makeFakeTx(42, executeCalls));
    });

    await insertStockRowsAtomic(db as any, 1, []);

    const refreshCalls = executeCalls.filter((s) =>
      s.toUpperCase().includes("REFRESH MATERIALIZED VIEW"),
    );
    expect(refreshCalls).toHaveLength(1);
    expect(refreshCalls[0]!.toUpperCase()).toContain("CONCURRENTLY");
  });

  // -------------------------------------------------------------------------
  // Exactly one refresh per import (no double-refresh)
  // -------------------------------------------------------------------------

  test("emits exactly one REFRESH per call regardless of row count", async () => {
    for (const count of [0, 1, 5]) {
      vi.clearAllMocks();
      const executeCalls: string[] = [];
      vi.mocked(db).transaction = vi.fn().mockImplementation(async (cb: any) => {
        return cb(makeFakeTx(count, executeCalls));
      });

      await insertStockRowsAtomic(db as any, 1, []);

      const refreshCalls = executeCalls.filter((s) =>
        s.toUpperCase().includes("REFRESH MATERIALIZED VIEW"),
      );
      expect(refreshCalls, `Expected exactly 1 REFRESH for mvCount=${count}`).toHaveLength(1);
    }
  });

  // -------------------------------------------------------------------------
  // Atomicity guarantee: refresh failure propagates (Pitfall #10 / #6)
  // -------------------------------------------------------------------------

  test("refresh failure propagates — does not swallow the error", async () => {
    vi.mocked(db).transaction = vi.fn().mockImplementation(async (cb: any) => {
      const fakeTx = {
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
        execute: vi.fn().mockImplementation((sqlObj: unknown) => {
          const sqlStr = extractSql(sqlObj);
          if (sqlStr.toUpperCase().includes("COUNT")) {
            return Promise.resolve({ rows: [{ count: 0 }] });
          }
          if (sqlStr.toUpperCase().includes("REFRESH MATERIALIZED VIEW")) {
            return Promise.reject(new Error("pg: concurrent refresh needs unique index"));
          }
          return Promise.resolve({ rows: [] });
        }),
      };
      return cb(fakeTx);
    });

    await expect(insertStockRowsAtomic(db as any, 1, [])).rejects.toThrow(
      "pg: concurrent refresh needs unique index",
    );
  });
});
