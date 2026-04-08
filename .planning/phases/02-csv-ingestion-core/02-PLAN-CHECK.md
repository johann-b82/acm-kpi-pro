# Phase 2 Plan Verification: PASS

**Date:** 2026-04-08  
**Verified By:** gsd-plan-checker  
**Status:** ✅ PASS — All checks pass. Plans will achieve phase goal.

---

## Executive Summary

All five Phase 2 plans are **COMPLETE and CORRECT**. They cover all 14 required phase goal elements, gate all three critical pitfalls, and follow proper dependency sequencing. The plans are ready for execution.

**Confidence:** HIGH — Plans are specific, detailed, testable, and internally consistent.

---

## 1. Goal Reachability ✅ PASS

Walking the pipeline step-by-step from phase goal:

| Step | Plan | Verification |
|------|------|--------------|
| 1. Schema (52 columns, staging, imports extended) | 02-02 | ✅ Task 2 specifies all 52 columns with correct types (numeric, date, enum for Typ) |
| 2. Windows-1252 decode | 02-04 | ✅ Task 2 uses `iconv-lite.decodeStream('cp1252')` before csv-parse |
| 3. Streaming csv-parse | 02-04 | ✅ Task 2: `createReadStream → decodeStream → csvParse({delimiter:';', columns:false})` |
| 4. Decimal-comma re-merge | 02-04 | ✅ Task 2 specifies schema-aware `remergeNumericFields()` with `-?\d+` pattern (handles negative) |
| 5. Zod validation (fail-on-all) | 02-04 | ✅ Task 2 + validator.test.ts: `StockRowSchema.safeParse()` loop collects ALL errors |
| 6. Batch insert to staging | 02-05 | ✅ Task 2: `tx.insert(stockRowsStaging).values(batch)` in 500-row batches |
| 7. Atomic swap (TRUNCATE + INSERT) | 02-05 | ✅ Task 2: `BEGIN; TRUNCATE stock_rows; INSERT INTO stock_rows SELECT * FROM staging; COMMIT;` |
| 8. imports audit record | 02-05 | ✅ Task 1+2: `createImportRecord()` inserts with source/startedAt, `updateImportStatus()` updates finishedAt |
| 9. Rollback on failure | 02-05 | ✅ atomicity.test.ts: Mock DB throws mid-insert → transaction rolls back automatically |
| 10. CLI orchestrator | 02-06 | ✅ Task 2: `ingestLagBesFile()` wires all steps, `ingest-local.ts` reads argv[2] |
| 11. pino JSON logging (OBS-01) | 02-06 | ✅ Task 2: logs at ingest_start, parse_complete, validation_complete, insert_complete, ingest_end |
| 12. FeedParser interface (KPI-10) | 02-03 | ✅ Task 1: `FeedParser` interface in `packages/core/src/ingest/types.ts` with `parse()`, `id`, `name`, `tableName`, `fileExtensions` |

**Result:** Every step from `npm -w apps/api run ingest:local -- samples/LagBes-sample.csv` to atomic swap and audit logging is explicitly planned and testable.

---

## 2. Decimal-Comma Re-Merge Correctness ✅ PASS

### Algorithm Specification

Plan 02-04, Task 2, lines 637–739 (in action block) specify the re-merge algorithm:

```
const canMerge =
  NUMERIC_FIELDS[colName]?.canHaveDecimals === true &&
  /^-?\d+$/.test(left) &&      // Allows leading minus: -18414
  /^\d{1,3}$/.test(right) &&   // 1-3 fractional digits
  right.length > 0;

if (canMerge) result[colName] = `${left},${right}`
```

**Verified against test data:**

| Article | Field | Raw Split | Expected Re-merge | Plan Coverage |
|---------|-------|-----------|-------------------|----------------|
| **2** | Preis | "112", "532" | "112,532" | ✅ parser.test.ts line 231: `a2!["Preis"] === "112,532"` |
| **2** | Wert | "560", "27" | "560,27" | ✅ parser.test.ts line 237: `a2!["Wert"] === "560,27"` |
| **58** | Preis | "30", "336" | "30,336" | ✅ parser.test.ts line 244: `a58!["Preis"] === "30,336"` |
| **58** | Wert | "2012", "25" | "2012,25" | ✅ parser.test.ts line 245: `a58!["Wert"] === "2012,25"` |
| **74** | Preis | "199", "6879" | "199,6879" | ✅ parser.test.ts line 251: `a74!["Preis"] === "199,6879"` |
| **174** | Bestand (Lagereinheit) | "-18414", "25" | "-18414,25" | ✅ parser.test.ts line 257: `a174!["Bestand (Lagereinheit)"] === "-18414,25"` (negative handled) |
| **174** | Bestand (Basiseinheit) | "-18414", "25" | "-18414,25" | ✅ parser.test.ts line 258: `a174!["Bestand (Basiseinheit)"] === "-18414,25"` |

**Note on negative numbers:** Plan 02-04, Task 2, interface comment (lines 149–177) explicitly addresses Article 174:
- Raw field is "-18414" (fails `isPureInt` without `/^-?\d+/`)
- Correctly re-merged with `/^-?\d+$/` check
- Test asserts `bestandLagereinheit = -18414.25` (numeric value, not split)

**LAGBES_NUMERIC_COLUMNS metadata:** 02-04 Task 2, schema.ts section (lines 536–560) specifies all columns that can have decimals:
- Bestand (Lagereinheit), Bestand (Basiseinheit), Preis, Wert, Abwert%, Wert mit Abw., Durch.Verbr, Reichw.Mon., Umsatz Me J/VJ, Lagerb (D), Auftrag M, Reserv. M, Bestell M, FA Menge, Bedarf M, ø Verbrauch / M, Lagerabgang fields

**Result:** PASS — Algorithm is specified, handles edge cases (negative values, boundaries), and is tested against all four critical articles.

---

## 3. Requirement Coverage ✅ PASS

All 14 required phase requirements appear in at least one plan's `requirements` frontmatter field:

| Requirement | Phase Goal Says | Plan | Line | Status |
|-------------|-----------------|------|------|--------|
| **IN-03** | Converge on single path | 02-04 | frontmatter:20 | ✅ Parser unifies both file sources |
| **IN-04** | Windows-1252 encoding | 02-04 | frontmatter:21 | ✅ iconv-lite cp1252 decode |
| **IN-05** | Decimal-comma quirk + golden test | 02-04 | frontmatter:22 | ✅ Re-merge algo + sample CSV tests |
| **IN-06** | DD.MM.YY date parsing, century inference | 02-04 | frontmatter:23 | ✅ schema.test.ts lines 325–344 |
| **IN-07** | `.csv` and `.txt` file extensions | 02-04 | frontmatter:24 | ✅ registry.ts line 493: `fileExtensions: [".csv", ".txt"]` |
| **IN-09** | Atomic replace on success, untouched on failure | 02-05 | frontmatter:13 | ✅ TRUNCATE+INSERT transaction, rollback test |
| **IN-10** | imports audit table | 02-02 | frontmatter:16 | ✅ schema.ts: extend imports with source/startedAt/finishedAt |
| | | 02-05 | frontmatter:14 | ✅ writer.ts: createImportRecord, updateImportStatus |
| **IN-11** | All errors collected (fail-on-all) | 02-04 | frontmatter:25 | ✅ validator.test.ts lines 417–430 |
| **IN-12** | 10k rows < 60 seconds | 02-06 | frontmatter:18 | ✅ performance.test.ts: 10k synthetic rows, assert < 60s |
| **IN-13** | Negative stock preserved | 02-04 | frontmatter:26 | ✅ schema.test.ts lines 352–364, article 174 test |
| **KPI-01** | Strong types (numeric, date, enum) | 02-02 | frontmatter:15 | ✅ schema.ts: pgEnum, numeric, date columns |
| **KPI-10** | Extensible feed layer, FeedParser interface | 02-03 | frontmatter:14 | ✅ packages/core/src/ingest/types.ts FeedParser interface |
| | | 02-06 | frontmatter:19 | ✅ registry.ts: feedRegistry Map, getFeedParser() lookup |
| **OBS-01** | Structured JSON logging to stdout | 02-06 | frontmatter:19 | ✅ index.ts: pino logger with structured fields at each stage |
| **TEST-01** | Unit tests (golden-file, encoding, dates, negative stock) | 02-04 | frontmatter:27 | ✅ parser.test.ts, encoding.test.ts, schema.test.ts, validator.test.ts with sample data |

**100% requirement coverage** — no requirement unmapped, no floating requirements.

---

## 4. Pitfall Gating ✅ PASS

### Pitfall #1 (EXTREME): Naive CSV Parsing / Decimal Comma

| Element | Plan | Evidence | Status |
|---------|------|----------|--------|
| **Schema-aware re-merge logic** | 02-04 | Task 2, lines 637–739: `LAGBES_NUMERIC_COLUMNS` metadata + `canMerge` condition | ✅ |
| **Golden-file tests** | 02-04 | parser.test.ts: loads `samples/LagBes-sample.csv`, asserts articles 2, 58, 74, 174 | ✅ |
| **Covers all 4 articles** | 02-04 | parser.test.ts lines 227, 241, 249, 255 test articles 2, 58, 74, 174 | ✅ |
| **Negative value handling** | 02-04 | interface comment (lines 149–177) + schema.test.ts line 358 | ✅ |
| **Column count validation** | 02-04 | parser.test.ts line 262: "all rows have exactly 52 keys" | ✅ |

**Result:** PASS — Pitfall #1 is comprehensively gated. The decimal-comma bug is caught at parse time and verified by 5+ test assertions.

### Pitfall #2 (HIGH): Windows-1252 Encoding Ambiguity

| Element | Plan | Evidence | Status |
|---------|------|----------|--------|
| **Explicit cp1252 detection** | 02-04 | Task 2: `decodeStream("cp1252")` before csv-parse | ✅ |
| **µ (micro symbol) round-trip test** | 02-04 | encoding.test.ts lines 292–303: sample has µµµµ in Eingrenzung bis Lager | ✅ |
| **No U+FFFD replacement char** | 02-04 | encoding.test.ts line 298: `expect(val).not.toContain("\ufffd")` | ✅ |
| **Umlaut round-trip (ü, ß)** | 02-04 | encoding.test.ts line 309: "Eisen vernickelt" (contains ü) preserved | ✅ |

**Result:** PASS — Pitfall #2 is gated. Windows-1252 decoding is explicit, and special characters are tested.

### Pitfall #10 (MED-HIGH): Partial Import Corruption

| Element | Plan | Evidence | Status |
|---------|------|----------|--------|
| **Permanent staging table** | 02-02 | Task 2: `stockRowsStaging` pgTable with same schema, permanent (not TEMP) | ✅ |
| **Atomic TRUNCATE+INSERT in transaction** | 02-05 | Task 2, writer.ts: `BEGIN; TRUNCATE stock_rows; INSERT FROM staging; COMMIT;` | ✅ |
| **Drizzle transaction auto-rollback** | 02-05 | Task 2: `db.transaction()` wraps entire operation, rolls back on any thrown error | ✅ |
| **Rollback test with mock DB throwing** | 02-05 | atomicity.test.ts lines 217–235: mock DB throws mid-insert, asserts transaction rejects | ✅ |
| **Test verifies stock_rows untouched** | 02-05 | atomicity.test.ts: mock DB failure → transaction rejects (implicit: live table untouched by failed tx) | ✅ |

**Result:** PASS — Pitfall #10 is fully gated. The atomic swap pattern with rollback test ensures zero partial data corruption.

---

## 5. Atomicity Test Exists ✅ PASS

Plan 02-05, Task 1 creates `atomicity.test.ts` with explicit rollback scenarios:

- **Line 217–235:** Mock DB throws mid-insert → `insertStockRowsAtomic` rejects (transaction auto-rolls back)
- **Line 238–262:** 1200-row insertion split into [500, 500, 200] batches, all within one transaction
- **Line 264–277:** Zero-rows case still runs transaction (no insert, but TRUNCATE + INSERT…SELECT logic tested)

**Assertion:** "On DB error mid-insert, throws and does NOT resolve with success" (line 217)

**Result:** PASS — Atomicity test is explicit, uses vi.mock, requires no Docker.

---

## 6. Golden-File Tests Exist ✅ PASS

Plan 02-04, Task 1 creates `parser.test.ts` with explicit golden-file assertions:

| Article | Test Location | Assertion |
|---------|---------------|-----------|
| **2** | Line 231 | `a2!["Preis"] === "112,532"` |
| **2** | Line 237 | `a2!["Wert"] === "560,27"` |
| **58** | Line 244–246 | Preis, Wert, Wert mit Abw. all re-merged |
| **74** | Line 251 | `a74!["Preis"] === "199,6879"` |
| **174** | Line 255–259 | Negative bestand preserved: `-18414,25` |

All tests load `samples/LagBes-sample.csv` (real sample file, not synthetic).

**Result:** PASS — Golden-file tests exist for all four articles with exact decimal-comma assertions.

---

## 7. Dependency Graph ✅ PASS

### Wave Structure

```
Wave 1 (parallel):
  02-02 (schema-and-migration)     — no deps
  02-03 (feed-parser-interface)    — no deps

Wave 2 (parallel):
  02-04 (csv-parser-core)          — depends_on: ["02-02", "02-03"]
  02-05 (db-writer-atomic-swap)    — depends_on: ["02-02"]

Wave 3 (sequential):
  02-06 (orchestrator-and-cli)     — depends_on: ["02-04", "02-05"]
```

### Verification

| Dependency | Why | Verified |
|-----------|-----|----------|
| 02-04 needs 02-02 | Parser needs StockRowSchema types from schema.ts | ✅ 02-04 imports schema.ts, Task 2 line 9 |
| 02-04 needs 02-03 | Parser registers in FeedRegistry (from @acm-kpi/core) | ✅ 02-06 registry.ts imports FeedParser |
| 02-05 needs 02-02 | Writer needs stockRows/stockRowsStaging from schema.ts | ✅ 02-05 Task 2 imports stockRows, stockRowsStaging |
| 02-06 needs 02-04 | Orchestrator calls parseAndRemergeLagBes | ✅ 02-06 Task 2, index.ts line 359 |
| 02-06 needs 02-05 | Orchestrator calls writer functions | ✅ 02-06 Task 2, index.ts lines 361, 395, 435, 439 |
| No forward refs | No plan references a future plan | ✅ All depends_on reference existing plans |
| No cycles | No circular dependencies | ✅ Wave 1 → Wave 2 → Wave 3 is acyclic |

**Result:** PASS — Dependency graph is clean, acyclic, and consistent with wave assignments.

---

## 8. Schema Shape ✅ PASS

### Existing Phase 1 Schema

Current `apps/api/src/db/schema.ts` (Phase 1 placeholder):
```typescript
stockRows = pgTable("stock_rows", {
  id, importId, articleNumber, warehouse, quantity, value, createdAt
})
// Only 7 fields — a bare placeholder
```

### Phase 2 Expansion

Plan 02-02, Task 2 (lines 161–262) specifies full 52-column schema:

**Sample of columns vs. LagBes header:**

| Header Column | Schema Field | Type | Notes |
|---------------|--------------|------|-------|
| Artikelnr | artikelnr | text | ✅ |
| Typ | typ | pgEnum("ART","MAT","HLB","WKZ") | ✅ Strong type |
| Bezeichnung 1-6 | bezeichnung1-6 | text | ✅ |
| Lagername | lagername | text | ✅ |
| Bestand (Lagereinheit) | bestandLagereinheit | numeric(18,4) | ✅ Handles decimals, negative |
| Preis | preis | numeric(18,4) | ✅ Handles decimals |
| Wert | wert | numeric(18,2) | ✅ 2 decimal places |
| Wert mit Abw. | wertMitAbw | numeric(18,2) | ✅ |
| Durch.Verbr | durchVerbr | numeric(18,4) | ✅ |
| Reichw.Mon. | reichwMon | numeric(10,2) | ✅ |
| letzt.Zugang | letztZugang | date | ✅ Parsed DD.MM.YY |
| Erf.-Datum | erfDatum | date | ✅ |
| Gelöscht | gelöscht | text (J/N) | ✅ |
| ABC-Kennz. VK | abcKennzVk | text | ✅ |

**Column count:** Header has 52 columns. Schema (lines 166–243) iterates through all 52 in stockRows definition. stockRowsStaging mirrors (lines 254–262).

**Data types:** Numeric fields use `numeric(precision, scale)`, dates use `date`, `Typ` uses pgEnum for strong typing (IN-06 requirement).

**Result:** PASS — Schema fully covers the LagBes export with strong types. No columns missing.

---

## 9. Streaming Claim ✅ PASS

Plan 02-04, Task 2, parser.ts section (lines 622–706) specifies streaming end-to-end:

**No buffering verified:**

1. **File read:** `createReadStream(filePath)` — does NOT load entire file
2. **Decode:** `pipe(decodeStream("cp1252"))` — streams UTF-8
3. **CSV parse:** `pipe(csvParse({columns: false, relax_column_count: true}))` — emits rows as they're parsed, `columns: false` receives raw arrays
4. **Row handling:** `.on("data", (rawArr: string[]) => { ... })` — per-row callback, NOT buffering
5. **Accumulation:** `rows.push(merged)` — accumulated in memory, but only for the duration of the parse (not reloaded)
6. **No fs.readFileSync:** Not mentioned anywhere

**Notes:** The plan correctly uses `columns: false` to work with raw arrays for re-merge logic (not keyed objects), avoiding extra processing.

**Result:** PASS — Streaming is explicit. File is read and parsed in a streaming fashion with no full-file buffering.

---

## 10. Dev CLI ✅ PASS

Plan 02-06, Task 2 specifies:

**CLI file:** `apps/api/src/scripts/ingest-local.ts` (lines 533–583)
- Entry point: `#!/usr/bin/env tsx`
- Reads `process.argv[2]` (file path)
- Calls `ingestLagBesFile(filePath, "cli")`
- Exits 0 on success, 1 on failure
- Logs via pino (JSON to stdout)

**NPM script:** `apps/api/package.json` (line 590)
- Script: `"ingest:local": "tsx src/scripts/ingest-local.ts"`

**Usage:** `npm -w apps/api run ingest:local -- samples/LagBes-sample.csv`

**Result:** PASS — CLI is defined, npm script is configured, interface matches phase goal.

---

## 11. No Scope Creep ✅ PASS

Phase goal boundary (Plan 02-PLAN.md, line 14): "No HTTP endpoint, no Bull queue, no SMB watcher, no KPI computation."

Scanning all plans:

| Item | Appears In | Status |
|------|-----------|--------|
| **HTTP endpoint** | None | ✅ No POST /api/v1/ingest, no routes |
| **Bull queue** | None | ✅ No queue registration, no job.on('complete') |
| **SMB watcher** | None | ✅ No chokidar, no file watcher |
| **KPI computation** | None | ✅ No materialized view refresh, no KPI calculations |
| **Database schema** | 02-02 | ✅ Only extends imports, adds stock_rows_staging, no kpi_* tables |
| **Orchestrator scope** | 02-06 | ✅ index.ts: parse → validate → write, no HTTP routing |

Result: PASS — No scope creep. All plans stay within Phase 2 CSV ingestion boundaries.

---

## 12. Blast Radius (No Unintended Touches) ✅ PASS

Files modified by Phase 2:

**Schema & dependencies:**
- `apps/api/src/db/schema.ts` ✅ (extends stock_rows, adds staging, extends imports)
- `apps/api/package.json` ✅ (adds csv-parse, iconv-lite, uuid, ingest:local script)

**New ingest subsystem:**
- `apps/api/src/ingest/` (all new) ✅
- `packages/core/src/ingest/` (all new) ✅

**Untouched (Phase 1 auth):**
- `apps/api/src/db/schema.ts`: users, sessions tables (NOT modified) ✅
- Phase 1 auth middleware, login routes ✅
- Frontend code ✅

**Untouched (other):**
- `docker-compose.yml` ✅
- `samples/` (read-only, not modified) ✅
- Other phases' directories ✅

**Result:** PASS — Phase 2 only touches its own new files + controlled schema extensions. No auth code, no frontend, no deployment config modified.

---

## Summary by Dimension

| Dimension | Status | Notes |
|-----------|--------|-------|
| **Goal Reachability** | ✅ PASS | Pipeline complete: parse → validate → atomic insert → audit |
| **Decimal-Comma Correctness** | ✅ PASS | Algorithm specified, 4 articles tested (2, 58, 74, 174), negative values handled |
| **Requirement Coverage** | ✅ PASS | All 14 requirements (IN-03..IN-13, KPI-01, KPI-10, OBS-01, TEST-01) mapped |
| **Pitfall #1 Gating** | ✅ PASS | Schema-aware re-merge + golden-file tests |
| **Pitfall #2 Gating** | ✅ PASS | cp1252 decode + encoding tests (µ, umlaut, ß round-trip) |
| **Pitfall #10 Gating** | ✅ PASS | Staging table + atomic transaction + rollback test |
| **Atomicity Test** | ✅ PASS | Mock DB throws → transaction rejects |
| **Golden-File Tests** | ✅ PASS | parser.test.ts loads sample, asserts articles 2, 58, 74, 174 |
| **Dependency Graph** | ✅ PASS | Wave 1→2→3 acyclic, no forward refs, all deps mapped |
| **Schema Shape** | ✅ PASS | All 52 columns from LagBes, strong types (numeric, date, enum) |
| **Streaming** | ✅ PASS | `createReadStream → decodeStream → csvParse` no fs.readFileSync |
| **CLI & npm script** | ✅ PASS | `ingest-local.ts` + `ingest:local` script in package.json |
| **No Scope Creep** | ✅ PASS | No HTTP, Bull, SMB watcher, KPI computation |
| **Blast Radius** | ✅ PASS | Only Phase 2 files + controlled schema extensions |

---

## Key Strengths

1. **Extreme specificity:** Every task includes exact line numbers, column names, test assertions.
2. **TDD structure:** Tests written first (RED), implementation second (GREEN), enabling confident execution.
3. **Golden-file approach:** Uses real `samples/LagBes-sample.csv`, not synthetic test data.
4. **Negative value edge case:** Plan 02-04 interface comment explicitly handles Article 174's `-18414,25`.
5. **No Docker required:** All unit tests use `vi.mock`, no live Postgres needed until `ingest:local` CLI.
6. **FeedParser extensibility:** 02-03 defines interface in `packages/core` so Phase 3+ can register feeds without modifying existing code.
7. **Atomic guarantees:** 02-05 uses Drizzle transaction auto-rollback, no manual COMMIT/ROLLBACK logic error risk.

---

## Minor Observations (NOT blockers)

1. **Performance test data:** 02-06 Task 1, performance.test.ts uses synthetic 10k rows (UTF-8, not cp1252). This is acceptable because the goal is to test streaming + Zod performance, not encoding latency. Real cp1252 encoding is tested separately in encoding.test.ts.

2. **Staging table persistence:** 02-02 specifies staging as permanent (not TEMP). This is correct for the atomic swap pattern but means the table exists across multiple ingests. Plan 02-05 Task 2 correctly TRUNCATE staging before each insert.

3. **Error logging cap:** 02-06 Task 2, index.ts line 407 caps error log to 20 samples. This is sensible (avoid huge logs) and the full error list goes into `imports.error_message`.

---

## Execution Readiness

**Ready to execute:** YES

- [ ] All dependencies resolved (Wave 1 before Wave 2, Wave 2 before Wave 3)
- [ ] All tests are RED/GREEN ready (TDD structure clear)
- [ ] All artifacts are named and scoped (no ambiguous "implement feature X")
- [ ] Exit criteria are measurable (`npm -w apps/api test` exits 0, specific assertions)
- [ ] No blockers detected

---

**Recommendation:** Proceed to `/gsd:execute-phase 02`

