/**
 * apps/api/src/watcher/path-resolver.ts
 *
 * Pure path-resolution and error-log helpers for the SMB folder watcher (Phase 5).
 *
 * All functions are stateless — no side effects, no I/O.
 * The date subfolder uses server local time (see note in todayFolder).
 */

import { join } from "node:path";
import type { IngestResult } from "@acm-kpi/core";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns today's date as `YYYY-MM-DD` using server local time.
 *
 * Timezone note (D-06 deferred): If the server timezone differs from ACM's
 * timezone the subfolder date may be off by one around midnight. Acceptable
 * at v1 scale — add WATCHER_TZ config in v2 if real-world issues arise.
 */
function todayFolder(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/**
 * Returns the destination path for a successfully ingested file.
 * Pattern: `{shareRoot}/processed/YYYY-MM-DD/{filename}`
 *
 * D-06: same-name collision → overwrite. Latest export is truth.
 */
export function resolveProcessedPath(shareRoot: string, filename: string): string {
  return join(shareRoot, "processed", todayFolder(), filename);
}

/**
 * Returns the destination path for a failed-ingest file.
 * Pattern: `{shareRoot}/failed/YYYY-MM-DD/{filename}`
 */
export function resolveFailedPath(shareRoot: string, filename: string): string {
  return join(shareRoot, "failed", todayFolder(), filename);
}

/**
 * Returns the path for the `.error.json` sidecar file written alongside a
 * failed-ingest file.
 * Pattern: `{shareRoot}/failed/YYYY-MM-DD/{filename}.error.json`
 */
export function resolveFailedErrorPath(shareRoot: string, filename: string): string {
  return join(shareRoot, "failed", todayFolder(), `${filename}.error.json`);
}

// ---------------------------------------------------------------------------
// Error log
// ---------------------------------------------------------------------------

/**
 * Structured error log written as a JSON sidecar next to each failed file
 * (D-07). Shape mirrors UploadErrorResponse for uniform monitoring tooling.
 */
export interface WatcherErrorLog {
  timestamp: string;
  file: string;
  source: "watcher";
  errorType: "parse" | "validation" | "db" | "unknown";
  message: string;
  rowErrors: Array<{ row: number; field: string; value: unknown; reason: string }>;
}

/**
 * Builds a WatcherErrorLog from an IngestResult.
 *
 * Error type classification (D-07):
 * - "validation"  — row-level errors with a non-pipeline field
 * - "parse"       — pipeline error whose reason mentions "parse"
 * - "db"          — error whose reason mentions "db", "connection", or "database"
 * - "unknown"     — anything else
 */
export function buildErrorLog(filename: string, result: IngestResult): WatcherErrorLog {
  const rowErrors = result.errors ?? [];

  let errorType: WatcherErrorLog["errorType"] = "unknown";

  if (rowErrors.some((e) => e.row > 0 && e.field !== "pipeline")) {
    errorType = "validation";
  } else if (
    rowErrors.some((e) => e.field === "pipeline" && /parse/i.test(e.reason))
  ) {
    errorType = "parse";
  } else if (
    rowErrors.some((e) => /db|connection|database/i.test(e.reason))
  ) {
    errorType = "db";
  }

  return {
    timestamp: new Date().toISOString(),
    file: filename,
    source: "watcher",
    errorType,
    message: result.errors?.[0]?.reason ?? "Unknown error",
    rowErrors,
  };
}
