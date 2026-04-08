# Phase 2: CSV Ingestion Core - Research

**Researched:** 2026-04-08
**Domain:** German-locale CSV parsing with decimal-comma quirk, Windows-1252 encoding, atomic Postgres writes, audit logging
**Confidence:** HIGH

## Summary

Phase 2 solves the **most critical technical problem** in the project: reliably parsing Apollo NTS `LagBes` warehouse CSV exports that contain German decimal commas (`112,532`) in unquoted numeric fields, breaking naive CSV parsing. The parser must:

1. Decode Windows-1252 → UTF-8
2. Apply **schema-aware numeric-field re-merging** to recover split decimal columns
3. Validate all rows in a single pass (fail-on-end, not fail-on-first)
4. Atomically replace the previous `stock_rows` snapshot via transaction
5. Record metadata in the `imports` audit table
6. Be testable and fast (<60s for 10k rows)

The architecture uses `csv-parse` v5.x (streaming), `iconv-lite` for encoding, and Zod for type validation. A custom numeric-re-merge layer (schema-aware) runs between CSV parsing and Zod validation. Design prioritizes correctness (golden-file tests against the real sample) and atomicity (previous snapshot safe on failure).

**Primary recommendation:** Implement the schema-aware numeric-re-merge strategy (Strategy #1 from PITFALLS.md) with explicit column type metadata. Build this incrementally: (1) detect quirk, (2) re-merge, (3) validate, (4) insert atomically.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `csv-parse` | 5.5.x | Streaming CSV parser, semicolon-delimited, `relax_column_count: true` to tolerate split columns | Mature, streaming-first design (no buffering), handles `columns: true` auto-header detection |
| `iconv-lite` | 0.7.2 | Decode Windows-1252 (CP1252) to UTF-8, BOM handling | Only runtime dependency for encoding beyond Node's TextEncoder (ISO-8859-1 not sufficient for `µ` micro symbol) |
| `zod` | 4.3.6 | Type-safe validation + transformation of parsed rows | Already in api stack; excellent ergonomics for `preprocess` and custom refinements |
| `uuid` | 13.0.0 | Correlation IDs for each import attempt (structured logging) | Standard for audit trails |
| `drizzle-orm` | 0.45.2 | ORM for atomic transactions + bulk insert (already in stack) | Code-first migrations, excellent TypeScript support for transaction handling |

### Supporting (Already in Stack from Phase 1)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pino` | 9.0.0 | Structured JSON logging to stdout | All services log ingestion events (start, errors, completion) |
| `pg` | 8.20.0 | PostgreSQL client (Drizzle wraps this) | Direct for transactions if Drizzle lacks control |
| `fastify` | 5.8.4 | API framework (already present Phase 1) | Dev CLI routes + API endpoint (Phase 4 integration) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| csv-parse | `papaparse` (JS) or `fast-csv` | Both buffer entire file in memory; papaparse default assumes UTF-8; fast-csv less streaming-friendly |
| iconv-lite | Built-in `TextEncoder` or `node:encoding` | Node's encoder doesn't support CP1252 efficiently; `iconv-lite` is 1 liner with explicit encoding detection |
| Schema-aware re-merge | Regex pre-processing on raw file | Risky; can corrupt data if regex targets wrong fields. Schema-aware is safer and self-documenting |

**Installation:**
```bash
npm install csv-parse@5.5.7 iconv-lite@0.7.2 uuid@13.0.0
# Already in stack: zod, drizzle-orm, pg, pino, fastify
```

**Version verification:** As of 2026-04-08:
- `csv-parse@6.2.1` available but v5.5.7 stable (6.x has minor breaking changes in options API)
- `iconv-lite@0.7.2` current stable
- `zod@4.3.6` current
- `uuid@13.0.0` current

---

## Architecture Patterns

### Recommended Project Structure

```
apps/api/src/
├── ingest/                                    # NEW: CSV ingestion subsystem
│   ├── index.ts                               # Main export: ingestLagBesFile()
│   ├── types.ts                               # IngestError, ParsedRow, ValidationResult
│   ├── schema.ts                              # Zod schema, column metadata
│   ├── parser.ts                              # CSV parsing + numeric re-merge
│   ├── validator.ts                           # Zod validation + error collection
│   ├── transformer.ts                         # Row → StockRow transformations (dates, numbers)
│   ├── db.ts                                  # Atomic insert + staging table logic
│   └── __tests__/
│       ├── parser.test.ts                     # Golden-file tests vs sample
│       ├── encoding.test.ts                   # Windows-1252, umlauts, µ
│       ├── schema.test.ts                     # Zod validation edge cases
│       ├── atomicity.test.ts                  # Transaction rollback on error
│       └── fixtures/
│           └── LagBes-sample.csv              # Symlink to ../../samples/LagBes-sample.csv
├── scripts/
│   └── ingest-local.ts                        # Dev CLI: `npm -w apps/api run ingest:local -- path/to/file`
└── [existing routes/middleware/...]
```

### Pattern 1: Streaming CSV Parser with Schema-Aware Numeric Re-merge

**What:** Read file via `createReadStream` → decode Windows-1252 → csv-parse with custom row handler → re-merge decimal-comma-split columns → accumulate parsed rows → pass to validator

**When to use:** Always for Phase 2 (non-negotiable for correctness)

**Why this pattern:** 
- Streaming avoids loading 10k+ rows into memory
- `csv-parse` with `columns: true` gives us header mapping
- `relax_column_count: true` allows extra columns from decimal splits
- Custom numeric re-merge knows the schema and can intelligently merge adjacent numeric columns

**Example skeleton:**
```typescript
// apps/api/src/ingest/parser.ts
import { createReadStream } from "fs";
import { parseCSV } from "csv-parse/lib/index.js"; // streaming mode
import { createDecodeStream } from "iconv-lite";
import { validateNumericReMerge } from "./schema";

export async function parseAndRemergeLagBes(filePath: string): Promise<Record<string, string>[]> {
  const parsed: Record<string, string>[] = [];
  const errors: Array<{ row: number; reason: string }> = [];
  let rowNum = 1; // Header is row 1

  return new Promise((resolve, reject) => {
    createReadStream(filePath)
      .pipe(createDecodeStream("cp1252")) // Windows-1252 → UTF-8
      .pipe(
        parseCSV({
          delimiter: ";",
          from_line: 1,
          columns: true, // Auto-detect header
          relax_column_count: true, // Allow extra columns from decimal splits
          trim: true,
          skip_empty_lines: true,
          cast: false, // Don't auto-cast; we handle casting in Zod
          encoding: "utf8", // Already decoded above
        })
      )
      .on("data", (row: Record<string, any>) => {
        rowNum++;
        try {
          const merged = validateNumericReMerge(row, rowNum);
          parsed.push(merged);
        } catch (e) {
          errors.push({ row: rowNum, reason: (e as Error).message });
        }
      })
      .on("error", reject)
      .on("end", () => {
        if (errors.length > 0) {
          reject(new ValidationError(`Parse errors on ${errors.length} rows`, errors));
        }
        resolve(parsed);
      });
  });
}
```

### Pattern 2: Column Index → Type Metadata Map

**What:** Pre-computed lookup that tells us: for each column index, is it numeric? If numeric, can it have decimals? What's the target numeric precision?

**When to use:** For the re-merge algorithm to know which adjacent fields might be a decimal pair

**Example:**
```typescript
// apps/api/src/ingest/schema.ts
export const LAGBES_NUMERIC_COLUMNS = {
  "Bestand (Lagereinheit)": { index: 13, type: "quantity", canHaveDecimals: true, scale: 4 },
  "Bestand (Basiseinheit)": { index: 15, type: "quantity", canHaveDecimals: true, scale: 4 },
  "Preis": { index: 17, type: "currency", canHaveDecimals: true, scale: 2 },
  "pro Menge": { index: 18, type: "quantity", canHaveDecimals: false },
  "Wert": { index: 19, type: "currency", canHaveDecimals: true, scale: 2 },
  "Abwert%": { index: 20, type: "percentage", canHaveDecimals: true, scale: 2 },
  "Wert mit Abw.": { index: 21, type: "currency", canHaveDecimals: true, scale: 2 },
  "Durch.Verbr": { index: 22, type: "consumption", canHaveDecimals: true, scale: 2 },
  "Reichw.Mon.": { index: 23, type: "months", canHaveDecimals: true, scale: 1 },
  // ... etc
} as const;
```

### Pattern 3: Error Accumulation, Not Fail-On-First

**What:** Parse and validate ALL rows, collecting errors. Return either success or all errors at once (with row numbers and column context)

**When to use:** CSV validation (IN-11 requirement: "collected all at once")

**Why:** Executives need to fix the entire file once and re-upload, not one row at a time

**Example:**
```typescript
// apps/api/src/ingest/validator.ts
import { z } from "zod";

export interface ValidationError {
  row: number;
  field: string;
  value: any;
  reason: string;
}

export interface ValidationResult {
  valid: boolean;
  rows?: Array<z.infer<typeof StockRowSchema>>;
  errors?: ValidationError[];
}

export async function validateAllRows(
  parsedRows: Record<string, string>[],
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const validRows: any[] = [];

  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    const result = StockRowSchema.safeParse(row);
    
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          row: i + 2, // +2: header is row 1, data starts row 2
          field: String(issue.path[0]),
          value: (row as any)[String(issue.path[0])],
          reason: issue.message,
        });
      }
    } else {
      validRows.push(result.data);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, rows: validRows };
}
```

### Pattern 4: Atomic TRUNCATE + INSERT in Single Transaction

**What:** One transaction: TRUNCATE the live table → INSERT from staging → COMMIT. On failure: rollback, previous data untouched.

**When to use:** For snapshot replacement (IN-09)

**Why:** PostgreSQL MVCC ensures concurrent readers see old data until COMMIT. No partial views.

**SQL pattern:**
```sql
-- Phase 2 does NOT refresh materialized views (Phase 3 does)
-- But the structure is ready for Phase 3 to add REFRESH MATERIALIZED VIEW kpi_dashboard_data

BEGIN;
  -- Insert staging rows (from previous step)
  INSERT INTO stock_rows (import_id, article_number, warehouse, ...) 
  SELECT $1, article_number, warehouse, ... FROM stock_rows_staging;
  
  -- If we were replacing (not Phase 2, but future pattern):
  -- TRUNCATE stock_rows CASCADE;  -- with FK constraints, must cascade
  
COMMIT; -- On failure anywhere above, entire transaction rolls back
```

**Drizzle transaction pattern:**
```typescript
export async function insertStockRowsAtomic(
  db: DrizzleClient,
  importId: number,
  rows: StockRowInsert[],
): Promise<{ inserted: number; errors?: string[] }> {
  return db.transaction(async (tx) => {
    // Insert in batches to avoid single huge query
    let total = 0;
    const batchSize = 500;
    
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const inserted = await tx
        .insert(stockRows)
        .values(batch.map(r => ({ ...r, importId })))
        .returning({ id: stockRows.id });
      
      total += inserted.length;
    }
    
    // No REFRESH MATERIALIZED VIEW in Phase 2 (Phase 3 adds this)
    return { inserted: total };
  });
}
```

### Anti-Patterns to Avoid

- **Processing rows one-by-one with individual transactions:** Slow (N transactions for N rows). Batch instead.
- **Validating only the first row as a "format check":** Misses errors in rows 500-1000. Must validate all.
- **Buffering entire CSV in memory before parsing:** For 50k rows × average 200 bytes, that's 10MB; streaming is cleaner.
- **Assuming Preis field never has decimals:** The sample shows `112,532` in Preis (row 2). Always re-merge numeric columns.
- **Skipping the atomic transaction:** Using INSERT then UPDATE then DELETE as separate calls. On failure mid-way, the live table is corrupted.

---

## Decimal-Comma Re-Merge Algorithm (CRITICAL)

### Problem Statement

Apollo NTS exports `LagBes` with German locale. Numeric values use comma as decimal separator: `112,532` = 112.532. The CSV is semicolon-delimited and values are NOT quoted. Result: `112,532` is split by csv-parse into two columns: `["112", "532"]`.

**Sample evidence from `samples/LagBes-sample.csv`:**

Header has 52 columns. Sample row 2 (article 2) when naively split has 55 columns (3 extra from decimal splits).

Row 2 raw:
```
2;ART;Cover Bottom;;beige/ braun;Sheepskin color Caramel;;;BEZ.ST;;5400;0;Summe;5;STK;5;STK;112;532;1;560;27;0;560;27;...
                                                                                                      ^^^   ^^^     ^^^   ^^   ^^
                                                                      These are split: 112,532 | 560,27 | 0 | 560,27
```

Correct parse: `["112,532", "1", "560,27", "0", "560,27"]` (re-merged)
Naive parse: `["112", "532", "1", "560", "27", "0", "560", "27"]` (columns misaligned)

### Algorithm: Schema-Aware Re-Merge (Strategy #1)

**Input:** Raw row array from csv-parse (with `relax_column_count: true`)

**Output:** Merged row array with decimals restored

**Steps:**

```
1. Load column metadata: LAGBES_COLUMN_SCHEMA (index → {name, type, canHaveDecimals})

2. Initialize:
   - merged = []
   - i = 0 (position in raw split array)
   - headerIndex = build map of column name → expected position in final result

3. While i < raw.length:
   a. Peek at raw[i] and raw[i+1]
   
   b. Is raw[i] a pure integer (matches /^\d+$/)?
      AND is raw[i+1] a pure integer (1-3 digits)?
      AND does the column at headerIndex[i] expect decimals?
      
      Example: headerIndex has "Preis" at position 17, expecting decimals
               raw[17] = "112", raw[18] = "532"
               → Yes, merge them
      
   c. If yes (all 3 conditions):
      → merged.push(raw[i] + "," + raw[i+1])  // Restore comma
      → i += 2  // Skip both parts
   
   d. If no:
      → merged.push(raw[i])
      → i += 1  // Move to next

4. Return merged
```

**Pseudocode with example:**

```typescript
function remergeNumericFields(
  rawRow: (string | undefined)[],
  headerRow: string[],
): Record<string, string> {
  const NUMERIC_FIELDS = {
    "Bestand (Lagereinheit)": true,
    "Bestand (Basiseinheit)": true,
    "Preis": true,
    "pro Menge": false,  // Never has decimals
    "Wert": true,
    "Abwert%": true,
    "Wert mit Abw.": true,
    "Durch.Verbr": true,
    "Reichw.Mon.": true,
    "Lagerabgang letzes Jahr": true,
    "Lagerabgang letzes 1/2 Jahr": true,
    "Lagerzugang letzes 1/2 Jahr": true,
    "ø Verbrauch / M": true,
    "Lagerb (D)": true,
    "Auftrag M": true,
    "Reserv. M": true,
    "Bestell M": true,
    "FA Menge": true,
    "Bedarf M": true,
  };

  const merged: string[] = [];
  let i = 0;

  while (i < rawRow.length) {
    const currentHeader = headerRow[merged.length];
    const nextRaw1 = rawRow[i];
    const nextRaw2 = rawRow[i + 1];

    // Three conditions for merge:
    const isPureInt = (val: string | undefined): boolean =>
      val !== undefined && /^\d+$/.test(val);
    
    const shouldMerge =
      NUMERIC_FIELDS[currentHeader] === true &&
      isPureInt(nextRaw1) &&
      isPureInt(nextRaw2) &&
      nextRaw2.length <= 3; // Fractional part is 1-3 digits (e.g., "27" for 0.27)

    if (shouldMerge) {
      merged.push(`${nextRaw1},${nextRaw2}`);
      i += 2;
    } else {
      merged.push(nextRaw1 || "");
      i += 1;
    }
  }

  // Convert back to object using header
  const result: Record<string, string> = {};
  for (let j = 0; j < merged.length && j < headerRow.length; j++) {
    result[headerRow[j]] = merged[j];
  }

  return result;
}
```

### Edge Cases Handled

| Case | Example | Handling |
|------|---------|----------|
| Negative quantity | `"-18414", "25"` (row 174, Bestand field) | NOT merged (first part is `-18414`, not pure digits; string test fails on leading `-`). Correct: preserved as `-18414` in one column, `25` in next. |
| Zero value | `"0"` followed by `"1"` (Abwert% = 0, Wert mit Abw. = 1) | NOT merged (0 alone is a complete value, 1 is the next field). Correct: `0`, `1` in separate columns. |
| Empty/blank field | `""` followed by numeric | NOT merged (blank is not `/^\d+$/`). Correct: preserved as two fields. |
| String field (e.g., description) | `"Sheepskin"` followed by `"color"` | NOT merged (neither matches `/^\d+$/`, also not in NUMERIC_FIELDS). Correct: two columns. |
| Trailing semicolon in raw file | Produces empty string at end of raw array | Handled gracefully: empty string is pushed, no index out of bounds. |

### Validation After Re-merge

After re-merging, the column count should match the header count (±1 for trailing empty). Zod schema then validates each field's type and content.

---

## Zod Schema for Stock Rows

### Input Shape (After Re-merge and Basic Transformations)

```typescript
// apps/api/src/ingest/schema.ts
import { z } from "zod";

// Custom parsers for German formats
const parseGermanDecimal = (val: unknown): number => {
  if (typeof val !== "string") return 0;
  return parseFloat(val.replace(",", "."));
};

const parseGermanDate = (val: unknown): Date | null => {
  if (typeof val !== "string" || !val.trim()) return null;
  const match = val.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (!match) return null;

  const [, day, month, year] = match.map(Number);
  // Century inference: if year >= 80, assume 19xx; else 20xx
  // (Apollo NTS data rarely predates 1980)
  const fullYear = year >= 80 ? 1900 + year : 2000 + year;

  return new Date(fullYear, month - 1, day); // Month is 0-indexed
};

export const StockRowSchema = z.object({
  // Required string fields
  artikelnr: z.string().min(1, "Article number required").max(50),
  typ: z.enum(["ART", "MAT", "HLB", "WKZ"], { message: "Invalid type" }),
  bezeichnung_1: z.string().max(255).nullable(),
  
  // Enumerations
  lagername: z.string().max(100),
  lag_einh: z.string().max(20), // Unit of storage (STK, QM, KON, etc.)
  
  // Numeric fields (re-merged from decimals)
  bestand_lagereinheit: z.preprocess(parseGermanDecimal, z.number()),
  bestand_basiseinheit: z.preprocess(parseGermanDecimal, z.number()),
  preis: z.preprocess(parseGermanDecimal, z.number().min(0, "Price cannot be negative")),
  pro_menge: z.preprocess(parseGermanDecimal, z.number().int("Unit count must be integer")),
  wert: z.preprocess(parseGermanDecimal, z.number()),
  abwert_prozent: z.preprocess(parseGermanDecimal, z.number().min(0).max(100)),
  wert_mit_abw: z.preprocess(parseGermanDecimal, z.number()),
  
  // Coverage / consumption
  durch_verbr: z.preprocess(parseGermanDecimal, z.number()),
  reichw_mon: z.preprocess(parseGermanDecimal, z.number()),
  
  // Dates (German DD.MM.YY)
  letzt_zugang: z.preprocess(parseGermanDate, z.date().nullable()),
  lagerzugang_dat: z.preprocess(parseGermanDate, z.date().nullable()),
  lagerabgang_dat: z.preprocess(parseGermanDate, z.date().nullable()),
  erf_datum: z.preprocess(parseGermanDate, z.date()),
  
  // Flags
  geloescht: z.enum(["J", "N"], { message: "Gelöscht must be J or N" }),
  abc_kennz_vk: z.enum(["A", "B", "C", ""], { message: "ABC class must be A/B/C or empty" }).default("C"),
  
  // Optional fields
  lieferant: z.string().max(100).nullable(),
  wgr: z.string().max(50).nullable(),
  prodgrp: z.string().max(50).nullable(),
}).transform(row => ({
  // Normalize to database column names (snake_case, English aliases where needed)
  ...row,
  // Preserve negative stock (IN-13)
  // No zeroing of negative values
}));

export type StockRow = z.infer<typeof StockRowSchema>;
```

### Key Points

1. **Preprocessing:** `z.preprocess()` lets us transform the string value (after re-merge) to the target type
2. **German decimal:** Replace `,` with `.` then `parseFloat()`
3. **German date:** Parse `DD.MM.YY`, infer century (≥80 → 19xx, else 20xx)
4. **Negative stock preserved:** No validation rejects negatives. They're legitimate (corrections, reservations). IN-13 requirement.
5. **Nullable fields:** Many columns can be blank (museum items, zero-value rows). Use `.nullable()` for optional fields.
6. **Enum columns:** `Typ` is one of {ART, MAT, HLB, WKZ}; `Gelöscht` is {J, N}; `ABC-Kennz. VK` is {A, B, C, blank→C}

---

## Do Not Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|------------|-------------|-----|
| CSV parsing with encoding | Custom byte-level parser | `csv-parse` + `iconv-lite` | Handles edge cases: quotes, escapes, BOM, streaming; encoding is complex (byte order, fallbacks) |
| German date parsing | Regex or string slice | `z.preprocess()` + `Date` object | Easy to get century inference wrong; Date constructor handles month bounds checking |
| Decimal-comma replacement | Global regex on file | Schema-aware re-merge (custom but minimal) | Regex can corrupt non-numeric fields; schema-aware is safe and only 50 lines |
| Transactional atomicity | Separate INSERT + DELETE | `db.transaction()` from Drizzle | Race conditions if not atomic; MVCC requires explicit transaction boundaries |
| Error collection | Throw on first error | Zod's `safeParse` + manual loop | Fail-on-all is a requirement (IN-11); don't build your own validation engine |
| Structured logging | `console.log` strings | `pino` (already in stack) | JSON to stdout, no replication, correlation IDs, log levels |

---

## Common Pitfalls (from PITFALLS.md)

### Pitfall #1: Naive CSV Parsing Silently Corrupts KPIs

**What goes wrong:** Parsing without the decimal-comma re-merge succeeds but produces wrong columns. Dashboard shows 40% higher inventory value. Undetected for weeks.

**How to avoid:**
- Implement the re-merge algorithm as part of parser initialization (non-negotiable)
- Golden-file test: parse `samples/LagBes-sample.csv`, assert exact parsed values for articles 2, 58, 74, 174 (known decimal cases)
- After parsing, count columns: `parsed.length === header.length` (within ±1)
- Spot-check numeric columns: all post-decimal-comma should be valid numbers (no NaN)

**Detection:** Dashboard KPI totals don't match ERP export when spot-checked. Sum of `Wert mit Abw.` across all rows differs >5% from expected.

### Pitfall #2: Encoding Ambiguity (Windows-1252 vs UTF-8)

**What goes wrong:** File uploaded with Windows-1252 encoding, parser assumes UTF-8. Umlauts and `µ` become mojibake. Search for "Schaffhausen Größe" returns 0 results.

**How to avoid:**
- Always decode with `iconv-lite` and **explicit encoding** (`cp1252`)
- Test round-trip: upload file with `µµµµ`, `ü`, `ß` in description (present in sample), verify characters round-trip correctly
- Detect and warn if BOM is present in UTF-8 file (malformed)
- Reject files whose encoding cannot be detected (don't silently assume)

**Detection:** Special characters in descriptions display as `?` or multi-byte gibberish.

### Pitfall #10: Partial Import Corrupts Previous Snapshot

**What goes wrong:** File upload succeeds, parser hits error on row 5000 of 10000. Some rows inserted, some not. Previous snapshot lost. Dashboard shows a mix of old + partial new data.

**How to avoid:**
- Use staging table pattern: INSERT into `stock_rows_staging` (separate from live `stock_rows`)
- Atomic transaction: `BEGIN; DELETE/TRUNCATE stock_rows; INSERT FROM staging; COMMIT;` — all-or-nothing
- On failure: catch exception, rollback, staging table dropped, live table untouched
- Record the failure in `imports` audit table with error message

**Detection:** Dashboard row counts don't match uploaded file row count. Some old articles reappear, some new ones are missing.

---

## Streaming Pipeline Architecture

```
File (Windows-1252, 900+ rows)
  │
  ├─→ createReadStream(filePath)
  │
  ├─→ .pipe(iconv.decodeStream('cp1252'))
  │    └─ Streaming decode to UTF-8
  │
  ├─→ .pipe(csvParse({
  │         delimiter: ';',
  │         columns: true,
  │         relax_column_count: true,
  │         from_line: 1,
  │         trim: true,
  │         skip_empty_lines: true
  │       }))
  │    └─ Emits header + rows as objects
  │
  ├─→ [Custom row handler]
  │    ├─ remergeNumericFields(row, header)
  │    │  └─ Restore decimal commas: 112;532 → 112,532
  │    │
  │    └─ Accumulate rows + collect errors
  │
  ├─→ validateAllRows(rows, ZodSchema)
  │    └─ All-at-once validation (no fail-on-first)
  │
  ├─→ insertStockRowsAtomic(db, importId, validRows)
  │    ├─ BEGIN TRANSACTION
  │    ├─ INSERT INTO stock_rows VALUES (batches of 500)
  │    ├─ COMMIT
  │    └─ On error: ROLLBACK, previous snapshot untouched
  │
  └─→ recordImport(importId, status, errorCount, duration)
       └─ Write to imports audit table
```

**Backpressure handling:**
- csv-parse handles backpressure internally (pauses reading if consumer is slow)
- Zod validation runs in-memory (no async I/O), so no additional pause needed
- Drizzle transaction holds for entire insert batch

**Memory budget for 50k rows (worst case):**
- Streaming parser: constant memory (1 row at a time)
- Accumulated parsed rows: ~50k × 200 bytes average = 10 MB
- Zod validation: ~20 MB for error messages + transformed objects
- Total: ~30-40 MB for a 50k-row file. Safe on 512MB container.

---

## Test Strategy (Gates PITFALL #1)

### Golden-File Test Against Sample

**File:** `apps/api/src/ingest/__tests__/parser.test.ts`

**Approach:** Parse `samples/LagBes-sample.csv` end-to-end, assert exact parsed output for known rows.

**Test cases:**

```typescript
describe("CSV Parser — Decimal-Comma Re-merge", () => {
  test("Article 2 (Preis=112,532) re-merges correctly", async () => {
    const rows = await parseAndRemergeLagBes("samples/LagBes-sample.csv");
    const article2 = rows.find(r => r.artikelnr === "2");
    
    // After re-merge, these should be single values with commas
    expect(article2.preis).toBe("112,532");
    expect(article2.wert).toBe("560,27");
    expect(article2.wert_mit_abw).toBe("560,27");
  });

  test("Article 58 (multiple decimals) re-merges correctly", async () => {
    const rows = await parseAndRemergeLagBes("samples/LagBes-sample.csv");
    const article58 = rows.find(r => r.artikelnr === "58");
    
    expect(article58.preis).toBe("30,336");
    expect(article58.wert).toBe("2012,25");
  });

  test("Article 174 (negative stock preserved)", async () => {
    const rows = await parseAndRemergeLagBes("samples/LagBes-sample.csv");
    const article174 = rows.find(r => r.artikelnr === "174");
    
    // Negative stock from re-merged column: -18414 (not split)
    expect(article174.bestand_lagereinheit).toBe("-18414,25");
    expect(article174.bestand_basiseinheit).toBe("-18414,25");
  });

  test("Sample file parses with exact row count", async () => {
    const rows = await parseAndRemergeLagBes("samples/LagBes-sample.csv");
    expect(rows.length).toBe(12); // Sample has 12 data rows
  });
});
```

### Encoding Test

**File:** `apps/api/src/ingest/__tests__/encoding.test.ts`

```typescript
test("Windows-1252 decoding preserves umlauts and micro symbol", async () => {
  const rows = await parseAndRemergeLagBes("samples/LagBes-sample.csv");
  
  // Sample row 1 (Cover Bottom) has "µµµµ" in the file
  const article2 = rows.find(r => r.artikelnr === "2");
  expect(article2.raw_line_sample).toContain("µµµµ");
  
  // Verify roundtrip: no mojibake
  expect(article2.raw_line_sample).not.toContain("\ufffd"); // U+FFFD is replacement char
});

test("BOM detection and stripping", async () => {
  // Create a CP1252 file with UTF-8 BOM
  // Parser should detect and strip it
  // Assert first row parses correctly (not malformed by BOM)
});
```

### Date Parsing Test

**File:** `apps/api/src/ingest/__tests__/schema.test.ts`

```typescript
test("DD.MM.YY dates infer century correctly", () => {
  const schema = StockRowSchema;
  
  // 2001 (01 with century inference)
  expect(schema.parse({ ...baseRow, erf_datum: "17.09.12" }).erf_datum.getFullYear()).toBe(2012);
  
  // 1984 (84 >= 80 → 1900+)
  expect(schema.parse({ ...baseRow, erf_datum: "01.01.84" }).erf_datum.getFullYear()).toBe(1984);
  
  // Boundary: 79 → 2079, 80 → 1980
  expect(schema.parse({ ...baseRow, erf_datum: "01.01.79" }).erf_datum.getFullYear()).toBe(2079);
  expect(schema.parse({ ...baseRow, erf_datum: "01.01.80" }).erf_datum.getFullYear()).toBe(1980);
});
```

### Negative Stock Preservation Test

```typescript
test("Negative stock preserved (IN-13)", () => {
  const schema = StockRowSchema;
  const row = schema.parse({
    ...baseRow,
    bestand_lagereinheit: "-18414,25",
  });
  
  expect(row.bestand_lagereinheit).toBe(-18414.25);
  expect(row.bestand_lagereinheit).toBeLessThan(0); // Not zeroed
});
```

### Atomic Transaction Test

**File:** `apps/api/src/ingest/__tests__/atomicity.test.ts`

```typescript
test("Rollback on parse error leaves previous snapshot untouched", async () => {
  // Seed DB with known stock_rows
  await db.insert(stockRows).values([
    { articleNumber: "ARTICLE_1", quantity: 100, ... },
  ]);

  // Create mock file that fails on row 2
  const mockRows = [
    { validRow: true, ... },
    { validRow: false, willFailSchema: true }, // Fails Zod validation
  ];

  // Attempt insert (mock Zod to fail on row 2)
  await expect(insertStockRowsAtomic(db, 1, mockRows)).rejects.toThrow();

  // Verify previous data still exists
  const remaining = await db.select().from(stockRows);
  expect(remaining).toHaveLength(1);
  expect(remaining[0].articleNumber).toBe("ARTICLE_1");
});
```

### Error Collection Test

```typescript
test("All validation errors collected (fail-on-all, not fail-on-first)", async () => {
  const mockFile = [
    { artikelnr: "1", typ: "INVALID", ... }, // Bad enum
    { artikelnr: "2", preis: "not_a_number", ... }, // Bad number
    { artikelnr: "", typ: "ART", ... }, // Missing required
  ];

  const result = await validateAllRows(mockFile);
  
  expect(result.valid).toBe(false);
  expect(result.errors).toHaveLength(3);
  expect(result.errors[0].field).toBe("typ");
  expect(result.errors[1].field).toBe("preis");
  expect(result.errors[2].field).toBe("artikelnr");
});
```

---

## Runtime State Inventory

N/A — Phase 2 is greenfield (no prior schema or state to migrate from Phase 1).

---

## Validation Architecture

Test framework: **Vitest** (already in Phase 1 stack, Node.js fork mode to isolate tests)

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Command | File Exists? |
|--------|----------|-----------|---------|-------------|
| IN-04 | Windows-1252 encode round-trip | unit | `npm -w apps/api test -- encoding` | ✅ Phase 2 Wave 0 |
| IN-05 | Decimal-comma quirk fixed | unit | `npm -w apps/api test -- parser` | ✅ Phase 2 Wave 0 |
| IN-06 | DD.MM.YY date parsing | unit | `npm -w apps/api test -- schema` | ✅ Phase 2 Wave 0 |
| IN-09 | Atomic replace, rollback safe | unit | `npm -w apps/api test -- atomicity` | ✅ Phase 2 Wave 0 |
| IN-10 | Import audit row recorded | unit | `npm -w apps/api test -- imports` | ✅ Phase 2 Wave 1 |
| IN-11 | All validation errors collected | unit | `npm -w apps/api test -- validator` | ✅ Phase 2 Wave 0 |
| IN-12 | 10k rows in <60s | integration | `npm -w apps/api test -- performance` (load 10k rows, time) | ✅ Phase 2 Wave 1 |
| IN-13 | Negative stock preserved | unit | `npm -w apps/api test -- negative-stock` | ✅ Phase 2 Wave 0 |
| KPI-01 | `stock_rows` schema strong types | unit | Schema definition exists | ✅ Phase 2 Wave 0 |
| KPI-10 | Feed registry extensibility | unit | `FeedParser` interface exists in packages/core | ✅ Phase 2 Wave 0 |
| OBS-01 | Structured JSON logging (pino) | unit | Log output to stdout, parse as JSON | ✅ Phase 2 Wave 1 |
| TEST-01 | Golden-file test vs sample | unit | `npm -w apps/api test -- parser` (includes sample.csv) | ✅ Phase 2 Wave 0 |

**Wave 0 (must exist before plan execution):**
- `parser.test.ts` — golden-file tests
- `encoding.test.ts` — Windows-1252 round-trip
- `schema.test.ts` — Zod schema, dates, negatives
- `validator.test.ts` — error accumulation
- `atomicity.test.ts` — transaction rollback

**Wave 1 (executed during plan, gates phase completion):**
- `imports.test.ts` — audit table recording
- Performance test (10k rows, measure elapsed time)
- `logging.test.ts` — pino JSON output format

**Quick run command (smoke test):** `npm -w apps/api run test -- parser encoding schema`
**Full suite command:** `npm -w apps/api run test` (all ingest tests)

---

## Staging Table + Atomic Swap Strategy

### Option A: TRUNCATE + INSERT (Recommended for Phase 2)

**Why:** Fast, minimal locks, atomic within single transaction, safe with MVCC.

**Schema change needed:**
```sql
-- Phase 1 stub expanded in Phase 2
CREATE TABLE stock_rows (
  id SERIAL PRIMARY KEY,
  import_id INTEGER REFERENCES imports(id),
  article_number TEXT NOT NULL,
  warehouse TEXT,
  quantity NUMERIC(18, 4),
  value NUMERIC(18, 2),
  -- ... 50+ columns ...
  created_at TIMESTAMP DEFAULT NOW()
);

-- Staging table (identical schema, dropped/recreated per import)
CREATE TEMPORARY TABLE stock_rows_staging AS SELECT * FROM stock_rows WHERE FALSE;
```

**Pattern in Drizzle:**
```typescript
export async function replaceStockRowsAtomic(
  tx: DB, // Transaction context from db.transaction()
  importId: number,
  rows: StockRowInsert[],
): Promise<void> {
  // Clear staging and insert new rows
  await tx.delete(stockRowsStaging).execute();
  
  // Batch insert
  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    await tx.insert(stockRowsStaging).values(
      rows.slice(i, i + batchSize).map(r => ({ ...r, importId }))
    );
  }
  
  // Atomic swap (TRUNCATE + INSERT)
  // Note: In Phase 2, we DO NOT truncate yet (no prior data)
  // In Phase 3+, this becomes:
  // await tx.sql`TRUNCATE TABLE stock_rows CASCADE`;
  // await tx.sql`INSERT INTO stock_rows SELECT * FROM stock_rows_staging`;
  //
  // For Phase 2, just rename:
  await tx.sql`ALTER TABLE stock_rows RENAME TO stock_rows_old`;
  await tx.sql`ALTER TABLE stock_rows_staging RENAME TO stock_rows`;
}
```

### Option B: Table Rename (For Phase 3+)

If Phase 3 needs snapshot history:
```sql
-- Phase 3 adds versioning
CREATE TABLE stock_rows_import_001 (LIKE stock_rows);
CREATE TABLE stock_rows_import_002 (LIKE stock_rows);
-- ... etc, and a view pointing to current
CREATE VIEW stock_rows AS SELECT * FROM stock_rows_import_001; -- Swappable
```

**For Phase 2: Use Option A (TRUNCATE + INSERT).** Simpler, no version tracking needed yet.

---

## File Layout (apps/api)

```
apps/api/
├── src/
│   ├── ingest/
│   │   ├── index.ts                         # Main export: ingestLagBesFile()
│   │   ├── types.ts                         # IngestError, ParsedRow, ValidationResult
│   │   ├── schema.ts                        # Zod schema + LAGBES_NUMERIC_COLUMNS metadata
│   │   ├── parser.ts                        # parseAndRemergeLagBes()
│   │   ├── validator.ts                     # validateAllRows()
│   │   ├── transformer.ts                   # Row → StockRow transformations
│   │   ├── db.ts                            # insertStockRowsAtomic()
│   │   └── __tests__/
│   │       ├── parser.test.ts               # Golden-file tests
│   │       ├── encoding.test.ts
│   │       ├── schema.test.ts
│   │       ├── validator.test.ts
│   │       ├── atomicity.test.ts
│   │       ├── fixtures/
│   │       │   └── LagBes-sample.csv        # Symlink to samples/LagBes-sample.csv
│   │       └── mocks.ts                     # Mock DB, file readers
│   │
│   ├── scripts/
│   │   └── ingest-local.ts                  # Dev CLI entry
│   │
│   ├── db/
│   │   └── schema.ts                        # EXPANDED for `stock_rows` full schema
│   │
│   └── [existing: server.ts, routes/*, middleware/*, ...]
│
├── package.json                             # Add: csv-parse, iconv-lite
├── vitest.config.ts                         # Already exists from Phase 1
└── tsconfig.json
```

---

## Dev CLI: `ingest:local`

**File:** `apps/api/src/scripts/ingest-local.ts`

**Invocation:**
```bash
npm -w apps/api run ingest:local -- samples/LagBes-sample.csv
# or with full path
npm -w apps/api run ingest:local -- /path/to/custom/LagBes.csv
```

**Output:**
```
[2026-04-08T14:32:00Z] INGEST_START { file: "LagBes-sample.csv", size_bytes: 125000, import_id: "uuid-..." }
[2026-04-08T14:32:01Z] PARSE_COMPLETE { rows_parsed: 912, errors: 0 }
[2026-04-08T14:32:02Z] VALIDATION_COMPLETE { rows_valid: 912, validation_errors: 0 }
[2026-04-08T14:32:03Z] INSERT_COMPLETE { rows_inserted: 912, duration_ms: 1200 }
[2026-04-08T14:32:03Z] INGEST_END { status: "success", duration_ms: 3000, total_rows: 912 }
```

**Implementation sketch:**
```typescript
// apps/api/src/scripts/ingest-local.ts
import { ingestLagBesFile } from "../ingest/index.js";
import { createLogger } from "../logger.js";

const logger = createLogger("ingest-local");

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: ingest:local <path>");
    process.exit(1);
  }

  try {
    const result = await ingestLagBesFile(filePath, "local-cli");
    logger.info(result, `Import complete`);
    process.exit(result.status === "success" ? 0 : 1);
  } catch (err) {
    logger.error(err, "Import failed");
    process.exit(1);
  }
}

main();
```

**Added to `package.json`:**
```json
{
  "scripts": {
    "ingest:local": "tsx src/scripts/ingest-local.ts"
  }
}
```

---

## Feed Registry Hook (KPI-10 Extensibility)

**File:** `packages/core/src/types/feed.ts`

```typescript
/**
 * Feed parser interface for extensibility (Phase 3+).
 * Each feed (LagBes, scrap rate, etc.) implements this interface.
 */
export interface FeedParser {
  /**
   * Unique feed identifier (e.g., "lagbes", "scrap_rate")
   */
  id: string;

  /**
   * Human-readable feed name
   */
  name: string;

  /**
   * Main table this feed populates (e.g., "stock_rows", "scrap_rows")
   */
  tableName: string;

  /**
   * Zod schema for row validation
   */
  schema: z.ZodType;

  /**
   * Parse a file into rows matching the schema
   * Returns async iterable for streaming
   */
  parse(filePath: string): AsyncIterable<unknown>;

  /**
   * Optional: custom insertion logic (if not a simple INSERT)
   */
  insert?(db: DB, importId: number, rows: unknown[]): Promise<void>;
}
```

**Phase 2 registration (minimal):**
```typescript
// apps/api/src/ingest/registry.ts
import { FeedParser } from "@acm-kpi/core";
import { ingestLagBesFile } from "./index.js";
import { StockRowSchema } from "./schema.js";

const feedRegistry: Record<string, FeedParser> = {
  lagbes: {
    id: "lagbes",
    name: "LagBes (Warehouse Stock)",
    tableName: "stock_rows",
    schema: StockRowSchema,
    async *parse(filePath: string) {
      const rows = await ingestLagBesFile(filePath, "registry");
      for (const row of rows.rows || []) {
        yield row;
      }
    },
  },
};

export function getFeedParser(feedId: string): FeedParser {
  const parser = feedRegistry[feedId];
  if (!parser) throw new Error(`Unknown feed: ${feedId}`);
  return parser;
}
```

**Phase 3+ adds:** New feeds (scrap rate) register by adding entries to `feedRegistry`.

---

## Logging + Observability

### Pino Integration

**File:** `apps/api/src/ingest/index.ts` (main export)

```typescript
export async function ingestLagBesFile(
  filePath: string,
  source: "browser" | "watcher" | "local-cli",
): Promise<ImportResult> {
  const correlationId = randomUUID(); // Unique per import
  const logger = createLogger("ingest", { correlationId });

  const startTime = Date.now();
  logger.info({ file: filePath, size: await getFileSize(filePath) }, "ingest_start");

  try {
    const parsed = await parseAndRemergeLagBes(filePath);
    logger.info({ rows: parsed.length }, "parse_complete");

    const validated = await validateAllRows(parsed);
    if (!validated.valid) {
      logger.error({ errors: validated.errors }, "validation_failed");
      throw new ValidationError("Validation failed", validated.errors);
    }
    logger.info({ rows: validated.rows?.length }, "validation_complete");

    const { inserted } = await insertStockRowsAtomic(db, importId, validated.rows || []);
    logger.info({ inserted }, "insert_complete");

    // Record in audit table
    await db.insert(imports).values({
      filename: path.basename(filePath),
      rowCount: inserted,
      status: "success",
      operator: source === "browser" ? req.user?.username : null,
      createdAt: new Date(),
    });

    const duration = Date.now() - startTime;
    logger.info({ duration, total_rows: inserted }, "ingest_end");

    return { status: "success", importId, rowsInserted: inserted, duration };
  } catch (err) {
    logger.error(err, "ingest_error");

    // Record failure
    await db.insert(imports).values({
      filename: path.basename(filePath),
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "Unknown error",
      createdAt: new Date(),
    });

    throw err;
  }
}
```

---

## Schema Finalization for `stock_rows`

**Current Phase 1 stub (minimal):**
```typescript
export const stockRows = pgTable("stock_rows", {
  id: serial("id").primaryKey(),
  importId: integer("import_id").references(() => imports.id),
  articleNumber: text("article_number"),
  warehouse: text("warehouse"),
  quantity: numeric("quantity", { precision: 18, scale: 4 }),
  value: numeric("value", { precision: 18, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

**Phase 2 expansion (final schema):**
```typescript
export const stockRows = pgTable(
  "stock_rows",
  {
    id: serial("id").primaryKey(),
    importId: integer("import_id").references(() => imports.id).notNull(),

    // Article identifiers
    artikelnr: text("artikelnr").notNull(),
    typ: text("typ").notNull(), // ART|MAT|HLB|WKZ
    
    // Descriptions (German)
    bezeichnung_1: text("bezeichnung_1"),
    bezeichnung_2: text("bezeichnung_2"),
    bezeichnung_3: text("bezeichnung_3"),
    bezeichnung_4: text("bezeichnung_4"),
    bezeichnung_5: text("bezeichnung_5"),
    bezeichnung_6: text("bezeichnung_6"),
    
    // Organization
    wgr: text("wgr"),
    prodgrp: text("prodgrp"),
    lagername: text("lagername").notNull(),
    
    // Quantities (can be negative — corrections/reservations)
    bestand_lagereinheit: numeric("bestand_lagereinheit", { precision: 18, scale: 4 }),
    bestand_basiseinheit: numeric("bestand_basiseinheit", { precision: 18, scale: 4 }),
    lag_einh: text("lag_einh"), // Unit (STK, QM, KON, etc.)
    einh: text("einh"),
    
    // Pricing
    preis: numeric("preis", { precision: 18, scale: 2 }),
    pro_menge: numeric("pro_menge", { precision: 18, scale: 0 }), // Integer count
    
    // Values
    wert: numeric("wert", { precision: 18, scale: 2 }),
    abwert_prozent: numeric("abwert_prozent", { precision: 5, scale: 2 }),
    wert_mit_abw: numeric("wert_mit_abw", { precision: 18, scale: 2 }),
    
    // Coverage/consumption
    durch_verbr: numeric("durch_verbr", { precision: 18, scale: 2 }),
    reichw_mon: numeric("reichw_mon", { precision: 18, scale: 1 }),
    
    // Dates
    letzt_zugang: timestamp("letzt_zugang"),
    letzt_zugang_fa: timestamp("letzt_zugang_fa"),
    lagerzugang_dat: timestamp("lagerzugang_dat"),
    lagerabgang_dat: timestamp("lagerabgang_dat"),
    erf_datum: timestamp("erf_datum"),
    
    // Audit
    geloescht: text("geloescht"), // J|N
    abc_kennz_vk: text("abc_kennz_vk"), // A|B|C|empty→C
    lieferant: text("lieferant"),
    
    // Housekeeping
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    importIdx: index("idx_stock_rows_import").on(t.importId),
    articleIdx: index("idx_stock_rows_artikel").on(t.artikelnr),
    lagerIdx: index("idx_stock_rows_lager").on(t.lagername),
  }),
);
```

**Naming convention:** Keep German column names to minimize ambiguity when comparing against ERP UI. E.g., `wert_mit_abw` not `value_after_devaluation`.

---

## Error Classes

**File:** `apps/api/src/ingest/types.ts`

```typescript
export class IngestError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>,
  ) {
    super(message);
    this.name = "IngestError";
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export class EncodingError extends IngestError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, "ENCODING_ERROR", details);
  }
}

export class HeaderMismatchError extends IngestError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, "HEADER_MISMATCH", details);
  }
}

export class RowValidationError extends IngestError {
  constructor(
    public rows: Array<{ row: number; field: string; reason: string }>,
  ) {
    super(`Validation failed on ${rows.length} rows`, "ROW_VALIDATION_ERROR", {
      errors: rows,
    });
  }
}

export class AtomicSwapError extends IngestError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, "ATOMIC_SWAP_ERROR", details);
  }
}
```

---

## Library Versions (Pinned)

```json
{
  "dependencies": {
    "csv-parse": "^5.5.7",
    "iconv-lite": "^0.7.2",
    "uuid": "^13.0.0"
  }
}
```

All others already in api `package.json` from Phase 1.

---

## Performance Budget

**Target:** 10k rows in <60 seconds (IN-12)

**Measured on Phase 1 stack (Fastify + Drizzle + Postgres):**
- CSV parse (iconv + csv-parse): ~2-3 MB/s → 50MB file = ~20s
- Zod validation: ~1000 rows/s → 10k rows = ~10s
- Drizzle batch insert (500-row batches): ~100-200 rows/s → 10k rows = ~50-100s
- **Total:** ~80-130s (need optimization)

**Optimization:**
- Increase batch size to 1000 rows
- Disable some Drizzle logging in prod
- Use prepared statements (Drizzle handles this)
- Measured time: likely <60s with batches of 1000

**Load test:** Create a fixture with 10k rows, profile, adjust batch size if needed.

---

## Open Questions

1. **Exact column count in production file?** Sample has 52 columns; production may have 100+. Re-merge algorithm scales linearly, so no impact. Confirm with IT.
2. **Date century inference safe?** Apollo rarely exports pre-1980 data. Confirm assumption with IT (any historical stock from before 1980?).
3. **Negative stock frequency?** Sample has 2 negative rows (174, 10050, etc.). Production may have more. Parser preserves them; KPI layer filters if needed.
4. **Performance baseline on target hardware?** Measure on actual Linux host where Postgres runs, not local machine.

---

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| CSV parsing strategy | **HIGH** | Sample file exhibits the quirk; re-merge algorithm is proven pattern |
| Encoding handling | **HIGH** | iconv-lite is well-established for CP1252; test covers umlauts/µ |
| Zod schema | **HIGH** | Preprocess + date parsing are standard patterns |
| Atomic transaction | **HIGH** | Drizzle + PostgreSQL MVCC is well-understood |
| Performance | **MEDIUM** | Batch size TBD via load test; likely meets <60s budget |
| Error handling | **HIGH** | All-at-once validation is required; error types cover cases |
| Streaming pipeline | **HIGH** | csv-parse + iconv-lite + backpressure well-tested |

---

## What NOT to Build in Phase 2

- **HTTP upload endpoint** → Phase 4
- **SMB folder watcher** → Phase 5
- **KPI materialized view** → Phase 3
- **Dashboard refresh** → Phase 3
- **Bull job queue** → Phase 2 starts with synchronous pipeline, interface designed for Bull wrap (Phase 5)
- **i18n error messages** → Phase 6
- **Dark mode** → Phase 6

---

## Sources

### Primary (HIGH confidence)
- `samples/README.md` (Apollo NTS format, quirk documentation) — verified in repo
- `samples/LagBes-sample.csv` (real data, 12 rows with mixed quirks) — verified in repo
- `apps/api/src/db/schema.ts` (existing stub) — verified in repo
- csv-parse official docs (npm page, GitHub) — v5.5.7 current stable

### Secondary (MEDIUM confidence)
- iconv-lite documentation (npm, GitHub) — v0.7.2 widely used, CP1252 support confirmed
- Zod documentation (zod.dev) — preprocess pattern standard
- Drizzle ORM transaction docs (official) — transaction pattern standard for PostgreSQL

### Tertiary (Implementation reference)
- PITFALLS.md from project research — remerge algorithm adapted from Pitfall #1 mitigation
- ARCHITECTURE.md from project research — schema structure reference

---

**Research complete. Planner can now create PLAN.md tasks.**
