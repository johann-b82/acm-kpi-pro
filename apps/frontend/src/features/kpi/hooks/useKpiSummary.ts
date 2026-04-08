import { useQuery } from "@tanstack/react-query";
import type { KpiSummary } from "@acm-kpi/core";
import { fetchKpiSummary, kpiKeys } from "../queries.js";

/**
 * React Query hook for the KPI summary.
 *
 * Polls every 30 seconds (DASH-04) with a 25s stale window.
 * Returns isLoading, isError, data, refetch from React Query's UseQueryResult.
 *
 * Usage:
 *   const { data: summary, isLoading, isError, refetch } = useKpiSummary();
 */
export function useKpiSummary() {
  return useQuery<KpiSummary>({
    queryKey: kpiKeys.summary(),
    queryFn: fetchKpiSummary,
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
}
