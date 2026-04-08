/**
 * apps/api/src/ingest/__tests__/orchestrator.test.ts
 *
 * Unit tests for the ingestLagBesFile() orchestrator.
 * All DB and IO dependencies are mocked — no live Postgres required.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { resolve } from "path";
import { fileURLToPath } from "url";

// Mock DB (no live Postgres)
vi.mock("../../../db/index.js", () => ({
  db: {
    transaction: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

// Mock writer to intercept DB calls
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
const SAMPLE = resolve(__dirname, "../../../../samples/LagBes-sample-cp1252.csv");

describe("ingestLagBesFile — orchestrator integration", () => {
  beforeEach(() => vi.clearAllMocks());

  test("success path: returns IngestResult with status=success", async () => {
    const result = await ingestLagBesFile(SAMPLE, "cli");

    expect(result.status).toBe("success");
    expect(result.rowsInserted).toBe(12);
    expect(result.errors).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("success path: createImportRecord called with source=cli", async () => {
    await ingestLagBesFile(SAMPLE, "cli");
    expect(createImportRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: "cli" }),
    );
  });

  test("success path: updateImportStatus called with status=success", async () => {
    await ingestLagBesFile(SAMPLE, "cli");
    expect(updateImportStatus).toHaveBeenCalledWith(
      expect.anything(),
      99, // importId from createImportRecord mock
      expect.objectContaining({ status: "success", rowCount: 12 }),
    );
  });

  test("success path: insertStockRowsAtomic called with 12 rows", async () => {
    await ingestLagBesFile(SAMPLE, "cli");
    const [, importId, rows] = vi.mocked(insertStockRowsAtomic).mock.calls[0];
    expect(importId).toBe(99);
    expect((rows as unknown[]).length).toBe(12);
  });

  test("failure path: insertStockRowsAtomic throws → status=failed, imports updated", async () => {
    vi.mocked(insertStockRowsAtomic).mockRejectedValueOnce(
      new Error("Simulated DB failure"),
    );

    const result = await ingestLagBesFile(SAMPLE, "cli");

    expect(result.status).toBe("failed");
    expect(updateImportStatus).toHaveBeenCalledWith(
      expect.anything(),
      99,
      expect.objectContaining({
        status: "failed",
        errorMessage: expect.stringContaining("DB failure"),
      }),
    );
  });

  test("success path: filename in result matches basename", async () => {
    const result = await ingestLagBesFile(SAMPLE, "cli");
    expect(result.filename).toBe("LagBes-sample-cp1252.csv");
  });

  test("success path: source=upload flows to createImportRecord", async () => {
    await ingestLagBesFile(SAMPLE, "upload");
    expect(createImportRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: "upload" }),
    );
  });

  test("success path: correlationId is present in IngestResult", async () => {
    const result = await ingestLagBesFile(SAMPLE, "cli");
    expect(typeof result.correlationId).toBe("string");
    expect(result.correlationId.length).toBeGreaterThan(0);
  });

  test("success path: durationMs is a non-negative number", async () => {
    const result = await ingestLagBesFile(SAMPLE, "cli");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
