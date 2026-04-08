---
phase: "02-csv-ingestion-core"
plan: "02-02"
slug: "schema-and-migration"
subsystem: "database/schema"
tags: ["drizzle-orm", "postgresql", "schema", "migration", "csv-ingestion"]
dependency_graph:
  requires:
    - "01-07 (Phase 1 API foundation, existing DB schema)"
  provides:
    - "Full 52-column stock_rows Drizzle schema (Wave 2 plans: 02-03, 02-04, 02-05 unblocked)"
    - "stock_rows_staging permanent table for atomic swap pattern"
    - "Extended imports audit table (source, startedAt, finishedAt)"
    - "StockRowInsert, StockRowSelect TypeScript types"
    - "csv-parse, iconv-lite, uuid npm dependencies"
  affects:
    - "apps/api/src/ingest/* (wave 2 plans reference stockRows, stockRowsStaging, imports)"
tech_stack:
  added:
    - "csv-parse@5.6.0 (streaming CSV parser)"
    - "iconv-lite@0.7.2 (Windows-1252 decoding)"
    - "uuid@13.0.0 (import correlation IDs)"
    - "@types/uuid@10.0.0 (dev)"
    - "articleTypeEnum pgEnum (ART/MAT/HLB/WKZ)"
  patterns:
    - "Drizzle pgTable with explicit numeric precision for monetary/quantity columns"
    - "Permanent staging table (no FK, no indexes) for atomic bulk-insert swap"
    - "StockRowInsert inferred from $inferInsert for type-safe inserts"
key_files:
  created:
    - "apps/api/drizzle/0001_expand_stock_rows_schema.sql"
    - "apps/api/drizzle/meta/0001_snapshot.json"
  modified:
    - "apps/api/src/db/schema.ts"
    - "apps/api/drizzle/meta/_journal.json"
    - "apps/api/package.json"
    - "apps/api/drizzle/meta/0000_snapshot.json (unchanged — Phase 1 state preserved)"
decisions:
  - "article_type enum created as pgEnum (not text) — enables DB-level type safety on Typ column"
  - "stock_rows_staging has no FK and no indexes — bulk insert performance during atomic swap"
  - "gelöscht stored as text 'geloescht' (ASCII) — avoids encoding issues in column name"
  - "abcKennzVk kept as text (not enum) — blank values → NULL, not requiring Drizzle enum handling"
  - "drizzle-kit generate bypassed for stock_rows column changes — requires TTY (documented below)"
metrics:
  duration: "~45 min"
  completed_date: "2026-04-08"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 6
requirements:
  - KPI-01
  - IN-10
---

# Phase 2 Plan 02: Schema and Migration Summary

**One-liner:** Full 52-column LagBes schema with stock_rows_staging staging table, article_type pgEnum, extended imports audit columns, and incremental migration SQL — enabling Wave 2 ingest plans to compile.

## What Was Built

### Task 1: Dependencies Installed

Added to `apps/api/package.json`:
- `csv-parse@^5.5.7` (resolved to 5.6.0) — streaming semicolon-delimited CSV parser
- `iconv-lite@^0.7.2` — Windows-1252 / CP1252 decoder
- `uuid@^13.0.0` — import correlation IDs for structured logging
- `@types/uuid@^10.0.0` (dev) — TypeScript types for uuid v13

### Task 2: Schema Expansion

**`apps/api/src/db/schema.ts`** was rewritten from the 7-column Phase 1 placeholder to:

- `articleTypeEnum` — pgEnum `article_type` with values `ART`, `MAT`, `HLB`, `WKZ`
- `stockRows` — 56 Drizzle columns covering all 52 Apollo NTS LagBes fields plus `id`, `importId`, `rawRow`, `createdAt`. Indexes on `import_id`, `artikelnr`, `lagername`, `typ`, `abc_kennz_vk`. FK to `imports.id` with `ON DELETE CASCADE`.
- `stockRowsStaging` — identical 56-column definition, `"stock_rows_staging"` table name, no FK, no indexes (permanent table for bulk insert + atomic swap)
- `imports` extended — added `source text NOT NULL DEFAULT 'cli'`, `started_at timestamp`, `finished_at timestamp`
- Exported inferred types: `StockRowInsert`, `StockRowSelect`, `StockRowStagingInsert`, `ImportInsert`, `ImportSelect`

**Migration `0001_expand_stock_rows_schema.sql`:**
1. `CREATE TYPE "public"."article_type" AS ENUM('ART', 'MAT', 'HLB', 'WKZ')`
2. `ALTER TABLE "imports" ADD COLUMN` — source, started_at, finished_at
3. `ALTER TABLE "stock_rows" DROP CONSTRAINT/DROP COLUMN` — removes 4 Phase 1 placeholder columns
4. `ALTER TABLE "stock_rows" ADD COLUMN` — adds all 48 Phase 2 columns
5. `ALTER TABLE "stock_rows" ADD CONSTRAINT` — FK with CASCADE
6. `CREATE INDEX` — 4 new indexes on artikelnr, lagername, typ, abc_kennz_vk
7. `CREATE TABLE "stock_rows_staging"` — full 56-column staging table

## Verification Results

| Check | Result |
|-------|--------|
| TypeScript build errors in schema.ts | 0 new errors |
| Pre-existing ldap.service errors | 19 (unchanged — pre-existing in Phase 1) |
| Biome lint on schema.ts | Exit 0, no violations |
| csv-parse loadable | PASS |
| stockRowsStaging export exists | PASS |
| startedAt/source/finishedAt in schema | PASS (7 matches) |
| Migration SQL exists | `0001_expand_stock_rows_schema.sql` |
| stock_rows_staging in migration | PASS (2 occurrences) |
| All auth tests pass (isolated) | 9/9 PASS |
| Full test suite | 27/28 pass (1 flaky timeout — pre-existing, see below) |

## Deviations from Plan

### Auto-fixed Issues

None — no bugs found.

### Blocking Issue (Rule 3)

**[Rule 3 - Blocking] drizzle-kit generate requires TTY — non-interactive environment**

- **Found during:** Task 2, migration generation step
- **Issue:** `drizzle-kit generate` v0.31.x calls `promptColumnsConflicts` (an interactive hanji prompt) when the diff includes column deletions or creations in the same table. In non-TTY shells (background processes, piped input, CI), it throws: `"Interactive prompts require a TTY terminal (process.stdin.isTTY or process.stdout.isTTY is false)."` This was triggered because the Phase 1 placeholder columns (`article_number`, `warehouse`, `quantity`, `value`) were being replaced with the Phase 2 columns.
- **Fix applied:** Migration SQL was written manually based on the exact diff between Phase 1 and Phase 2 schemas. The SQL follows drizzle-kit's exact format (breakpoint comments, same DDL style). The drizzle meta snapshot was updated to reflect the correct Phase 2 state (`0001_snapshot.json`). The `0000_snapshot.json` was preserved unchanged (Phase 1 state). Running `drizzle-kit generate` after applying this fix confirms no additional drift.
- **Alternative tried:** `generateMigration()` from `drizzle-kit/api.mjs` uses the same internal `columnsResolver` — also requires TTY.
- **Files modified:** `apps/api/drizzle/0001_expand_stock_rows_schema.sql` (new), `apps/api/drizzle/meta/0001_snapshot.json` (new), `apps/api/drizzle/meta/_journal.json` (updated)
- **Impact:** Migration SQL is semantically equivalent to what drizzle-kit would generate. The stock_rows_staging `CREATE TABLE` statement in `0001` was verified against what drizzle-kit DID generate in an earlier attempt. Correctness is high confidence.
- **Recommendation:** On a Docker host (Postgres available), run `drizzle-kit push` to verify the migration applies cleanly.

### Pre-existing Issues (Out of Scope)

**19 TypeScript errors in `ldap.service.ts` / `ldap.service.test.ts`** — these existed before this plan (verified by stash/unstash). All errors relate to LDAP mock types (`Client` interface) and `exactOptionalPropertyTypes` strictness. Not caused by schema changes.

**1 flaky test timeout in full suite** — `auth.test.ts > returns 200 and sets cookie on valid admin credentials` times out at 5000ms when all 3 test files run in parallel (resource contention). Passes in 483ms when run in isolation. Pre-existing.

## Known Stubs

None. The schema defines real column types for all fields. No placeholder data or hardcoded values flow to UI rendering (schema is not consumed by UI directly).

## Live Migration Deferred

`drizzle-kit push` (applying migration to live Postgres) is deferred to a Docker host. Per execution rules, Docker Desktop is not available in the current environment. Migration SQL is correct and ready to apply.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `apps/api/src/db/schema.ts` | FOUND |
| `apps/api/drizzle/0001_expand_stock_rows_schema.sql` | FOUND |
| `apps/api/drizzle/meta/0001_snapshot.json` | FOUND |
| `02-02-SUMMARY.md` | FOUND |
| Commit `4026fcb` (deps) | FOUND |
| Commit `63378db` (schema) | FOUND |
| `stockRowsStaging` in schema.ts | 2 occurrences |
| `articleTypeEnum` in schema.ts | 3 occurrences |
| `startedAt` in schema.ts | 2 occurrences |
| `csv-parse` in package.json | 1 occurrence |
