/**
 * KPI helper queries used by non-dashboard routes (Phase 4 — upload).
 *
 * getHeadlineKpis() reads the kpi_dashboard_data materialised view and returns
 * the 4 headline KPIs the upload page needs to compute a before/after delta.
 * Returns null on the first-ever import (MV empty).
 *
 * This is kept separate from kpi/routes.ts because the upload handler needs a
 * narrower projection (no color computation, no full KpiSummary shape) and we
 * do not want to create a circular dependency back into routes.ts.
 */

import { sql } from "drizzle-orm";
import type { HeadlineKpis } from "@acm-kpi/core";
import type { IngestDb } from "../ingest/index.js";

interface MvHeadlineRow {
  total_value_eur: string | number | null;
  days_on_hand: string | number | null;
  stockouts: { count?: number | string } | null;
  devaluation: { pct?: number | string } | null;
}

/**
 * Fetch the 4 headline KPIs from the kpi_dashboard_data materialised view.
 * Returns null when the MV has no row (first-ever import).
 *
 * The MV is refreshed by the ingest pipeline, so callers MUST invoke this
 * AFTER ingestLagBesFile() completes to see post-ingest values, or BEFORE
 * to snapshot the pre-ingest state.
 */
export async function getHeadlineKpis(
  db: IngestDb,
): Promise<HeadlineKpis | null> {
  // Drizzle's raw-SQL `execute` surfaces a node-pg-style result ({ rows: [...] })
  const result = await db.execute(
    sql`SELECT total_value_eur, days_on_hand, stockouts, devaluation
        FROM kpi_dashboard_data
        LIMIT 1`,
  );

  const row = (result.rows?.[0] ?? undefined) as MvHeadlineRow | undefined;
  if (!row) return null;

  const toNumber = (v: string | number | null | undefined): number =>
    v == null ? 0 : typeof v === "number" ? v : Number.parseFloat(v);

  const daysOnHandRaw = row.days_on_hand;
  const daysOnHand: number | null =
    daysOnHandRaw == null
      ? null
      : typeof daysOnHandRaw === "number"
        ? daysOnHandRaw
        : Number.parseFloat(daysOnHandRaw);

  return {
    totalInventoryValue: toNumber(row.total_value_eur),
    daysOnHand: Number.isFinite(daysOnHand as number) ? daysOnHand : null,
    stockoutsCount: Number.parseInt(String(row.stockouts?.count ?? 0), 10),
    deadStockPct: toNumber(row.devaluation?.pct ?? 0),
  };
}
