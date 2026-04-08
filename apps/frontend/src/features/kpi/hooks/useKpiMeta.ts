import { useQuery } from "@tanstack/react-query";
import type { KpiMeta } from "@acm-kpi/core";
import { fetchKpiMeta, kpiKeys } from "../queries.js";

/**
 * React Query hook for filter dropdown metadata.
 *
 * Returns distinct warehouses, product groups, ABC classes, and article types.
 * Meta changes only on new imports, so it uses a 5-minute stale window
 * and does NOT poll (refetchInterval: false).
 *
 * Usage:
 *   const { data: meta } = useKpiMeta();
 *   // meta.warehouses → string[]
 */
export function useKpiMeta() {
  return useQuery<KpiMeta>({
    queryKey: kpiKeys.meta(),
    queryFn: fetchKpiMeta,
    staleTime: 5 * 60_000,
    refetchInterval: false,
  });
}
