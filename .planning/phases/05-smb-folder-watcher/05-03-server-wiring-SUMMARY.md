---
phase: 05-smb-folder-watcher
plan: "03"
subsystem: server-wiring
tags: [fastify, watcher, lifecycle, healthz, docker-compose, smb]
dependency_graph:
  requires:
    - "05-01 (startWatcher, stopWatcher, getWatcherStatus exports)"
    - "apps/api/src/server.ts (createServer, Fastify lifecycle hooks)"
    - "docker-compose.yml (api service)"
  provides:
    - "Watcher auto-starts on Fastify onReady when WATCHER_ENABLED=true"
    - "Watcher stops cleanly on Fastify onClose"
    - "/api/v1/healthz watcher block with enabled, last_ingest_ts, last_ingest_status, last_file"
    - "docker-compose.yml SMB volume mount + 6 WATCHER_* env vars for production"
  affects:
    - "apps/api/src/__tests__/healthz.test.ts (watcher mock added)"
tech_stack:
  added: []
  patterns:
    - "Fastify onReady/onClose lifecycle hooks for background service wiring"
    - "Dynamic import of db inside onReady hook to avoid module-load side effects"
    - "Module-level FSWatcher handle (null when disabled)"
    - "Docker named volume as SMB mount stub with CIFS production override comment"
key_files:
  created: []
  modified:
    - apps/api/src/server.ts
    - apps/api/src/__tests__/healthz.test.ts
    - docker-compose.yml
decisions:
  - "Dynamic import of db inside onReady (not top-level) keeps module-load side effects isolated from test environments"
  - "Module-level _watcher variable acceptable for single-process production; tests mock the watcher module via vi.mock"
  - "smb_share named volume with driver:local acts as dev stub; CIFS override documented in comment for ops team"
metrics:
  duration_seconds: 163
  completed_date: "2026-04-09"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 3
---

# Phase 05 Plan 03: Server Wiring Summary

**One-liner:** Fastify onReady/onClose hooks wire startWatcher/stopWatcher into the server lifecycle; /healthz extended with watcher block; docker-compose.yml gets 6 WATCHER_* env vars and smb_share volume mount.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Wire watcher into Fastify server lifecycle + extend healthz | `1099f56` | apps/api/src/server.ts, apps/api/src/__tests__/healthz.test.ts |
| 2 | Add SMB volume mount + watcher env vars to docker-compose.yml | `d4d8986` | docker-compose.yml |

## What Was Built

### apps/api/src/server.ts (extended)

Three additions:

1. **Imports** — `startWatcher`, `stopWatcher`, `getWatcherStatus` from `./watcher/index.js`; `FSWatcher` type from `chokidar`

2. **Module-level watcher handle** — `let _watcher: FSWatcher | null = null` at module scope. Single watcher per process; null when disabled.

3. **Fastify lifecycle hooks** (registered after all routes):
   - `onReady`: dynamically imports `db` from `./db/index.js`, calls `startWatcher(config, server.log, db)`. Dynamic import avoids DATABASE_URL throw at module load time in tests.
   - `onClose`: calls `stopWatcher(_watcher)` if watcher is not null, then sets `_watcher = null`.

4. **Healthz route extended** — replaced `last_ingest_ts: null` stub with `watcher.lastIngestionAt`; added full `watcher` block:
   ```json
   {
     "watcher": {
       "enabled": false,
       "last_ingest_ts": null,
       "last_ingest_status": null,
       "last_file": null
     }
   }
   ```

### apps/api/src/__tests__/healthz.test.ts (updated)

Added `vi.mock("../watcher/index.js")` returning safe stubs for all three exports. This prevents real chokidar initialization during unit tests and keeps test isolation clean. The mock returns `getWatcherStatus()` with `enabled: false` and all null fields — matching the expected healthz response when watcher is off.

### docker-compose.yml (extended)

1. **6 WATCHER_* env vars** in the `api` service `environment:` block with safe defaults:
   - `WATCHER_ENABLED: ${WATCHER_ENABLED:-false}` — off by default in all environments
   - `WATCHER_SHARE_PATH: ${WATCHER_SHARE_PATH:-/mnt/smb}`
   - `WATCHER_FILE_PATTERN: ${WATCHER_FILE_PATTERN:-LagBes*}`
   - `WATCHER_POLL_INTERVAL_MS: ${WATCHER_POLL_INTERVAL_MS:-5000}`
   - `WATCHER_STABILITY_WINDOW_MS: ${WATCHER_STABILITY_WINDOW_MS:-1000}`
   - `WATCHER_BUSY_WAIT_MAX_RETRIES: ${WATCHER_BUSY_WAIT_MAX_RETRIES:-5}`

2. **Volume mount** in `api` service: `smb_share:/mnt/smb:rw,Z` (`:Z` for SELinux compatibility per Phase 1 pattern)

3. **Named volume** `smb_share` at top-level `volumes:` with `driver: local` and a CIFS production override comment documenting how ops replaces the stub with a real SMB CIFS mount.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The watcher is now fully wired into the server lifecycle. When `WATCHER_ENABLED=true` and `WATCHER_SHARE_PATH` is set, the watcher starts automatically. The docker-compose `smb_share` volume is intentionally a local driver stub for development; production CIFS override is documented in the YAML comment.

## Self-Check: PASSED

Files exist:
- `apps/api/src/server.ts` (contains onReady + watcher block) - checked
- `apps/api/src/__tests__/healthz.test.ts` (vi.mock for watcher) - checked
- `docker-compose.yml` (WATCHER_ENABLED + smb_share) - checked

Commits exist:
- `1099f56` - Task 1 (server.ts + healthz.test.ts)
- `d4d8986` - Task 2 (docker-compose.yml)
