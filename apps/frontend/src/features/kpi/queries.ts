import type {
  ArticleFilterQuery,
  ArticleListResponse,
  KpiMeta,
  KpiSummary,
} from "@acm-kpi/core";

// ─── Query key factories ───────────────────────────────────────────────────────

export const kpiKeys = {
  all: ["kpi"] as const,
  summary: () => ["kpi", "summary"] as const,
  articles: (params: ArticleFilterQuery) => ["kpi", "articles", params] as const,
  meta: () => ["kpi", "meta"] as const,
};

// ─── Fetch functions ───────────────────────────────────────────────────────────

/**
 * Fetches the KPI summary from GET /api/v1/kpi/summary.
 * Redirects to /login on 401 (session expired).
 */
export async function fetchKpiSummary(): Promise<KpiSummary> {
  const res = await fetch("/api/v1/kpi/summary", { credentials: "include" });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthenticated");
  }
  if (!res.ok) throw new Error(`KPI summary fetch failed: ${res.statusText}`);
  return res.json() as Promise<KpiSummary>;
}

/**
 * Fetches filtered article rows from GET /api/v1/kpi/articles.
 * Used by the drill-down modal and article search.
 */
export async function fetchArticles(params: ArticleFilterQuery): Promise<ArticleListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.append(k, String(v));
  }
  const res = await fetch(`/api/v1/kpi/articles?${qs.toString()}`, {
    credentials: "include",
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthenticated");
  }
  if (!res.ok) throw new Error(`Articles fetch failed: ${res.statusText}`);
  return res.json() as Promise<ArticleListResponse>;
}

/**
 * Fetches filter dropdown metadata from GET /api/v1/kpi/meta.
 * Returns distinct warehouses, product groups, ABC classes, article types.
 */
export async function fetchKpiMeta(): Promise<KpiMeta> {
  const res = await fetch("/api/v1/kpi/meta", { credentials: "include" });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthenticated");
  }
  if (!res.ok) throw new Error(`KPI meta fetch failed: ${res.statusText}`);
  return res.json() as Promise<KpiMeta>;
}
