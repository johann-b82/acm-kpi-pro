import { useCallback } from "react";
import { Header } from "../components/Header.js";
import { useKpiSummary } from "../features/kpi/hooks/useKpiSummary.js";
import { useStalenessAlert } from "../features/kpi/hooks/useStalenessAlert.js";

/**
 * DashboardPage — Phase 3 full layout skeleton.
 * Replaces the Phase 1 placeholder (single hardcoded KPI card).
 *
 * Layout slots (filled in Plan 03-07):
 *   - Header (accepts lastUpdatedAt/onForceRefresh/isRefreshing — no-ops until 03-07)
 *   - StaleDataBanner slot (data-testid="stale-banner-slot")
 *   - EmptyState slot (data-testid="empty-state-slot" when has_data=false)
 *   - KPI grid slot (data-testid="kpi-grid-slot")
 *   - Slow-mover chart slot (data-testid="slow-mover-chart-slot")
 *   - Stockout list slot (data-testid="stockout-list-slot")
 *   - Filter bar slot (data-testid="filter-bar-slot")
 *
 * Requirements: DASH-01, DASH-03, DASH-04, DASH-08, DASH-11
 * Pitfall #6: Freshness addressed via StaleDataBanner + force-refresh button
 * Pitfall #8: Lean default view — slots defined, heavy components deferred to 03-07
 */
export function DashboardPage() {
  const { data: summary, isLoading, isError, refetch, isFetching } = useKpiSummary();
  const stalenessLevel = useStalenessAlert(summary?.last_updated_at ?? null);

  const handleForceRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

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
          {/* EmptyState component slot — implemented in Plan 03-07 */}
          <div data-testid="empty-state-slot">
            <p className="py-16 text-center text-muted-foreground">
              No data yet — EmptyState component coming in Plan 03-07
            </p>
          </div>
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
        {/* StaleDataBanner slot — implemented in Plan 03-07 */}
        {stalenessLevel !== "none" && (
          <div
            data-testid="stale-banner-slot"
            data-staleness={stalenessLevel}
            className={
              stalenessLevel === "critical"
                ? "rounded-md border border-red-300 bg-red-100 px-4 py-3 text-sm text-red-900"
                : "rounded-md border border-yellow-300 bg-yellow-100 px-4 py-3 text-sm text-yellow-900"
            }
          >
            {stalenessLevel === "critical"
              ? "Data is older than 2 hours. Please refresh."
              : "Data is over 30 minutes old."}
          </div>
        )}

        {/* KPI Grid — 7 cards in 3-col grid (Pitfall #8: lean default) — Plan 03-07 */}
        <section aria-label="KPI Overview">
          <div
            data-testid="kpi-grid-slot"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {/* KpiGrid component — implemented in Plan 03-07 */}
            <p className="col-span-full text-muted-foreground">
              KPI grid coming in Plan 03-07
            </p>
          </div>
        </section>

        {/* Slow-mover stacked bar chart — DASH-06 — Plan 03-07 */}
        <section aria-label="Slow Movers and Dead Stock">
          <div data-testid="slow-mover-chart-slot">
            <p className="text-muted-foreground">SlowMoverChart coming in Plan 03-07</p>
          </div>
        </section>

        {/* Stockout list with drill-down — DASH-07 — Plan 03-07 */}
        <section aria-label="Stockouts and Low Stock">
          <div data-testid="stockout-list-slot">
            <p className="text-muted-foreground">StockoutList coming in Plan 03-07</p>
          </div>
        </section>

        {/* Filter bar — DASH-05 — Plan 03-07 */}
        <section aria-label="Filters">
          <div data-testid="filter-bar-slot">
            <p className="text-muted-foreground">FilterBar coming in Plan 03-07</p>
          </div>
        </section>

      </main>
    </div>
  );
}
