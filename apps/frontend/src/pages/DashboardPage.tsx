import { useCallback, useState } from "react";
import { Header } from "../components/Header.js";
import { useKpiSummary } from "../features/kpi/hooks/useKpiSummary.js";
import { useStalenessAlert } from "../features/kpi/hooks/useStalenessAlert.js";
import { useKpiMeta } from "../features/kpi/hooks/useKpiMeta.js";
import { KpiGrid } from "../features/kpi/components/KpiGrid.js";
import { SlowMoverChart } from "../features/kpi/components/SlowMoverChart.js";
import { StockoutList } from "../features/kpi/components/StockoutList.js";
import { StaleDataBanner } from "../features/kpi/components/StaleDataBanner.js";
import { EmptyState } from "../features/kpi/components/EmptyState.js";
import { FilterBar } from "../features/kpi/components/FilterBar.js";
import { ArticleDrilldownModal } from "../features/kpi/components/ArticleDrilldownModal.js";
import type { ArticleSummary, ArticleFilterQuery } from "@acm-kpi/core";

/**
 * DashboardPage — Phase 3 full layout.
 * Replaces the Phase 1 placeholder (single hardcoded KPI card).
 *
 * Layout:
 *   Header (LastUpdatedBadge + force-refresh button)
 *   StaleDataBanner (yellow >30min, red >2h) — Pitfall #6
 *   FilterBar (4 dropdowns)
 *   KpiGrid (7 cards above the fold) — Pitfall #8
 *   SlowMoverChart (stacked horizontal bar)
 *   StockoutList (top-5 preview, click → ArticleDrilldownModal)
 *   ArticleDrilldownModal (8-10 essentials + toggle for all fields)
 *
 * Requirements: DASH-01, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08, DASH-11
 */
export function DashboardPage() {
  const { data: summary, isLoading, isError, refetch, isFetching } = useKpiSummary();
  const stalenessLevel = useStalenessAlert(summary?.last_updated_at ?? null);
  const { data: meta } = useKpiMeta();

  // Filter state (DASH-05: scaffolding present; data filtered in v1.x)
  const [filters, setFilters] = useState<Partial<ArticleFilterQuery>>({});

  // Drill-down modal state
  const [selectedArticle, setSelectedArticle] = useState<ArticleSummary | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleForceRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleRowClick = useCallback((item: ArticleSummary) => {
    setSelectedArticle(item);
    setModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
  }, []);

  const handleFilterChange = useCallback((updates: Partial<ArticleFilterQuery>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  }, []);

  // ─── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-screen-xl px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 rounded bg-muted" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-32 rounded-lg bg-muted" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-screen-xl px-4 py-8">
          <div className="rounded-md border border-red-200 bg-red-50 p-6 text-red-900">
            <p className="font-semibold">Failed to load KPI data</p>
            <p className="mt-1 text-sm">
              Check your network connection or contact your administrator.
            </p>
            <button
              onClick={handleForceRefresh}
              className="mt-3 text-sm underline hover:no-underline"
              type="button"
            >
              Try again
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ─── Empty state — no successful import yet ─────────────────────────────────
  if (!summary?.has_data) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-screen-xl px-4 py-8">
          <EmptyState />
        </main>
      </div>
    );
  }

  // ─── Full dashboard ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <Header
        lastUpdatedAt={summary.last_updated_at}
        onForceRefresh={handleForceRefresh}
        isRefreshing={isFetching}
      />
      <main className="mx-auto max-w-screen-xl space-y-6 px-4 py-8">

        {/* Stale-data banner — Pitfall #6, DASH-03 */}
        <StaleDataBanner level={stalenessLevel} />

        {/* Filter bar — DASH-05 (scaffolding; data filtering deferred to v1.x) */}
        <section aria-label="Filters">
          <FilterBar
            meta={meta}
            warehouse={filters.warehouse}
            wgr={filters.wgr}
            abc={filters.abc}
            typ={filters.typ}
            onChange={handleFilterChange}
          />
        </section>

        {/* 7 KPI cards — Pitfall #8: lean default view, all above fold */}
        <section aria-label="KPI Overview">
          <KpiGrid summary={summary} />
        </section>

        {/* Slow-mover stacked bar chart — DASH-06 */}
        <section aria-label="Slow Movers and Dead Stock">
          <SlowMoverChart
            buckets={summary.slow_dead_stock.buckets}
            clutterCount={summary.slow_dead_stock.clutter_excluded_count}
            samplesCount={summary.slow_dead_stock.samples_excluded_count}
          />
        </section>

        {/* Stockout list with drill-down — DASH-07 */}
        <section aria-label="Stockouts and Low Stock">
          <StockoutList
            items={summary.stockouts.items_preview}
            onRowClick={handleRowClick}
          />
        </section>

        {/* Article drill-down modal */}
        <ArticleDrilldownModal
          isOpen={modalOpen}
          onClose={handleModalClose}
          article={selectedArticle}
        />

      </main>
    </div>
  );
}
