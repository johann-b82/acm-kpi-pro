/**
 * packages/core/src/ingest/error.ts
 *
 * Shared error log type for the SMB folder watcher (Phase 5 — D-07).
 *
 * WatcherErrorLog is the shape of the .error.json sidecar file written
 * alongside failed-ingest files in failed/YYYY-MM-DD/.
 *
 * Shape mirrors UploadErrorResponse for uniform monitoring tooling across
 * the upload and watcher ingest paths.
 *
 * Note: WatcherErrorLog is also defined in apps/api/src/watcher/path-resolver.ts
 * (kept local to avoid circular deps between apps/api and packages/core).
 * This export from @acm-kpi/core is the canonical type for downstream consumers
 * (monitoring tools, Phase 3 healthz extension, future admin UI).
 */
export interface WatcherErrorLog {
  /** ISO 8601 timestamp of when the error was recorded */
  timestamp: string;
  /** Original filename of the failed file */
  file: string;
  /** Always "watcher" — identifies the ingest path */
  source: "watcher";
  /** Error classification */
  errorType: "parse" | "validation" | "db" | "unknown";
  /** Human-readable error summary */
  message: string;
  /** Row-level validation errors (empty for pipeline/db errors) */
  rowErrors: Array<{ row: number; field: string; value: unknown; reason: string }>;
}
