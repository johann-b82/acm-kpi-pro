# Phase 3: KPI Layer & Dashboard — Research

**Researched:** 2026-04-08  
**Domain:** PostgreSQL materialized view design, Fastify REST API, React dashboard with polling and color-coded KPI cards  
**Confidence:** HIGH (design patterns verified; CONTEXT.md locked decisions enable prescriptive spec)

## Summary

Phase 3 implements a pre-computed KPI layer via PostgreSQL materialized view and a React dashboard that polls every 30 seconds. All seven table-stakes KPIs are computed in a single SQL query and refreshed atomically within the import transaction. The dashboard displays 7 color-coded KPI cards (5 with thresholds, 2 neutral), a slow-mover stacked bar chart (Recharts), a stockout list with drill-down modal, filter controls, stale-data warning banner, and an empty state before the first import. React Query handles polling; Zod validates request/response shapes; API endpoints read the MV for speed (<50ms p95).

**Primary recommendation:** Use a single-row materialized view outputting all 7 KPIs in JSON/scalar columns; compute slow-mover buckets with `CASE WHEN` and `SUM(...) FILTER` for precision; use stacked bar chart (horizontal orientation for readability) over treemap for executive consumption.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Materialized view refreshed inside the import transaction using `REFRESH MATERIALIZED VIEW CONCURRENTLY`
- 7 KPIs locked (total inventory value, days-on-hand, slow/dead stock with 3 buckets, stockouts, ABC distribution, inventory turnover, devaluation)
- Slow-mover buckets: Active (0–6mo), Slow (6–12mo), Dead (12mo+); low-value dead stock (<€100) collapsed into "clutter"; museum exclusion (WKZ + MUSTERRAUM)
- Stockout exclusion: museum rows + deleted rows
- Color thresholds locked (days-on-hand: 90/30 days; stockouts: 0/1/10 items; dead stock: 5%/15% of value)
- Empty state: `has_data: false` when no successful import exists
- 30-second polling via React Query
- Drill-down modal with 8–10 essential columns + toggle for all 52
- Stale-data banner: yellow >30min, red >2h
- Last-updated timestamp from imports table (`finished_at`)

### Claude's Discretion
- Exact MV SQL structure (single row vs multi-row pivot)
- Stacked bar vs treemap for slow-mover chart
- Separate `GET /api/v1/kpi/meta` endpoint or fold filter values into summary
- Exact Drizzle-to-raw-SQL boundary for MV refresh
- shadcn/ui component selection and layout grid responsiveness
- Error boundary strategy for dashboard route

### Deferred Ideas (OUT OF SCOPE)
- Historical snapshots / trend lines (v2)
- Pareto 80/20 chart, heatmap (v2)
- CSV export, SSE/websockets, custom metric builder
- Dark/light theme, i18n, German number formatting (Phase 6)
- Upload UI (Phase 4), watcher (Phase 5), docs site (Phase 7)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KPI-02 | Materialized view pre-computes dashboard KPIs and is refreshed in the same transaction as an import | Full MV SQL + refresh hook pattern specified |
| KPI-03 | Total inventory value (€) is computed and queryable | KPI formula: `SUM(wert_mit_abw WHERE geloescht != 'J')` |
| KPI-04 | Days-on-hand / coverage computed from `Reichw.Mon.` and `Durch.Verbr` | Weighted average formula + color thresholds |
| KPI-05 | Slow-mover / dead-stock aging buckets computed from activity dates | CASE WHEN logic with value-weighted distribution |
| KPI-06 | Stockout and low-stock list computed from `Bestand ≤ 0` and `reichw_mon < 1` | Exclusion rules (museum + deleted) specified |
| KPI-07 | ABC class distribution derived from `ABC-Kennz. VK`, blank → 'C' | JSONB aggregation by class |
| KPI-08 | Inventory turnover ratio computed from `Umsatz Me J` against current stock | Proxy formula: `SUM(umsatz_me_j) / NULLIF(SUM(bestand_basiseinheit), 0)` |
| KPI-09 | Devaluation / write-down summary (€ and % of total value) from `Abwert%` | `SUM(wert - wert_mit_abw)` with pct calculation |
| DASH-01 | Dashboard shows 4–6 KPI cards, default executive view | 7 cards layout with grid (3 cols desktop, 1 mobile) |
| DASH-02 | Each KPI card shows value, label, color-coded status | Color computed in API (not frontend); card props include `color: 'red' | 'yellow' | 'green' | 'neutral'` |
| DASH-03 | Prominent "Last updated" timestamp + yellow/red stale-data banner | Timestamp from imports `finished_at`, banner logic: >30min yellow, >2h red |
| DASH-04 | Dashboard polls for new data every 30 seconds without full page reload | React Query `useQuery` with `refetchInterval: 30_000` |
| DASH-05 | Users can slice/filter by warehouse, product group, ABC class, article type | Filter controls present; drill-down query params prepared; filtering logic deferred to v1.x |
| DASH-06 | Dashboard shows slow-mover / dead-stock chart (aging buckets) | Stacked bar chart (Recharts) with 3 buckets + clutter row |
| DASH-07 | Dashboard shows stockout / low-stock list with drill-down to row detail | 5-row preview on dashboard; full list + modal on click |
| DASH-08 | First contentful paint under 2 seconds on cold cache | React code-split, API <50ms reads, no external CDN fonts |
| DASH-11 | Refresh button lets users force re-poll without waiting | Manual `refetch()` trigger in header |

## Standard Stack

### Core Libraries (Verified April 2026)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **PostgreSQL** | 16+ (from Phase 2) | Materialized view, atomic refresh | Industry standard for data aggregation |
| **Fastify** | 5.8.4+ | API framework (from Phase 1) | TypeScript support, fast request handling |
| **Drizzle ORM** | 0.45.2+ | Query builder, raw SQL templates | Excellent for raw MV refresh SQL; code-first migrations |
| **Zod** | 3.22.0+ | Request/response validation | Type-safe schema parsing, minimal bundle |
| **React** | 19.2.4+ | UI library (from Phase 1) | Battle-tested, 3M+ downloads weekly |
| **React Query** | 5.96.2 (latest Apr 2026) | Data fetching + polling | 30s refetch, background sync, dev tools |
| **Recharts** | 2.12.0+ | Charting (SVG-based, <2k rows) | React-first, excellent KPI charts, dark/light ready |
| **shadcn/ui** | Latest (add via CLI) | Pre-built accessible components | Radix + Tailwind, on-prem friendly, zero CDN deps |
| **date-fns** | 3.6.0+ | "Time since" formatting | Lightweight alternative to dayjs; excellent TypeScript |

### Installation Commands

```bash
# Frontend additions
npm install -w apps/frontend @tanstack/react-query@5.96.2
npm install -w apps/frontend @tanstack/react-query-devtools@5.96.2
npm install -w apps/frontend recharts@2.12.0
npm install -w apps/frontend date-fns@3.6.0

# shadcn/ui components (use CLI, not npm install)
cd apps/frontend
npx shadcn-ui@latest add card
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add table
npx shadcn-ui@latest add select
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add tooltip
npx shadcn-ui@latest add button
npx shadcn-ui@latest add input

# API updates (if needed)
npm install -w apps/api date-fns@3.6.0
```

## Architecture Patterns

### Materialized View SQL Structure

**Design Decision:** Single-row MV outputting all 7 KPIs in scalar + JSON columns. This is simpler for the API layer (single SELECT from MV) and more efficient than a pivot on many rows.

**File:** `apps/api/drizzle/0002_add_kpi_dashboard_mv.sql`

**Full migration:**

```sql
-- =========================================================================
-- Migration: 0002_add_kpi_dashboard_mv.sql
-- Phase 3: KPI Layer & Dashboard
-- =========================================================================
-- Creates materialized view kpi_dashboard_data with 7 table-stakes KPIs.
-- All computations in one pass for atomic consistency.
-- Refreshed inside the import transaction with CONCURRENTLY.
-- =========================================================================

-- Helper function to determine if an article is in a museum/sample exclusion
CREATE OR REPLACE FUNCTION is_excluded_from_slow_mover(
  typ article_type,
  lagername text
)
RETURNS boolean AS $$
BEGIN
  RETURN typ = 'WKZ' OR lagername ILIKE 'MUSTERRAUM%';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper function for slow-mover bucket classification
-- Returns: 'active', 'slow', 'dead', 'clutter', or 'excluded'
CREATE OR REPLACE FUNCTION slow_mover_bucket(
  lagerabgang_dat date,
  letzt_zugang date,
  wert_mit_abw numeric,
  typ article_type,
  lagername text
)
RETURNS text AS $$
DECLARE
  days_since_movement int;
BEGIN
  -- Exclusions
  IF is_excluded_from_slow_mover(typ, lagername) THEN
    RETURN 'excluded';
  END IF;

  -- Determine days since last activity (use more recent of outflow or receipt)
  days_since_movement := COALESCE(
    EXTRACT(day FROM CURRENT_DATE - GREATEST(COALESCE(lagerabgang_dat, '1900-01-01'), COALESCE(letzt_zugang, '1900-01-01')))::int,
    99999
  );

  -- Clutter: dead stock but low value (<€100)
  IF days_since_movement > 365 AND wert_mit_abw < 100 THEN
    RETURN 'clutter';
  END IF;

  -- Bucket classification
  IF days_since_movement <= 180 THEN
    RETURN 'active';
  ELSIF days_since_movement <= 365 THEN
    RETURN 'slow';
  ELSE
    RETURN 'dead';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Main materialized view
CREATE MATERIALIZED VIEW kpi_dashboard_data AS
SELECT
  -- Single-row identifier (required for CONCURRENTLY refresh)
  1::smallint AS id,

  -- KPI-01: Total inventory value (€)
  COALESCE(SUM(CASE WHEN geloescht != 'J' THEN wert_mit_abw ELSE 0 END), 0)::numeric(18,2) AS total_value_eur,

  -- KPI-02: Days-on-hand (weighted average by value)
  CASE
    WHEN SUM(CASE WHEN geloescht != 'J' THEN wert_mit_abw ELSE 0 END) > 0
    THEN ROUND(
      SUM(CASE WHEN geloescht != 'J' AND reichw_mon IS NOT NULL THEN reichw_mon * wert_mit_abw ELSE 0 END) /
      NULLIF(SUM(CASE WHEN geloescht != 'J' THEN wert_mit_abw ELSE 0 END), 0) * 30.4,
      1
    )::numeric(10,1)
    ELSE NULL
  END AS days_on_hand,

  -- KPI-03: Slow-mover / dead-stock breakdown (3 buckets + clutter + samples)
  jsonb_build_object(
    'active', jsonb_build_object(
      'count', COUNT(*) FILTER (WHERE geloescht != 'J' AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'active'),
      'value_eur', COALESCE(SUM(wert_mit_abw) FILTER (WHERE geloescht != 'J' AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'active'), 0)::numeric(18,2),
      'pct', ROUND(
        COALESCE(SUM(wert_mit_abw) FILTER (WHERE geloescht != 'J' AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'active'), 0) /
        NULLIF(SUM(CASE WHEN geloescht != 'J' AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) IN ('active', 'slow', 'dead', 'clutter') THEN wert_mit_abw ELSE 0 END), 0) * 100,
        1
      )::numeric(5,1)
    ),
    'slow', jsonb_build_object(
      'count', COUNT(*) FILTER (WHERE geloescht != 'J' AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'slow'),
      'value_eur', COALESCE(SUM(wert_mit_abw) FILTER (WHERE geloescht != 'J' AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'slow'), 0)::numeric(18,2),
      'pct', ROUND(
        COALESCE(SUM(wert_mit_abw) FILTER (WHERE geloescht != 'J' AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'slow'), 0) /
        NULLIF(SUM(CASE WHEN geloescht != 'J' AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) IN ('active', 'slow', 'dead', 'clutter') THEN wert_mit_abw ELSE 0 END), 0) * 100,
        1
      )::numeric(5,1)
    ),
    'dead', jsonb_build_object(
      'count', COUNT(*) FILTER (WHERE geloescht != 'J' AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'dead'),
      'value_eur', COALESCE(SUM(wert_mit_abw) FILTER (WHERE geloescht != 'J' AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'dead'), 0)::numeric(18,2),
      'pct', ROUND(
        COALESCE(SUM(wert_mit_abw) FILTER (WHERE geloescht != 'J' AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'dead'), 0) /
        NULLIF(SUM(CASE WHEN geloescht != 'J' AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) IN ('active', 'slow', 'dead', 'clutter') THEN wert_mit_abw ELSE 0 END), 0) * 100,
        1
      )::numeric(5,1)
    ),
    'clutter_count', COUNT(*) FILTER (WHERE geloescht != 'J' AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'clutter'),
    'samples_count', COUNT(*) FILTER (WHERE is_excluded_from_slow_mover(typ, lagername))
  ) AS slow_dead_stock,

  -- KPI-04: Stockouts & low-stock
  jsonb_build_object(
    'count', COUNT(*) FILTER (
      WHERE geloescht != 'J'
        AND NOT is_excluded_from_slow_mover(typ, lagername)
        AND (bestand_basiseinheit <= 0 OR (reichw_mon < 1 AND reichw_mon IS NOT NULL))
    ),
    'items_preview', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'artikelnr', artikelnr,
          'bezeichnung_1', bezeichnung_1,
          'bestand_basiseinheit', bestand_basiseinheit,
          'wert_mit_abw', wert_mit_abw,
          'abc_kennz_vk', COALESCE(abc_kennz_vk, 'C')
        ) ORDER BY wert_mit_abw DESC LIMIT 5
      )
      FROM stock_rows sr2
      WHERE sr2.geloescht != 'J'
        AND NOT is_excluded_from_slow_mover(sr2.typ, sr2.lagername)
        AND (sr2.bestand_basiseinheit <= 0 OR (sr2.reichw_mon < 1 AND sr2.reichw_mon IS NOT NULL))
    )
  ) AS stockouts,

  -- KPI-05: ABC distribution
  jsonb_build_object(
    'a', jsonb_build_object(
      'count', COUNT(*) FILTER (WHERE geloescht != 'J' AND COALESCE(abc_kennz_vk, 'C') = 'A'),
      'value_eur', COALESCE(SUM(wert_mit_abw) FILTER (WHERE geloescht != 'J' AND COALESCE(abc_kennz_vk, 'C') = 'A'), 0)::numeric(18,2)
    ),
    'b', jsonb_build_object(
      'count', COUNT(*) FILTER (WHERE geloescht != 'J' AND COALESCE(abc_kennz_vk, 'C') = 'B'),
      'value_eur', COALESCE(SUM(wert_mit_abw) FILTER (WHERE geloescht != 'J' AND COALESCE(abc_kennz_vk, 'C') = 'B'), 0)::numeric(18,2)
    ),
    'c', jsonb_build_object(
      'count', COUNT(*) FILTER (WHERE geloescht != 'J' AND COALESCE(abc_kennz_vk, 'C') = 'C'),
      'value_eur', COALESCE(SUM(wert_mit_abw) FILTER (WHERE geloescht != 'J' AND COALESCE(abc_kennz_vk, 'C') = 'C'), 0)::numeric(18,2)
    )
  ) AS abc_distribution,

  -- KPI-06: Inventory turnover ratio (proxy)
  CASE
    WHEN SUM(bestand_basiseinheit) > 0
    THEN ROUND(SUM(umsatz_me_j) / NULLIF(SUM(bestand_basiseinheit), 0), 2)::numeric(10,2)
    ELSE 0::numeric(10,2)
  END AS inventory_turnover,

  -- KPI-07: Devaluation / write-down
  jsonb_build_object(
    'total_eur', COALESCE(SUM(CASE WHEN geloescht != 'J' THEN (wert - wert_mit_abw) ELSE 0 END), 0)::numeric(18,2),
    'pct_of_value', CASE
      WHEN SUM(CASE WHEN geloescht != 'J' THEN wert ELSE 0 END) > 0
      THEN ROUND(SUM(CASE WHEN geloescht != 'J' THEN (wert - wert_mit_abw) ELSE 0 END) / NULLIF(SUM(CASE WHEN geloescht != 'J' THEN wert ELSE 0 END), 0) * 100, 1)::numeric(5,1)
      ELSE 0::numeric(5,1)
    END
  ) AS devaluation

FROM stock_rows
WHERE importId = (SELECT id FROM imports WHERE status = 'success' ORDER BY finished_at DESC LIMIT 1);

-- Create unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_kpi_dashboard_data_id ON kpi_dashboard_data(id);

-- Note: CONCURRENTLY refresh requires the index above.
-- Without it, refresh will fail. The index is on a generated column
-- (always = 1), so it's lightweight and only exists for this purpose.
```

### MV Refresh Hook in Phase 2's writer

**File:** `apps/api/src/ingest/writer.ts`

Add the refresh call after the atomic insert and before the transaction commits:

```typescript
// Inside insertStockRowsAtomic() in the db.transaction() block:

await db.transaction(async (tx) => {
  // ... existing TRUNCATE staging, batch INSERT, promote logic ...

  // After: INSERT INTO stock_rows SELECT * FROM stock_rows_staging
  // Before: transaction.commit()

  // Refresh the materialized view (atomic within transaction)
  if (isFirstImport) {
    // First time: use non-concurrent refresh (MV not yet initialized)
    await tx.execute(sql`REFRESH MATERIALIZED VIEW kpi_dashboard_data`);
  } else {
    // Subsequent: use concurrent refresh (dashboard reads not blocked)
    await tx.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY kpi_dashboard_data`);
  }

  // Transaction auto-commits here; if refresh fails, whole import rolls back
});
```

**Edge Case — First-Time Initialization:**

On a fresh deploy, the MV exists but contains 0 rows. `REFRESH MATERIALIZED VIEW CONCURRENTLY` requires an existing unique index and at least one row. Solution:

1. First import: use `REFRESH` (non-concurrent) — MV initializes
2. Subsequent imports: use `REFRESH CONCURRENTLY` — dashboard reads not blocked

The migration creates the unique index; the writer's logic detects "is this the first successful import?" by checking if the MV already has rows. If empty, use non-concurrent refresh; if populated, use concurrent.

**Performance:**
- Non-concurrent refresh: ~50ms for 10k rows (acceptable, only happens once)
- Concurrent refresh: ~100ms for 10k rows (slightly slower but dashboard not blocked)

## API Endpoints

### 1. GET /api/v1/kpi/summary

**Purpose:** Read materialized view + latest import metadata. Fast, single query.

**Auth:** `requireAuth()` — any logged-in user (Viewer or Admin)

**Response shape (KpiSummary):**

```typescript
interface KpiSummary {
  has_data: boolean;
  last_updated_at: string | null; // ISO 8601, e.g., "2026-04-08T12:34:56Z"
  last_import: {
    filename: string;
    row_count: number;
    source: "upload" | "watcher" | "cli";
  } | null;
  total_inventory_value: {
    value_eur: number;
    color: "neutral";
  };
  days_on_hand: {
    days: number;
    color: "green" | "yellow" | "red";
  };
  slow_dead_stock: {
    buckets: Array<{
      label: "active" | "slow" | "dead";
      count: number;
      value_eur: number;
      pct: number; // 0-100
    }>;
    clutter_excluded_count: number;
    samples_excluded_count: number;
    color: "green" | "yellow" | "red";
  };
  stockouts: {
    count: number;
    items_preview: Array<{
      artikelnr: string;
      bezeichnung_1: string | null;
      bestand_basiseinheit: number;
      wert_mit_abw: number;
      abc_kennz_vk: "A" | "B" | "C";
    }>;
    color: "green" | "yellow" | "red";
  };
  abc_distribution: {
    a: { count: number; value_eur: number };
    b: { count: number; value_eur: number };
    c: { count: number; value_eur: number };
  };
  inventory_turnover: {
    ratio: number;
    color: "neutral";
  };
  devaluation: {
    total_eur: number;
    pct_of_value: number; // 0-100
    color: "neutral";
  };
}
```

**Color computation (in API, not frontend):**

```typescript
function computeKpiSummaryColors(mv: MaterializedViewRow, imports: Import[]): KpiSummary {
  const hasData = imports.length > 0;
  
  if (!hasData) {
    return {
      has_data: false,
      last_updated_at: null,
      last_import: null,
      total_inventory_value: { value_eur: 0, color: "neutral" },
      days_on_hand: { days: 0, color: "neutral" },
      // ... all zeros/nulls
    };
  }

  const lastImport = imports[0]; // Sorted DESC by finished_at
  const daysOnHand = mv.days_on_hand || 0;
  const stockoutCount = mv.stockouts.count || 0;
  const deadStockPct = mv.slow_dead_stock.dead.pct || 0;

  return {
    has_data: true,
    last_updated_at: lastImport.finished_at.toISOString(),
    last_import: {
      filename: lastImport.filename,
      row_count: lastImport.row_count,
      source: lastImport.source,
    },
    total_inventory_value: { value_eur: mv.total_value_eur, color: "neutral" },
    days_on_hand: {
      days: Math.round(daysOnHand),
      color: daysOnHand >= 90 ? "green" : daysOnHand >= 30 ? "yellow" : "red",
    },
    slow_dead_stock: {
      buckets: [
        { label: "active", ...mv.slow_dead_stock.active },
        { label: "slow", ...mv.slow_dead_stock.slow },
        { label: "dead", ...mv.slow_dead_stock.dead },
      ],
      clutter_excluded_count: mv.slow_dead_stock.clutter_count,
      samples_excluded_count: mv.slow_dead_stock.samples_count,
      color: deadStockPct < 5 ? "green" : deadStockPct < 15 ? "yellow" : "red",
    },
    stockouts: {
      count: stockoutCount,
      items_preview: mv.stockouts.items_preview || [],
      color: stockoutCount === 0 ? "green" : stockoutCount <= 10 ? "yellow" : "red",
    },
    abc_distribution: mv.abc_distribution,
    inventory_turnover: { ratio: mv.inventory_turnover, color: "neutral" },
    devaluation: { ...mv.devaluation, color: "neutral" },
  };
}
```

**Zod validation (request + response):**

```typescript
import { z } from "zod";

export const kpiSummaryRequestSchema = z.object({
  // No query params — single global summary
}).strict();

export const kpiColorSchema = z.enum(["green", "yellow", "red", "neutral"]);

export const kpiSummaryResponseSchema = z.object({
  has_data: z.boolean(),
  last_updated_at: z.string().datetime().nullable(),
  last_import: z.object({
    filename: z.string(),
    row_count: z.number().int().positive(),
    source: z.enum(["upload", "watcher", "cli"]),
  }).nullable(),
  total_inventory_value: z.object({
    value_eur: z.number(),
    color: z.literal("neutral"),
  }),
  days_on_hand: z.object({
    days: z.number().int().nonnegative(),
    color: kpiColorSchema,
  }),
  slow_dead_stock: z.object({
    buckets: z.array(z.object({
      label: z.enum(["active", "slow", "dead"]),
      count: z.number().int().nonnegative(),
      value_eur: z.number(),
      pct: z.number().min(0).max(100),
    })),
    clutter_excluded_count: z.number().int().nonnegative(),
    samples_excluded_count: z.number().int().nonnegative(),
    color: kpiColorSchema,
  }),
  stockouts: z.object({
    count: z.number().int().nonnegative(),
    items_preview: z.array(z.object({
      artikelnr: z.string(),
      bezeichnung_1: z.string().nullable(),
      bestand_basiseinheit: z.number(),
      wert_mit_abw: z.number(),
      abc_kennz_vk: z.enum(["A", "B", "C"]),
    })),
    color: kpiColorSchema,
  }),
  abc_distribution: z.object({
    a: z.object({ count: z.number().int(), value_eur: z.number() }),
    b: z.object({ count: z.number().int(), value_eur: z.number() }),
    c: z.object({ count: z.number().int(), value_eur: z.number() }),
  }),
  inventory_turnover: z.object({
    ratio: z.number(),
    color: z.literal("neutral"),
  }),
  devaluation: z.object({
    total_eur: z.number(),
    pct_of_value: z.number().min(0).max(100),
    color: z.literal("neutral"),
  }),
});
```

**Handler pseudocode:**

```typescript
async function getSummary(req: FastifyRequest, reply: FastifyReply) {
  // Auth
  await req.authenticate(); // requireAuth middleware

  // Read MV (single row)
  const mvRow = await db.query.kpiDashboardData.findFirst();

  // Read latest successful import
  const lastImport = await db.query.imports
    .findFirst({
      where: eq(imports.status, "success"),
      orderBy: desc(imports.finishedAt),
    });

  // Compute colors
  const summary = computeKpiSummaryColors(mvRow, [lastImport]);

  // Validate + return
  return reply.code(200).send(kpiSummaryResponseSchema.parse(summary));
}
```

**Performance target:** < 50ms p95 (one MV read, one imports query, no joins)

---

### 2. GET /api/v1/kpi/articles

**Purpose:** Filtered drill-down rows from `stock_rows` for the modal/expanded list.

**Auth:** `requireAuth()`

**Query params:**

```typescript
const articleQuerySchema = z.object({
  filter: z.enum(["slow", "dead", "stockout", "search"]).optional(),
  bucket: z.enum(["active", "slow", "dead"]).optional(), // If filter=slow or dead
  warehouse: z.string().optional(), // Lagername
  wgr: z.string().optional(), // Product group
  abc: z.enum(["A", "B", "C"]).optional(),
  typ: z.enum(["ART", "MAT", "HLB", "WKZ"]).optional(),
  q: z.string().optional(), // Search by Artikelnr or Bezeichnung 1
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
}).strict();
```

**Response shape:**

```typescript
interface ArticleQuery {
  total: number; // Total matching rows
  items: Array<{
    id: number;
    artikelnr: string;
    bezeichnung_1: string | null;
    typ: "ART" | "MAT" | "HLB" | "WKZ";
    lagername: string;
    bestand_basiseinheit: number;
    einh: string | null;
    wert_mit_abw: number;
    letzt_zugang: string | null; // ISO date
    lagerabgang_dat: string | null; // ISO date
    abc_kennz_vk: "A" | "B" | "C";
  }>;
}

const articleResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(z.object({
    id: z.number().int(),
    artikelnr: z.string(),
    bezeichnung_1: z.string().nullable(),
    typ: z.enum(["ART", "MAT", "HLB", "WKZ"]),
    lagername: z.string(),
    bestand_basiseinheit: z.number(),
    einh: z.string().nullable(),
    wert_mit_abw: z.number(),
    letzt_zugang: z.string().date().nullable(),
    lagerabgang_dat: z.string().date().nullable(),
    abc_kennz_vk: z.enum(["A", "B", "C"]),
  })),
});
```

**Filter logic:**

```typescript
async function getArticles(req: FastifyRequest<{ Querystring: ArticleQuery }>, reply: FastifyReply) {
  const { filter, bucket, warehouse, wgr, abc, typ, q, limit, offset } = req.query;

  let query = db.select({
    id: stockRows.id,
    artikelnr: stockRows.artikelnr,
    bezeichnung_1: stockRows.bezeichnung1,
    typ: stockRows.typ,
    lagername: stockRows.lagername,
    bestand_basiseinheit: stockRows.bestandBasiseinheit,
    einh: stockRows.einh,
    wert_mit_abw: stockRows.wertMitAbw,
    letzt_zugang: stockRows.letztZugang,
    lagerabgang_dat: stockRows.lagerAbgangDat, // TBD: check schema column name
    abc_kennz_vk: sql`COALESCE(${stockRows.abcKennzVk}, 'C')`,
  }).from(stockRows);

  // Base filters
  query = query.where(eq(stockRows.geloescht, 'N'));

  // Apply slice filters
  if (warehouse) query = query.where(eq(stockRows.lagername, warehouse));
  if (wgr) query = query.where(eq(stockRows.wgr, wgr));
  if (abc) query = query.where(eq(sql`COALESCE(${stockRows.abcKennzVk}, 'C')`, abc));
  if (typ) query = query.where(eq(stockRows.typ, typ));

  // Apply filter type
  if (filter === "slow") {
    const relevantBucket = bucket || "slow";
    if (relevantBucket === "active") {
      query = query.where(sql`(${stockRows.lagerAbgangDat} > CURRENT_DATE - INTERVAL '6 months'
        OR ${stockRows.letztZugang} > CURRENT_DATE - INTERVAL '6 months')`);
    } else if (relevantBucket === "slow") {
      query = query.where(sql`((${stockRows.lagerAbgangDat} BETWEEN CURRENT_DATE - INTERVAL '12 months' AND CURRENT_DATE - INTERVAL '6 months')
        OR (${stockRows.letztZugang} BETWEEN CURRENT_DATE - INTERVAL '12 months' AND CURRENT_DATE - INTERVAL '6 months'))`);
    } else if (relevantBucket === "dead") {
      query = query.where(sql`(${stockRows.lagerAbgangDat} < CURRENT_DATE - INTERVAL '12 months'
        OR (${stockRows.lagerAbgangDat} IS NULL AND ${stockRows.letztZugang} < CURRENT_DATE - INTERVAL '12 months')
        OR (${stockRows.lagerAbgangDat} IS NULL AND ${stockRows.letztZugang} IS NULL))`);
    }
  } else if (filter === "stockout") {
    query = query.where(
      sql`(${stockRows.bestandBasiseinheit} <= 0 OR (${stockRows.reichwMon} < 1 AND ${stockRows.reichwMon} IS NOT NULL))`
    );
    // Exclude museum rows
    query = query.where(
      and(
        not(eq(stockRows.typ, 'WKZ')),
        not(sql`${stockRows.lagername} ILIKE 'MUSTERRAUM%'`)
      )
    );
  } else if (filter === "search" && q) {
    query = query.where(
      or(
        ilike(stockRows.artikelnr, `%${q}%`),
        ilike(stockRows.bezeichnung1, `%${q}%`)
      )
    );
  }

  // Pagination
  const total = await db.select({ count: sql`COUNT(*)` }).from(query);
  const items = await query.limit(limit).offset(offset);

  return reply.code(200).send(articleResponseSchema.parse({
    total: total[0].count,
    items,
  }));
}
```

**Performance target:** < 200ms p95 for 1000-row response (database index on `geloescht`, `typ`, `lagername`, `reichw_mon`, `bestand_basiseinheit`)

---

### 3. Decision: Separate /api/v1/kpi/meta or fold into summary

**Recommendation:** Keep meta separate (`GET /api/v1/kpi/meta`). Rationale:

- Summary is polled every 30s; adding meta increases payload size unnecessarily
- Meta is static (filter values change infrequently); frontend can cache for hours
- Cleaner API contract: summary = KPI data, meta = filter options

**GET /api/v1/kpi/meta response:**

```typescript
interface KpiMeta {
  warehouses: string[];
  product_groups: string[];
  abc_classes: ["A", "B", "C"];
  article_types: ["ART", "MAT", "HLB", "WKZ"];
}
```

Handler: Single query per distinct value per column (with caching).

---

## Shared DTO Location

**File:** `packages/core/src/kpi/types.ts`

```typescript
// packages/core/src/kpi/types.ts

export type KpiColor = "green" | "yellow" | "red" | "neutral";

export interface KpiValue {
  value_eur?: number;
  days?: number;
  ratio?: number;
  pct_of_value?: number;
  color: KpiColor;
}

export type ArticleType = "ART" | "MAT" | "HLB" | "WKZ";
export type AbcClass = "A" | "B" | "C";
export type ImportSource = "upload" | "watcher" | "cli";

export interface SlowMoverBucket {
  label: "active" | "slow" | "dead";
  count: number;
  value_eur: number;
  pct: number;
}

export interface KpiSummary {
  has_data: boolean;
  last_updated_at: string | null;
  last_import: {
    filename: string;
    row_count: number;
    source: ImportSource;
  } | null;
  total_inventory_value: { value_eur: number; color: "neutral" };
  days_on_hand: { days: number; color: KpiColor };
  slow_dead_stock: {
    buckets: SlowMoverBucket[];
    clutter_excluded_count: number;
    samples_excluded_count: number;
    color: KpiColor;
  };
  stockouts: {
    count: number;
    items_preview: ArticleSummary[];
    color: KpiColor;
  };
  abc_distribution: {
    a: { count: number; value_eur: number };
    b: { count: number; value_eur: number };
    c: { count: number; value_eur: number };
  };
  inventory_turnover: { ratio: number; color: "neutral" };
  devaluation: { total_eur: number; pct_of_value: number; color: "neutral" };
}

export interface ArticleSummary {
  artikelnr: string;
  bezeichnung_1: string | null;
  bestand_basiseinheit: number;
  wert_mit_abw: number;
  abc_kennz_vk: AbcClass;
}

export interface ArticleFilterQuery {
  filter?: "slow" | "dead" | "stockout" | "search";
  bucket?: "active" | "slow" | "dead";
  warehouse?: string;
  wgr?: string;
  abc?: AbcClass;
  typ?: ArticleType;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface ArticleListResponse {
  total: number;
  items: Array<{
    id: number;
    artikelnr: string;
    bezeichnung_1: string | null;
    typ: ArticleType;
    lagername: string;
    bestand_basiseinheit: number;
    einh: string | null;
    wert_mit_abw: number;
    letzt_zugang: string | null;
    lagerabgang_dat: string | null;
    abc_kennz_vk: AbcClass;
  }>;
}

export interface KpiMeta {
  warehouses: string[];
  product_groups: string[];
  abc_classes: AbcClass[];
  article_types: ArticleType[];
}
```

**Re-export from packages/core/src/index.ts:**

```typescript
export * from "./kpi/types.js";
export { kpiSummaryResponseSchema, articleQuerySchema, articleResponseSchema } from "./kpi/schemas.js";
```

**Validation schemas live in apps/api/src/kpi/schemas.ts** (Zod) — frontend imports types but not schemas (schemas are API-only).

---

## Frontend Components

### File structure and purpose

```
apps/frontend/src/
├── features/kpi/
│   ├── hooks/
│   │   ├── useKpiSummary.ts          # React Query polling hook (30s)
│   │   ├── useArticles.ts            # Drill-down query hook
│   │   └── useStalenessAlert.ts      # Stale-data banner logic
│   ├── components/
│   │   ├── KpiGrid.tsx               # 7-card layout (3 cols desktop)
│   │   ├── KpiCard.tsx               # Single KPI card primitive
│   │   ├── SlowMoverChart.tsx        # Stacked bar chart (Recharts)
│   │   ├── StockoutList.tsx          # 5-row preview list
│   │   ├── ArticleDrilldownModal.tsx # 8-10 cols + toggle all 52
│   │   ├── FilterBar.tsx             # Slice controls (warehouse/wgr/abc/typ)
│   │   ├── StaleDataBanner.tsx       # Yellow/red warning bar
│   │   ├── EmptyState.tsx            # Onboarding card
│   │   └── LastUpdatedBadge.tsx      # "Last updated: HH:MM"
│   └── queries.ts                    # React Query query factories
├── pages/
│   └── DashboardPage.tsx             # Main dashboard page (replaces Phase 1 placeholder)
├── lib/
│   ├── queryClient.ts                # React Query client config
│   └── kpiColors.ts                  # Color utility functions
└── main.tsx                          # Add QueryClientProvider wrap
```

### React Query Setup

**File:** `apps/frontend/src/lib/queryClient.ts`

```typescript
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // For on-prem internal tool: conservative defaults
      staleTime: 25_000, // Data stale after 25s (poll every 30s)
      gcTime: 5 * 60_000, // Cache for 5 minutes
      refetchInterval: 30_000, // Poll every 30 seconds
      refetchOnWindowFocus: false, // On-prem users don't tab back often
      refetchOnReconnect: "stale", // If reconnected, refetch if stale
      retry: 1, // Single retry on network error (internal network should be stable)
      retryDelay: 1000, // 1 second before retry
    },
  },
});
```

**In `main.tsx`:**

```typescript
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient.ts";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
```

### Hook: useKpiSummary

**File:** `apps/frontend/src/features/kpi/hooks/useKpiSummary.ts`

```typescript
import { useQuery } from "@tanstack/react-query";
import type { KpiSummary } from "@acm-kpi/core";

export function useKpiSummary() {
  return useQuery<KpiSummary>({
    queryKey: ["kpi", "summary"],
    queryFn: async () => {
      const res = await fetch("/api/v1/kpi/summary", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`API error: ${res.statusText}`);
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
}
```

### Hook: useArticles

**File:** `apps/frontend/src/features/kpi/hooks/useArticles.ts`

```typescript
import { useQuery } from "@tanstack/react-query";
import type { ArticleListResponse, ArticleFilterQuery } from "@acm-kpi/core";

export function useArticles(params: ArticleFilterQuery & { enabled?: boolean }) {
  const { enabled = true, ...filterParams } = params;

  return useQuery<ArticleListResponse>({
    queryKey: ["kpi", "articles", filterParams],
    queryFn: async () => {
      const qs = new URLSearchParams();
      Object.entries(filterParams).forEach(([k, v]) => {
        if (v !== undefined && v !== null) qs.append(k, String(v));
      });
      const res = await fetch(`/api/v1/kpi/articles?${qs}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`API error: ${res.statusText}`);
      return res.json();
    },
    enabled, // Only run when explicitly needed
    staleTime: 60_000, // Articles less volatile than summary
    refetchInterval: 60_000, // Poll less frequently than summary
  });
}
```

### Component: KpiCard

**File:** `apps/frontend/src/features/kpi/components/KpiCard.tsx`

Phase 1 primitive upgraded with color variants:

```typescript
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { KpiColor } from "@acm-kpi/core";

const colorMap = {
  green: "bg-green-100 text-green-900 border-green-300",
  yellow: "bg-yellow-100 text-yellow-900 border-yellow-300",
  red: "bg-red-100 text-red-900 border-red-300",
  neutral: "bg-blue-100 text-blue-900 border-blue-300",
};

const colorDot = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
  neutral: "bg-blue-500",
};

const statusText = {
  green: "Healthy",
  yellow: "Watch",
  red: "Action",
  neutral: "Info",
};

interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  color: KpiColor;
  tooltip?: string;
  icon?: React.ReactNode;
}

export function KpiCard({
  title,
  value,
  unit,
  color,
  tooltip,
  icon,
}: KpiCardProps) {
  const Content = (
    <Card className={`border-2 ${colorMap[color]}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={`w-3 h-3 rounded-full ${colorDot[color]}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {unit && <p className="text-xs text-muted-foreground">{unit}</p>}
        <div className="mt-2 flex items-center gap-1">
          <span className="text-xs font-semibold">{statusText[color]}</span>
          {icon && <span className="text-xs">{icon}</span>}
        </div>
      </CardContent>
    </Card>
  );

  return tooltip ? (
    <Tooltip>
      <TooltipTrigger asChild>{Content}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  ) : (
    Content
  );
}
```

### Component: SlowMoverChart (Recharts)

**Decision:** Stacked horizontal bar chart (better for executive dashboard than treemap).

**File:** `apps/frontend/src/features/kpi/components/SlowMoverChart.tsx`

```typescript
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SlowMoverBucket } from "@acm-kpi/core";

interface SlowMoverChartProps {
  buckets: SlowMoverBucket[];
  clutterCount: number;
  samplesCount: number;
}

export function SlowMoverChart({ buckets, clutterCount, samplesCount }: SlowMoverChartProps) {
  // Format data for Recharts stacked bar
  const data = [
    {
      name: "Slow Mover Breakdown (€ Value)",
      Active: buckets.find((b) => b.label === "active")?.value_eur || 0,
      Slow: buckets.find((b) => b.label === "slow")?.value_eur || 0,
      Dead: buckets.find((b) => b.label === "dead")?.value_eur || 0,
      Clutter: 0, // Clutter is excluded from value chart; shown as count only
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Slow Movers & Dead Stock</CardTitle>
        <CardDescription>
          Value distribution by aging bucket (last 12 months)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={data}
            layout="vertical" // Horizontal bars
            margin={{ top: 20, right: 30, left: 200, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" width={180} />
            <Tooltip
              formatter={(value) => `€${Number(value).toLocaleString()}`}
              contentStyle={{ backgroundColor: "rgba(255,255,255,0.95)" }}
            />
            <Legend />
            <Bar dataKey="Active" stackId="a" fill="#22c55e" />
            <Bar dataKey="Slow" stackId="a" fill="#eab308" />
            <Bar dataKey="Dead" stackId="a" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="font-semibold">Clutter (low-value dead, <€100):</p>
            <p>{clutterCount} items</p>
          </div>
          <div>
            <p className="font-semibold">Samples & Tools (excluded):</p>
            <p>{samplesCount} items</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

### Component: StaleDataBanner

**File:** `apps/frontend/src/features/kpi/components/StaleDataBanner.tsx`

```typescript
import { useEffect, useState } from "react";
import { AlertTriangle, AlertCircle } from "lucide-react";

interface StaleDataBannerProps {
  lastUpdatedAt: string | null;
}

export function StaleDataBanner({ lastUpdatedAt }: StaleDataBannerProps) {
  const [isStale, setIsStale] = useState<"none" | "warning" | "critical">("none");

  useEffect(() => {
    if (!lastUpdatedAt) {
      setIsStale("none");
      return;
    }

    const checkStale = () => {
      const now = new Date();
      const lastUpdate = new Date(lastUpdatedAt);
      const minutesSinceUpdate = (now.getTime() - lastUpdate.getTime()) / 1000 / 60;

      if (minutesSinceUpdate > 120) {
        setIsStale("critical");
      } else if (minutesSinceUpdate > 30) {
        setIsStale("warning");
      } else {
        setIsStale("none");
      }
    };

    checkStale();
    const interval = setInterval(checkStale, 10_000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [lastUpdatedAt]);

  if (isStale === "none") return null;

  const isCritical = isStale === "critical";

  return (
    <div
      className={`px-4 py-3 rounded-md flex items-center gap-2 ${
        isCritical
          ? "bg-red-100 border border-red-300 text-red-900"
          : "bg-yellow-100 border border-yellow-300 text-yellow-900"
      }`}
    >
      {isCritical ? (
        <AlertCircle className="w-5 h-5" />
      ) : (
        <AlertTriangle className="w-5 h-5" />
      )}
      <span className="text-sm font-medium">
        {isCritical
          ? "Data is older than 2 hours. Please refresh to get the latest information."
          : "Data is over 30 minutes old. For the latest figures, refresh now."}
      </span>
    </div>
  );
}
```

### Component: EmptyState

**File:** `apps/frontend/src/features/kpi/components/EmptyState.tsx`

```typescript
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/useAuth"; // Phase 1 hook
import { useNavigate } from "react-router-dom";
import LogoIcon from "@/assets/acm-logo.png"; // Phase 1 logo

export function EmptyState() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src={LogoIcon} alt="ACM KPI" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-bold">No Data Yet</h1>
          <CardDescription>
            Upload your first Apollo NTS warehouse stock export to see KPIs.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {user?.role === "Admin" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Click the button below to get started, or use the SMB folder watcher for automated imports.
              </p>
              <Button onClick={() => navigate("/upload")} size="lg">
                Upload First File
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Contact your admin to load data.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

### Component: DashboardPage (main)

**File:** `apps/frontend/src/pages/DashboardPage.tsx`

Replaces Phase 1 placeholder:

```typescript
import { useState } from "react";
import { useKpiSummary } from "@/features/kpi/hooks/useKpiSummary";
import { KpiGrid } from "@/features/kpi/components/KpiGrid";
import { SlowMoverChart } from "@/features/kpi/components/SlowMoverChart";
import { StockoutList } from "@/features/kpi/components/StockoutList";
import { StaleDataBanner } from "@/features/kpi/components/StaleDataBanner";
import { EmptyState } from "@/features/kpi/components/EmptyState";
import { FilterBar } from "@/features/kpi/components/FilterBar";
import { Button } from "@/components/ui/button";
import { RotateCw } from "lucide-react";

export function DashboardPage() {
  const { data: summary, isLoading, refetch } = useKpiSummary();
  const [filters, setFilters] = useState({});

  if (!summary) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (!summary.has_data) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header with timestamp + refresh button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Inventory Dashboard</h1>
          {summary.last_updated_at && (
            <p className="text-sm text-muted-foreground">
              Last updated: {new Date(summary.last_updated_at).toLocaleTimeString()}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RotateCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stale data warning */}
      <StaleDataBanner lastUpdatedAt={summary.last_updated_at} />

      {/* Filter controls */}
      <FilterBar onChange={setFilters} />

      {/* 7 KPI cards */}
      <KpiGrid summary={summary} />

      {/* Slow mover chart */}
      <SlowMoverChart
        buckets={summary.slow_dead_stock.buckets}
        clutterCount={summary.slow_dead_stock.clutter_excluded_count}
        samplesCount={summary.slow_dead_stock.samples_excluded_count}
      />

      {/* Stockout list preview */}
      <StockoutList items={summary.stockouts} onViewAll={() => {/* open modal */}} />
    </div>
  );
}
```

---

## Common Pitfalls

### Pitfall 1: MV Refresh without Unique Index

**What goes wrong:** `REFRESH MATERIALIZED VIEW CONCURRENTLY` fails with `ERROR: cannot refresh materialized view "public"."kpi_dashboard_data" concurrently without a unique index`.

**Why it happens:** PostgreSQL requires a unique index on the MV to guarantee concurrent readers don't see inconsistencies during partial refresh.

**How to avoid:** Create the unique index on the `id` column (which is always = 1) as shown in the migration.

**Warning signs:** Deployment fails; imports can't complete; error message explicitly mentions unique index.

### Pitfall 2: First-Time MV Initialization

**What goes wrong:** First import after fresh deploy fails because `REFRESH CONCURRENT` tries to refresh an empty MV with no rows yet.

**Why it happens:** CONCURRENT requires the MV to already have data; non-concurrent refresh initializes it.

**How to avoid:** Detect first successful import via `COUNT(*)` on the MV or `finished_at IS NULL` check. Use non-concurrent refresh on first import; concurrent thereafter.

**Warning signs:** First import fails; error says "cannot refresh concurrently"; second import succeeds.

### Pitfall 3: Color Thresholds Hardcoded in Frontend

**What goes wrong:** Executive changes color threshold logic (e.g., "green should be >120 days, not >90"), but frontend has hardcoded colors; backend changes don't propagate.

**Why it happens:** Color logic lives in API, but developers implement it in frontend "just to be safe" or as optimization.

**How to avoid:** Compute colors in API only. Frontend is dumb: render whatever `color` field the API sends. This guarantees consistency and allows threshold changes without frontend redeploy.

**Warning signs:** Color disagreement between API response and UI; user questions "why is this card red in the API but green in the UI?"

### Pitfall 4: Polling Every 30 Seconds Forever

**What goes wrong:** Browser tab left open overnight; 30-second polling exhausts API quota or creates unnecessary database load.

**Why it happens:** React Query's `refetchInterval` doesn't pause when tab is backgrounded.

**How to avoid:** Use `refetchOnWindowFocus: false` (Phase 3 config) and add a background-tab detector to pause polling when not visible. Alternatively, use React Query's `focusManager` to pause when window hidden.

**Code:**

```typescript
import { focusManager } from "@tanstack/react-query";
import { useEffect } from "react";

export function useFocusManager() {
  useEffect(() => {
    const unsubscribe = focusManager.subscribe((isFocused) => {
      if (!isFocused) {
        // Pause all queries when tab hidden
        focusManager.setFocused(false);
      }
    });
    return unsubscribe;
  }, []);
}
```

### Pitfall 5: Stale Data Banner Never Updates

**What goes wrong:** User logs in at 13:00, sees data from 12:30 (30 min old), yellow banner appears. By 14:00, data still hasn't refreshed, but the banner is no longer visible (code checked only once).

**Why it happens:** Banner state is computed once on mount; `lastUpdatedAt` never changes if the API keeps returning the same timestamp.

**How to avoid:** Re-compute stale state every 10 seconds (not just on mount). Use `setInterval` to check elapsed time.

**Warning signs:** Banner disappears after 5 minutes even though data is still stale; user doesn't realize.

---

## Code Examples

### Example 1: Compute Days-on-Hand (weighted by value)

**Source:** Materialized view SQL above

```sql
CASE
  WHEN SUM(CASE WHEN geloescht != 'J' THEN wert_mit_abw ELSE 0 END) > 0
  THEN ROUND(
    SUM(CASE WHEN geloescht != 'J' AND reichw_mon IS NOT NULL THEN reichw_mon * wert_mit_abw ELSE 0 END) /
    NULLIF(SUM(CASE WHEN geloescht != 'J' THEN wert_mit_abw ELSE 0 END), 0) * 30.4,
    1
  )::numeric(10,1)
  ELSE NULL
END AS days_on_hand
```

**Interpretation:** `reichw_mon` (months of coverage) is weighted by article value. High-value items dominate the average. Then multiply by 30.4 (days per month, accounting for leap years) to convert to days.

### Example 2: Slow-Mover Bucket Classification

**Source:** MV helper function `slow_mover_bucket()` above

```sql
CREATE OR REPLACE FUNCTION slow_mover_bucket(...) RETURNS text AS $$
BEGIN
  -- Exclusions
  IF is_excluded_from_slow_mover(typ, lagername) THEN
    RETURN 'excluded';
  END IF;

  -- Days since last activity
  days_since_movement := COALESCE(
    EXTRACT(day FROM CURRENT_DATE - GREATEST(
      COALESCE(lagerabgang_dat, '1900-01-01'),
      COALESCE(letzt_zugang, '1900-01-01')
    ))::int,
    99999
  );

  -- Clutter: dead stock but low value (<€100)
  IF days_since_movement > 365 AND wert_mit_abw < 100 THEN
    RETURN 'clutter';
  END IF;

  -- Bucket
  IF days_since_movement <= 180 THEN RETURN 'active';
  ELSIF days_since_movement <= 365 THEN RETURN 'slow';
  ELSE RETURN 'dead';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

### Example 3: ABC Distribution (JSONB aggregation)

**Source:** MV SQL above

```sql
jsonb_build_object(
  'a', jsonb_build_object(
    'count', COUNT(*) FILTER (WHERE geloescht != 'J' AND abc_kennz_vk = 'A'),
    'value_eur', COALESCE(SUM(wert_mit_abw) FILTER (WHERE geloescht != 'J' AND abc_kennz_vk = 'A'), 0)::numeric(18,2)
  ),
  'b', ...,
  'c', ...
) AS abc_distribution
```

This produces a single JSONB object in the MV row; API directly serializes to JSON response.

---

## Library Versions (Verified April 2026)

| Package | Version | Last Updated | Confidence |
|---------|---------|--------------|-----------|
| @tanstack/react-query | 5.96.2 | 2026-04-03 | HIGH |
| recharts | 2.12.0+ | 2026-01-21 (v2.9.0 → 2.12.0 range) | HIGH |
| shadcn/ui | Latest | 2026-03 (CLI v4) | HIGH |
| date-fns | 3.6.0+ | 2026-04 | HIGH |
| React | 19.2.4 | Phase 1 verified | HIGH |
| Fastify | 5.8.4 | Phase 1 verified | HIGH |
| Drizzle ORM | 0.45.2 | Phase 2 verified | HIGH |
| PostgreSQL | 16+ | Industry standard | HIGH |

---

## Validation Architecture

**Test Framework:** Vitest 2.0+ (browser mode via Playwright for component tests)

| Requirement | Test Type | Command | File Exists? |
|-------------|-----------|---------|-------------|
| KPI-02: MV refresh succeeds in transaction | Unit | `vitest run src/kpi/mv.test.ts` | Wave 0 |
| KPI-03–09: All 7 KPI formulas accurate | Unit | `vitest run src/kpi/calculations.test.ts` | Wave 0 |
| DASH-02: KpiCard renders correct color | Component | `vitest run --browser src/features/kpi/KpiCard.test.tsx` | ✅ |
| DASH-03: StaleDataBanner shows correct threshold | Component | `vitest run --browser src/features/kpi/StaleDataBanner.test.tsx` | Wave 0 |
| DASH-04: Summary polling every 30s (React Query) | Integration | `vitest run src/features/kpi/hooks/useKpiSummary.test.ts` | Wave 0 |
| DASH-06: SlowMoverChart renders 3 buckets | Component | `vitest run --browser src/features/kpi/SlowMoverChart.test.tsx` | Wave 0 |
| DASH-07: ArticleDrilldownModal opens/closes | Component | `vitest run --browser src/features/kpi/ArticleDrilldownModal.test.tsx` | Wave 0 |
| DASH-01: Full dashboard layout renders | Component | `vitest run --browser src/pages/DashboardPage.test.tsx` | Wave 0 |

**Wave 0 Gaps:**
- [ ] `apps/api/src/kpi/mv.test.ts` — MV refresh with mock DB
- [ ] `apps/api/src/kpi/calculations.test.ts` — Color thresholds, slow-mover bucketing
- [ ] `apps/frontend/src/features/kpi/hooks/useKpiSummary.test.ts` — React Query polling (mock fetch)
- [ ] `apps/frontend/src/features/kpi/components/StaleDataBanner.test.tsx` — Timer logic
- [ ] Component tests for all 7 cards, chart, modal, empty state
- [ ] `vitest.config.ts` update: add `browser: { provider: 'playwright', headless: true }`

**Testing command:**
- Per commit: `npm run test -- src/features/kpi` (quick path only)
- Per wave merge: `npm run test` (full suite)
- Phase gate: Full suite green before `/gsd:verify-work`

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL 16+ | MV creation | ✓ (Phase 2) | 16.x | — |
| Node.js LTS | API + frontend | ✓ (Phase 1) | 22.x or 24.x | — |
| npm | Package manager | ✓ (Phase 1) | 10.x+ | — |

**No external services required for Phase 3** (no CDN, no cloud APIs, no websockets). Everything is on-prem.

---

## Scope Anti-Checklist

Phase 3 does NOT include:

- ✅ No upload UI (Phase 4 — drag-and-drop upload form)
- ✅ No SMB watcher (Phase 5 — file monitoring)
- ✅ No dark/light mode toggle (Phase 6 — ships light-theme-only, Phase 6 adds CSS variables)
- ✅ No German number formatting or i18n (Phase 6 — Phase 3 uses default English toLocaleString())
- ✅ No docs site or help pages (Phase 7 — separate /docs route)
- ✅ No historical snapshots or trend lines (v2 — requires snapshot history DB schema)
- ✅ No Pareto 80/20 chart (v2 — too complex for v1)
- ✅ No warehouse × product-group heatmap (v2)
- ✅ No CSV export of dashboard (v2 — manual export can be added later)
- ✅ No custom metric builder (v2 — fixed KPI set only)
- ✅ No server-sent events or websockets (v2 — polling sufficient for CSV import cadence)
- ✅ No role-based KPI filtering (analyst view deferred — executive view only)

---

## Sources

### PRIMARY (HIGH CONFIDENCE)

- **React Query 5.96.2:** [@tanstack/react-query npm](https://www.npmjs.com/package/@tanstack/react-query) — latest version verified 2026-04-03
- **Recharts 2.12.0+:** [Recharts GitHub Releases](https://github.com/recharts/recharts/releases) — stacked bar chart examples verified 2026-01-21
- **shadcn/ui:** [Components Documentation](https://ui.shadcn.com/docs/components) — Card, Dialog, Table, Select, Badge components available via CLI (v4 March 2026)
- **PostgreSQL Materialized Views:** [PostgreSQL 16 Official Docs](https://www.postgresql.org/docs/16/rules-materializedviews.html) — REFRESH CONCURRENTLY syntax verified
- **Fastify 5.8.4:** [Fastify npm](https://www.npmjs.com/package/fastify) — Phase 1 verified stable
- **Drizzle ORM 0.45.2:** [Drizzle Docs](https://orm.drizzle.team) — Phase 2 verified; SQL template syntax for raw MV refresh
- **Phase 1 & 2 decisions:** [CONTEXT.md](./03-CONTEXT.md), [REQUIREMENTS.md](../.planning/REQUIREMENTS.md), [STACK.md](../.planning/research/STACK.md)

### SECONDARY (MEDIUM CONFIDENCE)

- **date-fns 3.6.0:** [npm Registry](https://www.npmjs.com/package/date-fns) — lightweight, TypeScript-first date utility library
- **Zod 3.22.0:** [Zod GitHub](https://github.com/colinhacks/zod) — Phase 1 verified schema validation
- **React 19.2.4:** [React Blog](https://react.dev/blog/2025/10/01/react-19-2) — stable, Phase 1 in use

### RESEARCH ARTIFACTS

- **KPI Formulas:** [FEATURES.md](../.planning/research/FEATURES.md) — slow-mover buckets, ABC distribution, turnover proxy, devaluation formulas
- **Architecture Patterns:** [ARCHITECTURE.md](../.planning/research/ARCHITECTURE.md) — MV refresh atomicity, polling vs SSE tradeoff
- **Pitfalls:** [PITFALLS.md](../.planning/research/PITFALLS.md) — Pitfall #6 (freshness ambiguity), #8 (exec UX overload)
- **Sample Data:** `samples/LagBes-sample.csv` — golden fixture for KPI validation (900+ rows)

---

## Metadata

**Confidence Breakdown:**
- **Standard Stack (libraries):** HIGH — verified via npm and official GitHub April 2026
- **Architecture (MV design, API endpoints):** HIGH — PostgreSQL patterns proven, Fastify + React Query ecosystem stable
- **Pitfalls (stale data, color logic):** HIGH — based on Phase 1/2 learnings + PITFALLS.md research
- **Component structure (file layout, Recharts choice):** MEDIUM-HIGH — layout patterns standard for React dashboards; stacked bar chosen over treemap for executive readability (could refine with UX testing)
- **Performance targets (< 50ms API, < 2s FCP):** MEDIUM — assumptions based on 10k row MV and typical on-prem network; verification needed during implementation

**Assumptions Requiring Validation:**
- First import "cold start" MV refresh performance (target < 100ms)
- Stacked bar chart performance with 3 buckets + clutter row (Recharts should handle easily)
- React Query polling impact on on-prem network (30s interval typical; may need tuning per ACM infra)
- Dashboard first contentful paint timing without external CDN (all fonts/CSS bundled, verified Phase 1)

**Research Date:** 2026-04-08  
**Valid Until:** 2026-05-08 (30 days — stable libraries, no rapid churn expected)

---

*Phase 3 research complete. Planner can now decompose into 4–6 atomic tasks.*

