---
phase: 05-smb-folder-watcher
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/api/package.json
  - apps/api/src/config.ts
  - apps/api/src/watcher/index.ts
  - apps/api/src/watcher/stability.ts
  - apps/api/src/watcher/path-resolver.ts
autonomous: true
requirements:
  - WAT-01
  - WAT-02
  - WAT-03
  - WAT-04
  - WAT-05
  - WAT-07
  - IN-08

must_haves:
  truths:
    - "Watcher detects new LagBes* files in a mounted directory within the configured poll interval"
    - "Files are not ingested until size+mtime are stable for ≥1 second (no partial-write ingestion)"
    - "After successful ingest, file is moved to processed/YYYY-MM-DD/ subfolder"
    - "After failed ingest, file is moved to failed/YYYY-MM-DD/ with adjacent .error.json sidecar"
    - "Watcher configuration (share path, poll interval, pattern, stability window) is read from env vars"
    - "processed/** and failed/** are never re-watched"
    - "Files present in the watched root at watcher startup are ingested (not skipped) — D-03 startup catch-up"
  artifacts:
    - path: "apps/api/src/watcher/index.ts"
      provides: "Watcher bootstrap: creates chokidar instance, wires add event, calls ingestLagBesFile"
      exports: ["startWatcher", "stopWatcher"]
    - path: "apps/api/src/watcher/stability.ts"
      provides: "Pure stability-check logic: isSizeAndMtimeStable(path, windowMs)"
      exports: ["isSizeAndMtimeStable"]
    - path: "apps/api/src/watcher/path-resolver.ts"
      provides: "Resolves processed/YYYY-MM-DD/ and failed/YYYY-MM-DD/ destination paths; builds .error.json content"
      exports: ["resolveProcessedPath", "resolveFailedPath", "buildErrorLog"]
    - path: "apps/api/src/config.ts"
      provides: "Watcher env vars: WATCHER_ENABLED, WATCHER_SHARE_PATH, WATCHER_FILE_PATTERN, WATCHER_POLL_INTERVAL_MS, WATCHER_STABILITY_WINDOW_MS, WATCHER_BUSY_WAIT_MAX_RETRIES"
      contains: "WATCHER_ENABLED"
  key_links:
    - from: "apps/api/src/watcher/index.ts"
      to: "apps/api/src/ingest/index.ts"
      via: "ingestLagBesFile(filePath, 'watcher')"
      pattern: "ingestLagBesFile"
    - from: "apps/api/src/watcher/index.ts"
      to: "apps/api/src/watcher/stability.ts"
      via: "isSizeAndMtimeStable before firing ingest"
      pattern: "isSizeAndMtimeStable"
    - from: "apps/api/src/watcher/index.ts"
      to: "apps/api/src/watcher/path-resolver.ts"
      via: "resolveProcessedPath / resolveFailedPath post-ingest"
      pattern: "resolveProcessedPath|resolveFailedPath"
---

<objective>
Create the SMB folder watcher core module in apps/api/src/watcher/. This installs chokidar, extends config.ts with watcher env vars, and implements three focused modules: stability check logic, path resolution helpers, and the watcher bootstrap (chokidar setup + file lifecycle).

Purpose: Deliver the primary Phase 5 behaviour — file detection, stability gating, ingest dispatch, and post-ingest archiving — as a self-contained module ready to be wired into the Fastify server in Plan 03.

Output: `apps/api/src/watcher/` directory with index.ts, stability.ts, path-resolver.ts; chokidar installed; config.ts extended.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/05-smb-folder-watcher/05-CONTEXT.md

@apps/api/src/config.ts
@apps/api/src/ingest/index.ts
@apps/api/src/routes/upload.ts
@packages/core/src/upload/types.ts
</context>

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from codebase. -->

From apps/api/src/ingest/index.ts:
```typescript
export type IngestSource = "upload" | "watcher" | "cli";
export async function ingestLagBesFile(
  filePath: string,
  source: IngestSource,
  opts?: { correlationId?: string; db?: IngestDb },
): Promise<IngestResult>
// IngestResult from @acm-kpi/core:
// { status: "success"|"failed"; filename: string; rowsInserted: number; errors: IngestError[]; durationMs: number; correlationId: string }
```

From packages/core/src/upload/types.ts:
```typescript
export interface UploadErrorResponse {
  status: "failed";
  filename: string;
  rowsInserted: 0;
  errors: Array<{ row: number; field: string; value: unknown; reason: string }>;
  durationMs: number;
}
```

From apps/api/src/config.ts (current shape — extend with watcher vars):
```typescript
// Existing fields: NODE_ENV, API_PORT, DATABASE_URL, LDAP_*, SESSION_SECRET, LOG_LEVEL
export type AppConfig = z.infer<typeof configSchema>;
```

From apps/api/src/db/schema.ts (imports table for concurrency guard):
```typescript
imports.status  // text: 'pending'|'running'|'success'|'failed'
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Install chokidar + extend config.ts with watcher env vars</name>
  <files>apps/api/package.json, apps/api/src/config.ts</files>
  <read_first>
    - apps/api/package.json — see existing dependencies before adding chokidar
    - apps/api/src/config.ts — read full file; extend configSchema with watcher vars at bottom of the schema object
  </read_first>
  <behavior>
    - configSchema parses WATCHER_ENABLED as boolean (default false in dev, true in prod is operator's choice — default false keeps dev safe)
    - configSchema parses WATCHER_SHARE_PATH: z.string().optional() — required only when WATCHER_ENABLED=true (validated in watcher/index.ts at runtime, not in schema)
    - configSchema parses WATCHER_FILE_PATTERN: z.string().default("LagBes*")
    - configSchema parses WATCHER_POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(5000)
    - configSchema parses WATCHER_STABILITY_WINDOW_MS: z.coerce.number().int().min(100).default(1000)
    - configSchema parses WATCHER_BUSY_WAIT_MAX_RETRIES: z.coerce.number().int().min(0).default(5)
  </behavior>
  <action>
    1. Install chokidar v3 (not v4 — v4 dropped CJS compatibility; v3 works with ESM via type:module):
       `pnpm add chokidar@3 --filter @acm-kpi/api`
       Also add `@types/node` if not present (already there per package.json).

    2. Extend configSchema in apps/api/src/config.ts — append after the existing LOG_LEVEL field:
       ```typescript
       // Watcher (Phase 5 — WAT-07)
       WATCHER_ENABLED: z
         .string()
         .transform((v) => v.toLowerCase() === "true")
         .default("false"),
       WATCHER_SHARE_PATH: z.string().optional(),
       WATCHER_FILE_PATTERN: z.string().default("LagBes*"),
       WATCHER_POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(5000),
       WATCHER_STABILITY_WINDOW_MS: z.coerce.number().int().min(100).default(1000),
       WATCHER_BUSY_WAIT_MAX_RETRIES: z.coerce.number().int().min(0).default(5),
       ```

    3. The AppConfig type is inferred from the schema — no separate type changes needed.
  </action>
  <verify>
    <automated>cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro" && pnpm --filter @acm-kpi/api exec tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "WATCHER_ENABLED" apps/api/src/config.ts` returns a line with `.transform`
    - `grep -n "WATCHER_SHARE_PATH" apps/api/src/config.ts` returns a line with `.optional()`
    - `grep -n "WATCHER_POLL_INTERVAL_MS" apps/api/src/config.ts` returns a line with `.default(5000)`
    - `grep -n "WATCHER_STABILITY_WINDOW_MS" apps/api/src/config.ts` returns a line with `.default(1000)`
    - `grep -n "WATCHER_BUSY_WAIT_MAX_RETRIES" apps/api/src/config.ts` returns a line with `.default(5)`
    - `grep -n "chokidar" apps/api/package.json` returns a line with `"chokidar"`
    - `pnpm --filter @acm-kpi/api exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>config.ts compiles clean with all 6 watcher env vars; chokidar listed in package.json dependencies.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create apps/api/src/watcher/ module (stability.ts, path-resolver.ts, index.ts)</name>
  <files>
    apps/api/src/watcher/stability.ts,
    apps/api/src/watcher/path-resolver.ts,
    apps/api/src/watcher/index.ts
  </files>
  <read_first>
    - apps/api/src/ingest/index.ts — ingestLagBesFile signature and IngestResult; also read the concurrency guard pattern in upload.ts
    - apps/api/src/routes/upload.ts — concurrency guard: `db.select({id:imports.id}).from(imports).where(eq(imports.status,"running")).limit(1)`
    - apps/api/src/config.ts — AppConfig shape after Task 1 (has WATCHER_* fields)
    - packages/core/src/upload/types.ts — UploadErrorResponse shape (reused for .error.json)
    - apps/api/src/db/schema.ts — imports table columns
  </read_first>
  <behavior>
    stability.ts:
    - `isSizeAndMtimeStable(filePath: string, windowMs: number): Promise<boolean>` — calls fs.stat twice with windowMs delay; returns true only if both size and mtime are identical across the two calls. Uses Node `fs/promises` stat.

    path-resolver.ts:
    - `resolveProcessedPath(shareRoot: string, filename: string): string` — returns `${shareRoot}/processed/${YYYY-MM-DD}/${filename}` using local server date (note: per CONTEXT.md D-06, file is overwritten on same-name collision).
    - `resolveFailedPath(shareRoot: string, filename: string): string` — returns `${shareRoot}/failed/${YYYY-MM-DD}/${filename}`.
    - `resolveFailedErrorPath(shareRoot: string, filename: string): string` — returns `${shareRoot}/failed/${YYYY-MM-DD}/${filename}.error.json`.
    - `buildErrorLog(filename: string, result: IngestResult): WatcherErrorLog` — shapes IngestResult into the D-07 JSON structure: `{ timestamp, file, source: "watcher", errorType: "parse"|"validation"|"db"|"unknown", message, rowErrors }`.
    - Error type classification: if result.errors has entries with row>0 and field!="pipeline" → "validation"; if row==0 and field=="pipeline" and message includes "parse" → "parse"; if message includes "db" or "connection" → "db"; else "unknown".

    index.ts:
    - `startWatcher(config: AppConfig, logger: pino.Logger, db: IngestDb): Promise<FSWatcher>` — creates chokidar watcher with:
      ```
      chokidar.watch(config.WATCHER_SHARE_PATH!, {
        usePolling: true,
        interval: config.WATCHER_POLL_INTERVAL_MS,
        awaitWriteFinish: {
          stabilityThreshold: config.WATCHER_STABILITY_WINDOW_MS,
          pollInterval: 100,
        },
        ignored: [/[\\/](processed|failed)[\\/]/],
        depth: 0,
        persistent: true,
        ignoreInitial: false,  // D-03: emit add for pre-existing root files on startup (catch-up)
      })
      ```
    - `ignoreInitial: false` is chokidar's default but MUST be set explicitly so the startup catch-up intent is unambiguous. This causes chokidar to fire `add` for every matching file in the watched root on first scan, enabling the D-03 catch-up without any extra code. `processed/**` and `failed/**` are excluded by the `ignored` regex so archived files are never re-ingested.
    - Listens to the `add` event (new files only — no `change` events to avoid re-ingesting the same file).
    - File pattern matching: only process files where `path.basename(filePath)` matches the configured `WATCHER_FILE_PATTERN` glob (use `minimatch` or simple `startsWith` — prefer `picomatch` which is already a transitive dep of chokidar).
    - On `add` event for a matching file:
      1. Log `watcher.file_detected` with `{ file: basename }`
      2. Busy-wait check: query `db.select().from(imports).where(eq(imports.status,"running")).limit(1)`. If running and retries < WATCHER_BUSY_WAIT_MAX_RETRIES: log `watcher.busy_wait`, schedule retry via `setTimeout(retry, WATCHER_POLL_INTERVAL_MS)`. After max retries exceeded: treat as hard failure, move to failed/ immediately with errorType "db" and message "Ingest busy: max retries exceeded".
      3. Stability already handled by chokidar `awaitWriteFinish` — do NOT call `isSizeAndMtimeStable` again in the handler (would double the window). Export `isSizeAndMtimeStable` from stability.ts for direct use in tests.
      4. Call `ingestLagBesFile(filePath, 'watcher', { db })`.
      5. On success: `fs.promises.mkdir(processedDir, {recursive:true})` → `fs.promises.rename(filePath, processedPath)`. Log `watcher.ingest_succeeded`.
      6. On failure: `fs.promises.mkdir(failedDir, {recursive:true})` → `fs.promises.rename(filePath, failedPath)` → write `.error.json` sidecar via `fs.promises.writeFile`. Log `watcher.ingest_failed`.
    - Maintain in-memory state for /healthz: export `getWatcherStatus(): WatcherStatus` returning `{ enabled: boolean, lastIngestionAt: string|null, lastIngestionStatus: "success"|"failed"|null, lastFile: string|null }`. Update after each ingest attempt.
    - `stopWatcher(watcher: FSWatcher): Promise<void>` — calls `watcher.close()`.
    - Log events (pino structured): `watcher.started` (on ready), `watcher.file_detected`, `watcher.stability_passed` (for docs — chokidar fires add only after awaitWriteFinish), `watcher.ingest_succeeded`, `watcher.ingest_failed`, `watcher.busy_wait`. All include `{ file, source: "watcher" }`.

    Note on WATCHER_ENABLED=false: `startWatcher` checks `config.WATCHER_ENABLED` first. If false, logs `watcher.disabled` and returns a no-op stub FSWatcher (or null — return `null` and caller must handle).
  </behavior>
  <action>
    Create three files under apps/api/src/watcher/:

    **stability.ts** — pure function, no side effects beyond two fs.stat calls with a delay:
    ```typescript
    import { stat } from "node:fs/promises";

    export async function isSizeAndMtimeStable(
      filePath: string,
      windowMs: number,
    ): Promise<boolean> {
      const before = await stat(filePath);
      await new Promise((r) => setTimeout(r, windowMs));
      const after = await stat(filePath);
      return (
        before.size === after.size &&
        before.mtimeMs === after.mtimeMs
      );
    }
    ```

    **path-resolver.ts** — pure functions:
    ```typescript
    import { join } from "node:path";
    import type { IngestResult } from "@acm-kpi/core";

    function todayFolder(): string {
      // Server local time (per D-context deferred note — explicit comment required)
      // Uses server-local date. If server TZ differs from ACM file TZ, date may be off by one.
      // Acceptable at v1 scale. TODO: add TZ config in v2 if needed.
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }

    export function resolveProcessedPath(shareRoot: string, filename: string): string {
      return join(shareRoot, "processed", todayFolder(), filename);
    }

    export function resolveFailedPath(shareRoot: string, filename: string): string {
      return join(shareRoot, "failed", todayFolder(), filename);
    }

    export function resolveFailedErrorPath(shareRoot: string, filename: string): string {
      return join(shareRoot, "failed", todayFolder(), `${filename}.error.json`);
    }

    export interface WatcherErrorLog {
      timestamp: string;
      file: string;
      source: "watcher";
      errorType: "parse" | "validation" | "db" | "unknown";
      message: string;
      rowErrors: Array<{ row: number; field: string; value: unknown; reason: string }>;
    }

    export function buildErrorLog(filename: string, result: IngestResult): WatcherErrorLog {
      const rowErrors = result.errors ?? [];
      let errorType: WatcherErrorLog["errorType"] = "unknown";
      if (rowErrors.some((e) => e.row > 0 && e.field !== "pipeline")) {
        errorType = "validation";
      } else if (rowErrors.some((e) => e.field === "pipeline" && /parse/i.test(e.reason))) {
        errorType = "parse";
      } else if (rowErrors.some((e) => /db|connection|database/i.test(e.reason))) {
        errorType = "db";
      }
      return {
        timestamp: new Date().toISOString(),
        file: filename,
        source: "watcher",
        errorType,
        message: result.errors?.[0]?.reason ?? "Unknown error",
        rowErrors,
      };
    }
    ```

    **index.ts** — watcher bootstrap. Key implementation points per D-01 through D-09:
    - Import: chokidar, path/basename, fs/promises, pino, node:path, db schema (imports table), drizzle eq
    - `startWatcher` accepts (config: AppConfig, logger: pino.Logger, db: IngestDb) and returns FSWatcher | null
    - chokidar config: `{ usePolling: true, interval: config.WATCHER_POLL_INTERVAL_MS, awaitWriteFinish: { stabilityThreshold: config.WATCHER_STABILITY_WINDOW_MS, pollInterval: 100 }, ignored: [/[\\/](processed|failed)[\\/]/], depth: 0, persistent: true, ignoreInitial: false }`
    - `ignoreInitial: false` is explicit (D-03 catch-up): chokidar fires `add` for every pre-existing root file on first scan. The `ignored` regex prevents `processed/**` and `failed/**` from triggering these events.
    - Use `picomatch` (already a dep via chokidar) or a simple `filename.startsWith("LagBes")` check for WATCHER_FILE_PATTERN matching. Prefer picomatch: `import pm from "picomatch"; const isMatch = pm(config.WATCHER_FILE_PATTERN);`
    - Module-level `watcherStatus` object updated after each ingest
    - Export `getWatcherStatus()` for healthz route to call

    All fs operations (mkdir, rename, writeFile) use `node:fs/promises`. All errors caught and logged — never allow an unhandled promise rejection to crash the Fastify process.
  </action>
  <verify>
    <automated>cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro" && pnpm --filter @acm-kpi/api exec tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <acceptance_criteria>
    - `ls apps/api/src/watcher/` shows stability.ts, path-resolver.ts, index.ts
    - `grep -n "usePolling: true" apps/api/src/watcher/index.ts` returns a match
    - `grep -n "awaitWriteFinish" apps/api/src/watcher/index.ts` returns a match with `stabilityThreshold`
    - `grep -n "ignored.*processed.*failed" apps/api/src/watcher/index.ts` returns a match
    - `grep -n "ignoreInitial: false" apps/api/src/watcher/index.ts` returns a match (D-03 startup catch-up)
    - `grep -n "ingestLagBesFile" apps/api/src/watcher/index.ts` returns a match with `"watcher"`
    - `grep -n "resolveProcessedPath\|resolveFailedPath" apps/api/src/watcher/index.ts` returns matches for both
    - `grep -n "getWatcherStatus" apps/api/src/watcher/index.ts` returns an export
    - `grep -n "isSizeAndMtimeStable" apps/api/src/watcher/stability.ts` returns the function definition
    - `grep -n "todayFolder\|YYYY-MM-DD" apps/api/src/watcher/path-resolver.ts` returns the date-folder logic
    - `grep -n "WatcherErrorLog\|buildErrorLog" apps/api/src/watcher/path-resolver.ts` returns both
    - `pnpm --filter @acm-kpi/api exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>All three watcher module files compile cleanly. Watcher logic is complete: chokidar configured with usePolling, awaitWriteFinish, ignoreInitial:false (D-03 catch-up), ignored patterns; ingestLagBesFile called on add events; post-ingest archiving to processed/ or failed/ with .error.json sidecar; getWatcherStatus exported for healthz.</done>
</task>

</tasks>

<verification>
After both tasks:
- `pnpm --filter @acm-kpi/api exec tsc --noEmit` passes with zero errors
- `grep -rn "WATCHER_ENABLED\|WATCHER_SHARE_PATH\|WATCHER_POLL_INTERVAL_MS\|WATCHER_STABILITY_WINDOW_MS\|WATCHER_BUSY_WAIT_MAX_RETRIES\|WATCHER_FILE_PATTERN" apps/api/src/config.ts` returns 6 matches
- `ls apps/api/src/watcher/` lists stability.ts, path-resolver.ts, index.ts
- `grep -n "ignoreInitial: false" apps/api/src/watcher/index.ts` returns a match (proves D-03 catch-up is explicit)
</verification>

<success_criteria>
- chokidar installed in apps/api/package.json
- config.ts has all 6 WATCHER_* env vars with correct defaults
- apps/api/src/watcher/ contains stability.ts, path-resolver.ts, index.ts
- All three files compile under tsc --noEmit
- Watcher: usePolling=true, awaitWriteFinish configured, ignoreInitial:false (D-03), processed|failed ignored, depth:0
- Watcher calls ingestLagBesFile(path, "watcher", { db }) on add events
- Post-ingest: success → processed/YYYY-MM-DD/, failure → failed/YYYY-MM-DD/ + .error.json
- getWatcherStatus() exported with { enabled, lastIngestionAt, lastIngestionStatus, lastFile }
</success_criteria>

<output>
After completion, create `.planning/phases/05-smb-folder-watcher/05-01-SUMMARY.md`
</output>
