-- =========================================================================
-- Migration: 0002_add_kpi_dashboard_mv.sql
-- Phase 3: KPI Layer & Dashboard
-- =========================================================================
-- Creates materialized view kpi_dashboard_data with 7 table-stakes KPIs.
-- All computations run in one pass over stock_rows for the latest import.
--
-- KPI-02: MV existence + refresh hook
-- KPI-03: total_value_eur
-- KPI-04: days_on_hand (weighted average)
-- KPI-05: slow_dead_stock (3 buckets + clutter + samples)
-- KPI-06: stockouts (count + top-5 preview)
-- KPI-07: abc_distribution
-- KPI-08: inventory_turnover (proxy)
-- KPI-09: devaluation (€ + %)
--
-- Apply: this file is read by apps/api/src/db/migrate.ts in lex order
-- after 0001_expand_stock_rows_schema.sql. Run via `npm run db:migrate`.
--
-- CONCURRENTLY refresh requires the unique index created at the bottom.
-- First-time refresh (after initial import) MUST use non-concurrent
-- REFRESH MATERIALIZED VIEW kpi_dashboard_data — this is Plan 03-04's concern.
-- Subsequent refreshes use REFRESH MATERIALIZED VIEW CONCURRENTLY kpi_dashboard_data.
-- =========================================================================
--
-- Column-name mapping note (MV output → KpiSummary DTO in packages/core/src/kpi/types.ts):
--   MV column (snake_case)   →  DTO field
--   id                       →  (internal, not exposed)
--   total_value_eur          →  total_inventory_value.value_eur
--   days_on_hand             →  days_on_hand.days
--   slow_dead_stock (jsonb)  →  slow_dead_stock (entire object)
--   stockouts (jsonb)        →  stockouts (entire object)
--   abc_distribution (jsonb) →  abc_distribution (entire object)
--   inventory_turnover       →  inventory_turnover.ratio
--   devaluation (jsonb)      →  devaluation (entire object)
--
-- The API layer in Plan 03-05 (routes.ts) reads the single row from this MV
-- and constructs the KpiSummary response by merging with color-threshold logic
-- and latest import metadata queried from the imports table.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Helper function 1: Museum / sample exclusion
-- Returns TRUE for rows that should be excluded from slow-mover analysis:
--   - typ = 'WKZ' (Werkzeug / tool-fixtures / reference samples)
--   - lagername ILIKE 'MUSTERRAUM%' (sample room storage)
-- Declared IMMUTABLE so Postgres can inline / optimise calls.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_excluded_from_slow_mover(
  typ article_type,
  lagername text
)
RETURNS boolean AS $$
BEGIN
  RETURN typ = 'WKZ' OR lagername ILIKE 'MUSTERRAUM%';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- -------------------------------------------------------------------------
-- Helper function 2: Slow-mover bucket classification
-- Returns one of: 'active' | 'slow' | 'dead' | 'clutter' | 'excluded'
--
-- Recency is determined by the more-recent of lagerabgang_dat (last outflow)
-- and letzt_zugang (last inbound receipt). A null date is treated as the
-- distant past (1900-01-01) so items with no movement are treated as dead.
--
-- Bucket thresholds (LOCKED per 03-CONTEXT.md — do not change without a
-- new migration):
--   excluded : is_excluded_from_slow_mover() = true
--   clutter  : days_since_movement > 365 AND wert_mit_abw < 100
--              (low-value dead stock — collapsed separately so it doesn't
--               distort the dead-stock € total)
--   active   : days_since_movement <= 180   (0–6 months)
--   slow     : days_since_movement 181–365  (6–12 months)
--   dead     : days_since_movement > 365    (12+ months)
-- -------------------------------------------------------------------------
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
  -- Museum / sample rows are excluded entirely from slow-mover analysis
  IF is_excluded_from_slow_mover(typ, lagername) THEN
    RETURN 'excluded';
  END IF;

  -- Use the more-recent of last-outflow and last-receipt as the movement date.
  -- Coalesce nulls to a distant-past sentinel so null-date rows are treated
  -- as "never moved" (dead, or clutter if < €100).
  days_since_movement := COALESCE(
    EXTRACT(day FROM CURRENT_DATE - GREATEST(
      COALESCE(lagerabgang_dat, '1900-01-01'::date),
      COALESCE(letzt_zugang,    '1900-01-01'::date)
    ))::int,
    99999
  );

  -- Low-value dead stock (< €100 per item) is classified as clutter first,
  -- before the dead check, so it stays out of the dead-stock € total.
  IF days_since_movement > 365 AND wert_mit_abw < 100 THEN
    RETURN 'clutter';
  END IF;

  IF days_since_movement <= 180 THEN
    RETURN 'active';
  ELSIF days_since_movement <= 365 THEN
    RETURN 'slow';
  ELSE
    RETURN 'dead';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- -------------------------------------------------------------------------
-- Main materialized view — single-row, all 7 KPIs
--
-- Scoped to the most-recently completed import via the import_id subquery.
-- If no successful import exists the SELECT returns no rows; the MV will
-- be empty until the first successful import and REFRESH.
-- -------------------------------------------------------------------------
CREATE MATERIALIZED VIEW kpi_dashboard_data AS
SELECT
  -- Synthetic PK — required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
  -- The unique index below is on this column.
  1::smallint AS id,

  -- -----------------------------------------------------------------------
  -- KPI-03: Total inventory value (€)
  -- Sum of wert_mit_abw (value after devaluation) for all non-deleted rows.
  -- Negative stock values (e.g. article 174, -18414.25 units) are included
  -- as-is — they represent legitimate corrections / over-commitments.
  -- -----------------------------------------------------------------------
  COALESCE(
    SUM(CASE WHEN geloescht != 'J' THEN wert_mit_abw ELSE 0 END),
    0
  )::numeric(18,2) AS total_value_eur,

  -- -----------------------------------------------------------------------
  -- KPI-04: Days-on-hand (weighted average)
  -- reichw_mon is stored in months; multiply by 30.4 to get days.
  -- Weighting by wert_mit_abw means high-value items drive the KPI.
  -- Rows with NULL reichw_mon (museum/sample items) are excluded from the
  -- numerator so they don't pull the average toward zero.
  -- Returns NULL when total value is zero (empty import or all deleted).
  -- -----------------------------------------------------------------------
  CASE
    WHEN SUM(CASE WHEN geloescht != 'J' THEN wert_mit_abw ELSE 0 END) > 0
    THEN ROUND(
      SUM(CASE
            WHEN geloescht != 'J' AND reichw_mon IS NOT NULL
            THEN reichw_mon * wert_mit_abw
            ELSE 0
          END) /
      NULLIF(SUM(CASE WHEN geloescht != 'J' THEN wert_mit_abw ELSE 0 END), 0)
      * 30.4,
      1
    )::numeric(10,1)
    ELSE NULL
  END AS days_on_hand,

  -- -----------------------------------------------------------------------
  -- KPI-05: Slow-mover / dead-stock breakdown
  -- Three main buckets (active / slow / dead) + clutter subtotal + samples.
  -- Percentage is share of total non-excluded value (active+slow+dead+clutter).
  -- Items with bestand=0 and wert_mit_abw=0 (e.g. type MAT rows with no
  -- value) land in clutter when movement is >365 days old.
  -- -----------------------------------------------------------------------
  jsonb_build_object(
    'active', jsonb_build_object(
      'count',
        COUNT(*) FILTER (
          WHERE geloescht != 'J'
            AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'active'
        ),
      'value_eur',
        COALESCE(
          SUM(wert_mit_abw) FILTER (
            WHERE geloescht != 'J'
              AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'active'
          ),
          0
        )::numeric(18,2),
      'pct',
        ROUND(
          COALESCE(
            SUM(wert_mit_abw) FILTER (
              WHERE geloescht != 'J'
                AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'active'
            ),
            0
          ) /
          NULLIF(
            SUM(CASE
                  WHEN geloescht != 'J'
                    AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername)
                       IN ('active', 'slow', 'dead', 'clutter')
                  THEN wert_mit_abw
                  ELSE 0
                END),
            0
          ) * 100,
          1
        )::numeric(5,1)
    ),
    'slow', jsonb_build_object(
      'count',
        COUNT(*) FILTER (
          WHERE geloescht != 'J'
            AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'slow'
        ),
      'value_eur',
        COALESCE(
          SUM(wert_mit_abw) FILTER (
            WHERE geloescht != 'J'
              AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'slow'
          ),
          0
        )::numeric(18,2),
      'pct',
        ROUND(
          COALESCE(
            SUM(wert_mit_abw) FILTER (
              WHERE geloescht != 'J'
                AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'slow'
            ),
            0
          ) /
          NULLIF(
            SUM(CASE
                  WHEN geloescht != 'J'
                    AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername)
                       IN ('active', 'slow', 'dead', 'clutter')
                  THEN wert_mit_abw
                  ELSE 0
                END),
            0
          ) * 100,
          1
        )::numeric(5,1)
    ),
    'dead', jsonb_build_object(
      'count',
        COUNT(*) FILTER (
          WHERE geloescht != 'J'
            AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'dead'
        ),
      'value_eur',
        COALESCE(
          SUM(wert_mit_abw) FILTER (
            WHERE geloescht != 'J'
              AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'dead'
          ),
          0
        )::numeric(18,2),
      'pct',
        ROUND(
          COALESCE(
            SUM(wert_mit_abw) FILTER (
              WHERE geloescht != 'J'
                AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'dead'
            ),
            0
          ) /
          NULLIF(
            SUM(CASE
                  WHEN geloescht != 'J'
                    AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername)
                       IN ('active', 'slow', 'dead', 'clutter')
                  THEN wert_mit_abw
                  ELSE 0
                END),
            0
          ) * 100,
          1
        )::numeric(5,1)
    ),
    'clutter_count',
      COUNT(*) FILTER (
        WHERE geloescht != 'J'
          AND slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername) = 'clutter'
      ),
    'samples_count',
      COUNT(*) FILTER (
        WHERE is_excluded_from_slow_mover(typ, lagername)
      )
  ) AS slow_dead_stock,

  -- -----------------------------------------------------------------------
  -- KPI-06: Stockouts & low-stock
  -- Trigger: bestand_lagereinheit <= 0  (out of stock / over-committed)
  --       OR reichw_mon < 1 AND reichw_mon IS NOT NULL  (< 1 month coverage)
  -- Excludes: museum rows (WKZ / MUSTERRAUM) and deleted rows.
  -- Negative bestand rows (e.g. articles 174, 10050, 12285) ARE counted
  -- as stockouts because bestand_lagereinheit <= 0.
  --
  -- items_preview: top-5 by wert_mit_abw (descending) from the same import.
  -- The correlated subquery repeats the import_id filter so it never leaks
  -- rows from a different (older) import.
  -- -----------------------------------------------------------------------
  jsonb_build_object(
    'count',
      COUNT(*) FILTER (
        WHERE geloescht != 'J'
          AND NOT is_excluded_from_slow_mover(typ, lagername)
          AND (
            bestand_lagereinheit <= 0
            OR (reichw_mon < 1 AND reichw_mon IS NOT NULL)
          )
      ),
    'items_preview', (
      SELECT COALESCE(jsonb_agg(preview_row), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'artikelnr',           sr2.artikelnr,
          'bezeichnung_1',       sr2.bezeichnung_1,
          'bestand_basiseinheit', sr2.bestand_basiseinheit,
          'wert_mit_abw',        sr2.wert_mit_abw,
          'abc_kennz_vk',        COALESCE(sr2.abc_kennz_vk, 'C')
        ) AS preview_row
        FROM stock_rows sr2
        WHERE sr2.import_id = (
          SELECT id FROM imports
          WHERE status = 'success'
          ORDER BY finished_at DESC
          LIMIT 1
        )
          AND sr2.geloescht != 'J'
          AND NOT is_excluded_from_slow_mover(sr2.typ, sr2.lagername)
          AND (
            sr2.bestand_lagereinheit <= 0
            OR (sr2.reichw_mon < 1 AND sr2.reichw_mon IS NOT NULL)
          )
        ORDER BY sr2.wert_mit_abw DESC
        LIMIT 5
      ) AS top5
    )
  ) AS stockouts,

  -- -----------------------------------------------------------------------
  -- KPI-07: ABC class distribution
  -- NULL abc_kennz_vk is treated as 'C' per data-quality rules in CONTEXT.md.
  -- Non-deleted rows only.
  -- -----------------------------------------------------------------------
  jsonb_build_object(
    'a', jsonb_build_object(
      'count',
        COUNT(*) FILTER (
          WHERE geloescht != 'J' AND COALESCE(abc_kennz_vk, 'C') = 'A'
        ),
      'value_eur',
        COALESCE(
          SUM(wert_mit_abw) FILTER (
            WHERE geloescht != 'J' AND COALESCE(abc_kennz_vk, 'C') = 'A'
          ),
          0
        )::numeric(18,2)
    ),
    'b', jsonb_build_object(
      'count',
        COUNT(*) FILTER (
          WHERE geloescht != 'J' AND COALESCE(abc_kennz_vk, 'C') = 'B'
        ),
      'value_eur',
        COALESCE(
          SUM(wert_mit_abw) FILTER (
            WHERE geloescht != 'J' AND COALESCE(abc_kennz_vk, 'C') = 'B'
          ),
          0
        )::numeric(18,2)
    ),
    'c', jsonb_build_object(
      'count',
        COUNT(*) FILTER (
          WHERE geloescht != 'J' AND COALESCE(abc_kennz_vk, 'C') = 'C'
        ),
      'value_eur',
        COALESCE(
          SUM(wert_mit_abw) FILTER (
            WHERE geloescht != 'J' AND COALESCE(abc_kennz_vk, 'C') = 'C'
          ),
          0
        )::numeric(18,2)
    )
  ) AS abc_distribution,

  -- -----------------------------------------------------------------------
  -- KPI-08: Inventory turnover ratio (proxy)
  -- Proxy formula: SUM(annual_units_sold) / SUM(current_stock_units)
  -- Returns 0 when total stock is zero (avoid division-by-zero; NULLIF is
  -- a belt-and-suspenders guard alongside the CASE WHEN).
  -- No geloescht filter here intentionally: deleted rows with residual stock
  -- still occupy warehouse capacity.
  -- -----------------------------------------------------------------------
  CASE
    WHEN SUM(bestand_basiseinheit) > 0
    THEN ROUND(
      SUM(umsatz_me_j) / NULLIF(SUM(bestand_basiseinheit), 0),
      2
    )::numeric(10,2)
    ELSE 0::numeric(10,2)
  END AS inventory_turnover,

  -- -----------------------------------------------------------------------
  -- KPI-09: Devaluation / write-down summary
  -- total_eur  = sum of (wert - wert_mit_abw) for non-deleted rows.
  --              When wert = wert_mit_abw (no devaluation), contribution = 0.
  --              When wert is NULL, CASE WHEN filters the row out.
  -- pct_of_value = devaluation as % of original value (wert), non-deleted.
  -- Both are 0 when there are no non-deleted rows.
  -- -----------------------------------------------------------------------
  jsonb_build_object(
    'total_eur',
      COALESCE(
        SUM(CASE WHEN geloescht != 'J' THEN (wert - wert_mit_abw) ELSE 0 END),
        0
      )::numeric(18,2),
    'pct_of_value',
      CASE
        WHEN SUM(CASE WHEN geloescht != 'J' THEN wert ELSE 0 END) > 0
        THEN ROUND(
          SUM(CASE WHEN geloescht != 'J' THEN (wert - wert_mit_abw) ELSE 0 END) /
          NULLIF(SUM(CASE WHEN geloescht != 'J' THEN wert ELSE 0 END), 0) * 100,
          1
        )::numeric(5,1)
        ELSE 0::numeric(5,1)
      END
  ) AS devaluation

FROM stock_rows
WHERE import_id = (
  SELECT id FROM imports
  WHERE status = 'success'
  ORDER BY finished_at DESC
  LIMIT 1
);

-- -------------------------------------------------------------------------
-- Unique index — REQUIRED for REFRESH MATERIALIZED VIEW CONCURRENTLY
-- Without this index the concurrent refresh will fail with:
--   ERROR: cannot refresh materialized view "kpi_dashboard_data" concurrently
--          because it has no unique index
-- The index is on the synthetic id column (always = 1), so it's a trivial
-- single-entry index with no storage or maintenance cost.
-- -------------------------------------------------------------------------
CREATE UNIQUE INDEX idx_kpi_dashboard_data_id ON kpi_dashboard_data (id);

-- -------------------------------------------------------------------------
-- Expected single-row shape (for documentation / test reference)
-- -------------------------------------------------------------------------
-- COMMENT ON MATERIALIZED VIEW kpi_dashboard_data IS
-- 'Single-row KPI summary for the most-recently completed import.
--  Columns: id (smallint), total_value_eur (numeric), days_on_hand (numeric),
--  slow_dead_stock (jsonb), stockouts (jsonb), abc_distribution (jsonb),
--  inventory_turnover (numeric), devaluation (jsonb).
--  Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY kpi_dashboard_data
--  (first time: non-concurrent; see apps/api/src/ingest/writer.ts).';

-- =========================================================================
-- Hand-computed expected values for the 12-row sample fixture
-- (samples/LagBes-sample.csv) as of evaluation date 2026-04-08
-- Used as a golden reference for Phase 3 integration tests.
--
-- NOTE: The CSV uses European decimal notation (comma as separator) and
-- semicolons as field delimiters. The ingest parser converts commas to
-- periods before inserting numeric values into Postgres.
--
-- --- Parsed rows (after CSV → DB normalisation) ---
--
-- artikelnr   | typ | geloescht | wert_mit_abw | wert      | reichw_mon | bestand_lagereinheit | bestand_basiseinheit | lagerabgang_dat | letzt_zugang | abc_kennz_vk
-- ------------|-----|-----------|--------------|-----------|------------|----------------------|----------------------|-----------------|--------------|-------------
-- 2           | ART | N         |      560.27  |   560.27  |      27.00 |             5.0000   |             5.0000   | 2025-07-14      | 2024-09-11   | C
-- 58          | ART | N         |     2012.25  |  2012.25  |      25.00 |            67.0000   |            67.0000   | 2025-06-25      | 2025-06-20   | B
-- 74          | ART | N         |      187.69  |   187.69  |      69.00 |             1.0000   |             1.0000   | 2025-01-30      | 2025-01-24   | A
-- 174         | ART | N         |   -22342.62  |-22342.62  |       0.00 |        -18414.2500   |        -18414.2500   | 2026-03-26      | 2026-02-19   | A
-- 000002_Mstr | WKZ | N         |        0.00  |     0.00  |       NULL |             1.0000   |             1.0000   | NULL            | NULL         | NULL (lagername=MUSTERRAUM...)
-- 10050       | ART | N         |    -2894.10  | -2894.10  |       0.00 |          -2983.0000  |          -2983.0000  | 2025-11-10      | 2025-11-10   | B
-- 10054       | MAT | N         |        0.00  |     0.00  |       0.00 |          -446.0000   |          -446.0000   | 2026-03-19      | 2025-09-11   | C
-- 12285       | ART | N         |    -2037.86  | -2037.86  |       0.00 |            -1.0000   |            -1.0000   | 2025-11-17      | 2025-07-24   | A
-- A 0011      | MAT | N         |        0.00  |     0.00  |       0.00 |            10.0000   |            10.0000   | NULL            | NULL         | C
-- K 0023      | MAT | N         |      212.35  |   212.35  |       0.00 |            15.0000   |            15.0000   | NULL            | 2014-07-30   | C
-- L 0007      | MAT | N         |      133.53  |   133.53  |       0.00 |             8.0000   |             8.0000   | 2025-10-06      | 2023-11-17   | C
-- H0001       | HLB | N         |     1291.69  |  1291.69  |       0.00 |          2200.0000   |          2200.0000   | NULL            | NULL         | C
--
-- -------------------------------------------------------------------------
-- KPI-03: total_value_eur
-- SUM(wert_mit_abw) for all rows with geloescht = 'N' (all 12 rows here):
--   560.27 + 2012.25 + 187.69 + (-22342.62) + 0.00 + (-2894.10) + 0.00
--   + (-2037.86) + 0.00 + 212.35 + 133.53 + 1291.69
--   = 560.27 + 2012.25 + 187.69 - 22342.62 - 2894.10 - 2037.86 + 212.35
--     + 133.53 + 1291.69  (0-value rows add 0)
--   ≈ -22876.80
-- NOTE: The WKZ row (000002_Muster) has wert_mit_abw = 0 and IS included
-- in total_value_eur (the total is of all non-deleted rows, not just non-museum).
-- Negative because the sample is a small demo slice with several negative-stock articles.
--
-- -------------------------------------------------------------------------
-- KPI-04: days_on_hand (weighted average, wert_mit_abw-weighted)
-- Only rows with reichw_mon IS NOT NULL contribute to numerator.
-- Rows with reichw_mon = 0 contribute 0 to numerator but their wert_mit_abw
-- contributes to the denominator.
-- Rows with NULL reichw_mon: only 000002_Muster (WKZ) — already at 0 weight.
-- Non-null reichw_mon rows contributing to numerator:
--   artikelnr 2:   27.00 * 560.27   = 15127.29
--   artikelnr 58:  25.00 * 2012.25  = 50306.25
--   artikelnr 74:  69.00 * 187.69   = 12950.61
--   artikelnr 174:  0.00 * (-22342.62) = 0  (reichw_mon=0)
--   (all others):  0.00 * wert_mit_abw = 0
-- numerator  = 15127.29 + 50306.25 + 12950.61 = 78384.15
-- denominator = total_value_eur of non-deleted rows = -22876.80
-- weighted_avg_months = 78384.15 / (-22876.80) ≈ -3.43 months
-- days_on_hand ≈ -3.43 * 30.4 ≈ -104.3 days
-- NOTE: The result is NEGATIVE because high-value negative-stock rows
-- (174: -22342.62) dominate the denominator while contributing 0 to the
-- numerator. In production data with a real full import this would be a
-- positive number. The sample is intentionally small/pathological.
--
-- -------------------------------------------------------------------------
-- KPI-05: slow_dead_stock buckets (evaluated at 2026-04-08)
-- Excluded (WKZ / MUSTERRAUM): 000002_Muster → samples_count = 1
-- Remaining 11 rows. Days since last movement (MAX(lagerabgang_dat, letzt_zugang)):
--   2:     max(2025-07-14, 2024-09-11) = 2025-07-14 → 268 days  → slow (181–365)
--   58:    max(2025-06-25, 2025-06-20) = 2025-06-25 → 287 days  → slow
--   74:    max(2025-01-30, 2025-01-24) = 2025-01-30 → 433 days  → wert=187.69 ≥ 100 → dead
--   174:   max(2026-03-26, 2026-02-19) = 2026-03-26 → 13 days   → active
--   10050: max(2025-11-10, 2025-11-10) = 2025-11-10 → 149 days  → active
--   10054: max(2026-03-19, 2025-09-11) = 2026-03-19 → 20 days   → active
--   12285: max(2025-11-17, 2025-07-24) = 2025-11-17 → 142 days  → active
--   A0011: max(1900-01-01, 1900-01-01) = 1900-01-01 → >>365     → wert=0 < 100 → clutter
--   K0023: max(1900-01-01, 2014-07-30) = 2014-07-30 → >>365     → wert=212.35 ≥ 100 → dead
--   L0007: max(2025-10-06, 2023-11-17) = 2025-10-06 → 183 days  → slow
--   H0001: max(1900-01-01, 1900-01-01) = 1900-01-01 → >>365     → wert=1291.69 ≥ 100 → dead
-- Summary:
--   active:  174 (-22342.62), 10050 (-2894.10), 10054 (0.00), 12285 (-2037.86)
--            count=4, value_eur = -27274.58
--   slow:    2 (560.27), 58 (2012.25), L0007 (133.53)
--            count=3, value_eur = 2706.05
--   dead:    74 (187.69), K0023 (212.35), H0001 (1291.69)
--            count=3, value_eur = 1691.73
--   clutter: A0011 (0.00)
--            count=1
--   samples: 000002_Muster
--            count=1
-- Total non-excluded value = -27274.58 + 2706.05 + 1691.73 + 0.00 = -22876.80
-- pct_active = -27274.58 / (-22876.80) * 100 ≈ 119.2%  (pathological sample)
-- pct_slow   = 2706.05   / (-22876.80) * 100 ≈ -11.8%  (pathological)
-- pct_dead   = 1691.73   / (-22876.80) * 100 ≈ -7.4%   (pathological)
-- NOTE: All percentages are distorted because the sample has large-magnitude
-- negative-value rows. Production data will show well-formed 0–100% values.
--
-- -------------------------------------------------------------------------
-- KPI-06: stockouts
-- Trigger: bestand_lagereinheit <= 0 OR (reichw_mon < 1 AND reichw_mon IS NOT NULL)
-- Exclude: museum (000002_Muster) and geloescht = 'J' (none in sample)
-- Rows where bestand_lagereinheit <= 0:
--   174: -18414.25  → stockout
--   10050: -2983    → stockout
--   10054: -446     → stockout
--   12285: -1       → stockout
-- Rows where reichw_mon < 1 AND reichw_mon IS NOT NULL (and not already caught):
--   174:   reichw_mon=0.00  → already counted
--   10050: reichw_mon=0.00  → already counted
--   10054: reichw_mon=0.00  → already counted
--   12285: reichw_mon=0.00  → already counted
--   A0011: reichw_mon=0.00  → bestand=10 (>0), so triggers on reichw_mon < 1 → stockout
--   K0023: reichw_mon=0.00  → bestand=15 (>0), triggers → stockout
--   L0007: reichw_mon=0.00  → bestand=8 (>0), triggers → stockout
--   H0001: reichw_mon=0.00  → bestand=2200 (>0), triggers → stockout
--   2:     reichw_mon=27.00 → not < 1
--   58:    reichw_mon=25.00 → not < 1
--   74:    reichw_mon=69.00 → not < 1
-- stockouts.count = 8 (all rows except artikelnr 2, 58, 74, and the WKZ museum row)
-- Top-5 by wert_mit_abw DESC: 174 (-22342.62), 10050 (-2894.10), 12285 (-2037.86),
--   H0001 (1291.69), K0023 (212.35)
-- NOTE: Ordering by wert_mit_abw DESC means MOST-NEGATIVE values sort first.
-- This correctly surfaces the highest-impact (most-negative) rows first.
--
-- -------------------------------------------------------------------------
-- KPI-07: ABC distribution (all 12 rows, geloescht='N')
-- A: artikelnr 74, 174, 12285                        count=3, value_eur = 187.69 + (-22342.62) + (-2037.86) = -24192.79
-- B: artikelnr 58, 10050                             count=2, value_eur = 2012.25 + (-2894.10) = -881.85
-- C: all others (NULL → 'C'): 2, 000002_Mstr, 10054,
--    A0011, K0023, L0007, H0001                      count=7, value_eur = 560.27 + 0 + 0 + 0 + 212.35 + 133.53 + 1291.69 = 2197.84
-- NOTE: 000002_Muster has NULL abc → treated as 'C'
--
-- -------------------------------------------------------------------------
-- KPI-08: inventory_turnover (proxy: SUM(umsatz_me_j) / SUM(bestand_basiseinheit))
-- SUM(umsatz_me_j) from CSV:  (all rows)
--   2: 11.09/24 → looking at CSV col 29 (Umsatz Me J):
--   Row 2:  100 (or 0? re-checking CSV col order)
-- [DEFERRED: umsatz_me_j values require careful re-parsing of the CSV.
--  The CSV field widths shift when semicolons appear inside values like dates.
--  Computation deferred to Phase 3 integration test with live DB.]
--
-- -------------------------------------------------------------------------
-- KPI-09: devaluation
-- No row has wert != wert_mit_abw in this sample (abwert_prozent = 0 for all).
-- total_eur = SUM(wert - wert_mit_abw) for geloescht='N' = 0.00
-- pct_of_value = 0.0%
--
-- =========================================================================
