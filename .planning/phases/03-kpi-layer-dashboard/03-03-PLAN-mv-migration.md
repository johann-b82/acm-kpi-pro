---
phase: 03-kpi-layer-dashboard
plan: "03-03"
type: execute
wave: 1
depends_on: []
can_run_parallel_with: ["03-02"]
files_modified:
  - apps/api/drizzle/0002_add_kpi_dashboard_mv.sql
autonomous: true
requirements:
  - KPI-02
  - KPI-03
  - KPI-04
  - KPI-05
  - KPI-06
  - KPI-07
  - KPI-08
  - KPI-09
  - TEST-02

must_haves:
  truths:
    - "Running the migration SQL on a Postgres 16 database with a populated stock_rows table produces a queryable kpi_dashboard_data view with exactly 1 row"
    - "The unique index idx_kpi_dashboard_data_id exists on kpi_dashboard_data(id), enabling REFRESH MATERIALIZED VIEW CONCURRENTLY"
    - "Helper functions is_excluded_from_slow_mover() and slow_mover_bucket() are IMMUTABLE and compile without errors"
    - "The MV query references the correct column names from the Phase 2 stock_rows schema (lagerabgang_dat, letzt_zugang, bestand_basiseinheit, reichw_mon, wert_mit_abw, wert, umsatz_me_j, geloescht, abc_kennz_vk, typ, lagername)"
  artifacts:
    - path: apps/api/drizzle/0002_add_kpi_dashboard_mv.sql
      provides: "Full migration: 2 helper functions + 1 MV + 1 unique index"
      contains: "CREATE MATERIALIZED VIEW kpi_dashboard_data"
  key_links:
    - from: apps/api/drizzle/0002_add_kpi_dashboard_mv.sql
      to: apps/api/src/ingest/writer.ts
      via: "MV created by this migration; writer.ts calls REFRESH MATERIALIZED VIEW in Plan 03-04"
    - from: apps/api/drizzle/0002_add_kpi_dashboard_mv.sql
      to: apps/api/src/kpi/routes.ts
      via: "API reads kpi_dashboard_data via raw SQL SELECT in Plan 03-05"
---

<objective>
Create the PostgreSQL migration file that defines the `kpi_dashboard_data` materialized view. This is a hand-written SQL migration because drizzle-kit cannot model materialized views. The migration runner (`apps/api/src/db/migrate.ts`) reads `.sql` files from `apps/api/drizzle/` in lexicographic order, so `0002_...sql` runs after `0001_...sql`.

Purpose: The MV pre-computes all 7 KPIs in a single pass over `stock_rows`, enabling the `/api/v1/kpi/summary` endpoint to return in < 50ms (single-row SELECT vs full table scan on every request).

Output: `apps/api/drizzle/0002_add_kpi_dashboard_mv.sql` — the complete migration including helper functions, the MV definition, and the unique index required for `REFRESH CONCURRENTLY`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-kpi-layer-dashboard/03-CONTEXT.md
@.planning/phases/03-kpi-layer-dashboard/01-RESEARCH.md

<interfaces>
<!-- stock_rows column names (from apps/api/src/db/schema.ts) that the MV references -->
<!-- Use these exact snake_case column names in the SQL — they match the Drizzle schema -->

Column names available in stock_rows:
  artikelnr          TEXT NOT NULL
  typ                article_type NOT NULL  -- enum: 'ART','MAT','HLB','WKZ'
  bezeichnung_1      TEXT
  lagername          TEXT NOT NULL
  bestand_lagereinheit  NUMERIC(18,4)   -- used for stockout trigger
  bestand_basiseinheit  NUMERIC(18,4)   -- used for turnover ratio + stockout trigger
  wgr                TEXT
  preis              NUMERIC(18,4)
  wert               NUMERIC(18,2)      -- original value (for devaluation calc)
  abwert_prozent     NUMERIC(5,2)
  wert_mit_abw       NUMERIC(18,2)      -- value after devaluation (primary value field)
  durch_verbr        NUMERIC(18,4)
  reichw_mon         NUMERIC(10,2)      -- months of coverage; NULL for museum/sample items
  letzt_zugang       DATE               -- last inbound movement date
  lagerabgang_dat    DATE               -- last outbound movement date (slow-mover basis)
  umsatz_me_j        NUMERIC(18,4)      -- annual turnover in base units
  abc_kennz_vk       TEXT               -- 'A'|'B'|'C'|NULL (NULL treated as 'C')
  geloescht          TEXT NOT NULL DEFAULT 'N'  -- 'J'=deleted, 'N'=active
  import_id          INTEGER            -- FK to imports.id

The MV WHERE clause uses:
  import_id = (SELECT id FROM imports WHERE status = 'success' ORDER BY finished_at DESC LIMIT 1)
This scopes the MV to the latest successful import only.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create apps/api/drizzle/0002_add_kpi_dashboard_mv.sql</name>
  <files>apps/api/drizzle/0002_add_kpi_dashboard_mv.sql</files>
  <action>
Create the file with the complete migration SQL as specified in RESEARCH.md. Write it verbatim. Key requirements:

**Header comment block:**
```sql
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
-- CONCURRENTLY refresh requires the unique index created at the bottom.
-- First-time refresh uses non-concurrent (see writer.ts Plan 03-04).
-- =========================================================================
```

**Helper function 1 — museum/sample exclusion:**
```sql
CREATE OR REPLACE FUNCTION is_excluded_from_slow_mover(
  typ article_type,
  lagername text
)
RETURNS boolean AS $$
BEGIN
  RETURN typ = 'WKZ' OR lagername ILIKE 'MUSTERRAUM%';
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

**Helper function 2 — slow-mover bucket classification:**

Returns 'active' | 'slow' | 'dead' | 'clutter' | 'excluded'.

Bucket rules (per CONTEXT.md — these thresholds are LOCKED):
- excluded: is_excluded_from_slow_mover() = true
- Uses GREATEST(COALESCE(lagerabgang_dat, '1900-01-01'), COALESCE(letzt_zugang, '1900-01-01')) for recency
- clutter: days_since_movement > 365 AND wert_mit_abw < 100
- active: days_since_movement <= 180
- slow: days_since_movement 181–365
- dead: days_since_movement > 365

```sql
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
  IF is_excluded_from_slow_mover(typ, lagername) THEN
    RETURN 'excluded';
  END IF;

  days_since_movement := COALESCE(
    EXTRACT(day FROM CURRENT_DATE - GREATEST(
      COALESCE(lagerabgang_dat, '1900-01-01'::date),
      COALESCE(letzt_zugang, '1900-01-01'::date)
    ))::int,
    99999
  );

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
```

**Main MV — CREATE MATERIALIZED VIEW kpi_dashboard_data AS SELECT:**

Single row (id = 1::smallint as the PK for CONCURRENTLY):

1. `id`: `1::smallint AS id`

2. `total_value_eur` (KPI-03):
   `COALESCE(SUM(CASE WHEN geloescht != 'J' THEN wert_mit_abw ELSE 0 END), 0)::numeric(18,2)`

3. `days_on_hand` (KPI-04) — weighted average of reichw_mon * 30.4 by wert_mit_abw, only non-deleted rows with non-null reichw_mon:
   ```sql
   CASE
     WHEN SUM(CASE WHEN geloescht != 'J' THEN wert_mit_abw ELSE 0 END) > 0
     THEN ROUND(
       SUM(CASE WHEN geloescht != 'J' AND reichw_mon IS NOT NULL
           THEN reichw_mon * wert_mit_abw ELSE 0 END) /
       NULLIF(SUM(CASE WHEN geloescht != 'J' THEN wert_mit_abw ELSE 0 END), 0) * 30.4,
     1)::numeric(10,1)
     ELSE NULL
   END AS days_on_hand
   ```

4. `slow_dead_stock` (KPI-05) — `jsonb_build_object` with keys:
   - 'active': jsonb_build_object('count', COUNT FILTER active, 'value_eur', SUM FILTER active, 'pct', ROUND(SUM active / total_non_excluded * 100, 1))
   - 'slow': same pattern
   - 'dead': same pattern
   - 'clutter_count': COUNT FILTER clutter
   - 'samples_count': COUNT FILTER excluded

   Use `slow_mover_bucket(lagerabgang_dat, letzt_zugang, wert_mit_abw, typ, lagername)` as the classifier.
   Total non-excluded denominator: SUM(wert_mit_abw) FILTER (WHERE geloescht != 'J' AND bucket IN ('active','slow','dead','clutter'))

5. `stockouts` (KPI-06) — `jsonb_build_object` with:
   - 'count': COUNT FILTER (geloescht != 'J' AND NOT museum AND (bestand_basiseinheit <= 0 OR (reichw_mon < 1 AND reichw_mon IS NOT NULL)))
   - 'items_preview': correlated subquery returning jsonb_agg of top 5 by wert_mit_abw DESC (artikelnr, bezeichnung_1, bestand_basiseinheit, wert_mit_abw, COALESCE(abc_kennz_vk,'C'))

   Note: Use `bestand_basiseinheit` for the stockout trigger (NOT `bestand_lagereinheit`) — matches CONTEXT.md decision: `bestand_lagereinheit <= 0 OR reichw_mon < 1`.
   
   WAIT — re-read CONTEXT.md: the trigger is `bestand_lagereinheit <= 0 OR reichw_mon < 1`. Use `bestand_lagereinheit` for the <= 0 check and `reichw_mon` for the < 1 check.

6. `abc_distribution` (KPI-07) — `jsonb_build_object` with 'a', 'b', 'c' each having count and value_eur (COALESCE abc to 'C', non-deleted only).

7. `inventory_turnover` (KPI-08):
   ```sql
   CASE
     WHEN SUM(bestand_basiseinheit) > 0
     THEN ROUND(SUM(umsatz_me_j) / NULLIF(SUM(bestand_basiseinheit), 0), 2)::numeric(10,2)
     ELSE 0::numeric(10,2)
   END AS inventory_turnover
   ```

8. `devaluation` (KPI-09) — `jsonb_build_object` with:
   - 'total_eur': COALESCE(SUM(CASE WHEN geloescht != 'J' THEN (wert - wert_mit_abw) ELSE 0 END), 0)::numeric(18,2)
   - 'pct_of_value': CASE WHEN SUM(wert) > 0 THEN ROUND(devaluation_total / SUM(wert) * 100, 1) ELSE 0 END

**FROM clause:**
```sql
FROM stock_rows
WHERE import_id = (
  SELECT id FROM imports
  WHERE status = 'success'
  ORDER BY finished_at DESC
  LIMIT 1
);
```

**Unique index (required for CONCURRENTLY refresh):**
```sql
CREATE UNIQUE INDEX idx_kpi_dashboard_data_id ON kpi_dashboard_data(id);
```

Use the full SQL from `01-RESEARCH.md` as the authoritative reference. The above is a specification; the research file has the complete verbatim SQL — use it directly for the jsonb aggregation blocks to avoid transcription errors.

Critical: Every reference to column names must match the Phase 2 schema exactly. Use `lagerabgang_dat` (not `lagerabgang_date`), `letzt_zugang` (not `letzt_zugang_fa`), `bestand_basiseinheit`, `wert_mit_abw`, `abc_kennz_vk`.
  </action>
  <verify>
    <automated>test -f "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/drizzle/0002_add_kpi_dashboard_mv.sql" && grep -c "CREATE MATERIALIZED VIEW kpi_dashboard_data" "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/drizzle/0002_add_kpi_dashboard_mv.sql"</automated>
  </verify>
  <done>File exists; contains `CREATE MATERIALIZED VIEW kpi_dashboard_data`; contains `CREATE UNIQUE INDEX idx_kpi_dashboard_data_id`; contains both `is_excluded_from_slow_mover` and `slow_mover_bucket` function definitions; all stock_rows column references match Phase 2 schema</done>
</task>

</tasks>

<verification>
```bash
# Verify migration file is in correct location and ordering
ls -1 "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/drizzle/"
# Expected: 0001_... then 0002_... in order

# Verify required SQL objects present
grep "CREATE MATERIALIZED VIEW kpi_dashboard_data" \
  "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/drizzle/0002_add_kpi_dashboard_mv.sql"

grep "CREATE UNIQUE INDEX idx_kpi_dashboard_data_id" \
  "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/drizzle/0002_add_kpi_dashboard_mv.sql"

grep "is_excluded_from_slow_mover" \
  "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/drizzle/0002_add_kpi_dashboard_mv.sql"

grep "slow_mover_bucket" \
  "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/drizzle/0002_add_kpi_dashboard_mv.sql"

# Verify column names match Phase 2 schema (no typos)
grep -E "lagerabgang_dat|letzt_zugang|bestand_basiseinheit|wert_mit_abw|abc_kennz_vk|bestand_lagereinheit|reichw_mon" \
  "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/drizzle/0002_add_kpi_dashboard_mv.sql" | head -10
```

Note: The migration is not run in this plan (requires a live Postgres). It is validated by column-name inspection here. The API unit tests in Plan 03-05 mock the DB and don't require the migration to run. The migration runs during `npm run db:migrate` in the Phase 3 integration test.
</verification>

<success_criteria>
- `apps/api/drizzle/0002_add_kpi_dashboard_mv.sql` exists
- Contains 2 helper function definitions (IMMUTABLE)
- Contains `CREATE MATERIALIZED VIEW kpi_dashboard_data AS SELECT ... FROM stock_rows WHERE import_id = (SELECT id FROM imports ...)`
- Contains `CREATE UNIQUE INDEX idx_kpi_dashboard_data_id ON kpi_dashboard_data(id)`
- All 7 KPI columns present: `total_value_eur`, `days_on_hand`, `slow_dead_stock`, `stockouts`, `abc_distribution`, `inventory_turnover`, `devaluation`
- Column references match Phase 2 schema (`apps/api/src/db/schema.ts`)
</success_criteria>

<output>
After completion, create `.planning/phases/03-kpi-layer-dashboard/03-03-SUMMARY-mv-migration.md` with:
- File created
- List of SQL objects defined (functions + MV + index)
- Any column name corrections made vs research file
- Whether migration was validated against a live DB (expected: no — unit-test-only validation)
</output>
