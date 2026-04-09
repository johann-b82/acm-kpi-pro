import type { KpiSummary } from "@acm-kpi/core";
import { KpiCard } from "./KpiCard.js";

interface KpiGridProps {
  summary: KpiSummary;
}

/**
 * 7-card KPI grid — the executive overview above the fold.
 *
 * Cards:
 * 1. Total Inventory Value (neutral)
 * 2. Days on Hand (color from API)
 * 3. Dead Stock % (color from API)
 * 4. Stockouts (color from API)
 * 5. ABC Distribution (neutral, informational)
 * 6. Inventory Turnover (neutral)
 * 7. Devaluation (neutral)
 *
 * Layout: 3-col on desktop, 2-col on tablet, 1-col on mobile.
 * Pitfall #8: lean default view — all 7 cards above the fold on desktop.
 */
export function KpiGrid({ summary }: KpiGridProps) {
  const {
    total_inventory_value,
    days_on_hand,
    slow_dead_stock,
    stockouts,
    abc_distribution,
    inventory_turnover,
    devaluation,
  } = summary;

  // Dead stock is the % of dead bucket value
  const deadBucket = slow_dead_stock.buckets.find((b) => b.label === "dead");
  const deadPct = deadBucket?.pct ?? 0;

  // ABC distribution summary string
  const abcValue = `A:${abc_distribution.a.count} B:${abc_distribution.b.count} C:${abc_distribution.c.count}`;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* 1. Total Inventory Value */}
      <KpiCard
        title="Total Inventory Value"
        value={`€${total_inventory_value.value_eur.toLocaleString()}`}
        color={total_inventory_value.color}
        tooltip="Sum of wert_mit_abw for all non-deleted stock rows"
      />

      {/* 2. Days on Hand */}
      <KpiCard
        title="Days on Hand"
        value={days_on_hand.days.toLocaleString()}
        unit="days (weighted avg)"
        color={days_on_hand.color}
        tooltip="Weighted average coverage in days (reichw_mon × 30, weighted by value)"
      />

      {/* 3. Dead Stock */}
      <KpiCard
        title="Dead Stock"
        value={`${deadPct.toFixed(1)}%`}
        unit="of total inventory value"
        color={slow_dead_stock.color}
        tooltip="% of total value in articles with no outflow for >12 months"
      />

      {/* 4. Stockouts */}
      <KpiCard
        title="Stockouts / Low Stock"
        value={stockouts.count.toLocaleString()}
        unit="items"
        color={stockouts.color}
        tooltip="Articles with stock ≤ 0 or less than 1 month coverage"
      />

      {/* 5. ABC Distribution */}
      <KpiCard
        title="ABC Distribution"
        value={abcValue}
        unit="by count"
        color="neutral"
        tooltip="Article count per ABC class (A=high-value, C=low-value)"
      />

      {/* 6. Inventory Turnover */}
      <KpiCard
        title="Inventory Turnover"
        value={`${inventory_turnover.ratio.toFixed(1)}×`}
        unit="times/year (proxy)"
        color={inventory_turnover.color}
        tooltip="Proxy ratio: SUM(annual sales) / AVG(stock qty)"
      />

      {/* 7. Devaluation */}
      <KpiCard
        title="Devaluation"
        value={`€${devaluation.total_eur.toLocaleString()}`}
        unit={`${devaluation.pct_of_value.toFixed(1)}% of value`}
        color={devaluation.color}
        tooltip="Total write-down amount (wert − wert_mit_abw)"
      />
    </div>
  );
}
