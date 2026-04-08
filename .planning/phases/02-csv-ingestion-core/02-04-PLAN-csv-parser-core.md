---
phase: 02-csv-ingestion-core
plan: "02-04"
slug: csv-parser-core
type: execute
wave: 2
depends_on: ["02-02", "02-03"]
can_run_parallel_with: ["02-05"]
files_modified:
  - apps/api/src/ingest/types.ts
  - apps/api/src/ingest/schema.ts
  - apps/api/src/ingest/parser.ts
  - apps/api/src/ingest/validator.ts
  - apps/api/src/ingest/__tests__/parser.test.ts
  - apps/api/src/ingest/__tests__/encoding.test.ts
  - apps/api/src/ingest/__tests__/schema.test.ts
  - apps/api/src/ingest/__tests__/validator.test.ts
  - apps/api/src/ingest/__tests__/mocks.ts
autonomous: true
requirements:
  - IN-03
  - IN-04
  - IN-05
  - IN-06
  - IN-07
  - IN-11
  - IN-13
  - TEST-01

must_haves:
  truths:
    - "parsing samples/LagBes-sample.csv returns exactly 12 rows with no errors"
    - "article 2 has preis='112,532' (string after re-merge, before Zod), then preis=112.532 (number after Zod)"
    - "article 174 has bestandLagereinheit=-18414.25 (negative stock preserved, not zeroed)"
    - "Windows-1252 µµµµ and ü/ß characters round-trip correctly with no U+FFFD replacement char"
    - "DD.MM.YY date '17.09.12' parses to 2012-09-17; '01.01.84' parses to 1984-01-01"
    - "validation collects ALL errors from a multi-error batch, not just the first"
    - "all parser unit tests pass without Docker (no live DB required)"
  artifacts:
    - path: apps/api/src/ingest/parser.ts
      provides: "parseAndRemergeLagBes() — streaming parse + re-merge"
      exports: ["parseAndRemergeLagBes"]
    - path: apps/api/src/ingest/schema.ts
      provides: "StockRowSchema (Zod v3), LAGBES_NUMERIC_COLUMNS metadata, StockRow type"
      exports: ["StockRowSchema", "LAGBES_NUMERIC_COLUMNS", "StockRow", "StockRowInsert"]
    - path: apps/api/src/ingest/validator.ts
      provides: "validateAllRows() — fail-on-all Zod validation"
      exports: ["validateAllRows"]
    - path: apps/api/src/ingest/types.ts
      provides: "API-local IngestError, ValidationResult (complements packages/core types)"
      exports: ["IngestError", "ValidationResult"]
  key_links:
    - from: apps/api/src/ingest/parser.ts
      to: samples/LagBes-sample.csv
      via: "createReadStream → iconv.decodeStream('cp1252') → csvParse({delimiter:';',relax_column_count:true})"
      pattern: "decodeStream.*cp1252"
    - from: apps/api/src/ingest/schema.ts
      to: apps/api/src/ingest/parser.ts
      via: "LAGBES_NUMERIC_COLUMNS drives remergeNumericFields() merge decisions"
      pattern: "LAGBES_NUMERIC_COLUMNS"
    - from: apps/api/src/ingest/validator.ts
      to: apps/api/src/ingest/schema.ts
      via: "StockRowSchema.safeParse() called per row"
      pattern: "StockRowSchema.safeParse"
---

<objective>
Build the streaming CSV parser (Windows-1252 decode → csv-parse → decimal-comma re-merge
→ Zod validation) and its full unit test suite against `samples/LagBes-sample.csv`.
This is the highest-risk plan in Phase 2 — Pitfall #1 (naive parsing) and Pitfall #2
(encoding) are both gated here.

Purpose: Provide `parseAndRemergeLagBes()` and `validateAllRows()` that Plan 02-06 wires
into the orchestrator. These functions must be correct and fully tested before wiring.

Output: `parser.ts`, `schema.ts`, `validator.ts`, `types.ts` under `apps/api/src/ingest/`,
plus four test files with golden-file and unit coverage.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/02-csv-ingestion-core/01-RESEARCH.md
@apps/api/src/db/schema.ts
@samples/LagBes-sample.csv
@samples/README.md

<interfaces>
<!-- From 02-02 (schema.ts) — StockRow shape needed for StockRowInsert: -->
```typescript
// apps/api/src/db/schema.ts exports after 02-02:
export const stockRows = pgTable("stock_rows", { /* 52 columns */ });
export const stockRowsStaging = pgTable("stock_rows_staging", { /* same */ });
export const imports = pgTable("imports", { /* + source, startedAt, finishedAt */ });
// StockRowInsert = typeof stockRows.$inferInsert
```

<!-- From 02-03 (packages/core) — use these types, don't redefine: -->
```typescript
// import { IngestError, ValidationResult } from "@acm-kpi/core";
// apps/api/src/ingest/types.ts can re-export or use directly
```

<!-- csv-parse v5 streaming API (key options): -->
```typescript
import { parse as csvParse } from "csv-parse";
// Options:
// { delimiter: ";", columns: true, relax_column_count: true,
//   trim: true, skip_empty_lines: true, cast: false, from_line: 1 }
// Emits rows as Record<string, string> when columns:true
```

<!-- iconv-lite streaming API: -->
```typescript
import { decodeStream } from "iconv-lite";
// Usage: readStream.pipe(decodeStream("cp1252")).pipe(csvParser)
```

<!-- Critical sample data for golden tests (from samples/LagBes-sample.csv):
  Header row (row 1): 52 semicolon-separated column names.

  Article 2 (row 2) — key fields after re-merge:
    Artikelnr: "2", Typ: "ART", Lagername: "Summe"
    Preis raw split: "112";"532" → re-merged: "112,532" → Zod: 112.532
    Wert raw: "560";"27" → re-merged: "560,27" → Zod: 560.27
    Wert mit Abw.: "560,27" → Zod: 560.27
    Erf.-Datum: "17.09.12" → Date(2012, 8, 17) → year 2012
    Raw row contains: µµµµ (Windows-1252 micro symbol round-trip)

  Article 58 (row 3):
    Preis: "30,336" → Zod: 30.336
    Wert: "2012,25" → Zod: 2012.25
    ABC-Kennz. VK: "B"

  Article 74 (row 4):
    Preis raw: "199";"6879" — wait, look at raw: "199;6879;1;187;69;0;187;69"
    → Preis=199.6879? No — check sample: "199;6879" — first field is 199, second 6879.
    Actually sample row 4: "74;ART;Backrest Cover;;;;;;STOFF;;5400;0;Summe;1;STK;1;STK;199;6879;1;187;69;0;187;69;..."
    Preis re-merge: "199","6879" → "199,6879" → 199.6879
    Wert: "187","69" → "187,69" → 187.69
    Wert mit Abw.: "187,69" → 187.69
    ABC-Kennz. VK: "A"

  Article 174 (row 5) — negative stock:
    Raw: "174;ART;Diverses;;;;;;DIV;;5400;0;Summe;-18414;25;STK;-18414;25;STK;1;2133;1;-22342;62;0;-22342;62;..."
    Bestand (Lagereinheit): "-18414";"25" — but "-18414" starts with "-" so isPureInt fails!
    → NOT re-merged → stored as "-18414" in Bestand field, "25" flows to next column.
    WAIT: This means the negative field "-18414,25" is actually split as
    "-18414" (bestand_lagereinheit) | "25" (lag_einh field!?)
    This is the edge case documented in RESEARCH.md: negative values are NOT re-merged.
    The parser must handle this: "-18414" is treated as the full bestand value (-18414),
    and "25" becomes the next column (lag_einh = "25", but the header says "STK").
    
    ACTUALLY reading the raw more carefully:
    "Summe;-18414;25;STK;-18414;25;STK" maps to:
    Lagername=Summe, Bestand(Lagereinheit)="-18414", next="25", LagEinh="STK"...
    But "25" goes into position of LagEinh. The REAL value is "-18414,25".
    
    Resolution from RESEARCH.md edge cases section:
    "Negative quantity: '-18414', '25' (row 174, Bestand field) — NOT merged (first part
    is -18414, not pure digits; string test fails on leading -). Correct: preserved as
    -18414 in one column, 25 in next."
    
    This means the re-merge algorithm intentionally does NOT reconstruct "-18414,25".
    The database stores bestand_lagereinheit = -18414 (integer part only), and "25" shifts
    into lag_einh. This is the documented behavior — the algorithm accepts this loss.
    The test should assert bestand_lagereinheit parses to -18414 (not -18414.25).
    
    OR: handle negatives specially: if rawRow[i] matches /^-?\d+$/ AND rawRow[i+1] matches
    /^\d{1,3}$/ AND the column expects decimals, THEN merge (even for negative numbers).
    This would give bestand_lagereinheit = -18414.25. This is the CORRECT behavior.
    
    DECISION (from RESEARCH.md algorithm): Extend the isPureInt check to also allow
    a leading minus: /^-?\d+$/ for the left part AND /^\d{1,3}$/ for the right part.
    Assert: article 174 bestand_lagereinheit = -18414.25 (NOT -18414).
    
  Total rows: 12 data rows (the sample CSV has 13 lines: 1 header + 12 data + 1 blank).
-->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write test files (RED phase) — golden-file, encoding, schema, validator</name>
  <files>
    apps/api/src/ingest/__tests__/parser.test.ts
    apps/api/src/ingest/__tests__/encoding.test.ts
    apps/api/src/ingest/__tests__/schema.test.ts
    apps/api/src/ingest/__tests__/validator.test.ts
    apps/api/src/ingest/__tests__/mocks.ts
  </files>
  <behavior>
    All four test files run with `npm -w apps/api test -- parser encoding schema validator`
    and FAIL (RED) initially because the implementation files don't exist yet.
    After Task 2 implements the source files, all tests must PASS (GREEN).
  </behavior>
  <action>
    Create the `apps/api/src/ingest/__tests__/` directory. Write all four test files.
    They import from `../parser.js`, `../schema.js`, `../validator.js` (which don't exist
    yet — tests will fail until Task 2 creates them).

    --- parser.test.ts ---
    Tests `parseAndRemergeLagBes()` against the real sample file.
    Path to sample: `"../../../../samples/LagBes-sample.csv"` relative to test file,
    OR compute via `new URL("../../../../samples/LagBes-sample.csv", import.meta.url)`.

    ```typescript
    import { describe, test, expect } from "vitest";
    import { parseAndRemergeLagBes } from "../parser.js";
    import { resolve } from "path";

    const SAMPLE = resolve(
      new URL(".", import.meta.url).pathname,
      "../../../../samples/LagBes-sample.csv"
    );

    describe("parseAndRemergeLagBes — decimal-comma re-merge (Pitfall #1)", () => {
      test("parses sample file with exactly 12 rows", async () => {
        const rows = await parseAndRemergeLagBes(SAMPLE);
        expect(rows).toHaveLength(12);
      });

      test("article 2: Preis re-merged from '112'+'532' to '112,532'", async () => {
        const rows = await parseAndRemergeLagBes(SAMPLE);
        const a2 = rows.find(r => r["Artikelnr"] === "2");
        expect(a2).toBeDefined();
        expect(a2!["Preis"]).toBe("112,532");
      });

      test("article 2: Wert re-merged to '560,27'", async () => {
        const rows = await parseAndRemergeLagBes(SAMPLE);
        const a2 = rows.find(r => r["Artikelnr"] === "2");
        expect(a2!["Wert"]).toBe("560,27");
        expect(a2!["Wert mit Abw."]).toBe("560,27");
      });

      test("article 58: Preis re-merged to '30,336', Wert to '2012,25'", async () => {
        const rows = await parseAndRemergeLagBes(SAMPLE);
        const a58 = rows.find(r => r["Artikelnr"] === "58");
        expect(a58!["Preis"]).toBe("30,336");
        expect(a58!["Wert"]).toBe("2012,25");
        expect(a58!["Wert mit Abw."]).toBe("2012,25");
      });

      test("article 74: Preis re-merged to '199,6879'", async () => {
        const rows = await parseAndRemergeLagBes(SAMPLE);
        const a74 = rows.find(r => r["Artikelnr"] === "74");
        expect(a74!["Preis"]).toBe("199,6879");
      });

      test("article 174: negative bestand re-merged to '-18414,25' (IN-13)", async () => {
        const rows = await parseAndRemergeLagBes(SAMPLE);
        const a174 = rows.find(r => r["Artikelnr"] === "174");
        expect(a174!["Bestand (Lagereinheit)"]).toBe("-18414,25");
        expect(a174!["Bestand (Basiseinheit)"]).toBe("-18414,25");
      });

      test("all rows have exactly 52 keys (matching header column count)", async () => {
        const rows = await parseAndRemergeLagBes(SAMPLE);
        for (const row of rows) {
          expect(Object.keys(row).length).toBe(52);
        }
      });

      test("article 000002_Muster: WKZ type preserved", async () => {
        const rows = await parseAndRemergeLagBes(SAMPLE);
        const wkz = rows.find(r => r["Artikelnr"] === "000002_Muster");
        expect(wkz!["Typ"]).toBe("WKZ");
      });
    });
    ```

    --- encoding.test.ts ---
    Tests Windows-1252 encoding with the real sample (IN-04, Pitfall #2).
    The sample rows contain `µµµµ` in the `Eingrenzung bis Lager` field.

    ```typescript
    import { describe, test, expect } from "vitest";
    import { parseAndRemergeLagBes } from "../parser.js";
    import { resolve } from "path";

    const SAMPLE = resolve(
      new URL(".", import.meta.url).pathname,
      "../../../../samples/LagBes-sample.csv"
    );

    describe("Windows-1252 encoding (Pitfall #2)", () => {
      test("µµµµ round-trips without U+FFFD replacement char", async () => {
        const rows = await parseAndRemergeLagBes(SAMPLE);
        // Every row in the sample has µµµµ in the Eingrenzung bis Lager column
        for (const row of rows) {
          const val = row["Eingrenzung bis Lager"];
          if (val && val.length > 0) {
            expect(val).not.toContain("\ufffd"); // No replacement char
          }
        }
        // Article 2 row specifically — µµµµ is present in the raw file
        const a2 = rows.find(r => r["Artikelnr"] === "2");
        expect(a2!["Eingrenzung bis Lager"]).toBe("µµµµ");
      });

      test("umlaut in article 10054 Bezeichnung: 'vernickelt' (no mojibake)", async () => {
        const rows = await parseAndRemergeLagBes(SAMPLE);
        const a10054 = rows.find(r => r["Artikelnr"] === "10054");
        expect(a10054!["Bezeichnung 2"]).toBe("Eisen vernickelt");
      });
    });
    ```

    --- schema.test.ts ---
    Tests `StockRowSchema` Zod transformations (IN-06, IN-13).
    Uses inline row data — no file I/O.

    ```typescript
    import { describe, test, expect } from "vitest";
    import { StockRowSchema, buildBaseRow } from "../schema.js";

    // buildBaseRow() returns a valid minimal row for use in focused tests.
    // Exported from schema.ts for test use only.

    describe("StockRowSchema — date parsing (IN-06)", () => {
      test("'17.09.12' → year 2012 (< 80 → 2000+)", () => {
        const row = StockRowSchema.parse(buildBaseRow({ "Erf.-Datum": "17.09.12" }));
        expect(row.erfDatum?.getFullYear()).toBe(2012);
      });

      test("'01.01.84' → year 1984 (>= 80 → 1900+)", () => {
        const row = StockRowSchema.parse(buildBaseRow({ "Erf.-Datum": "01.01.84" }));
        expect(row.erfDatum?.getFullYear()).toBe(1984);
      });

      test("boundary: '01.01.79' → 2079", () => {
        const row = StockRowSchema.parse(buildBaseRow({ "Erf.-Datum": "01.01.79" }));
        expect(row.erfDatum?.getFullYear()).toBe(2079);
      });

      test("boundary: '01.01.80' → 1980", () => {
        const row = StockRowSchema.parse(buildBaseRow({ "Erf.-Datum": "01.01.80" }));
        expect(row.erfDatum?.getFullYear()).toBe(1980);
      });

      test("empty date field → null (not thrown)", () => {
        const row = StockRowSchema.parse(buildBaseRow({ "letzt.Zugang": "" }));
        expect(row.letztZugang).toBeNull();
      });
    });

    describe("StockRowSchema — negative stock (IN-13)", () => {
      test("bestand_lagereinheit accepts negative values", () => {
        const row = StockRowSchema.parse(
          buildBaseRow({ "Bestand (Lagereinheit)": "-18414,25" })
        );
        expect(row.bestandLagereinheit).toBe(-18414.25);
        expect(row.bestandLagereinheit).toBeLessThan(0);
      });

      test("wert accepts negative values (inventory corrections)", () => {
        const row = StockRowSchema.parse(buildBaseRow({ "Wert": "-22342,62" }));
        expect(row.wert).toBe(-22342.62);
      });
    });

    describe("StockRowSchema — German decimal comma", () => {
      test("'112,532' → 112.532", () => {
        const row = StockRowSchema.parse(buildBaseRow({ "Preis": "112,532" }));
        expect(row.preis).toBe(112.532);
      });

      test("'0' → 0 (no decimal)", () => {
        const row = StockRowSchema.parse(buildBaseRow({ "Preis": "0" }));
        expect(row.preis).toBe(0);
      });

      test("'' empty numeric → 0 or null (not NaN)", () => {
        const row = StockRowSchema.parse(buildBaseRow({ "Durch.Verbr": "" }));
        expect(row.durchVerbr).not.toBeNaN();
      });
    });

    describe("StockRowSchema — Typ enum", () => {
      test.each([["ART"], ["MAT"], ["HLB"], ["WKZ"]])("Typ '%s' is valid", (typ) => {
        expect(() => StockRowSchema.parse(buildBaseRow({ "Typ": typ }))).not.toThrow();
      });

      test("invalid Typ throws ZodError", () => {
        expect(() =>
          StockRowSchema.parse(buildBaseRow({ "Typ": "INVALID" }))
        ).toThrow();
      });
    });
    ```

    --- validator.test.ts ---
    Tests `validateAllRows()` error accumulation (IN-11).

    ```typescript
    import { describe, test, expect } from "vitest";
    import { validateAllRows } from "../validator.js";
    import { buildBaseRow } from "../schema.js";

    describe("validateAllRows — fail-on-all error collection (IN-11)", () => {
      test("valid rows return { valid: true, rows: [...] }", async () => {
        const good = [
          buildBaseRow({ "Artikelnr": "A1" }),
          buildBaseRow({ "Artikelnr": "A2" }),
        ];
        const result = await validateAllRows(good);
        expect(result.valid).toBe(true);
        expect(result.rows).toHaveLength(2);
        expect(result.errors).toBeUndefined();
      });

      test("multiple bad rows: all errors collected, not just first", async () => {
        const bad = [
          buildBaseRow({ "Typ": "INVALID_ENUM" }),           // row 2: bad enum
          buildBaseRow({ "Artikelnr": "" }),                   // row 3: missing required
          buildBaseRow({ "Erf.-Datum": "not-a-date" }),        // row 4: bad date
        ];
        const result = await validateAllRows(bad);
        expect(result.valid).toBe(false);
        // Must collect all 3 errors (or more if Zod emits multiple per row)
        expect(result.errors!.length).toBeGreaterThanOrEqual(3);
        const fields = result.errors!.map(e => e.field);
        expect(fields.some(f => f === "typ")).toBe(true);
        expect(fields.some(f => f === "artikelnr")).toBe(true);
      });

      test("error includes 1-based row number", async () => {
        const rows = [
          buildBaseRow({ "Typ": "INVALID" }),
        ];
        const result = await validateAllRows(rows);
        expect(result.errors![0].row).toBe(2); // Header=1, data starts=2
      });

      test("mixed valid + invalid: valid rows still collected", async () => {
        const rows = [
          buildBaseRow({ "Artikelnr": "GOOD1" }),
          buildBaseRow({ "Typ": "BAD" }),
          buildBaseRow({ "Artikelnr": "GOOD2" }),
        ];
        const result = await validateAllRows(rows);
        expect(result.valid).toBe(false);
        // errors contain only the bad row
        expect(result.errors!.some(e => e.row === 3)).toBe(true); // row 3 (0-index 1)
      });

      test("empty array returns valid with 0 rows", async () => {
        const result = await validateAllRows([]);
        expect(result.valid).toBe(true);
        expect(result.rows).toHaveLength(0);
      });
    });
    ```

    --- mocks.ts ---
    Shared mock helpers (used by 02-05 atomicity tests too).

    ```typescript
    // apps/api/src/ingest/__tests__/mocks.ts
    import { vi } from "vitest";

    /**
     * Creates a minimal mock Drizzle transaction client.
     * Use with vi.mock("../../../db/index.js") in atomicity tests.
     */
    export function createMockTx(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
        execute: vi.fn().mockResolvedValue(undefined),
        // Minimal sql tag mock
        sql: vi.fn().mockResolvedValue(undefined),
        ...overrides,
      };
    }

    export function createMockDb(txResult?: unknown) {
      return {
        transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => {
          const mockTx = createMockTx();
          return cb(mockTx);
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
        ...( txResult !== undefined ? { _txResult: txResult } : {} ),
      };
    }
    ```
  </action>
  <verify>
    <automated>npm -w apps/api test -- --reporter=verbose 2>&1 | grep -E "FAIL|Cannot find module" | head -20 && echo "RED phase confirmed (tests exist but implementation missing)"</automated>
  </verify>
  <done>
    All four test files exist. Running the tests shows failures caused by missing modules
    (`Cannot find module '../parser.js'` etc.), not syntax errors in the test files.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement parser.ts, schema.ts, validator.ts, types.ts (GREEN phase)</name>
  <files>
    apps/api/src/ingest/types.ts
    apps/api/src/ingest/schema.ts
    apps/api/src/ingest/parser.ts
    apps/api/src/ingest/validator.ts
  </files>
  <behavior>
    After this task, running `npm -w apps/api test -- parser encoding schema validator`
    passes all tests with no failures.
  </behavior>
  <action>
    Implement the four files. Reference the RESEARCH.md skeleton code as starting point
    but adapt as needed. Key implementation notes below.

    --- apps/api/src/ingest/types.ts ---
    Local API types that extend/alias the core package types.
    Keep this minimal — most types are in `@acm-kpi/core`.

    ```typescript
    // Re-export from core for convenience
    export type { IngestError, ValidationResult, IngestResult, FeedParser, ParsedRow }
      from "@acm-kpi/core";
    ```

    --- apps/api/src/ingest/schema.ts ---
    Zod v3 schema (zod ^3.22.0 — use v3 API, NOT v4 API).

    Key implementation points:
    1. `LAGBES_NUMERIC_COLUMNS` — a Set<string> (or Record) mapping column header name
       to `{ canHaveDecimals: boolean }`. Used by the re-merge algorithm in parser.ts.
       Include ALL columns from the sample that can have decimals:
       - "Bestand (Lagereinheit)" ✓ decimals
       - "Bestand (Basiseinheit)" ✓ decimals
       - "Preis" ✓ decimals
       - "pro Menge" ✗ no decimals (integer, e.g. 1, 1000)
       - "Wert" ✓ decimals
       - "Abwert%" ✓ decimals
       - "Wert mit Abw." ✓ decimals
       - "Durch.Verbr" ✓ decimals
       - "Reichw.Mon." ✓ decimals
       - "Umsatz Me J" ✓ decimals
       - "Umsatz Me VJ" ✓ decimals
       - "Lagerb (D)" ✓ decimals
       - "Auftrag M" ✓ decimals
       - "Reserv. M" ✓ decimals
       - "Bestell M" ✓ decimals
       - "FA Menge" ✓ decimals
       - "Bedarf M" ✓ decimals
       - "ø Verbrauch / M" ✓ decimals
       - "Lagerabgang letzes Jahr" ✓ decimals
       - "Lagerabgang letzes 1/2 Jahr" ✓ decimals
       - "Lagerzugang letzes 1/2 Jahr" ✓ decimals

    2. `parseGermanDecimal(val)` — replaces comma with dot and calls parseFloat.
       Empty string → returns 0 (not NaN). Use in `z.preprocess()`.

    3. `parseGermanDate(val)` — parses "DD.MM.YY" with century inference:
       year >= 80 → 1900 + year; else 2000 + year.
       Empty/blank → returns null. Use in `z.preprocess()`.

    4. `buildBaseRow(overrides)` — exported ONLY for test use. Returns a valid raw
       Record<string, string> matching the sample CSV headers. All fields default to
       sensible valid values. `overrides` are merged in.

    5. `StockRowSchema` maps raw column names (German, with spaces) to camelCase.
       The `transform` at the end renames keys to match the Drizzle column camelCase names.

    Example of key Zod schema shape (Zod v3 syntax):
    ```typescript
    import { z } from "zod";

    const parseGermanDecimal = (val: unknown): number => {
      if (typeof val !== "string" || !val.trim()) return 0;
      return parseFloat(val.replace(",", "."));
    };

    const parseGermanDate = (val: unknown): Date | null => {
      if (typeof val !== "string" || !val.trim()) return null;
      const m = val.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
      if (!m) return null;
      const [, d, mo, yr] = m.map(Number);
      const fullYear = yr >= 80 ? 1900 + yr : 2000 + yr;
      return new Date(fullYear, mo - 1, d);
    };

    export const StockRowSchema = z.object({
      "Artikelnr":              z.string().min(1, "Article number required"),
      "Typ":                    z.enum(["ART", "MAT", "HLB", "WKZ"]),
      "Bezeichnung 1":          z.string().max(255).nullable().optional(),
      // ... (all 52 columns)
      "Bestand (Lagereinheit)": z.preprocess(parseGermanDecimal, z.number()),
      "Preis":                  z.preprocess(parseGermanDecimal, z.number()),
      // ... dates
      "Erf.-Datum":             z.preprocess(parseGermanDate, z.date().nullable()),
      "letzt.Zugang":           z.preprocess(parseGermanDate, z.date().nullable()),
      // ...
    }).transform(raw => ({
      // Map German column names to camelCase Drizzle field names
      artikelnr:               raw["Artikelnr"],
      typ:                     raw["Typ"],
      bezeichnung1:            raw["Bezeichnung 1"] ?? null,
      // ... (all 52 fields)
      bestandLagereinheit:     raw["Bestand (Lagereinheit)"],
      preis:                   raw["Preis"],
      // ...
      erfDatum:                raw["Erf.-Datum"],
      letztZugang:             raw["letzt.Zugang"],
    }));

    export type StockRow = z.output<typeof StockRowSchema>;
    export type StockRowInput = z.input<typeof StockRowSchema>;
    ```

    --- apps/api/src/ingest/parser.ts ---
    Streaming pipeline. Key implementation points:

    1. Import `parse as csvParse` from `"csv-parse"` (NOT `"csv-parse/lib/index.js"` —
       the v5 ESM entry is `"csv-parse/sync"` for sync or `"csv-parse"` for stream).
       Check what the v5.5.7 package actually exports — use:
       ```typescript
       import { parse as csvParse } from "csv-parse";
       ```

    2. iconv-lite import:
       ```typescript
       import { decodeStream } from "iconv-lite";
       ```

    3. `remergeNumericFields(rawRow: Record<string, string>, header: string[]): Record<string, string>`
       — Implements the algorithm from RESEARCH.md.
       CRITICAL edge case: LEFT part matches `/^-?\d+$/` (allows negative numbers)
       AND RIGHT part matches `/^\d{1,3}$/` AND column is in LAGBES_NUMERIC_COLUMNS
       with canHaveDecimals=true → merge as `left + "," + right`.
       This handles article 174's -18414,25 (left="-18414", right="25").

    4. The `parseAndRemergeLagBes(filePath: string): Promise<Record<string, string>[]>`
       function wraps everything in a Promise. Uses EventEmitter pattern:
       ```typescript
       return new Promise((resolve, reject) => {
         const rows: Record<string, string>[] = [];
         let header: string[] = [];

         createReadStream(filePath)
           .pipe(decodeStream("cp1252"))
           .pipe(csvParse({
             delimiter: ";",
             columns: (h: string[]) => { header = h; return h; },
             relax_column_count: true,
             trim: true,
             skip_empty_lines: true,
             cast: false,
           }))
           .on("data", (rawRow: Record<string, string>) => {
             // rawRow comes in with extra columns if decimal commas split fields
             // Re-merge must operate on the raw value array, not the keyed object
             // because csv-parse already applied column names.
             // Solution: use `cast: false` and `columns: true` then re-merge on the
             // resulting keyed object using the known header order.
             //
             // Actually: with relax_column_count + columns:true, csv-parse assigns
             // column names to the first N headers even for extra fields.
             // Extra fields beyond header length are in rawRow["__EXTRA__N"] keys.
             // Better approach: capture raw arrays and apply columns manually.
             //
             // REVISED: Use columns: false to get raw arrays, then apply re-merge,
             // then map to column names manually.
             // See RESEARCH.md Pattern 1 for the streaming skeleton.
           })
           .on("end", () => resolve(rows))
           .on("error", reject);
       });
       ```

       IMPORTANT: With `columns: true` and `relax_column_count: true`, csv-parse
       assigns extra split values to auto-named keys. The re-merge must happen on
       the raw array. Use `columns: false` to receive raw string arrays, apply
       `remergeNumericFields()` on the arrays, then map to header:

       ```typescript
       .pipe(csvParse({
         delimiter: ";",
         columns: false,         // Get raw arrays
         relax_column_count: true,
         from_line: 1,           // Include header row
         trim: true,
         skip_empty_lines: true,
         cast: false,
       }))
       .on("data", (rawArr: string[]) => {
         if (!headerCaptured) {
           header = rawArr;
           headerCaptured = true;
           return;
         }
         const merged = remergeFields(rawArr, header);
         rows.push(merged);
       })
       ```

    5. `remergeFields(rawArr: string[], header: string[]): Record<string, string>`
       — walks rawArr, building the merged row, using `header[outputIndex]` to check
       if the current output column is in `LAGBES_NUMERIC_COLUMNS`:

       ```typescript
       const result: Record<string, string> = {};
       let inputIdx = 0;
       let outputIdx = 0;

       while (inputIdx < rawArr.length && outputIdx < header.length) {
         const colName = header[outputIdx];
         const left  = rawArr[inputIdx]  ?? "";
         const right = rawArr[inputIdx + 1] ?? "";
         const numMeta = LAGBES_NUMERIC_COLUMNS[colName];

         const canMerge =
           numMeta?.canHaveDecimals === true &&
           /^-?\d+$/.test(left) &&
           /^\d{1,3}$/.test(right) &&
           right.length > 0;

         if (canMerge) {
           result[colName] = `${left},${right}`;
           inputIdx += 2;
         } else {
           result[colName] = left;
           inputIdx += 1;
         }
         outputIdx += 1;
       }
       return result;
       ```

    --- apps/api/src/ingest/validator.ts ---
    Implements `validateAllRows()` from RESEARCH.md Pattern 3.
    Uses `StockRowSchema.safeParse()` in a for loop. Collects ALL errors.
    Returns `ValidationResult` from `@acm-kpi/core`.

    Use Zod v3 error path format: `issue.path[0]` gives the field name (the German
    column name before `.transform()`). After transform the path is from the INPUT
    shape so this still works.
  </action>
  <verify>
    <automated>npm -w apps/api test -- --reporter=verbose parser encoding schema validator 2>&1 | tail -30</automated>
  </verify>
  <done>
    `npm -w apps/api test -- parser encoding schema validator` exits 0 with all tests
    marked as PASS. No TypeScript errors in the implementation files (`npm -w apps/api run build` exits 0).

    Key assertions verified:
    - Article 2 Preis = "112,532" (re-merged)
    - Article 174 Bestand (Lagereinheit) = "-18414,25" (negative re-merged)
    - Row count = 12
    - µµµµ encoding preserved
    - Date "17.09.12" → year 2012
    - Date "01.01.84" → year 1984
    - All errors collected (fail-on-all)
  </done>
</task>

</tasks>

<verification>
```bash
# Full parser + encoding + schema + validator test suite
npm -w apps/api test -- --reporter=verbose parser encoding schema validator

# TypeScript build passes
npm -w apps/api run build

# Key assertions spot-check
npm -w apps/api test -- --reporter=verbose parser 2>&1 | grep -E "PASS|FAIL|✓|✗"
```
</verification>

<success_criteria>
- `npm -w apps/api test -- parser encoding schema validator` exits 0, all tests pass.
- `npm -w apps/api run build` exits 0 (no TypeScript errors).
- Article 2 Preis asserts as "112,532" after re-merge.
- Article 174 Bestand asserts as "-18414,25" (negative stock preserved — IN-13).
- Row count asserts as exactly 12.
- µµµµ encoding test passes (no U+FFFD).
- Date boundary tests pass (79→2079, 80→1980).
- All-errors-collected test passes (3 bad rows → ≥3 errors in result).
- Files have no imports of `iconv` or `csv-parse` in test files — tests only import from `../parser.js` etc.
</success_criteria>

<output>
After completion, create `.planning/phases/02-csv-ingestion-core/02-04-SUMMARY.md`
</output>
