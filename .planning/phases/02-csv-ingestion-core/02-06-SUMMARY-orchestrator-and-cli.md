---
phase: 02-csv-ingestion-core
plan: "02-06"
slug: orchestrator-and-cli
subsystem: ingest
tags: [orchestrator, pino, audit-trail, registry, cli, performance, IN-03, IN-09, IN-10, IN-11, IN-12, OBS-01]
dependency_graph:
  requires:
    - "02-04 (parseAndRemergeLagBes, validateAllRows)"
    - "02-05 (createImportRecord, insertStockRowsAtomic, updateImportStatus)"
    - "02-03 (IngestResult, FeedParser, FeedRegistry types)"
  provides:
    - "ingestLagBesFile() — top-level orchestrator function"
    - "feedRegistry Map with 'lagbes' entry + getFeedParser()"
    - "ingest:local dev CLI script"
    - "IN-12 performance verification (10k rows in ~490ms)"
  affects:
    - "Phase 3+ feed registration (registry.ts)"
    - "Phase 4 upload route (calls ingestLagBesFile)"
    - "Phase 5 folder watcher (calls ingestLagBesFile with source='watcher')"
tech_stack:
  added: []
  patterns:
    - "Lazy db resolution via opts.db injection for test isolation"
    - "pino structured JSON logging at each pipeline stage (OBS-01)"
    - "FeedRegistry Map pattern for KPI-10 extensibility"
    - "vi.mock writer + direct db injection for orchestrator unit tests"
key_files:
  created:
    - apps/api/src/ingest/index.ts
    - apps/api/src/ingest/registry.ts
    - apps/api/src/scripts/ingest-local.ts
    - apps/api/src/ingest/__tests__/orchestrator.test.ts
    - apps/api/src/ingest/__tests__/performance.test.ts
  modified:
    - apps/api/package.json
decisions:
  - "Lazy db resolution: ingestLagBesFile accepts opts.db to avoid DATABASE_URL throw at module load time — enables clean unit testing without Vitest module mock hoisting issues"
  - "vi.mock writer only (not db): db injection pattern is cleaner than relying on Vitest ESM mock hoisting for the db singleton in forks pool"
  - "rowCount: 0 on all failure paths to satisfy UpdateImportStatusOptions required field"
  - "Performance test uses UTF-8 synthetic file (cp1252 not needed for throughput test)"
metrics:
  duration: "~11 minutes"
  completed: "2026-04-08"
  tasks: 2
  files: 6
requirements_satisfied: ["IN-03", "IN-12", "OBS-01"]
---

# Phase 2 Plan 06: Orchestrator + Dev CLI + Imports Audit Integration Summary

**One-liner:** Single orchestrator function wiring streaming parser (02-04) + atomic DB writer (02-05) with pino-structured audit trail, FeedRegistry KPI-10 extensibility, dev CLI, and IN-12 10k-row benchmark at ~490ms.

## What Was Built

### `apps/api/src/ingest/index.ts` — Orchestrator

**Exported function:**
```typescript
export async function ingestLagBesFile(
  filePath: string,
  source: 'upload' | 'watcher' | 'cli',
  opts?: { correlationId?: string; db?: IngestDb }
): Promise<IngestResult>
```

**Pipeline (always resolves — never rejects):**
1. Generate `correlationId` (UUID v4 via `randomUUID()` if not provided)
2. Log `ingest_start` (correlationId, filename, source)
3. `createImportRecord(db, { filename, source })` → `importId`
4. `parseAndRemergeLagBes(filePath)` → `rawRows[]`
5. Log `parse_complete` (row count)
6. `validateAllRows(rawRows)` → collect ALL errors (IN-11)
7a. If validation fails: log `validation_failed`, `updateImportStatus(db, importId, { status: 'failed', rowCount: 0, ... })`, return `{ status: 'failed', errors: [...], rowsInserted: 0, ... }`
7b. Log `validation_complete`
8. `insertStockRowsAtomic(db, importId, validRows)` → `{ inserted }`
9. Log `insert_complete`
10. `updateImportStatus(db, importId, { status: 'success', rowCount: inserted, ... })`
11. Log `ingest_end` (status, rows_inserted, durationMs)
12. Return `{ status: 'success', rowsInserted: inserted, errors: [], ... }`

**Catch block:** Catches any thrown error from steps 4-10, logs `ingest_failed`, calls `updateImportStatus({ status: 'failed', rowCount: 0, errorMessage })` best-effort, returns `{ status: 'failed', errors: [{row: 0, field: 'pipeline', ...}] }`.

### `IngestResult` shape

**Success:**
```typescript
{
  status: "success",
  filename: "LagBes-sample.csv",
  rowsInserted: 12,
  errors: [],
  durationMs: 45,
  correlationId: "a3b4c5d6-..."
}
```

**Failure (validation or writer error):**
```typescript
{
  status: "failed",
  filename: "LagBes-sample.csv",
  rowsInserted: 0,
  errors: [{ row: 2, field: "Artikelnr", value: "", reason: "..." }],
  durationMs: 12,
  correlationId: "a3b4c5d6-..."
}
```

### `apps/api/src/ingest/registry.ts` — Feed Registry

**Exports:**
- `feedRegistry: FeedRegistry` — `Map<string, FeedParser>` with `"lagbes"` pre-registered
- `getFeedParser(feedId: string): FeedParser` — typed lookup, throws on unknown feedId

**Usage from Phase 3+:**
```typescript
import { feedRegistry, getFeedParser } from "../ingest/registry.js";

// Look up parser by id
const lagbes = getFeedParser("lagbes");
// lagbes.fileExtensions === [".csv", ".txt"]
// for await (const row of lagbes.parse(filePath)) { ... }

// Register a new feed without modifying existing code (KPI-10)
feedRegistry.set("scrap_rate", scrapRateParser);
```

### `apps/api/src/scripts/ingest-local.ts` — Dev CLI

**Usage:**
```bash
# From monorepo root
DATABASE_URL=postgres://user:pass@localhost:5432/acm_kpi \
  npm -w apps/api run ingest:local -- samples/LagBes-sample.csv

# With absolute path
DATABASE_URL=... npm -w apps/api run ingest:local -- /abs/path/to/LagBes.csv
```

Resolves paths relative to `process.cwd()` so the relative `samples/...` path works from the monorepo root.

Exits 0 on success, 1 on failure. Prints structured JSON IngestResult to stdout. Clear error message if DATABASE_URL is not set (exits 1 before attempting DB connection).

**npm script added to `apps/api/package.json`:**
```json
"ingest:local": "tsx src/scripts/ingest-local.ts"
```

### `apps/api/src/ingest/__tests__/orchestrator.test.ts` — Unit Tests

9 tests, all passing. Uses `vi.mock('../writer.js')` + `opts.db` injection (no live Postgres, no DATABASE_URL required):

| Test | Path |
|------|------|
| returns IngestResult with status=success | Success |
| createImportRecord called with source=cli | Success |
| updateImportStatus called with status=success + rowCount=12 | Success |
| insertStockRowsAtomic called with 12 rows | Success |
| insertStockRowsAtomic throws → status=failed, imports updated | Writer failure |
| filename in result matches basename | Success |
| source=upload flows to createImportRecord | Success |
| correlationId is present in IngestResult | Success |
| durationMs is a non-negative number | Success |

### `apps/api/src/ingest/__tests__/performance.test.ts` — IN-12 Benchmark

Synthetic 10k-row UTF-8 CSV generated in `os.tmpdir()` at test runtime. Every 5th row includes a `Preis` decimal-comma split to exercise the re-merge path. Runs `parseAndRemergeLagBes` + `validateAllRows` (real implementations, no mocks).

**Result: ~490ms for 10,000 rows (IN-12 budget: 60,000ms). 122x headroom.**

## Requirement Coverage

### IN-09: Atomicity — Previous Snapshot Safe

End-to-end guarantee: `ingestLagBesFile` calls `insertStockRowsAtomic(db, importId, validRows)` which wraps all four SQL steps (TRUNCATE staging, batch INSERT staging, TRUNCATE stock_rows, INSERT SELECT from staging) inside a single Drizzle `db.transaction()`. Any throw causes automatic ROLLBACK. The orchestrator's catch block NEVER calls `insertStockRowsAtomic` again after failure — it only calls `updateImportStatus({ status: 'failed' })`. `stock_rows` is untouched on any parser, validation, or DB failure.

### IN-10: Audit Row on Every Attempt

`createImportRecord(db, { filename, source })` is called on line 2 of the try block — BEFORE parsing begins. The `imports` row with `status='running'` is written to the DB before any parsing, validation, or insert. The audit row is updated to `status='success'` or `status='failed'` in ALL code paths (including the outer catch). If `updateImportStatus` itself throws during error recovery, the failure is swallowed and logged (not re-thrown) so the caller always receives a result. Every pipeline invocation has a traceable `imports` row.

### IN-11: All Errors Collected

`validateAllRows(rawRows)` (Plan 02-04) runs `StockRowSchema.safeParse()` on every row and accumulates ALL `ZodError.issues` before returning. The orchestrator receives the full `errors[]` array and includes it in the `IngestResult`. The UI (Phase 4+) can display all errors in one shot rather than requiring the user to fix and retry one row at a time.

### IN-12: Performance — 10k Rows < 60s

Measured: ~490ms for 10,000 rows (parse + validate, re-merge path exercised on ~2,000 rows). 122x headroom against the 60s budget.

### OBS-01: Structured Pino Logs

All log output is JSON to stdout (captured by Docker). Log events emitted at:
- `ingest_start`: `{ correlationId, file, source }`
- `parse_complete`: `{ correlationId, rows }`
- `validation_complete`: `{ correlationId, rows }` (or `validation_failed` with error count + sample)
- `insert_complete`: `{ correlationId, inserted }`
- `ingest_end`: `{ correlationId, status, rows_inserted, durationMs }`
- `ingest_failed`: `{ correlationId, error }` (catch path)

Every log line carries `correlationId`, linking the pipeline run to the `imports.id` audit row.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Vitest ESM mock hoisting does not intercept dynamic imports in forks pool**
- **Found during:** Task 2 GREEN phase — orchestrator tests failed with `DATABASE_URL environment variable is required` even though `vi.mock("../../../db/index.js")` was in place
- **Issue:** Vitest's `vi.mock()` hoisting intercepts static `import` statements. When `index.ts` imports `db` from `../db/index.js`, the real `db/index.ts` module executes (throws on missing DATABASE_URL) before the mock can intercept it. The `forks` pool makes this worse because each test subprocess starts fresh.
- **Fix:** Changed `index.ts` to accept optional `opts.db` (dependency injection). Tests pass `{ db: mockDb }` where `mockDb` is a plain `vi.fn()` object. The `resolveDb()` helper returns `opts.db` if provided, otherwise dynamically imports the real singleton. The orchestrator test only mocks `writer.js` (not `db/index.js`) and passes `mockDb` directly.
- **Files modified:** `apps/api/src/ingest/index.ts`, `apps/api/src/ingest/__tests__/orchestrator.test.ts`
- **Commit:** `86bf04b`

**2. [Rule 1 - Bug] Sample file path was 4 levels up instead of 5**
- **Found during:** Task 2 GREEN phase — tests failed with ENOENT for samples path
- **Issue:** Test at `src/ingest/__tests__/` requires 5 `../` to reach project root, not 4
- **Fix:** Changed `../../../../samples/` to `../../../../../samples/`
- **Files modified:** `apps/api/src/ingest/__tests__/orchestrator.test.ts`
- **Commit:** `86bf04b`

**3. [Rule 2 - Missing functionality] updateImportStatus rowCount required on failure paths**
- **Found during:** Task 2 implementation — plan's code sample called `updateImportStatus` without `rowCount` in the catch block, but `UpdateImportStatusOptions.rowCount: number` is required
- **Fix:** Passed `rowCount: 0` on all failure paths (validation failure + writer catch) to satisfy the interface without modifying writer.ts
- **Files modified:** `apps/api/src/ingest/index.ts`

## Known Stubs

None. All orchestrator paths are fully wired. The `ingest:local` CLI will exit 1 with a clear message when `DATABASE_URL` is not set — this is correct behavior, not a stub.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `apps/api/src/ingest/index.ts` | FOUND |
| `apps/api/src/ingest/registry.ts` | FOUND |
| `apps/api/src/scripts/ingest-local.ts` | FOUND |
| `apps/api/src/ingest/__tests__/orchestrator.test.ts` | FOUND |
| `apps/api/src/ingest/__tests__/performance.test.ts` | FOUND |
| `"ingest:local"` in `apps/api/package.json` | FOUND |
| Commit `26a734d` (RED phase) | FOUND |
| Commit `86bf04b` (GREEN phase) | FOUND |
| All 89 tests pass | VERIFIED |
| No new TypeScript errors (pre-existing ldap/atomicity errors unchanged) | VERIFIED |
| IN-12: 10k rows in ~490ms (< 60,000ms) | VERIFIED |
