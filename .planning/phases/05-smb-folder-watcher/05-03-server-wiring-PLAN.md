---
phase: 05-smb-folder-watcher
plan: 03
type: execute
wave: 2
depends_on:
  - "05-01"
files_modified:
  - apps/api/src/server.ts
  - docker-compose.yml
autonomous: true
requirements:
  - WAT-06
  - WAT-07

must_haves:
  truths:
    - "Watcher starts automatically when Fastify server is ready (onReady hook) and WATCHER_ENABLED=true"
    - "Watcher shuts down cleanly when Fastify server closes (onClose hook)"
    - "GET /api/v1/healthz response includes a watcher block with enabled, lastIngestionAt, lastIngestionStatus, lastFile"
    - "docker-compose.yml api service includes WATCHER_ENABLED, WATCHER_SHARE_PATH env vars and an SMB volume mount stub"
  artifacts:
    - path: "apps/api/src/server.ts"
      provides: "Watcher registered via server.addHook('onReady') and server.addHook('onClose'); healthz route extended with watcher block"
      contains: "onReady"
    - path: "docker-compose.yml"
      provides: "WATCHER_ENABLED and WATCHER_SHARE_PATH env vars in api service; smb_share named volume and /mnt/smb volume mount"
      contains: "WATCHER_ENABLED"
  key_links:
    - from: "apps/api/src/server.ts"
      to: "apps/api/src/watcher/index.ts"
      via: "import { startWatcher, stopWatcher, getWatcherStatus } from './watcher/index.js'"
      pattern: "startWatcher|getWatcherStatus"
    - from: "apps/api/src/server.ts"
      to: "apps/api/src/db/index.ts"
      via: "db injected into startWatcher(config, server.log, db)"
      pattern: "startWatcher.*db"
---

<objective>
Wire the watcher module into the live Fastify server: register startup in onReady hook, shutdown in onClose hook, and extend the existing /api/v1/healthz response with a watcher block. Also update docker-compose.yml to declare the SMB volume mount and watcher env vars for production use.

Purpose: Make the watcher operational in the running stack. The watcher module (Plan 01) and its tests (Plan 02) are complete — this plan is the final connection that makes it production-ready.

Output: Updated server.ts (watcher lifecycle + healthz extension), updated docker-compose.yml (SMB volume + env vars).
</objective>

<execution_context>
@$HOME/.claire/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/05-smb-folder-watcher/05-CONTEXT.md

@apps/api/src/server.ts
@docker-compose.yml
@apps/api/src/watcher/index.ts
@apps/api/src/config.ts
</context>

<interfaces>
<!-- Contracts from Plan 01 watcher module -->

From apps/api/src/watcher/index.ts:
```typescript
export async function startWatcher(
  config: AppConfig,
  logger: pino.Logger,
  db: IngestDb,
): Promise<FSWatcher | null>  // null when WATCHER_ENABLED=false

export async function stopWatcher(watcher: FSWatcher): Promise<void>

export interface WatcherStatus {
  enabled: boolean;
  lastIngestionAt: string | null;        // ISO-8601 timestamp or null
  lastIngestionStatus: "success" | "failed" | null;
  lastFile: string | null;
}
export function getWatcherStatus(): WatcherStatus
```

Existing /api/v1/healthz response (from server.ts before this plan):
```typescript
{
  status: "ok" | "degraded",
  db_connected: boolean,
  ldap_reachable: boolean,
  last_ingest_ts: null,  // ← replace this stub
  ts: string,
}
```

Target /api/v1/healthz response after this plan:
```typescript
{
  status: "ok" | "degraded",
  db_connected: boolean,
  ldap_reachable: boolean,
  last_ingest_ts: string | null,   // from watcher.lastIngestionAt
  ts: string,
  watcher: {
    enabled: boolean,
    last_ingest_ts: string | null,
    last_ingest_status: "success" | "failed" | null,
    last_file: string | null,
  }
}
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Wire watcher into Fastify server lifecycle + extend healthz</name>
  <files>apps/api/src/server.ts</files>
  <read_first>
    - apps/api/src/server.ts — read the full file; identify the healthz route handler and the createServer function signature
    - apps/api/src/watcher/index.ts — verify exported function names (startWatcher, stopWatcher, getWatcherStatus) and WatcherStatus shape
    - apps/api/src/config.ts — confirm WATCHER_ENABLED, WATCHER_SHARE_PATH are present after Plan 01
    - apps/api/src/db/index.ts — confirm `db` export for passing into startWatcher
  </read_first>
  <action>
    Modify apps/api/src/server.ts:

    1. Add import at the top (with other route/service imports):
       ```typescript
       import { startWatcher, stopWatcher, getWatcherStatus } from "./watcher/index.js";
       ```

    2. After the LDAP service setup and before the routes section, add a module-level variable to hold the watcher handle:
       ```typescript
       let _watcher: import("chokidar").FSWatcher | null = null;
       ```

    3. After all routes are registered (after `await registerUploadRoutes(server, config)`), add lifecycle hooks:
       ```typescript
       // ─── Watcher lifecycle (Phase 5 — WAT-01, WAT-02) ────────────────────────
       server.addHook("onReady", async () => {
         const { db } = await import("./db/index.js");
         _watcher = await startWatcher(config, server.log as unknown as import("pino").Logger, db);
       });

       server.addHook("onClose", async () => {
         if (_watcher) {
           await stopWatcher(_watcher);
           _watcher = null;
         }
       });
       ```
       Note: `server.log` is Fastify's pino-compatible logger. Cast as needed to satisfy TypeScript — the pino Logger interface is compatible at runtime.

    4. Extend the existing healthz route handler. Find the block:
       ```typescript
       return reply.code(healthy ? 200 : 503).send({
         status: healthy ? "ok" : "degraded",
         db_connected: dbConnected,
         ldap_reachable: ldapReachable,
         last_ingest_ts: null,
         ts: new Date().toISOString(),
       });
       ```
       Replace `last_ingest_ts: null` with the real value and add the watcher block:
       ```typescript
       const watcher = getWatcherStatus();
       return reply.code(healthy ? 200 : 503).send({
         status: healthy ? "ok" : "degraded",
         db_connected: dbConnected,
         ldap_reachable: ldapReachable,
         last_ingest_ts: watcher.lastIngestionAt,
         ts: new Date().toISOString(),
         watcher: {
           enabled: watcher.enabled,
           last_ingest_ts: watcher.lastIngestionAt,
           last_ingest_status: watcher.lastIngestionStatus,
           last_file: watcher.lastFile,
         },
       });
       ```

    5. Confirm the module-scoped `_watcher` variable does not leak between tests. Since createServer() is called fresh per test, `_watcher` is module-scoped state. This is acceptable for production (single process). Tests that call createServer() do not start a real watcher because they mock the watcher module — tests for server.ts integration should mock `./watcher/index.js` via vi.mock.
  </action>
  <verify>
    <automated>cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro" && pnpm --filter @acm-kpi/api exec tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "startWatcher\|stopWatcher\|getWatcherStatus" apps/api/src/server.ts` returns at least 3 matches
    - `grep -n "onReady" apps/api/src/server.ts` returns a match with `startWatcher`
    - `grep -n "onClose" apps/api/src/server.ts` returns a match with `stopWatcher`
    - `grep -n "watcher:" apps/api/src/server.ts` returns the watcher block in the healthz response
    - `grep -n "last_ingest_ts: watcher" apps/api/src/server.ts` returns a match (not `null` anymore)
    - `grep -n "last_ingest_status\|last_file" apps/api/src/server.ts` returns matches in the watcher block
    - `pnpm --filter @acm-kpi/api exec tsc --noEmit` exits 0
    - `pnpm --filter @acm-kpi/api vitest run` exits 0 (existing healthz tests must still pass; update them to expect a `watcher` key in the response if they assert the exact body shape)
  </acceptance_criteria>
  <done>server.ts compiles; onReady starts watcher, onClose stops it; /healthz response includes watcher block with enabled/last_ingest_ts/last_ingest_status/last_file keys.</done>
</task>

<task type="auto">
  <name>Task 2: Add SMB volume mount + watcher env vars to docker-compose.yml</name>
  <files>docker-compose.yml</files>
  <read_first>
    - docker-compose.yml — read the full api service definition and the volumes section at the bottom
  </read_first>
  <action>
    Update docker-compose.yml:

    1. In the `api` service `environment:` block, add after the existing LOG_LEVEL line:
       ```yaml
       # Watcher (Phase 5 — WAT-07)
       WATCHER_ENABLED: ${WATCHER_ENABLED:-false}
       WATCHER_SHARE_PATH: ${WATCHER_SHARE_PATH:-/mnt/smb}
       WATCHER_FILE_PATTERN: ${WATCHER_FILE_PATTERN:-LagBes*}
       WATCHER_POLL_INTERVAL_MS: ${WATCHER_POLL_INTERVAL_MS:-5000}
       WATCHER_STABILITY_WINDOW_MS: ${WATCHER_STABILITY_WINDOW_MS:-1000}
       WATCHER_BUSY_WAIT_MAX_RETRIES: ${WATCHER_BUSY_WAIT_MAX_RETRIES:-5}
       ```

    2. In the `api` service `volumes:` block (create it if not present, or append), add:
       ```yaml
       volumes:
         - smb_share:/mnt/smb:rw,Z
       ```
       The `:Z` label enables SELinux access on enforcing hosts (per Phase 1 pattern).
       Note: In production, the operator replaces `smb_share` volume with the actual SMB CIFS bind mount. The named volume acts as a placeholder / local dev stub.

    3. At the bottom of the file in the top-level `volumes:` section, add:
       ```yaml
       smb_share:
         driver: local
         # Production override: replace with CIFS bind mount or host bind path.
         # Example for CIFS: driver_opts: { type: cifs, o: "username=svc,password=***,uid=1001", device: "//ACM-NAS01/exports" }
       ```

    4. Do NOT change any other service, health check, or network configuration.
  </action>
  <verify>
    <automated>cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro" && docker compose config --quiet 2>&1 | head -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "WATCHER_ENABLED" docker-compose.yml` returns a match with `${WATCHER_ENABLED:-false}`
    - `grep -n "WATCHER_SHARE_PATH" docker-compose.yml` returns a match with `/mnt/smb`
    - `grep -n "smb_share:/mnt/smb" docker-compose.yml` returns a match in the api volumes block
    - `grep -n "smb_share:" docker-compose.yml` returns at least 2 matches (volume mount + named volume declaration)
    - `grep -n "WATCHER_POLL_INTERVAL_MS\|WATCHER_STABILITY_WINDOW_MS\|WATCHER_BUSY_WAIT_MAX_RETRIES\|WATCHER_FILE_PATTERN" docker-compose.yml` returns 4 matches
    - `docker compose config --quiet` exits 0 (valid YAML)
  </acceptance_criteria>
  <done>docker-compose.yml is valid YAML; api service declares all 6 WATCHER_* env vars with safe defaults; smb_share volume mount present in api volumes list; smb_share named volume declared at top level with CIFS comment.</done>
</task>

</tasks>

<verification>
End-to-end check:
1. `pnpm --filter @acm-kpi/api exec tsc --noEmit` exits 0
2. `pnpm --filter @acm-kpi/api vitest run` exits 0 (healthz test updated to accept watcher key)
3. `docker compose config --quiet` exits 0
4. `grep -c "WATCHER_" docker-compose.yml` returns 6 (one per env var)
5. `grep -n "watcher:" apps/api/src/server.ts` returns the healthz watcher block
</verification>

<success_criteria>
- Fastify server onReady hook calls startWatcher(config, logger, db)
- Fastify server onClose hook calls stopWatcher(watcher) if watcher is not null
- /healthz response shape includes: { watcher: { enabled, last_ingest_ts, last_ingest_status, last_file } }
- /healthz top-level last_ingest_ts is now populated from watcher.lastIngestionAt (not hardcoded null)
- docker-compose.yml api service has all 6 WATCHER_* env vars with correct defaults
- smb_share volume declared at top-level with CIFS mount documentation comment
- All existing tests pass without modification (or with minimal healthz test update to include watcher key)
</success_criteria>

<output>
After completion, create `.planning/phases/05-smb-folder-watcher/05-03-SUMMARY.md`
</output>
