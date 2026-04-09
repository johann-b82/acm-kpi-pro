/**
 * Pure color-computation functions for KPI cards (Plan 03-05).
 *
 * No DB access, no Fastify dependency — safe to use in tests without mocking.
 *
 * Color thresholds (LOCKED in 03-CONTEXT.md):
 *   days-on-hand:   >= 90d → green, 30-89d → yellow, < 30d → red
 *   stockouts:      0      → green, 1-10   → yellow, > 10  → red
 *   dead-stock pct: < 5%   → green, 5-15%  → yellow, > 15% → red
 *   all others:     always "neutral"
 */

import type { ImportSource, KpiColor, KpiSummary } from "@acm-kpi/core";

// ─── Sub-type mirrors for the MV row ─────────────────────────────────────────

interface SlowDeadStockMv {
  dead: { pct: number; count: number; value_eur: number };
  active: { count: number; value_eur: number; pct: number };
  slow: { count: number; value_eur: number; pct: number };
  clutter_count: number;
  samples_count: number;
}

interface StockoutsMv {
  count: number;
  items_preview: KpiSummary["stockouts"]["items_preview"];
}

export interface MvRow {
  total_value_eur: string | number;
  days_on_hand: string | number | null;
  slow_dead_stock: SlowDeadStockMv;
  stockouts: StockoutsMv;
  abc_distribution: KpiSummary["abc_distribution"];
  inventory_turnover: string | number;
  devaluation: { total_eur: number; pct_of_value: number };
}

export interface LastImport {
  filename: string;
  row_count: number | null;
  source: string;
  finished_at: Date | string | null;
}

// ─── Individual threshold functions (exported for unit tests) ─────────────────

/**
 * days-on-hand threshold: >= 90 → green, 30-89 → yellow, < 30 → red
 * null input returns "neutral" (no data available)
 */
export function daysOnHandColor(days: number | null): KpiColor {
  if (days === null) return "neutral";
  if (days >= 90) return "green";
  if (days >= 30) return "yellow";
  return "red";
}

/**
 * stockouts count threshold: 0 → green, 1-10 → yellow, > 10 → red
 */
export function stockoutCountColor(count: number): KpiColor {
  if (count === 0) return "green";
  if (count <= 10) return "yellow";
  return "red";
}

/**
 * dead-stock % of total value threshold: < 5% → green, 5-15% → yellow, > 15% → red
 */
export function deadStockShareColor(pct: number): KpiColor {
  if (pct < 5) return "green";
  if (pct <= 15) return "yellow";
  return "red";
}

/**
 * Always returns "neutral" — for total value, devaluation, turnover, ABC.
 */
export function neutralColor(): "neutral" {
  return "neutral";
}

// ─── Main aggregation function ────────────────────────────────────────────────

/**
 * Build the full KpiSummary DTO with computed colors.
 * Pass null for either argument to get the empty onboarding state (has_data: false).
 */
export function computeKpiColors(
  mvRow: MvRow | null,
  lastImport: LastImport | null,
): KpiSummary {
  if (!mvRow || !lastImport) {
    // Empty state — no successful import yet
    return {
      has_data: false,
      last_updated_at: null,
      last_import: null,
      total_inventory_value: { value_eur: 0, color: "neutral" },
      days_on_hand: { days: 0, color: "neutral" },
      slow_dead_stock: {
        buckets: [
          { label: "active", count: 0, value_eur: 0, pct: 0 },
          { label: "slow", count: 0, value_eur: 0, pct: 0 },
          { label: "dead", count: 0, value_eur: 0, pct: 0 },
        ],
        clutter_excluded_count: 0,
        samples_excluded_count: 0,
        color: "neutral",
      },
      stockouts: { count: 0, items_preview: [], color: "neutral" },
      abc_distribution: {
        a: { count: 0, value_eur: 0 },
        b: { count: 0, value_eur: 0 },
        c: { count: 0, value_eur: 0 },
      },
      inventory_turnover: { ratio: 0, color: "neutral" },
      devaluation: { total_eur: 0, pct_of_value: 0, color: "neutral" },
    };
  }

  const daysOnHand = Number(mvRow.days_on_hand ?? 0);
  const stockoutCount = Number(mvRow.stockouts.count ?? 0);
  const deadPct = Number(mvRow.slow_dead_stock.dead.pct ?? 0);

  const finishedAt = mvRow && lastImport?.finished_at;
  const lastUpdatedAt =
    finishedAt instanceof Date
      ? finishedAt.toISOString()
      : typeof finishedAt === "string"
        ? finishedAt
        : null;

  return {
    has_data: true,
    last_updated_at: lastUpdatedAt,
    last_import: {
      filename: lastImport.filename,
      row_count: lastImport.row_count ?? 0,
      source: lastImport.source as ImportSource,
    },
    total_inventory_value: {
      value_eur: Number(mvRow.total_value_eur),
      color: neutralColor(),
    },
    days_on_hand: {
      days: Math.round(daysOnHand),
      color: daysOnHandColor(daysOnHand),
    },
    slow_dead_stock: {
      buckets: [
        { label: "active", ...mvRow.slow_dead_stock.active },
        { label: "slow", ...mvRow.slow_dead_stock.slow },
        { label: "dead", ...mvRow.slow_dead_stock.dead },
      ],
      clutter_excluded_count: mvRow.slow_dead_stock.clutter_count,
      samples_excluded_count: mvRow.slow_dead_stock.samples_count,
      color: deadStockShareColor(deadPct),
    },
    stockouts: {
      count: stockoutCount,
      items_preview: mvRow.stockouts.items_preview,
      color: stockoutCountColor(stockoutCount),
    },
    abc_distribution: mvRow.abc_distribution,
    inventory_turnover: {
      ratio: Number(mvRow.inventory_turnover),
      color: neutralColor(),
    },
    devaluation: {
      ...mvRow.devaluation,
      color: neutralColor(),
    },
  };
}
