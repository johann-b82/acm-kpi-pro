import type { KpiSummary } from "@acm-kpi/core";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "../../../lib/format.js";
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
 * Phase 6: localized titles via i18n (D-18), currency via formatCurrency (D-19).
 */
export function KpiGrid({ summary }: KpiGridProps) {
  const { t } = useTranslation();

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
        title={t("dashboard.kpiLabels.inventoryValue")}
        value={formatCurrency(total_inventory_value.value_eur)}
        color={total_inventory_value.color}
        tooltip="Sum of wert_mit_abw for all non-deleted stock rows"
      />

      {/* 2. Days on Hand */}
      <KpiCard
        title={t("dashboard.kpiLabels.coverage")}
        value={days_on_hand.days}
        unit="days (weighted avg)"
        color={days_on_hand.color}
        tooltip="Weighted average coverage in days (reichw_mon × 30, weighted by value)"
      />

      {/* 3. Dead Stock */}
      <KpiCard
        title={t("dashboard.kpiLabels.slowMovers")}
        value={`${deadPct.toFixed(1)}%`}
        unit="of total inventory value"
        color={slow_dead_stock.color}
        tooltip="% of total value in articles with no outflow for >12 months"
      />

      {/* 4. Stockouts */}
      <KpiCard
        title={t("dashboard.kpiLabels.stockouts")}
        value={stockouts.count}
        unit="items"
        color={stockouts.color}
        tooltip="Articles with stock ≤ 0 or less than 1 month coverage"
      />

      {/* 5. ABC Distribution */}
      <KpiCard
        title={t("dashboard.kpiLabels.abcDistribution")}
        value={abcValue}
        unit="by count"
        color="neutral"
        tooltip="Article count per ABC class (A=high-value, C=low-value)"
      />

      {/* 6. Inventory Turnover */}
      <KpiCard
        title={t("dashboard.kpiLabels.turnover")}
        value={`${inventory_turnover.ratio.toFixed(1)}×`}
        unit="times/year (proxy)"
        color={inventory_turnover.color}
        tooltip="Proxy ratio: SUM(annual sales) / AVG(stock qty)"
      />

      {/* 7. Devaluation */}
      <KpiCard
        title={t("dashboard.kpiLabels.devaluation")}
        value={formatCurrency(devaluation.total_eur)}
        unit={`${devaluation.pct_of_value.toFixed(1)}% of value`}
        color={devaluation.color}
        tooltip="Total write-down amount (wert − wert_mit_abw)"
      />
    </div>
  );
}
