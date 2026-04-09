/**
 * apps/api/src/watcher/__tests__/path-resolver.test.ts
 *
 * Unit tests for resolveProcessedPath, resolveFailedPath, resolveFailedErrorPath,
 * and buildErrorLog. Pure functions — no mocks needed.
 */
import { describe, expect, it } from "vitest";
import {
  resolveProcessedPath,
  resolveFailedPath,
  resolveFailedErrorPath,
  buildErrorLog,
} from "../path-resolver.js";
import type { IngestResult } from "@acm-kpi/core";

// YYYY-MM-DD regex used in path assertions
const DATE_PATTERN = /\d{4}-\d{2}-\d{2}/;

describe("resolveProcessedPath", () => {
  it("contains /processed/ and the filename and a YYYY-MM-DD pattern", () => {
    const result = resolveProcessedPath("/mnt/smb", "LagBes.csv");
    expect(result).toContain("/processed/");
    expect(result).toContain("LagBes.csv");
    expect(result).toMatch(DATE_PATTERN);
  });

  it("does not contain /failed/", () => {
    const result = resolveProcessedPath("/mnt/smb", "LagBes.csv");
    expect(result).not.toContain("/failed/");
  });
});

describe("resolveFailedPath", () => {
  it("contains /failed/ and the filename and a YYYY-MM-DD pattern", () => {
    const result = resolveFailedPath("/mnt/smb", "LagBes.csv");
    expect(result).toContain("/failed/");
    expect(result).toContain("LagBes.csv");
    expect(result).toMatch(DATE_PATTERN);
  });

  it("does not contain /processed/", () => {
    const result = resolveFailedPath("/mnt/smb", "LagBes.csv");
    expect(result).not.toContain("/processed/");
  });
});

describe("resolveFailedErrorPath", () => {
  it("ends with LagBes.csv.error.json", () => {
    const result = resolveFailedErrorPath("/mnt/smb", "LagBes.csv");
    expect(result).toMatch(/LagBes\.csv\.error\.json$/);
  });

  it("contains /failed/ in the path", () => {
    const result = resolveFailedErrorPath("/mnt/smb", "LagBes.csv");
    expect(result).toContain("/failed/");
  });
});

describe("buildErrorLog", () => {
  const baseResult: IngestResult = {
    status: "failed",
    filename: "LagBes.csv",
    rowsInserted: 0,
    errors: [],
    durationMs: 123,
    correlationId: "test-correlation-id",
  };

  it("classifies as 'validation' when there are row-level errors (row > 0, field != pipeline)", () => {
    const result: IngestResult = {
      ...baseResult,
      errors: [
        { row: 5, field: "Wert", value: "abc", reason: "Not a number" },
      ],
    };
    const log = buildErrorLog("LagBes.csv", result);
    expect(log.errorType).toBe("validation");
  });

  it("classifies as 'parse' when there is a pipeline error with 'parse' in the reason", () => {
    const result: IngestResult = {
      ...baseResult,
      errors: [
        { row: 0, field: "pipeline", value: null, reason: "CSV parse error: unexpected token" },
      ],
    };
    const log = buildErrorLog("LagBes.csv", result);
    expect(log.errorType).toBe("parse");
  });

  it("classifies as 'db' when the error reason mentions 'db'", () => {
    const result: IngestResult = {
      ...baseResult,
      errors: [
        { row: 0, field: "pipeline", value: null, reason: "db connection refused" },
      ],
    };
    const log = buildErrorLog("LagBes.csv", result);
    expect(log.errorType).toBe("db");
  });

  it("classifies as 'db' when the error reason mentions 'connection'", () => {
    const result: IngestResult = {
      ...baseResult,
      errors: [
        { row: 0, field: "pipeline", value: null, reason: "Connection timeout to database" },
      ],
    };
    const log = buildErrorLog("LagBes.csv", result);
    expect(log.errorType).toBe("db");
  });

  it("classifies as 'unknown' when the error does not match any known pattern", () => {
    const result: IngestResult = {
      ...baseResult,
      errors: [
        { row: 0, field: "pipeline", value: null, reason: "Something completely unexpected" },
      ],
    };
    const log = buildErrorLog("LagBes.csv", result);
    expect(log.errorType).toBe("unknown");
  });

  it("classifies as 'unknown' when errors array is empty", () => {
    const log = buildErrorLog("LagBes.csv", baseResult);
    expect(log.errorType).toBe("unknown");
  });

  it("always sets source to 'watcher'", () => {
    const log = buildErrorLog("LagBes.csv", baseResult);
    expect(log.source).toBe("watcher");
  });

  it("sets file to the provided filename", () => {
    const log = buildErrorLog("LagBes.csv", baseResult);
    expect(log.file).toBe("LagBes.csv");
  });

  it("timestamp is an ISO string", () => {
    const log = buildErrorLog("LagBes.csv", baseResult);
    expect(log.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
