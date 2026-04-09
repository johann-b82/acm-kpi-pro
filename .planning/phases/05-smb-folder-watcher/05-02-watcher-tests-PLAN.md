---
phase: 05-smb-folder-watcher
plan: 02
type: tdd
wave: 2
depends_on:
  - "05-01"
files_modified:
  - apps/api/src/watcher/__tests__/stability.test.ts
  - apps/api/src/watcher/__tests__/path-resolver.test.ts
  - apps/api/src/watcher/__tests__/watcher.test.ts
  - packages/core/src/ingest/error.ts
  - packages/core/src/index.ts
autonomous: true
requirements:
  - WAT-01
  - WAT-02
  - WAT-03
  - WAT-04
  - WAT-05
  - IN-08

must_haves:
  truths:
    - "stability check returns false when file size or mtime changes between two stat calls"
    - "stability check returns true when file size and mtime are identical across the stability window"
    - "path-resolver produces correct YYYY-MM-DD subfolder paths for processed/ and failed/"
    - "buildErrorLog classifies errors correctly: validation vs parse vs db vs unknown"
    - "watcher integration test: chokidar add event → ingest called → file moved to processed/"
    - "watcher integration test: failed ingest → file moved to failed/ → .error.json written"
    - "watcher skips files not matching WATCHER_FILE_PATTERN glob"
    - "watcher ignores files inside processed/ and failed/ subfolders"
  artifacts:
    - path: "apps/api/src/watcher/__tests__/stability.test.ts"
      provides: "Unit tests for isSizeAndMtimeStable pure function"
      contains: "isSizeAndMtimeStable"
    - path: "apps/api/src/watcher/__tests__/path-resolver.test.ts"
      provides: "Unit tests for resolveProcessedPath, resolveFailedPath, buildErrorLog"
      contains: "buildErrorLog"
    - path: "apps/api/src/watcher/__tests__/watcher.test.ts"
      provides: "Integration tests with mocked chokidar events and mocked ingestLagBesFile"
      contains: "vi.mock"
    - path: "packages/core/src/ingest/error.ts"
      provides: "WatcherErrorLog type exported from @acm-kpi/core"
      exports: ["WatcherErrorLog"]
  key_links:
    - from: "apps/api/src/watcher/__tests__/watcher.test.ts"
      to: "apps/api/src/watcher/index.ts"
      via: "imports startWatcher, getWatcherStatus"
      pattern: "startWatcher"
    - from: "apps/api/src/watcher/__tests__/watcher.test.ts"
      to: "apps/api/src/ingest/index.ts"
      via: "vi.mock('../ingest/index.js', ...)"
      pattern: "vi.mock.*ingest"
---

<objective>
Add a WatcherErrorLog type to packages/core/src/ingest/error.ts (re-exported from @acm-kpi/core index), then write three test files covering all testable watcher behaviours: stability pure function, path-resolver pure functions, and full watcher lifecycle integration (mocked chokidar + mocked ingestLagBesFile).

Purpose: Confirm the Phase 5 core module (Plan 01) behaves correctly under unit and integration conditions before it is wired into the live server in Plan 03.

Output: Three test files passing under `pnpm --filter @acm-kpi/api vitest run`; WatcherErrorLog type available from @acm-kpi/core.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/05-smb-folder-watcher/05-CONTEXT.md

@apps/api/src/watcher/stability.ts
@apps/api/src/watcher/path-resolver.ts
@apps/api/src/watcher/index.ts
@apps/api/src/ingest/index.ts
@apps/api/src/__tests__/healthz.test.ts
@apps/api/src/ingest/__tests__/orchestrator.test.ts
@packages/core/src/index.ts
</context>

<interfaces>
<!-- Exports from Plan 01 that tests will consume -->

From apps/api/src/watcher/stability.ts:
```typescript
export async function isSizeAndMtimeStable(filePath: string, windowMs: number): Promise<boolean>
```

From apps/api/src/watcher/path-resolver.ts:
```typescript
export function resolveProcessedPath(shareRoot: string, filename: string): string
export function resolveFailedPath(shareRoot: string, filename: string): string
export function resolveFailedErrorPath(shareRoot: string, filename: string): string
export interface WatcherErrorLog {
  timestamp: string; file: string; source: "watcher";
  errorType: "parse" | "validation" | "db" | "unknown";
  message: string;
  rowErrors: Array<{ row: number; field: string; value: unknown; reason: string }>;
}
export function buildErrorLog(filename: string, result: IngestResult): WatcherErrorLog
```

From apps/api/src/watcher/index.ts:
```typescript
export async function startWatcher(config: AppConfig, logger: pino.Logger, db: IngestDb): Promise<FSWatcher | null>
export async function stopWatcher(watcher: FSWatcher): Promise<void>
export function getWatcherStatus(): WatcherStatus
// WatcherStatus: { enabled: boolean, lastIngestionAt: string|null, lastIngestionStatus: "success"|"failed"|null, lastFile: string|null }
```

From apps/api/src/ingest/index.ts:
```typescript
export async function ingestLagBesFile(filePath: string, source: IngestSource, opts?): Promise<IngestResult>
// IngestResult: { status: "success"|"failed"; filename: string; rowsInserted: number; errors: IngestError[]; durationMs: number; correlationId: string }
```
</interfaces>

<feature>
  <name>Watcher module test coverage</name>
  <files>
    apps/api/src/watcher/__tests__/stability.test.ts,
    apps/api/src/watcher/__tests__/path-resolver.test.ts,
    apps/api/src/watcher/__tests__/watcher.test.ts,
    packages/core/src/ingest/error.ts,
    packages/core/src/index.ts
  </files>
  <behavior>

    **stability.test.ts** — mock fs/promises.stat:
    - Test 1: stat returns same size + same mtime twice → isSizeAndMtimeStable returns true
    - Test 2: stat returns same size but different mtime → returns false
    - Test 3: stat returns different size → returns false
    - Test 4: stat throws (file disappeared) → isSizeAndMtimeStable rejects with the fs error

    **path-resolver.test.ts** — pure functions, no mocks needed:
    - Test 1: resolveProcessedPath("/mnt/smb", "LagBes.csv") → contains "/processed/" and "LagBes.csv" and a YYYY-MM-DD pattern
    - Test 2: resolveFailedPath("/mnt/smb", "LagBes.csv") → contains "/failed/" and "LagBes.csv" and a YYYY-MM-DD pattern
    - Test 3: resolveFailedErrorPath("/mnt/smb", "LagBes.csv") → ends with "LagBes.csv.error.json"
    - Test 4: buildErrorLog with validation errors (row>0) → errorType === "validation"
    - Test 5: buildErrorLog with pipeline parse error → errorType === "parse"
    - Test 6: buildErrorLog with db error message → errorType === "db"
    - Test 7: buildErrorLog with unknown error → errorType === "unknown"
    - Test 8: buildErrorLog.source is always "watcher"

    **watcher.test.ts** — mock chokidar + fs + ingestLagBesFile:
    - Uses vitest vi.mock to mock "chokidar", "node:fs/promises", and "../ingest/index.js"
    - Mock chokidar returns an EventEmitter-like object with on(), watch(), close() methods
    - Mock ingestLagBesFile returns a Promise<IngestResult>
    - Mock fs.promises: mkdir, rename, writeFile all resolve

    Test 1 (success path): startWatcher called → chokidar watch() called with usePolling:true → fire "add" event with "LagBes.csv" → ingestLagBesFile called with ("LagBes.csv", "watcher") → fs.rename called with path containing "processed" → getWatcherStatus().lastIngestionStatus === "success"

    Test 2 (failure path): ingestLagBesFile returns {status:"failed",...} → fs.rename called with path containing "failed" → fs.writeFile called with path ending in ".error.json" → getWatcherStatus().lastIngestionStatus === "failed"

    Test 3 (pattern filter): fire "add" event with "SomeOtherFile.csv" (not matching WATCHER_FILE_PATTERN "LagBes*") → ingestLagBesFile NOT called

    Test 4 (WATCHER_ENABLED=false): startWatcher returns null without creating a chokidar instance → getWatcherStatus().enabled === false

    Test 5 (busy-wait): mock db query returns [{id:1}] (running import) → ingestLagBesFile NOT called immediately → after WATCHER_BUSY_WAIT_MAX_RETRIES retries: file moved to failed/ with message "Ingest busy: max retries exceeded"

  </behavior>
  <implementation>
    1. Create packages/core/src/ingest/error.ts: export WatcherErrorLog interface (copy from path-resolver.ts — keep both in sync; path-resolver imports from @acm-kpi/core in a future refactor but for now define in both places to avoid circular deps between apps/api and packages/core).
       Actually: keep WatcherErrorLog defined only in apps/api/src/watcher/path-resolver.ts for now. packages/core/src/ingest/error.ts only adds a minimal re-export if needed by downstream. Check if anything outside apps/api needs it — if not, skip packages/core change and focus on test files.

    2. Write stability.test.ts mocking "node:fs/promises" stat.

    3. Write path-resolver.test.ts — no mocks (pure functions).

    4. Write watcher.test.ts — mock chokidar, fs/promises, and ingest/index.

    Test setup pattern (matches existing vitest setup in the codebase):
    - Use `vi.mock` at top level
    - Use `beforeEach(() => vi.clearAllMocks())`
    - Follow pool:forks + setupFile pattern from vitest.config.ts if present
  </implementation>
</feature>

<verification>
```
cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro" && pnpm --filter @acm-kpi/api vitest run --reporter=verbose 2>&1 | tail -40
```
All watcher tests pass. Existing tests continue to pass.
</verification>

<success_criteria>
- `pnpm --filter @acm-kpi/api vitest run` exits 0
- `grep -rn "isSizeAndMtimeStable" apps/api/src/watcher/__tests__/stability.test.ts` returns at least 4 test case lines
- `grep -rn "resolveProcessedPath\|resolveFailedPath\|buildErrorLog" apps/api/src/watcher/__tests__/path-resolver.test.ts` returns matches for all three
- `grep -rn "vi.mock.*chokidar\|vi.mock.*ingest" apps/api/src/watcher/__tests__/watcher.test.ts` returns both mock declarations
- `grep -n "processed\|failed\|error.json" apps/api/src/watcher/__tests__/watcher.test.ts` returns matches for file movement assertions
- `grep -n "lastIngestionStatus" apps/api/src/watcher/__tests__/watcher.test.ts` returns at least 2 assertions
</success_criteria>

<output>
After completion, create `.planning/phases/05-smb-folder-watcher/05-02-SUMMARY.md`
</output>
