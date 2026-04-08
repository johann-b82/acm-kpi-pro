---
phase: 02-csv-ingestion-core
plan: "02-02"
slug: schema-and-migration
type: execute
wave: 1
depends_on: []
can_run_parallel_with: ["02-03"]
files_modified:
  - apps/api/src/db/schema.ts
  - apps/api/package.json
  - apps/api/drizzle.config.ts
autonomous: true
requirements:
  - KPI-01
  - IN-10

must_haves:
  truths:
    - "stock_rows table stores all 52 LagBes columns with strong types (numeric for prices/quantities, date columns, enum for Typ)"
    - "stock_rows_staging table has identical schema to stock_rows and exists as a permanent table for atomic swap"
    - "imports table tracks source ('upload'|'watcher'|'cli'), startedAt, finishedAt, and status ('running'|'success'|'failed')"
    - "Drizzle migration file exists and generates without error"
    - "TypeScript types exported from schema.ts compile cleanly"
  artifacts:
    - path: apps/api/src/db/schema.ts
      provides: "Full stock_rows + stock_rows_staging + extended imports Drizzle schema"
      contains: "stockRowsStaging, source, startedAt, finishedAt"
    - path: apps/api/package.json
      provides: "csv-parse, iconv-lite, uuid dependencies declared"
      contains: "csv-parse"
  key_links:
    - from: apps/api/src/db/schema.ts
      to: apps/api/src/ingest/writer.ts
      via: "stockRows, stockRowsStaging, imports Drizzle table exports"
      pattern: "export const stockRowsStaging"
    - from: apps/api/src/db/schema.ts
      to: apps/api/src/ingest/schema.ts
      via: "StockRowInsert type inferred from stockRows.$inferInsert"
      pattern: "inferInsert"
---

<objective>
Expand the Phase 1 placeholder `stock_rows` table to its full 52-column schema matching
the Apollo NTS LagBes export. Add a permanent `stock_rows_staging` table with identical
schema for the atomic swap pattern. Extend the `imports` table with `source`,
`started_at`, and `finished_at` columns. Regenerate the Drizzle migration. Install the
three missing npm dependencies (`csv-parse`, `iconv-lite`, `uuid`).

Purpose: Wave 2 plans (02-04, 02-05) cannot compile without these types. The schema is
the single source of truth for column names and Postgres types.

Output: Extended `schema.ts`, updated `package.json`, a new Drizzle migration SQL file.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/02-csv-ingestion-core/01-RESEARCH.md
@apps/api/src/db/schema.ts
@apps/api/src/db/index.ts
@apps/api/package.json
@samples/LagBes-sample.csv
@samples/README.md

<interfaces>
<!-- Existing schema.ts exports that must be preserved (do not remove): -->
```typescript
// KEEP these unchanged — Phase 1 auth code depends on them:
export const users    // pgTable("users", ...)
export const sessions // pgTable("sessions", ...)

// EXTEND this — Phase 1 placeholder with only 7 columns:
export const stockRows // pgTable("stock_rows", ...)

// EXTEND this — add source, startedAt, finishedAt:
export const imports  // pgTable("imports", ...)
```

<!-- Drizzle column helpers available: -->
```typescript
import {
  boolean, date, index, integer, numeric, pgEnum, pgTable,
  serial, text, timestamp
} from "drizzle-orm/pg-core";
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install missing npm dependencies</name>
  <files>apps/api/package.json</files>
  <action>
    Add three runtime dependencies to `apps/api/package.json`. These are NOT yet present
    (verified: only fastify, ldapts, iron-session, drizzle-orm, pg, pino, zod are listed).

    Add to the `"dependencies"` block:
    ```json
    "csv-parse": "^5.5.7",
    "iconv-lite": "^0.7.2",
    "uuid": "^13.0.0"
    ```

    Also add to `"devDependencies"`:
    ```json
    "@types/uuid": "^10.0.0"
    ```

    Then run `npm install` from the monorepo root so lockfile is updated:
    ```bash
    npm install
    ```

    NOTE: Do NOT change any existing dependency versions. Do NOT add csv-parse v6.x —
    stick to ^5.5.7 (v6 has breaking options API changes documented in RESEARCH.md).
    NOTE: `zod` is already at `^3.22.0` — do NOT upgrade to v4. The Zod schema in
    Plan 02-04 must use v3 syntax (`z.preprocess`, `.safeParse`, etc., which is identical
    in v3 and v4 for our usage).
  </action>
  <verify>
    <automated>node -e "require('/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/node_modules/csv-parse/dist/cjs/index.cjs')" && echo "csv-parse OK"</automated>
  </verify>
  <done>
    `csv-parse`, `iconv-lite`, and `uuid` appear in `apps/api/package.json` dependencies.
    `node_modules` at repo root contains these packages after `npm install`.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Expand stock_rows + add stock_rows_staging + extend imports in schema.ts</name>
  <files>
    apps/api/src/db/schema.ts
  </files>
  <behavior>
    - Schema compiles: `npm -w apps/api run build` (tsc) exits 0.
    - `stockRows` export has at least these fields: `artikelnr`, `typ`, `bezeichnung1`,
      `lagername`, `bestandLagereinheit`, `bestandBasiseinheit`, `preis`,
      `proMenge`, `wert`, `abwertProzent`, `wertMitAbw`, `durchVerbr`,
      `reichwMon`, `letztZugang`, `lagerzugangDat`, `lagerabgangDat`,
      `lagerabgangLetztesJahr`, `lagerabgangLetztes12Jahr`,
      `lagerzugangLetztes12Jahr`, `gelöscht`, `erfDatum`, `abcKennzVk`, `importId`.
    - `stockRowsStaging` export has identical column set to `stockRows` (same field names
      and Drizzle column types; different table name `"stock_rows_staging"`).
    - `imports` export gains `source` (text, not null, default 'cli'),
      `startedAt` (timestamp), `finishedAt` (timestamp nullable).
    - All existing `users`, `sessions`, `imports` (original fields) are untouched.
  </behavior>
  <action>
    Replace the `stockRows` definition in `apps/api/src/db/schema.ts` with the full
    52-column schema. Keep `users` and `sessions` exactly as they are. Keep existing
    `imports` fields and ADD the three new columns.

    Full column list for `stockRows` (and mirror in `stockRowsStaging`):

    ```typescript
    // pgEnum for Typ
    export const articleTypeEnum = pgEnum("article_type", ["ART", "MAT", "HLB", "WKZ"]);

    export const stockRows = pgTable("stock_rows", {
      id:                        serial("id").primaryKey(),
      importId:                  integer("import_id").references(() => imports.id, { onDelete: "cascade" }),

      // Identification
      artikelnr:                 text("artikelnr").notNull(),
      typ:                       articleTypeEnum("typ").notNull(),
      bezeichnung1:              text("bezeichnung_1"),
      bezeichnung2:              text("bezeichnung_2"),
      bezeichnung3:              text("bezeichnung_3"),
      bezeichnung4:              text("bezeichnung_4"),
      bezeichnung5:              text("bezeichnung_5"),
      bezeichnung6:              text("bezeichnung_6"),
      wgr:                       text("wgr"),
      prodgrp:                   text("prodgrp"),
      wareneingangskonto:        text("wareneingangskonto"),
      bestandskonto:             text("bestandskonto"),
      lagername:                 text("lagername").notNull(),

      // Stock quantities (can be negative — IN-13)
      bestandLagereinheit:       numeric("bestand_lagereinheit", { precision: 18, scale: 4 }),
      lagEinh:                   text("lag_einh"),
      bestandBasiseinheit:       numeric("bestand_basiseinheit", { precision: 18, scale: 4 }),
      einh:                      text("einh"),

      // Pricing and value
      preis:                     numeric("preis", { precision: 18, scale: 4 }),
      proMenge:                  integer("pro_menge"),
      wert:                      numeric("wert", { precision: 18, scale: 2 }),
      abwertProzent:             numeric("abwert_prozent", { precision: 5, scale: 2 }),
      wertMitAbw:                numeric("wert_mit_abw", { precision: 18, scale: 2 }),

      // Coverage and consumption
      durchVerbr:                numeric("durch_verbr", { precision: 18, scale: 4 }),
      reichwMon:                 numeric("reichw_mon", { precision: 10, scale: 2 }),

      // Dates (stored as date, parsed from DD.MM.YY — IN-06)
      letztZugang:               date("letzt_zugang"),
      letztZugangFa:             date("letzt_zugang_fa"),
      stammlager:                text("stammlager"),
      stammstellplatz:           text("stammstellplatz"),

      // Turnover / movements (can be negative)
      umsatzMeJ:                 numeric("umsatz_me_j",   { precision: 18, scale: 4 }),
      umsatzMeVj:                numeric("umsatz_me_vj",  { precision: 18, scale: 4 }),
      lieferant:                 text("lieferant"),
      lagerbD:                   numeric("lagerb_d",      { precision: 18, scale: 4 }),
      auftragM:                  numeric("auftrag_m",     { precision: 18, scale: 4 }),
      reservM:                   numeric("reserv_m",      { precision: 18, scale: 4 }),
      bestellM:                  numeric("bestell_m",     { precision: 18, scale: 4 }),
      faMenge:                   numeric("fa_menge",      { precision: 18, scale: 4 }),
      bedarfM:                   numeric("bedarf_m",      { precision: 18, scale: 4 }),
      oVerbrauchM:               numeric("o_verbrauch_m", { precision: 18, scale: 4 }),

      // Additional fields
      lEkAm:                     date("l_ek_am"),
      produktgruppe:             text("produktgruppe"),
      stmUniA01:                 text("stm_uni_a01"),

      // Date audit fields
      lagerzugangDat:            date("lagerzugang_dat"),
      lagerabgangDat:            date("lagerabgang_dat"),
      lagerabgangLetztesJahr:    numeric("lagerabgang_letztes_jahr",     { precision: 18, scale: 4 }),
      lagerabgangLetztes12Jahr:  numeric("lagerabgang_letztes_12_jahr",  { precision: 18, scale: 4 }),
      lagerzugangLetztes12Jahr:  numeric("lagerzugang_letztes_12_jahr",  { precision: 18, scale: 4 }),

      // Status flags
      gelöscht:                  text("geloescht").notNull().default("N"),  // "J" | "N"
      erfDatum:                  date("erf_datum"),
      eingrenzungVon:            text("eingrenzung_von"),
      eingrenzungBis:            text("eingrenzung_bis"),
      inventurgruppe:            text("inventurgruppe"),
      abcKennzVk:                text("abc_kennz_vk"),  // "A" | "B" | "C" | ""

      // Raw row for audit / debugging
      rawRow:                    text("raw_row"),

      createdAt: timestamp("created_at").defaultNow().notNull(),
    }, (t) => ({
      importIdx:   index("idx_stock_rows_import").on(t.importId),
      artikelnrIdx: index("idx_stock_rows_artikelnr").on(t.artikelnr),
      lagernameIdx: index("idx_stock_rows_lagername").on(t.lagername),
      typIdx:       index("idx_stock_rows_typ").on(t.typ),
      abcIdx:       index("idx_stock_rows_abc").on(t.abcKennzVk),
    }));

    // Staging table — identical columns, different table name.
    // Permanent table (not TEMP) so it survives connection resets.
    export const stockRowsStaging = pgTable("stock_rows_staging", {
      id:                        serial("id").primaryKey(),
      importId:                  integer("import_id"),
      artikelnr:                 text("artikelnr").notNull(),
      // ... exact same columns as stockRows, WITHOUT the indexes and WITHOUT
      // the .references() FK (staging is truncated per import, FK would slow inserts)
      // ... (all columns repeated as above except indexes block)
      createdAt: timestamp("created_at").defaultNow().notNull(),
    });
    ```

    For `stockRowsStaging`, repeat EVERY column from `stockRows` except:
    - Drop all `.references()` calls (no FK on staging)
    - Drop all `index(...)` calls (no indexes on staging — bulk insert performance)

    EXTEND the `imports` table (preserve existing fields, add three new ones):
    ```typescript
    source:      text("source").notNull().default("cli"),   // 'upload'|'watcher'|'cli'
    startedAt:   timestamp("started_at"),
    finishedAt:  timestamp("finished_at"),
    ```

    After editing `schema.ts`, generate a new migration:
    ```bash
    npm -w apps/api run db:generate
    ```
    This produces a new `.sql` file in `apps/api/drizzle/` (or wherever `drizzle.config.ts`
    points). Commit the migration file as part of this plan.
  </action>
  <verify>
    <automated>npm -w apps/api run build 2>&1 | tail -5 && echo "BUILD OK"</automated>
  </verify>
  <done>
    - `npm -w apps/api run build` exits 0 (no TypeScript errors).
    - `grep -c "stock_rows_staging" apps/api/src/db/schema.ts` returns at least 1.
    - `grep "startedAt\|source\|finishedAt" apps/api/src/db/schema.ts` matches.
    - A new migration SQL file exists in `apps/api/drizzle/` containing `CREATE TABLE "stock_rows_staging"`.
  </done>
</task>

</tasks>

<verification>
```bash
# TypeScript compiles cleanly
npm -w apps/api run build

# Dependencies installed
node -e "require('/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/node_modules/csv-parse/dist/cjs/index.cjs')"

# Schema exports present
grep -c "stockRowsStaging\|articleTypeEnum\|startedAt" \
  "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/src/db/schema.ts"

# Migration generated
ls "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/drizzle/" | grep -E "\.sql$"
```
</verification>

<success_criteria>
- `npm -w apps/api run build` exits 0.
- `stockRowsStaging` is a named export from `apps/api/src/db/schema.ts`.
- `imports` table Drizzle schema includes `source`, `startedAt`, `finishedAt`.
- `csv-parse`, `iconv-lite`, `uuid` are in `apps/api/package.json` dependencies.
- `apps/api/drizzle/` contains a migration SQL file with `stock_rows_staging` DDL.
- No changes to `users`, `sessions` Drizzle definitions.
</success_criteria>

<output>
After completion, create `.planning/phases/02-csv-ingestion-core/02-02-SUMMARY.md`
</output>
