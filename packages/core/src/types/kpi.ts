/**
 * KPI summary returned by /api/v1/kpi/summary.
 * Scaffold for Phase 1; values are populated in Phase 3.
 */
export interface KpiSummary {
  /** Total inventory value in EUR — null until first import */
  totalInventoryValue: number | null;
  /** ISO 8601 timestamp of the last successful import */
  lastIngestTs: string | null;
  /** Status of the last import attempt */
  lastIngestStatus: "success" | "failed" | null;
}
