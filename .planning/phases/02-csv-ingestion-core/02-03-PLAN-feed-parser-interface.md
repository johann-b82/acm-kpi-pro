---
phase: 02-csv-ingestion-core
plan: "02-03"
slug: feed-parser-interface
type: execute
wave: 1
depends_on: []
can_run_parallel_with: ["02-02"]
files_modified:
  - packages/core/src/ingest/types.ts
  - packages/core/src/index.ts
autonomous: true
requirements:
  - KPI-10

must_haves:
  truths:
    - "FeedParser interface is importable from @acm-kpi/core"
    - "ParsedRow, IngestResult, IngestError types are exported from @acm-kpi/core"
    - "A feedRegistry Map type is exported so Phase 3+ can register feeds without modifying existing code"
    - "The interface has no runtime dependencies — pure TypeScript types only"
    - "packages/core builds cleanly with no TypeScript errors"
  artifacts:
    - path: packages/core/src/ingest/types.ts
      provides: "FeedParser interface, ParsedRow, IngestResult, IngestError, FeedRegistry"
      contains: "FeedParser"
    - path: packages/core/src/index.ts
      provides: "Re-exports all ingest types alongside existing auth types"
      contains: "ingest/types"
  key_links:
    - from: packages/core/src/ingest/types.ts
      to: apps/api/src/ingest/registry.ts
      via: "import { FeedParser, FeedRegistry } from '@acm-kpi/core'"
      pattern: "FeedParser"
---

<objective>
Create the `FeedParser` interface and companion types in `packages/core/src/ingest/types.ts`
so future feeds (scrap rate, Phase 3+) can be registered without modifying existing
ingestion or dashboard code. This is pure TypeScript — zero runtime logic.

Purpose: KPI-10 extensibility requirement. The interface contracts what a feed must expose
so Phase 3's KPI layer can call `registry.get('lagbes').parse(file)` uniformly.

Output: `packages/core/src/ingest/types.ts`, updated `packages/core/src/index.ts`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/02-csv-ingestion-core/01-RESEARCH.md
@packages/core/src/types/auth.ts
@packages/core/src/index.ts

<interfaces>
<!-- Style reference — auth.ts pattern to follow for new ingest types: -->
```typescript
// auth.ts style: JSDoc comments on every interface member,
// no runtime imports (pure types), exported as named exports.

export type Role = "Viewer" | "Admin";
export interface AuthUser { ... }
export interface AuthProvider { ... }
```

<!-- packages/core/src/index.ts currently exports: -->
```typescript
// Check what it currently re-exports and ADD ingest types alongside.
// Do NOT remove any existing exports.
```

<!-- packages/core/package.json has NO runtime deps — keep it that way.
     zod is NOT a dep of @acm-kpi/core. Use `unknown` for schema type
     rather than importing Zod in the interface. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create packages/core/src/ingest/types.ts with FeedParser interface</name>
  <files>packages/core/src/ingest/types.ts</files>
  <behavior>
    - `FeedParser` interface is exported and has: `id: string`, `name: string`,
      `tableName: string`, `fileExtensions: string[]`,
      `parse(filePath: string): AsyncIterable<unknown>`,
      optional `insert?(db: unknown, importId: number, rows: unknown[]): Promise<void>`.
    - `ParsedRow` is exported as a record type with at least `artikelnr: string`.
    - `IngestError` is exported with `row: number`, `field: string`, `value: unknown`,
      `reason: string`.
    - `ValidationResult` is exported with `valid: boolean`, `rows?: unknown[]`,
      `errors?: IngestError[]`.
    - `IngestResult` is exported with `status: 'success' | 'failed'`, `filename: string`,
      `rowsInserted: number`, `errors: IngestError[]`, `durationMs: number`.
    - `FeedRegistry` is exported as `Map<string, FeedParser>`.
    - File has NO imports from zod, drizzle, or any node module — pure types only.
    - `packages/core` builds: `npm -w packages/core run build` exits 0.
  </behavior>
  <action>
    Create the directory `packages/core/src/ingest/` and write `types.ts`:

    ```typescript
    /**
     * Feed parser interface and companion types for the ingest subsystem.
     * Implements KPI-10 extensibility: adding a new feed means registering a
     * new FeedParser without touching existing ingestion or dashboard code.
     *
     * This file is pure TypeScript — no runtime imports.
     */

    /**
     * A single parsed data row from a feed file.
     * Concrete feeds (LagBes, scrap rate, ...) extend this with their own fields.
     */
    export interface ParsedRow {
      /** Primary identifier for this row (e.g. article number) */
      [key: string]: unknown;
    }

    /**
     * A validation error for a single field in a single row.
     */
    export interface IngestError {
      /** 1-based row number in the source file (header = row 1, data from row 2) */
      row: number;
      /** Column name that failed validation */
      field: string;
      /** Raw value that failed */
      value: unknown;
      /** Human-readable reason (shown to admin in error summary) */
      reason: string;
    }

    /**
     * Result of validating a batch of parsed rows.
     */
    export interface ValidationResult {
      valid: boolean;
      /** Populated when valid === true */
      rows?: ParsedRow[];
      /** Populated when valid === false — all errors collected (IN-11) */
      errors?: IngestError[];
    }

    /**
     * Summary returned by the orchestrator after a full ingest run.
     */
    export interface IngestResult {
      /** 'success' | 'failed' */
      status: "success" | "failed";
      /** Original filename */
      filename: string;
      /** Rows committed to the live table */
      rowsInserted: number;
      /** All validation errors (empty on success) */
      errors: IngestError[];
      /** Wall-clock milliseconds for the full pipeline */
      durationMs: number;
      /** UUID correlation ID linking this result to the imports audit row */
      correlationId: string;
    }

    /**
     * Feed parser interface — the contract every feed must satisfy.
     * Implement this interface to add a new data feed (e.g. scrap rate)
     * without modifying existing ingestion code (KPI-10).
     */
    export interface FeedParser {
      /**
       * Unique machine identifier for this feed (e.g. "lagbes", "scrap_rate").
       * Used as the key in FeedRegistry.
       */
      id: string;

      /**
       * Human-readable feed name (e.g. "LagBes (Warehouse Stock)").
       */
      name: string;

      /**
       * Target Postgres table name this feed populates (e.g. "stock_rows").
       */
      tableName: string;

      /**
       * Accepted file extensions (e.g. [".csv", ".txt"]) — IN-07.
       */
      fileExtensions: string[];

      /**
       * Parse a feed file into an async iterable of raw parsed rows.
       * Implementations must handle encoding, delimiter quirks, and decimal-comma
       * re-merging internally. Each yielded value is a record ready for Zod validation.
       *
       * @param filePath Absolute path to the file.
       */
      parse(filePath: string): AsyncIterable<unknown>;

      /**
       * Optional custom insertion logic.
       * If omitted, the orchestrator uses a generic batch INSERT.
       * Implement when the feed needs special staging or atomic swap logic.
       *
       * @param db  Drizzle client (typed as unknown to keep core dep-free)
       * @param importId  The imports.id for audit linkage
       * @param rows  Validated rows ready to persist
       */
      insert?(db: unknown, importId: number, rows: unknown[]): Promise<void>;
    }

    /**
     * Registry of all registered feed parsers.
     * Phase 2 registers "lagbes". Phase 3+ adds more without editing existing code.
     *
     * Usage:
     *   import { FeedRegistry } from "@acm-kpi/core";
     *   const registry: FeedRegistry = new Map();
     *   registry.set("lagbes", lagbesParser);
     */
    export type FeedRegistry = Map<string, FeedParser>;
    ```

    NOTE: `packages/core/package.json` has NO runtime deps — keep `types.ts` import-free.
    Do NOT import from `zod`, `drizzle-orm`, or any node built-in.
  </action>
  <verify>
    <automated>npm -w packages/core run build 2>&1 | tail -5 && echo "CORE BUILD OK"</automated>
  </verify>
  <done>
    `packages/core/src/ingest/types.ts` exists and exports `FeedParser`, `ParsedRow`,
    `IngestError`, `ValidationResult`, `IngestResult`, `FeedRegistry`.
    `npm -w packages/core run build` exits 0.
  </done>
</task>

<task type="auto">
  <name>Task 2: Re-export ingest types from packages/core/src/index.ts</name>
  <files>packages/core/src/index.ts</files>
  <action>
    Read the current `packages/core/src/index.ts`. Add a re-export for the ingest types
    alongside existing exports. Do NOT remove any existing exports.

    Add the line:
    ```typescript
    export * from "./ingest/types.js";
    ```

    Place it below any existing `export *` lines (alphabetical order by path is fine).

    Then rebuild:
    ```bash
    npm -w packages/core run build
    ```

    Verify the exported symbol is reachable:
    ```bash
    node -e "
      import('/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/packages/core/dist/index.js')
        .then(m => { if (!m.FeedParser) throw new Error('FeedParser not exported'); console.log('OK'); })
    "
    ```
    (The above checks the compiled output. `FeedParser` is an interface, so it won't be
    present as a runtime value — check for a non-throw instead, or simply verify tsc emits
    no errors and the `.d.ts` contains `FeedParser`.)

    Correct check:
    ```bash
    grep "FeedParser" \
      "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/packages/core/dist/index.d.ts" \
      && echo "OK"
    ```
  </action>
  <verify>
    <automated>npm -w packages/core run build 2>&1 | tail -3 && grep "FeedParser" "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/packages/core/dist/index.d.ts" && echo "EXPORT OK"</automated>
  </verify>
  <done>
    `packages/core/dist/index.d.ts` contains `FeedParser` (and `IngestResult`, `ParsedRow`,
    etc.). `npm -w packages/core run build` exits 0.
  </done>
</task>

</tasks>

<verification>
```bash
# Core package builds
npm -w packages/core run build

# FeedParser visible in compiled declaration
grep "FeedParser" \
  "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/packages/core/dist/index.d.ts"

# All ingest types exported
grep -E "IngestError|IngestResult|ValidationResult|FeedRegistry|ParsedRow" \
  "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/packages/core/dist/index.d.ts"
```
</verification>

<success_criteria>
- `packages/core/src/ingest/types.ts` exists with all six type exports.
- `packages/core/src/index.ts` re-exports `./ingest/types.js`.
- `npm -w packages/core run build` exits 0.
- `packages/core/dist/index.d.ts` contains `FeedParser` declaration.
- No runtime imports in `types.ts` (pure TypeScript types).
</success_criteria>

<output>
After completion, create `.planning/phases/02-csv-ingestion-core/02-03-SUMMARY.md`
</output>
