/**
 * Shared DTO types for the KPI layer (Phase 3).
 *
 * Pure TypeScript — no runtime imports, no Zod schemas.
 * Both apps/api and apps/frontend import from this file via @acm-kpi/core.
 * Zod validation schemas live in apps/api/src/kpi/schemas.ts (Plan 03-05).
 */

// ─── Primitives ───────────────────────────────────────────────────────────────

export type KpiColor = "green" | "yellow" | "red" | "neutral";

export type ArticleType = "ART" | "MAT" | "HLB" | "WKZ";

export type AbcClass = "A" | "B" | "C";

export type ImportSource = "upload" | "watcher" | "cli";

// ─── Slow-mover sub-types ─────────────────────────────────────────────────────

/** One of the three value-weighted aging buckets (Active / Slow / Dead). */
export interface SlowMoverBucket {
  label: "active" | "slow" | "dead";
  /** Article count in this bucket */
  count: number;
  /** Total € value in this bucket */
  value_eur: number;
  /** Percentage of total non-excluded stock value (0–100) */
  pct: number;
}

// ─── Article summary (used in stockout preview + articles endpoint) ───────────

export interface ArticleSummary {
  artikelnr: string;
  bezeichnung_1: string | null;
  bestand_basiseinheit: number;
  wert_mit_abw: number;
  abc_kennz_vk: AbcClass;
}

// ─── Full article row (from /kpi/articles endpoint) ──────────────────────────

export interface ArticleRow {
  id: number;
  artikelnr: string;
  bezeichnung_1: string | null;
  typ: ArticleType;
  lagername: string;
  bestand_basiseinheit: number;
  einh: string | null;
  wert_mit_abw: number;
  letzt_zugang: string | null;    // ISO date string "YYYY-MM-DD"
  lagerabgang_dat: string | null; // ISO date string "YYYY-MM-DD"
  abc_kennz_vk: AbcClass;
}

// ─── Main KPI summary (GET /api/v1/kpi/summary) ───────────────────────────────

export interface KpiSummary {
  /** true when at least one successful import has been run */
  has_data: boolean;
  /** ISO 8601 timestamp of the latest successful import, or null */
  last_updated_at: string | null;
  /** Metadata from the latest successful import, or null */
  last_import: {
    filename: string;
    row_count: number;
    source: ImportSource;
  } | null;
  /** KPI-03: SUM(wert_mit_abw) for non-deleted rows */
  total_inventory_value: {
    value_eur: number;
    color: "neutral";
  };
  /** KPI-04: Weighted average days-on-hand (reichw_mon * 30, weighted by wert_mit_abw) */
  days_on_hand: {
    days: number;
    color: KpiColor; // green >=90d, yellow 30-89d, red <30d
  };
  /** KPI-05: Slow-mover / dead-stock aging buckets */
  slow_dead_stock: {
    buckets: SlowMoverBucket[];
    /** Dead-stock items with wert_mit_abw < €100, excluded from bucket totals */
    clutter_excluded_count: number;
    /** WKZ + MUSTERRAUM rows excluded from slow-mover analysis entirely */
    samples_excluded_count: number;
    color: KpiColor; // based on dead-stock % of total value: green <5%, yellow 5-15%, red >15%
  };
  /** KPI-06: Rows where bestand_lagereinheit <= 0 OR reichw_mon < 1 (non-deleted, non-museum) */
  stockouts: {
    count: number;
    /** Top 5 by wert_mit_abw DESC */
    items_preview: ArticleSummary[];
    color: KpiColor; // green =0, yellow 1-10, red >10
  };
  /** KPI-07: ABC distribution by count and value */
  abc_distribution: {
    a: { count: number; value_eur: number };
    b: { count: number; value_eur: number };
    c: { count: number; value_eur: number };
  };
  /** KPI-08: Proxy turnover ratio: SUM(umsatz_me_j) / SUM(bestand_basiseinheit) */
  inventory_turnover: {
    ratio: number;
    color: "neutral";
  };
  /** KPI-09: SUM(wert - wert_mit_abw) in € and as % of total wert */
  devaluation: {
    total_eur: number;
    pct_of_value: number; // 0–100
    color: "neutral";
  };
}

// ─── Articles query params (GET /api/v1/kpi/articles) ─────────────────────────

export interface ArticleFilterQuery {
  filter?: "slow" | "dead" | "stockout" | "search";
  bucket?: "active" | "slow" | "dead";
  warehouse?: string;
  wgr?: string;
  abc?: AbcClass;
  typ?: ArticleType;
  /** Search by Artikelnr or Bezeichnung 1 (partial match) */
  q?: string;
  limit?: number;
  offset?: number;
}

// ─── Articles list response ───────────────────────────────────────────────────

export interface ArticleListResponse {
  /** Total matching rows (before limit/offset) */
  total: number;
  items: ArticleRow[];
}

// ─── Filter metadata (GET /api/v1/kpi/meta) ───────────────────────────────────

export interface KpiMeta {
  /** Distinct lagername values from stock_rows */
  warehouses: string[];
  /** Distinct wgr values from stock_rows */
  product_groups: string[];
  abc_classes: AbcClass[];
  article_types: ArticleType[];
}
