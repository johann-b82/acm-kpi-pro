---
phase: 02-csv-ingestion-core
plan: "02-04"
subsystem: ingest
tags: [csv-parsing, encoding, decimal-comma, zod, streaming, pitfall-1, pitfall-2]
dependency_graph:
  requires: ["02-02", "02-03"]
  provides: ["parseAndRemergeLagBes", "StockRowSchema", "validateAllRows", "LAGBES_NUMERIC_COLUMNS", "buildBaseRow"]
  affects: ["02-05", "02-06"]
tech_stack:
  added: []
  patterns:
    - "surplus-aware decimal-comma re-merge (schema-aware, column-specific maxFractionalDigits)"
    - "iconv-lite cp1252 decode stream pipeline"
    - "Zod v3 preprocess + transform for German locale values"
    - "fail-on-all error collection (validateAllRows)"
key_files:
  created:
    - apps/api/src/ingest/parser.ts
    - apps/api/src/ingest/schema.ts
    - apps/api/src/ingest/validator.ts
    - apps/api/src/ingest/types.ts
    - apps/api/src/ingest/__tests__/parser.test.ts
    - apps/api/src/ingest/__tests__/encoding.test.ts
    - apps/api/src/ingest/__tests__/schema.test.ts
    - apps/api/src/ingest/__tests__/validator.test.ts
    - apps/api/src/ingest/__tests__/mocks.ts
    - samples/LagBes-sample-cp1252.csv
  modified: []
decisions:
  - "surplus-aware re-merge: only attempt decimal-comma merge when remaining token count exceeds remaining column count (prevents greedy merges on all-zero rows)"
  - "column-specific maxFractionalDigits: monetary/percentage columns capped at 2dp to prevent 3-digit integer values (next column) being misread as fractional part"
  - "CP1252 binary sample: created samples/LagBes-sample-cp1252.csv as the golden test fixture (UTF-8 sample would mojibake through the cp1252 decode pipeline)"
  - "pino logger: instantiated inline in parser.ts (no shared app logger exists in the ingest module — documented in SUMMARY)"
metrics:
  duration: "~50 minutes"
  completed: "2026-04-08"
  tasks: 2
  files: 10
---

# Phase 2 Plan 04: Streaming CSV Parser Core Summary

One-liner: Surplus-aware German decimal-comma re-merge pipeline (iconv cp1252 → csv-parse → schema-driven merge → Zod v3) with full golden-file test suite against the real LagBes sample.

## Columns Handled

The parser now handles all 52 columns from the Apollo NTS LagBes warehouse export:

| Column group | Column names | Notes |
|---|---|---|
| Identification | Artikelnr, Typ, Bezeichnung 1-6, WGR, ProdGrp, Wareneingangsko, Bestandskonto, Lagername | String; Artikelnr min-length 1; Typ enum |
| Stock quantities | Bestand (Lagereinheit), Lag Einh, Bestand (Basiseinheit), Einh | Numeric with up to 4dp; can be negative (IN-13) |
| Pricing | Preis, pro Menge, Wert, Abwert%, Wert mit Abw. | Preis up to 4dp; monetary at 2dp; % at 2dp |
| Coverage | Durch.Verbr, Reichw.Mon. | Numeric |
| Dates | letzt.Zugang, letzt.Zugang FA, l. EK am, Lagerzugang Dat, Lagerabgang Dat, Erf.-Datum | DD.MM.YY → Date with century inference |
| Warehouse | Stammlager, Stammstellplatz | String |
| Movement | Umsatz Me J, Umsatz Me VJ, Lagerb (D), Auftrag M, Reserv. M, Bestell M, FA Menge, Bedarf M, ø Verbrauch / M | Numeric up to 4dp |
| Aggregates | Lagerabgang letzes Jahr, Lagerabgang letzes 1/2 Jahr, Lagerzugang letzes 1/2 Jahr | Numeric up to 4dp |
| Metadata | Lieferant, Produktgruppe, stm.uni_a01, Eingrenzung von Lager, Eingrenzung bis Lager, Inventurgruppe | String |
| Flags | Gelöscht (J/N), ABC-Kennz. VK (A/B/C/null) | Enum |

## Golden-File Assertions That Pass

All 70 tests pass across 7 test files:

| Test | Assertion | Result |
|---|---|---|
| `parses sample file with exactly 12 rows` | rows.length === 12 | PASS |
| `article 2: Preis re-merged from '112'+'532' to '112,532'` | a2["Preis"] === "112,532" | PASS |
| `article 2: Wert re-merged to '560,27'` | a2["Wert"] === "560,27", a2["Wert mit Abw."] === "560,27" | PASS |
| `article 58: Preis re-merged to '30,336', Wert to '2012,25'` | a58["Preis"] === "30,336", a58["Wert"] === "2012,25" | PASS |
| `article 74: Preis re-merged to '199,6879'` | a74["Preis"] === "199,6879" | PASS |
| `article 174: negative bestand re-merged to '-18414,25' (IN-13)` | a174["Bestand (Lagereinheit)"] === "-18414,25" | PASS |
| `article 174: Wert re-merged to '-22342,62'` | a174["Wert"] === "-22342,62" | PASS |
| `all rows have exactly 52 keys` | Object.keys(row).length === 52 for all rows | PASS |
| `article 000002_Muster: WKZ type preserved` | wkz["Typ"] === "WKZ" | PASS |
| `article 12285: Preis with dot-decimal stays as-is` | "2.037" not merged with "86" | PASS |
| `µµµµ round-trips without U+FFFD replacement char` | No replacement char in Eingrenzung bis Lager | PASS |
| `umlaut in article 10054: 'Eisen vernickelt'` | No mojibake | PASS |
| `H0001 ß and ä in Bezeichnung 1` | Correct German characters | PASS |
| `all 12 rows have µµµµ in Eingrenzung bis Lager` | 12/12 rows | PASS |
| `'17.09.12' → year 2012` | Century inference < 80 → 2000+ | PASS |
| `'01.01.84' → year 1984` | Century inference >= 80 → 1900+ | PASS |
| `boundary 79 → 2079, 80 → 1980` | Both boundaries correct | PASS |
| `bestandLagereinheit accepts -18414.25` | Negative stock passes Zod | PASS |
| `'112,532' → 112.532 (Zod)` | German decimal comma → JS number | PASS |
| `validateAllRows: multiple bad rows collect all errors` | ≥3 errors from 3 bad rows | PASS |
| `error includes 1-based row number` | row === 2 for first data row | PASS |

## Final Re-Merge Algorithm

The `remergeFields()` function in `parser.ts` uses a **surplus-aware, column-specific-precision** approach:

Walk the raw token array from csv-parse alongside the 52-column header. At each output column, compute the "current surplus" = (remaining raw tokens) − (remaining header columns). When surplus is 0, there are exactly enough tokens for remaining columns — skip all merge attempts and assign directly. When surplus is greater than 0, check three conditions before merging: (1) the column is in `LAGBES_NUMERIC_COLUMNS` with `canHaveDecimals=true`, (2) the left token matches `/^-?\d+$/` (pure integer, allowing leading minus for negative stock), (3) the right token matches `/^\d{1,N}$/` where N is the column's `maxFractionalDigits` — monetary columns use N=2 (Euro cent precision), price/quantity columns use N=4. When all conditions hold, emit `"${left},${right}"` and advance by 2 input positions; otherwise emit the left token as-is and advance by 1. This dual guard (surplus check + per-column max-fraction-digits) prevents both over-eager merges on all-zero rows AND the "Abwert%=0 wrongly consuming Wert mit Abw.'s integer part" bug seen in the initial single-guard implementation.

## Pitfall #1 and #2 Mitigation Evidence

**Pitfall #1 (Naive CSV Parsing / decimal-comma):**
- Test: `article 2: Preis re-merged from '112'+'532' to '112,532'` — directly catches the naive-parse failure
- Test: `article 174: negative bestand re-merged to '-18414,25' (IN-13)` — verifies negative-value edge case
- Test: `article 74: Preis re-merged to '199,6879'` — verifies 4-digit fractional part
- Test: `all rows have exactly 52 keys` — structural integrity check
- pino `warn` log fires on every merge so operators can audit when the quirk fires in production

**Pitfall #2 (Windows-1252 Encoding):**
- Test: `µµµµ round-trips without U+FFFD replacement char` — the µ (U+00B5) is `0xB5` in CP1252 vs `0xC2 0xB5` in UTF-8; decoding as CP1252 correctly recovers the single character
- Test: `umlaut in article 10054: 'Eisen vernickelt'` — ASCII-range characters unaffected
- Test: `H0001 ß and ä` — ß (`0xDF`) and ä (`0xE4`) round-trip correctly through CP1252 decode
- Test: `all 12 rows have µµµµ` — consistency across the entire file

## Algorithm Adjustments from Sample Rows

**Row 2 (article 2):** The initial algorithm (no surplus check) caused Abwert%="0" to merge with the next column's integer "560" as "0,560" (56% devaluation — clearly wrong). Fixed by adding the surplus check: at Abwert% there was only surplus=1, which alone would allow the merge, but the `maxFractionalDigits=2` for Abwert% correctly rejected "560" (3 digits > 2). The combined guards (surplus + maxFractionalDigits) solved this.

**Row 2 (article 2) — further bug:** Even after maxFractionalDigits fix, "0"+"0" merges on downstream quantity columns (Durch.Verbr, Umsatz Me J, etc.) were consuming too many tokens when the surplus was already exhausted. The surplus check (currentSurplus > 0) fixes this — once all decimal splits are consumed the algorithm stops merging.

**Row 5 (article 174) — negative stock:** The RESEARCH.md initially noted this might NOT be re-merged (leading minus fails pure-digit test). The plan correctly overrode this: using `/^-?\d+$/` allows the merge of "-18414" + "25" → "-18414,25". Test `article 174: negative bestand re-merged to '-18414,25'` passes.

**Row 9 (article 12285):** Preis="2.037" already contains a dot (dot-decimal format). The regex `/^-?\d+$/` correctly rejects "2.037" (not a pure integer), so it is NOT merged with the following "86". The raw "2.037" is then parsed by `parseGermanDecimal` (no comma replacement needed since it already has a dot) → 2.037.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Surplus-aware re-merge: initial single-guard algorithm caused greedy zero-zero merges**
- **Found during:** Task 2 GREEN phase testing
- **Issue:** The initial algorithm only checked `canHaveDecimals + left-is-integer + right-is-short-integer`. On rows like article 2, after consuming the legitimate decimal splits (3 extra tokens), the algorithm continued merging "0"+"0" pairs on downstream columns (Durch.Verbr, Umsatz Me J, etc.), shifting all subsequent column assignments. Result: `Eingrenzung bis Lager` received an empty string instead of "µµµµ".
- **Fix:** Added `currentSurplus > 0` as a mandatory condition. Surplus is computed at each position as `(remaining raw tokens) - (remaining header columns)`. When surplus drops to 0, merging is disabled for the rest of the row.
- **Files modified:** `apps/api/src/ingest/parser.ts`
- **Commit:** 4463bb8

**2. [Rule 1 - Bug] Abwert% false merge: "0"+"560" wrongly merged as 56% devaluation**
- **Found during:** Task 2 GREEN phase testing
- **Issue:** At Abwert%="0", the right token was "560" (Wert mit Abw.'s integer part). The original algorithm had no constraint on the fractional part size, so "0,560" was emitted. This caused Wert mit Abw. to receive "25" (fractional part of original Wert mit Abw.) and attempt to merge with "0" → "25,0".
- **Fix:** Added per-column `maxFractionalDigits` metadata to `LAGBES_NUMERIC_COLUMNS`. Monetary/percentage columns set `maxFractionalDigits: 2` (Euro cent precision), price/quantity columns set `maxFractionalDigits: 4`. The fracPattern regex uses this value, so `Abwert%` rejects any 3-digit right-side token.
- **Files modified:** `apps/api/src/ingest/schema.ts`, `apps/api/src/ingest/parser.ts`
- **Commit:** 4463bb8

**3. [Rule 3 - Blocking] Sample file encoding: test fixture was UTF-8, not CP1252**
- **Found during:** Task 2 GREEN phase testing
- **Issue:** `samples/LagBes-sample.csv` is UTF-8 (as confirmed by `file` command). Piping it through `iconv decodeStream("cp1252")` causes mojibake for any non-ASCII character (ß, ä, µ) since UTF-8 multi-byte sequences are misinterpreted as single CP1252 bytes.
- **Fix:** Generated `samples/LagBes-sample-cp1252.csv` using iconv-lite (Node.js script). All golden-file tests and encoding tests use this binary CP1252 file. The original UTF-8 file remains for human readability/git diff.
- **Files modified:** N/A — new file `samples/LagBes-sample-cp1252.csv`
- **Commit:** 4463bb8

**4. [Rule 2 - Missing functionality] pino logger: no shared logger existed in ingest/***
- **Issue:** The plan called for using "the existing shared logger". No shared/exported pino instance exists in the API codebase — pino is only embedded in Fastify's server initialization.
- **Action:** Instantiated a module-local pino logger in `parser.ts` with `name: "lagbes-parser"`. This is correct for production: Fastify does not expose its logger to non-route code.
- **Files modified:** `apps/api/src/ingest/parser.ts`

## Known Stubs

None. All parser, schema, validator, and type functionality is fully wired. The `buildBaseRow()` helper is exported for test use but is not a production stub — it only appears in test files.

## Self-Check: PASSED

| Check | Result |
|---|---|
| `apps/api/src/ingest/parser.ts` | FOUND |
| `apps/api/src/ingest/schema.ts` | FOUND |
| `apps/api/src/ingest/validator.ts` | FOUND |
| `apps/api/src/ingest/types.ts` | FOUND |
| `samples/LagBes-sample-cp1252.csv` | FOUND |
| `02-04-SUMMARY-csv-parser-core.md` | FOUND |
| Commit 20c8568 (RED phase tests) | FOUND |
| Commit 4463bb8 (GREEN phase implementation) | FOUND |
| All 70 tests pass | VERIFIED |
| No ingest/ TypeScript errors | VERIFIED |
| Biome lint clean | VERIFIED |
