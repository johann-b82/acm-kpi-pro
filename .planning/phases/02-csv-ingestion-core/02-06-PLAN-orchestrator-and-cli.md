---
phase: 02-csv-ingestion-core
plan: "02-06"
slug: orchestrator-and-cli
type: execute
wave: 3
depends_on: ["02-04", "02-05"]
can_run_parallel_with: []
files_modified:
  - apps/api/src/ingest/index.ts
  - apps/api/src/ingest/registry.ts
  - apps/api/src/scripts/ingest-local.ts
  - apps/api/package.json
  - apps/api/src/ingest/__tests__/orchestrator.test.ts
  - apps/api/src/ingest/__tests__/performance.test.ts
autonomous: true
requirements:
  - IN-03
  - IN-12
  - OBS-01

must_haves:
  truths:
    - "npm -w apps/api run ingest:local -- samples/LagBes-sample.csv exits 0 and logs INGEST_END {status:'success', rows_inserted:12}"
    - "imports audit table row is recorded as 'running' at start and updated to 'success'/'failed' at end"
    - "pino structured JSON is emitted to stdout at each pipeline stage (ingest_start, parse_complete, validation_complete, insert_complete, ingest_end)"
    - "a failed parse (invalid file) sets import status='failed' with errorMessage and does NOT corrupt stock_rows"
    - "the FeedParser registry maps 'lagbes' to the LagBes ingest pipeline"
    - "10,000 synthetic rows complete the parse+validate path in under 60 seconds (IN-12)"
  artifacts:
    - path: apps/api/src/ingest/index.ts
      provides: "ingestLagBesFile() — top-level orchestrator function"
      exports: ["ingestLagBesFile"]
    - path: apps/api/src/ingest/registry.ts
      provides: "feedRegistry Map with 'lagbes' entry, getFeedParser() lookup"
      exports: ["feedRegistry", "getFeedParser"]
    - path: apps/api/src/scripts/ingest-local.ts
      provides: "Dev CLI entry point, reads argv[2], calls ingestLagBesFile()"
    - path: apps/api/src/ingest/__tests__/performance.test.ts
      provides: "10k-row synthetic fixture test, asserts elapsed < 60,000 ms (IN-12)"
  key_links:
    - from: apps/api/src/ingest/index.ts
      to: apps/api/src/ingest/parser.ts
      via: "calls parseAndRemergeLagBes(filePath)"
      pattern: "parseAndRemergeLagBes"
    - from: apps/api/src/ingest/index.ts
      to: apps/api/src/ingest/validator.ts
      via: "calls validateAllRows(parsedRows)"
      pattern: "validateAllRows"
    - from: apps/api/src/ingest/index.ts
      to: apps/api/src/ingest/writer.ts
      via: "calls createImportRecord(), insertStockRowsAtomic(), updateImportStatus()"
      pattern: "insertStockRowsAtomic"
    - from: apps/api/src/ingest/index.ts
      to: apps/api/src/db/index.ts
      via: "imports db singleton (mocked in tests)"
      pattern: "import.*db.*from.*db/index"
    - from: apps/api/src/scripts/ingest-local.ts
      to: apps/api/src/ingest/index.ts
      via: "import { ingestLagBesFile } from '../ingest/index.js'"
      pattern: "ingestLagBesFile"
---

<objective>
Wire the parser (02-04) and writer (02-05) into a single orchestrator function
`ingestLagBesFile()`. Add pino structured logging at each pipeline stage (OBS-01). Create
the `ingest:local` dev CLI script. Register the LagBes parser in the FeedParser registry
from `@acm-kpi/core`. Validate IN-12 (10k rows < 60s) with a synthetic performance test.

Purpose: This is the final assembly step. After this plan, the phase exit criteria are
fully verifiable with `npm -w apps/api run ingest:local -- samples/LagBes-sample.csv`.

Output: `index.ts`, `registry.ts`, `ingest-local.ts`, `orchestrator.test.ts`,
`performance.test.ts`, `ingest:local` script in `apps/api/package.json`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/02-csv-ingestion-core/01-RESEARCH.md
@apps/api/src/db/schema.ts
@apps/api/src/db/index.ts
@apps/api/package.json

<interfaces>
<!-- From 02-04 parser.ts: -->
```typescript
export async function parseAndRemergeLagBes(
  filePath: string
): Promise<Record<string, string>[]>
```

<!-- From 02-04 validator.ts: -->
```typescript
import type { ValidationResult } from "@acm-kpi/core";

export async function validateAllRows(
  rows: Record<string, string>[]
): Promise<ValidationResult>
```

<!-- From 02-05 writer.ts: -->
```typescript
export async function createImportRecord(
  db: DB,
  opts: { filename: string; source: "upload" | "watcher" | "cli" }
): Promise<number>  // returns imports.id

export async function insertStockRowsAtomic(
  db: DB,
  importId: number,
  rows: StockRow[]
): Promise<{ inserted: number }>

export async function updateImportStatus(
  db: DB,
  importId: number,
  opts: {
    status: "success" | "failed";
    rowCount?: number;
    finishedAt: Date;
    errorMessage?: string;
  }
): Promise<void>
```

<!-- From @acm-kpi/core (02-03): -->
```typescript
export interface FeedParser { id, name, tableName, fileExtensions, parse(), insert?() }
export type FeedRegistry = Map<string, FeedParser>
export interface IngestResult {
  status: "success" | "failed";
  filename: string;
  rowsInserted: number;
  errors: IngestError[];
  durationMs: number;
  correlationId: string;
}
```

<!-- pino logger (already in apps/api from Phase 1): -->
```typescript
import pino from "pino";
const logger = pino({ name: "ingest" });
// Structured log: logger.info({ correlationId, file, rows }, "ingest_start")
// All pino output is JSON to stdout — Docker captures + OBS-01
```

<!-- uuid for correlation IDs: -->
```typescript
import { randomUUID } from "crypto";  // Node built-in, no uuid package needed for this
// OR if uuid ^13.0.0 is installed:
// import { v4 as uuidv4 } from "uuid";
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write orchestrator.test.ts and performance.test.ts (RED phase)</name>
  <files>
    apps/api/src/ingest/__tests__/orchestrator.test.ts
    apps/api/src/ingest/__tests__/performance.test.ts
  </files>
  <behavior>
    Both test files exist but fail with module-not-found for `../index.js` until Task 2
    creates `index.ts`. After Task 2, all tests pass.
  </behavior>
  <action>
    Create `orchestrator.test.ts`:

    ```typescript
    import { describe, test, expect, vi, beforeEach } from "vitest";
    import { resolve } from "path";

    // Mock DB (no live Postgres)
    vi.mock("../../../db/index.js", () => ({
      db: { transaction: vi.fn(), insert: vi.fn(), update: vi.fn() },
    }));

    // Mock writer to intercept DB calls
    vi.mock("../writer.js", () => ({
      createImportRecord: vi.fn().mockResolvedValue(99),
      insertStockRowsAtomic: vi.fn().mockResolvedValue({ inserted: 12 }),
      updateImportStatus: vi.fn().mockResolvedValue(undefined),
    }));

    import { ingestLagBesFile } from "../index.js";
    import {
      createImportRecord,
      insertStockRowsAtomic,
      updateImportStatus,
    } from "../writer.js";

    const SAMPLE = resolve(
      new URL(".", import.meta.url).pathname,
      "../../../../samples/LagBes-sample.csv"
    );

    describe("ingestLagBesFile — orchestrator integration", () => {
      beforeEach(() => vi.clearAllMocks());

      test("success path: returns IngestResult with status=success", async () => {
        const result = await ingestLagBesFile(SAMPLE, "cli");

        expect(result.status).toBe("success");
        expect(result.rowsInserted).toBe(12);
        expect(result.errors).toHaveLength(0);
        expect(result.durationMs).toBeGreaterThan(0);
        expect(result.correlationId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      });

      test("success path: createImportRecord called with source=cli", async () => {
        await ingestLagBesFile(SAMPLE, "cli");
        expect(createImportRecord).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ source: "cli" })
        );
      });

      test("success path: updateImportStatus called with status=success", async () => {
        await ingestLagBesFile(SAMPLE, "cli");
        expect(updateImportStatus).toHaveBeenCalledWith(
          expect.anything(),
          99, // importId from createImportRecord mock
          expect.objectContaining({ status: "success", rowCount: 12 })
        );
      });

      test("success path: insertStockRowsAtomic called with 12 rows", async () => {
        await ingestLagBesFile(SAMPLE, "cli");
        const [, importId, rows] = vi.mocked(insertStockRowsAtomic).mock.calls[0];
        expect(importId).toBe(99);
        expect((rows as unknown[]).length).toBe(12);
      });

      test("failure path: insertStockRowsAtomic throws → status=failed, imports updated", async () => {
        vi.mocked(insertStockRowsAtomic).mockRejectedValueOnce(
          new Error("Simulated DB failure")
        );

        const result = await ingestLagBesFile(SAMPLE, "cli");

        expect(result.status).toBe("failed");
        expect(updateImportStatus).toHaveBeenCalledWith(
          expect.anything(),
          99,
          expect.objectContaining({
            status: "failed",
            errorMessage: expect.stringContaining("DB failure"),
          })
        );
      });

      test("success path: filename in result matches basename", async () => {
        const result = await ingestLagBesFile(SAMPLE, "cli");
        expect(result.filename).toBe("LagBes-sample.csv");
      });
    });
    ```

    Create `performance.test.ts`:

    ```typescript
    import { describe, test, expect, vi } from "vitest";
    import { writeFileSync, unlinkSync } from "fs";
    import { tmpdir } from "os";
    import { join } from "path";
    import { parseAndRemergeLagBes } from "../parser.js";
    import { validateAllRows } from "../validator.js";

    /**
     * IN-12: Ingestion pipeline must handle 10k rows in under 60 seconds.
     * This test exercises the CPU-bound paths (parse + validate) with a synthetic
     * 10k-row LagBes-format CSV file. The DB insert path is mocked separately in
     * atomicity.test.ts.
     *
     * No Docker required — pure streaming + Zod validation, no live DB.
     */
    describe("Performance — 10k rows (IN-12)", () => {
      test(
        "parse + validate 10000 rows in under 60 seconds",
        async () => {
          // Generate synthetic 10k-row LagBes CSV
          const header =
            "Artikelnr;Typ;Bezeichnung 1;Bezeichnung 2;Bezeichnung 3;Bezeichnung 4;Bezeichnung 5;Bezeichnung 6;WGR;ProdGrp;Wareneingangsko;Bestandskonto;Lagername;Bestand (Lagereinheit);Lag Einh;Bestand (Basiseinheit);Einh;Preis;pro Menge;Wert;Abwert%;Wert mit Abw.;Durch.Verbr;Reichw.Mon.;letzt.Zugang;letzt.Zugang FA;Stammlager;Stammstellplatz;Umsatz Me J;Umsatz Me VJ;Lieferant;Lagerb (D);Auftrag M;Reserv. M;Bestell M;FA Menge;Bedarf M;ø Verbrauch / M;l. EK am;Produktgruppe;stm.uni_a01;Lagerzugang Dat;Lagerabgang Dat;Lagerabgang letzes Jahr;Lagerabgang letzes 1/2 Jahr;Lagerzugang letzes 1/2 Jahr;Gelöscht;Erf.-Datum;Eingrenzung von Lager;Eingrenzung bis Lager;Inventurgruppe;ABC-Kennz. VK";

          // One representative row with decimal commas (realistic format)
          const dataRow = (i: number) =>
            `${i};ART;Article ${i};;;;;;;DIV;;5400;0;HAUPTLAGER NEU;${Math.floor(Math.random() * 1000)};STK;${Math.floor(Math.random() * 1000)};STK;${Math.floor(Math.random() * 999)};${Math.floor(Math.random() * 999)};1;${Math.floor(Math.random() * 9999)};${Math.floor(Math.random() * 99)};0;${Math.floor(Math.random() * 9999)};${Math.floor(Math.random() * 99)};0;0;;01.01.25;HAUPTLAGER NEU;ROW1;0;0;0;0;0;0;0;0;0;0;;PERF;;;0;0;0;N;01.01.20;;;;C`;

          const rows = [header, ...Array.from({ length: 10_000 }, (_, i) => dataRow(i + 1))].join("\n");

          // Write to temp file (must be a real file for createReadStream)
          const tmpFile = join(tmpdir(), `lagbes-perf-test-${Date.now()}.csv`);
          // Write as UTF-8 (our parser handles both; performance test doesn't need cp1252)
          writeFileSync(tmpFile, rows, "utf-8");

          const start = Date.now();

          try {
            const parsedRows = await parseAndRemergeLagBes(tmpFile);
            const validationResult = await validateAllRows(parsedRows);
            const elapsed = Date.now() - start;

            expect(parsedRows.length).toBe(10_000);
            // Accept some validation failures from synthetic data (random numbers may fail
            // specific constraints), but the pipeline must COMPLETE in time.
            expect(elapsed).toBeLessThan(60_000);

            console.log(`[performance] parse+validate 10k rows: ${elapsed}ms`);
          } finally {
            unlinkSync(tmpFile);
          }
        },
        65_000 // Vitest timeout: 65 seconds (5s buffer above budget)
      );
    });
    ```
  </action>
  <verify>
    <automated>npm -w apps/api test -- --reporter=verbose orchestrator 2>&1 | grep -E "Cannot find module|orchestrator" | head -5 && echo "RED phase — ../index.js missing (expected)"</automated>
  </verify>
  <done>
    `orchestrator.test.ts` and `performance.test.ts` exist. Test run shows
    module-not-found for `../index.js` (correct RED state).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement index.ts, registry.ts, ingest-local.ts + add ingest:local script (GREEN phase)</name>
  <files>
    apps/api/src/ingest/index.ts
    apps/api/src/ingest/registry.ts
    apps/api/src/scripts/ingest-local.ts
    apps/api/package.json
  </files>
  <behavior>
    After this task:
    - `npm -w apps/api test -- orchestrator` passes all tests.
    - `npm -w apps/api test -- performance` passes (10k rows < 60s).
    - `npm -w apps/api run ingest:local -- samples/LagBes-sample.csv` exits 0 when
      DATABASE_URL is set (or exits 1 with a clear error if not set).
  </behavior>
  <action>
    --- apps/api/src/ingest/index.ts ---
    Main orchestrator. Wires parser → validator → writer with pino logging.

    ```typescript
    import pino from "pino";
    import { basename } from "path";
    import { randomUUID } from "crypto";
    import type { IngestResult } from "@acm-kpi/core";
    import { parseAndRemergeLagBes } from "./parser.js";
    import { validateAllRows } from "./validator.js";
    import { createImportRecord, insertStockRowsAtomic, updateImportStatus } from "./writer.js";
    import { db } from "../db/index.js";

    const logger = pino({ name: "ingest" });

    export type IngestSource = "upload" | "watcher" | "cli";

    /**
     * Top-level ingestion orchestrator.
     *
     * Pipeline:
     *   1. Create imports audit row (status=running)
     *   2. Parse file (Windows-1252 decode → csv-parse → decimal-comma re-merge)
     *   3. Validate all rows via Zod (fail-on-all — IN-11)
     *   4. Atomic swap into stock_rows (IN-09)
     *   5. Update imports audit row (status=success/failed)
     *
     * On any failure, the imports row is updated to status=failed with errorMessage.
     * stock_rows is untouched on failure (guaranteed by Drizzle transaction).
     *
     * @param filePath  Absolute path to the LagBes CSV/TXT file.
     * @param source    Origin of the import: 'upload' (Phase 4), 'watcher' (Phase 5), 'cli'.
     */
    export async function ingestLagBesFile(
      filePath: string,
      source: IngestSource
    ): Promise<IngestResult> {
      const correlationId = randomUUID();
      const filename = basename(filePath);
      const startTime = Date.now();

      logger.info({ correlationId, file: filename, source }, "ingest_start");

      // Step 1: Create audit record
      const importId = await createImportRecord(db, { filename, source });

      try {
        // Step 2: Parse
        const rawRows = await parseAndRemergeLagBes(filePath);
        logger.info({ correlationId, rows: rawRows.length }, "parse_complete");

        // Step 3: Validate (collect all errors — IN-11)
        const validation = await validateAllRows(rawRows);
        if (!validation.valid) {
          const errorSummary = validation.errors!
            .slice(0, 20) // Cap log size; full list in imports.error_message
            .map(e => `row ${e.row} [${e.field}]: ${e.reason}`)
            .join("; ");

          logger.error(
            { correlationId, errorCount: validation.errors!.length, sample: errorSummary },
            "validation_failed"
          );

          await updateImportStatus(db, importId, {
            status: "failed",
            rowCount: rawRows.length,
            finishedAt: new Date(),
            errorMessage: `Validation failed on ${validation.errors!.length} row(s): ${errorSummary}`,
          });

          return {
            status: "failed",
            filename,
            rowsInserted: 0,
            errors: validation.errors!,
            durationMs: Date.now() - startTime,
            correlationId,
          };
        }
        logger.info({ correlationId, rows: validation.rows!.length }, "validation_complete");

        // Step 4: Atomic swap
        const { inserted } = await insertStockRowsAtomic(db, importId, validation.rows!);
        logger.info({ correlationId, inserted }, "insert_complete");

        // Step 5: Mark success
        await updateImportStatus(db, importId, {
          status: "success",
          rowCount: inserted,
          finishedAt: new Date(),
        });

        const durationMs = Date.now() - startTime;
        logger.info({ correlationId, status: "success", rows_inserted: inserted, durationMs }, "ingest_end");

        return {
          status: "success",
          filename,
          rowsInserted: inserted,
          errors: [],
          durationMs,
          correlationId,
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error({ correlationId, error: errorMessage }, "ingest_failed");

        // Update audit row — best effort (don't throw if this also fails)
        await updateImportStatus(db, importId, {
          status: "failed",
          finishedAt: new Date(),
          errorMessage,
        }).catch((updateErr) => {
          logger.error({ correlationId, updateErr }, "failed_to_update_import_status");
        });

        return {
          status: "failed",
          filename,
          rowsInserted: 0,
          errors: [{ row: 0, field: "pipeline", value: null, reason: errorMessage }],
          durationMs: Date.now() - startTime,
          correlationId,
        };
      }
    }
    ```

    --- apps/api/src/ingest/registry.ts ---
    Feed registry — maps feed IDs to FeedParser implementations (KPI-10).

    ```typescript
    import type { FeedParser, FeedRegistry } from "@acm-kpi/core";
    import { StockRowSchema } from "./schema.js";
    import { parseAndRemergeLagBes } from "./parser.js";

    const lagbesParser: FeedParser = {
      id: "lagbes",
      name: "LagBes (Warehouse Stock / Apollo NTS)",
      tableName: "stock_rows",
      fileExtensions: [".csv", ".txt"], // IN-07

      async *parse(filePath: string) {
        const rows = await parseAndRemergeLagBes(filePath);
        for (const row of rows) {
          yield row;
        }
      },

      // insert() not overridden here — orchestrator uses the atomic swap logic.
      // Phase 5+ can override this for feeds that need different persistence patterns.
    };

    /**
     * Global feed registry.
     * Phase 3+: add entries to this map without modifying existing code (KPI-10).
     *
     * Example (Phase 5):
     *   import { scrapRateParser } from "../feeds/scrap-rate/parser.js";
     *   feedRegistry.set("scrap_rate", scrapRateParser);
     */
    export const feedRegistry: FeedRegistry = new Map([
      ["lagbes", lagbesParser],
    ]);

    /**
     * Look up a registered feed parser by ID.
     * @throws Error if feedId is not registered.
     */
    export function getFeedParser(feedId: string): FeedParser {
      const parser = feedRegistry.get(feedId);
      if (!parser) {
        throw new Error(
          `Unknown feed: "${feedId}". Registered feeds: ${[...feedRegistry.keys()].join(", ")}`
        );
      }
      return parser;
    }
    ```

    --- apps/api/src/scripts/ingest-local.ts ---
    Dev CLI. Accepts file path as argv[2].

    ```typescript
    #!/usr/bin/env tsx
    /**
     * Dev CLI for local LagBes CSV ingestion.
     *
     * Usage:
     *   npm -w apps/api run ingest:local -- samples/LagBes-sample.csv
     *   npm -w apps/api run ingest:local -- /abs/path/to/LagBes.csv
     *
     * Requires DATABASE_URL env var.
     * No HTTP endpoint — direct DB connection only.
     */
    import { resolve } from "path";
    import pino from "pino";
    import { ingestLagBesFile } from "../ingest/index.js";

    const logger = pino({ name: "ingest-local" });

    async function main(): Promise<void> {
      const rawPath = process.argv[2];

      if (!rawPath) {
        logger.error("Usage: ingest:local <path-to-csv>");
        process.exit(1);
      }

      // Resolve relative to CWD (allows `npm run ingest:local -- samples/LagBes-sample.csv`
      // from monorepo root)
      const filePath = resolve(process.cwd(), rawPath);

      logger.info({ filePath }, "starting local ingest");

      const result = await ingestLagBesFile(filePath, "cli");

      if (result.status === "success") {
        logger.info(result, "ingest:local complete");
        process.exit(0);
      } else {
        logger.error(result, "ingest:local failed");
        process.exit(1);
      }
    }

    main().catch((err) => {
      console.error("Fatal:", err);
      process.exit(1);
    });
    ```

    --- apps/api/package.json ---
    Add the `ingest:local` script. Open the file, find the `"scripts"` block, add:
    ```json
    "ingest:local": "tsx src/scripts/ingest-local.ts"
    ```
    Alongside the existing `dev`, `build`, `test`, `db:*` scripts.
  </action>
  <verify>
    <automated>npm -w apps/api test -- --reporter=verbose orchestrator 2>&1 | tail -25</automated>
  </verify>
  <done>
    - `npm -w apps/api test -- orchestrator` exits 0, all orchestrator tests pass.
    - `npm -w apps/api test -- performance` exits 0 (10k rows parsed+validated in < 60s).
    - `grep "ingest:local" "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/package.json"` matches.
    - `npm -w apps/api run build` exits 0.
    - `apps/api/src/ingest/registry.ts` exports `feedRegistry` with "lagbes" key.
  </done>
</task>

</tasks>

<verification>
```bash
# Orchestrator tests (no Docker)
npm -w apps/api test -- --reporter=verbose orchestrator

# Performance test (no Docker, 65s timeout)
npm -w apps/api test -- --reporter=verbose performance

# Full Phase 2 test suite
npm -w apps/api test

# Script is registered
grep "ingest:local" \
  "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/package.json"

# CLI smoke test (requires live DATABASE_URL)
# DATABASE_URL=postgres://... npm -w apps/api run ingest:local -- samples/LagBes-sample.csv

# Build
npm -w apps/api run build
```
</verification>

<success_criteria>
- `npm -w apps/api test` (full suite) exits 0 — all ingest tests pass including
  parser, encoding, schema, validator, atomicity, orchestrator, performance.
- `apps/api/package.json` contains `"ingest:local": "tsx src/scripts/ingest-local.ts"`.
- `ingestLagBesFile` exported from `apps/api/src/ingest/index.ts`.
- `feedRegistry.get('lagbes')` returns a valid `FeedParser` (tested in orchestrator.test.ts).
- Performance test asserts 10k rows parse+validate in < 60s.
- Failure path test asserts: DB throw → result.status === 'failed' + imports row updated.
- pino structured JSON emitted to stdout at ingest_start, parse_complete,
  validation_complete, insert_complete, ingest_end stages.
- `npm -w apps/api run build` exits 0.
</success_criteria>

<output>
After completion, create `.planning/phases/02-csv-ingestion-core/02-06-SUMMARY.md`
</output>
