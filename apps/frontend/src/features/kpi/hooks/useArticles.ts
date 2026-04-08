import { useQuery } from "@tanstack/react-query";
import type { ArticleFilterQuery, ArticleListResponse } from "@acm-kpi/core";
import { fetchArticles, kpiKeys } from "../queries.js";

type UseArticlesParams = ArticleFilterQuery & {
  /** Set to false to skip fetching (e.g. when modal is closed) */
  enabled?: boolean;
};

/**
 * React Query hook for fetching filtered article rows.
 *
 * Used by the drill-down modal and article search.
 * NOT polled — user-triggered only.
 * staleTime is 60s (articles are less volatile than the KPI summary).
 *
 * Usage:
 *   const { data, isLoading } = useArticles({ filter: 'stockout', enabled: isOpen });
 */
export function useArticles({ enabled = true, ...filterParams }: UseArticlesParams) {
  return useQuery<ArticleListResponse>({
    queryKey: kpiKeys.articles(filterParams),
    queryFn: () => fetchArticles(filterParams),
    enabled,
    staleTime: 60_000,
    refetchInterval: false,
  });
}
