/**
 * Shared DTO types for the upload flow (Phase 4).
 *
 * Pure TypeScript — no runtime imports, no Zod schemas.
 * Both apps/api (POST /api/v1/upload handler) and apps/frontend (Upload page)
 * import these via @acm-kpi/core so the request/response contract is single-sourced.
 *
 * The endpoint returns either UploadSuccessResponse (ingest succeeded) or
 * UploadErrorResponse (validation failed). HTTP status 400 wraps the latter.
 */

// ─── Headline KPI snapshot (pre/post ingest) ─────────────────────────────────

/**
 * A minimal slice of the dashboard KPIs, captured before and after ingest so
 * the upload UI can show a before → after → delta per the 04-UI-SPEC success view.
 *
 * Values are raw numbers (not formatted) — the frontend handles presentation.
 * daysOnHand may be null when the MV has no reichw_mon values to weight.
 */
export interface HeadlineKpis {
  totalInventoryValue: number;
  daysOnHand: number | null;
  stockoutsCount: number;
  deadStockPct: number;
}

// ─── KPI delta primitives ────────────────────────────────────────────────────

/**
 * One KPI field with before/after/delta. `before` is null on the first-ever
 * import (the materialised view is empty until an ingest succeeds).
 */
export interface KpiDeltaField {
  before: number | null;
  after: number;
  delta: number;
}

/**
 * The four headline KPIs surfaced on the upload success screen.
 * Each field follows the same before/after/delta contract.
 */
export interface UploadKpiDelta {
  totalInventoryValue: KpiDeltaField;
  daysOnHand: KpiDeltaField;
  stockoutsCount: KpiDeltaField;
  deadStockPct: KpiDeltaField;
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

/**
 * Returned on ingest success (HTTP 200).
 * rowsInserted is the number of stock_rows rows written by the atomic swap.
 */
export interface UploadSuccessResponse {
  status: "success";
  filename: string;
  rowsInserted: number;
  durationMs: number;
  kpiDelta: UploadKpiDelta;
}

/**
 * Returned on ingest validation failure (HTTP 400).
 * errors mirrors the IngestError shape from @acm-kpi/core ingest/types.ts —
 * duplicated here instead of re-exported to keep the upload contract
 * self-contained for the frontend.
 */
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

/** Discriminated union — narrow on `status` in consumers. */
export type UploadResponse = UploadSuccessResponse | UploadErrorResponse;
