/**
 * apps/api/src/ingest/__tests__/orchestrator.test.ts
 *
 * Unit tests for the ingestLagBesFile() orchestrator.
 * All DB and IO dependencies are mocked — no live Postgres required.
 *
 * Strategy: vi.mock the writer module (which contains all DB calls), then pass
 * a dummy db object via opts.db injection. This avoids loading db/index.ts
 * (which throws if DATABASE_URL is not set) while still testing all orchestrator
 * paths including createImportRecord, insertStockRowsAtomic, updateImportStatus.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { resolve } from "path";
import { fileURLToPath } from "url";

// Mock the writer module — intercepts all DB calls.
// The mocked functions replace the real DB operations while keeping call tracking.
vi.mock("../writer.js", () => ({
  createImportRecord: vi.fn().mockResolvedValue(99),
  insertStockRowsAtomic: vi.fn().mockResolvedValue({ inserted: 12 }),
  updateImportStatus: vi.fn().mockResolvedValue(undefined),
}));

import { ingestLagBesFile } from "../index.js";
import {
  createImportRecord,
  insertStockRowsAtomic,
  updateImportStatus,
} from "../writer.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SAMPLE = resolve(__dirname, "../../../../../samples/LagBes-sample-cp1252.csv");

// Dummy db object — writer is fully mocked so db is never actually called.
// Passed via opts.db to avoid ingestLagBesFile loading the real db/index.ts
// (which throws at module load when DATABASE_URL is not set).
const mockDb = {
  transaction: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

describe("ingestLagBesFile — orchestrator integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply default resolved values after clearAllMocks
    vi.mocked(createImportRecord).mockResolvedValue(99);
    vi.mocked(insertStockRowsAtomic).mockResolvedValue({ inserted: 12 });
    vi.mocked(updateImportStatus).mockResolvedValue(undefined);
  });

  test("success path: returns IngestResult with status=success", async () => {
    const result = await ingestLagBesFile(SAMPLE, "cli", { db: mockDb });

    expect(result.status).toBe("success");
    expect(result.rowsInserted).toBe(12);
    expect(result.errors).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("success path: createImportRecord called with source=cli", async () => {
    await ingestLagBesFile(SAMPLE, "cli", { db: mockDb });
    expect(createImportRecord).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ source: "cli" }),
    );
  });

  test("success path: updateImportStatus called with status=success", async () => {
    await ingestLagBesFile(SAMPLE, "cli", { db: mockDb });
    expect(updateImportStatus).toHaveBeenCalledWith(
      mockDb,
      99, // importId from createImportRecord mock
      expect.objectContaining({ status: "success", rowCount: 12 }),
    );
  });

  test("success path: insertStockRowsAtomic called with 12 rows", async () => {
    await ingestLagBesFile(SAMPLE, "cli", { db: mockDb });
    const calls = vi.mocked(insertStockRowsAtomic).mock.calls;
    expect(calls.length).toBe(1);
    const firstCall = calls[0];
    expect(firstCall).toBeDefined();
    // calls[0] = [db, importId, rows]
    expect(firstCall?.[1]).toBe(99); // importId
    expect((firstCall?.[2] as unknown[]).length).toBe(12); // rows count
  });

  test("failure path: insertStockRowsAtomic throws → status=failed, imports updated", async () => {
    vi.mocked(insertStockRowsAtomic).mockRejectedValueOnce(
      new Error("Simulated DB failure"),
    );

    const result = await ingestLagBesFile(SAMPLE, "cli", { db: mockDb });

    expect(result.status).toBe("failed");
    expect(updateImportStatus).toHaveBeenCalledWith(
      mockDb,
      99,
      expect.objectContaining({
        status: "failed",
        errorMessage: expect.stringContaining("DB failure"),
      }),
    );
  });

  test("success path: filename in result matches basename", async () => {
    const result = await ingestLagBesFile(SAMPLE, "cli", { db: mockDb });
    expect(result.filename).toBe("LagBes-sample-cp1252.csv");
  });

  test("success path: source=upload flows to createImportRecord", async () => {
    await ingestLagBesFile(SAMPLE, "upload", { db: mockDb });
    expect(createImportRecord).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ source: "upload" }),
    );
  });

  test("success path: correlationId is present in IngestResult", async () => {
    const result = await ingestLagBesFile(SAMPLE, "cli", { db: mockDb });
    expect(typeof result.correlationId).toBe("string");
    expect(result.correlationId.length).toBeGreaterThan(0);
  });

  test("success path: durationMs is a non-negative number", async () => {
    const result = await ingestLagBesFile(SAMPLE, "cli", { db: mockDb });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
