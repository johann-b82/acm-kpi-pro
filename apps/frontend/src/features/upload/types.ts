/**
 * Local types for the upload feature.
 *
 * NOTE: `UploadResponse` is intentionally defined locally here rather than
 * imported from `@acm-kpi/core` because plan 04-01 (which creates
 * `packages/core/src/upload/types.ts`) executes in parallel with this plan
 * (04-02). Plan 04-05 (e2e wiring) is the appropriate place to switch to
 * the shared type — by then the core package export is guaranteed to exist.
 */

/** Finite state machine states for the upload flow. */
export type UploadState =
  | "idle"
  | "uploading"
  | "parsing"
  | "success"
  | "error";

/** Per-KPI before/after/delta payload used by the success response. */
export interface UploadKpiDelta {
  totalInventoryValue: { before: number | null; after: number; delta: number };
  daysOnHand: { before: number | null; after: number; delta: number };
  stockoutsCount: { before: number | null; after: number; delta: number };
  deadStockPct: { before: number | null; after: number; delta: number };
}

export interface UploadSuccessResponse {
  status: "success";
  filename: string;
  rowsInserted: number;
  durationMs: number;
  kpiDelta: UploadKpiDelta;
}

export interface UploadErrorResponse {
  status: "failed";
  filename: string;
  rowsInserted: 0;
  errors: Array<{
    row: number;
    field: string;
    value: unknown;
    reason: string;
  }>;
  durationMs: number;
}

export type UploadResponse = UploadSuccessResponse | UploadErrorResponse;

/** Props for the DropZone component. */
export interface DropZoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  error?: string | null;
}
