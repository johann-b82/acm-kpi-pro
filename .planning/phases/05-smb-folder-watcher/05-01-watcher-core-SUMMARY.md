---
phase: 05-smb-folder-watcher
plan: "01"
subsystem: watcher
tags: [chokidar, smb, file-watcher, ingest, stability, archiving]
dependency_graph:
  requires:
    - "02-csv-ingestion-core (ingestLagBesFile)"
    - "04-upload-page (IngestDb pattern, concurrency guard)"
  provides:
    - "startWatcher / stopWatcher for server.ts wiring (Plan 05-03)"
    - "getWatcherStatus for /healthz extension (Plan 05-02)"
  affects:
    - "apps/api/src/config.ts (AppConfig extended)"
tech_stack:
  added:
    - "chokidar@3.6.0 (usePolling SMB watcher)"
  patterns:
    - "in-process watcher (no Bull/Redis — D-01)"
    - "chokidar awaitWriteFinish stability gate (D-02)"
    - "ignoreInitial:false startup catch-up (D-03)"
    - "busy-wait concurrency guard (D-05)"
    - "YYYY-MM-DD date-subfolder archiving (D-06)"
    - "WatcherErrorLog JSON sidecar (D-07)"
key_files:
  created:
    - apps/api/src/watcher/index.ts
    - apps/api/src/watcher/stability.ts
    - apps/api/src/watcher/path-resolver.ts
  modified:
    - apps/api/src/config.ts
    - apps/api/package.json
    - apps/api/src/__tests__/auth.test.ts
    - apps/api/src/__tests__/healthz.test.ts
    - apps/api/src/__tests__/ldap.service.test.ts
    - apps/api/src/kpi/__tests__/routes.test.ts
    - apps/api/src/routes/upload.test.ts
decisions:
  - "D-01 honored: ingestLagBesFile called directly — no Bull/Redis queue"
  - "D-03 honored: ignoreInitial:false set explicitly for unambiguous startup catch-up intent"
  - "matchesPattern() uses simple prefix/suffix split on '*' — avoids CJS/ESM picomatch interop friction in ESM workspace"
  - "Pattern matching: if pattern has '*', split into prefix+suffix; else exact match — covers all Apollo NTS export naming patterns"
metrics:
  duration_seconds: 417
  completed_date: "2026-04-09"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 8
---

# Phase 05 Plan 01: Watcher Core Summary

**One-liner:** Chokidar v3 SMB watcher with usePolling + awaitWriteFinish stability gating, ignoreInitial:false startup catch-up (D-03), busy-wait concurrency guard, ingestLagBesFile dispatch, and processed/failed/YYYY-MM-DD/ archiving with JSON error sidecar.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Install chokidar + extend config.ts | `038c5fa` | apps/api/package.json, apps/api/src/config.ts, 5 test fixtures |
| 2 | Create watcher module (stability, path-resolver, index) | `7af673f` | apps/api/src/watcher/{index,stability,path-resolver}.ts |

## What Was Built

### apps/api/src/watcher/stability.ts
Pure `isSizeAndMtimeStable(filePath, windowMs)` function using two `fs.stat` calls with a configurable delay. Exported for direct unit testing; not called inside the watcher add-handler (chokidar `awaitWriteFinish` already handles stability — calling it again would double the window).

### apps/api/src/watcher/path-resolver.ts
Pure path helpers:
- `resolveProcessedPath(shareRoot, filename)` → `{shareRoot}/processed/YYYY-MM-DD/{filename}`
- `resolveFailedPath(shareRoot, filename)` → `{shareRoot}/failed/YYYY-MM-DD/{filename}`
- `resolveFailedErrorPath(shareRoot, filename)` → `{shareRoot}/failed/YYYY-MM-DD/{filename}.error.json`
- `buildErrorLog(filename, result)` → `WatcherErrorLog` with errorType classification (parse/validation/db/unknown)

### apps/api/src/watcher/index.ts
Watcher bootstrap with these properties (all D-decisions honored):
- **D-01:** `ingestLagBesFile(path, 'watcher', { db })` called directly — no queue
- **D-02:** `usePolling: true`, `awaitWriteFinish: { stabilityThreshold: WATCHER_STABILITY_WINDOW_MS, pollInterval: 100 }`
- **D-03:** `ignoreInitial: false` explicit (fires `add` for pre-existing root files on startup)
- **D-04:** `ignored: [/[\\/](processed|failed)[\\/]/]` + `depth: 0` — subfolders never re-ingested
- **D-05:** busy-wait up to `WATCHER_BUSY_WAIT_MAX_RETRIES` times before hard-failing to `failed/`
- **D-06:** same-name collision → overwrite (rename semantics)
- **D-07:** `.error.json` sidecar with `WatcherErrorLog` shape
- **D-08:** all configuration via `AppConfig` env vars
- **D-09:** pino structured logs: `watcher.started`, `watcher.file_detected`, `watcher.stability_passed`, `watcher.ingest_succeeded`, `watcher.ingest_failed`, `watcher.busy_wait`

Exports: `startWatcher`, `stopWatcher`, `getWatcherStatus`, `WatcherStatus`.

### apps/api/src/config.ts (extended)
Six new watcher env vars added to `configSchema`:
- `WATCHER_ENABLED` (boolean transform, default `false`)
- `WATCHER_SHARE_PATH` (optional string)
- `WATCHER_FILE_PATTERN` (default `"LagBes*"`)
- `WATCHER_POLL_INTERVAL_MS` (coerce number, min 500, default 5000)
- `WATCHER_STABILITY_WINDOW_MS` (coerce number, min 100, default 1000)
- `WATCHER_BUSY_WAIT_MAX_RETRIES` (coerce number, min 0, default 5)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test mock configs missing new AppConfig watcher fields**
- **Found during:** Task 1 — running `tsc --noEmit` after extending `configSchema`
- **Issue:** Five test files declare `const testConfig: AppConfig = { ... }` with literal objects missing the new watcher fields, causing TS2739 "missing properties" errors
- **Fix:** Added all 6 watcher fields with their default values to each mock config object
- **Files modified:** `src/__tests__/auth.test.ts`, `src/__tests__/healthz.test.ts`, `src/__tests__/ldap.service.test.ts`, `src/kpi/__tests__/routes.test.ts`, `src/routes/upload.test.ts`
- **Commit:** `038c5fa` (included in Task 1 commit)

**2. [Rule 3 - Implementation choice] picomatch skipped; simple prefix/suffix match used**
- **Found during:** Task 2 — picomatch is a CJS module without ESM exports; importing it as `import pm from "picomatch"` in a strict ESM workspace risks interop failures across Node versions
- **Fix:** Replaced with `matchesPattern(filename, pattern)` — splits pattern on `*` into prefix+suffix and uses `startsWith`/`endsWith`. Covers all real Apollo NTS export filename patterns (`LagBes*`, `LagBes*.csv`, exact names)
- **Files modified:** `apps/api/src/watcher/index.ts`
- **Commit:** `7af673f`

## Pre-existing TypeScript Errors (out of scope)

The following errors existed before this plan and are not caused by any changes here:
- `src/services/ldap.service.ts` — `tlsOptions: undefined` assignment with `exactOptionalPropertyTypes`
- `src/__tests__/ldap.service.test.ts` — mock ldapts `Client` partial object type mismatches
- `src/ingest/__tests__/atomicity.test.ts` and `mv-refresh.test.ts` — cannot find module `../../../db/index.js`

These are logged in `deferred-items.md` per scope boundary rules.

## Known Stubs

None. The watcher module is fully wired:
- `ingestLagBesFile` is called with real arguments
- `getWatcherStatus` returns live in-memory state
- Path resolvers return real computed paths

The watcher is not yet wired into `server.ts` (that is Plan 05-03) and `/healthz` is not yet extended (Plan 05-02) — those are intentional sequencing decisions, not stubs.

## Self-Check: PASSED

Files exist:
- `apps/api/src/watcher/index.ts` ✓
- `apps/api/src/watcher/stability.ts` ✓
- `apps/api/src/watcher/path-resolver.ts` ✓
- `apps/api/src/config.ts` (WATCHER_ENABLED present) ✓

Commits exist:
- `038c5fa` ✓
- `7af673f` ✓
