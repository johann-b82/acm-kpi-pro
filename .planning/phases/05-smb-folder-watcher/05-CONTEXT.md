# Phase 5: SMB Folder Watcher — Context

**Gathered:** 2026-04-09
**Status:** Ready for research and planning
**Source:** /gsd:discuss-phase interactive session

<domain>
## Phase Boundary

**In scope:**
- Background watcher on a mounted SMB share for `LagBes*` files (pattern configurable)
- Chokidar with `usePolling: true` (inotify does not work on SMB); default poll interval 5s
- File-stability check (size + mtime unchanged ≥1s) before picking up a file, to avoid partial-write ingestion
- On detection: ingest via existing `ingestLagBesFile(path, 'watcher')` — reuses Phase 2 pipeline end-to-end
- Post-ingest file movement: success → `processed/YYYY-MM-DD/`; failure → `failed/YYYY-MM-DD/` with adjacent `.error.json`
- Startup catch-up: process any `LagBes*` files already in the watched folder root at boot
- `/healthz` endpoint reports last ingestion timestamp and status (feeds Phase 3 stale-data banner)
- Configuration via env vars (share path, poll interval, file pattern, stability window)
- Unit tests: file-stability logic (pure function), error classification, path-collision helper; integration test with mocked chokidar events

**Out of scope:**
- Bull queue / Redis infrastructure (see D-01 below — roadmap wording superseded by Phase 4 reality)
- Admin UI surface for watcher status (Phase 3 stale-data banner is the only surface)
- Retry logic on ingestion failures (see D-04)
- Multi-share / multi-pattern watching (single share root, single pattern in v1)
- Manual re-queue UI / file re-scan commands (human manually copies file back to root if needed)
- Watching nested subdirectories beyond root + processed/ + failed/ structure
- SMB mount setup / permissions (ops concern — ship expects an already-mounted path)
- German locale considerations in paths / filenames

</domain>

<decisions>
## Implementation Decisions

### Worker architecture (D-01) — Claude's Discretion, locked

**In-process watcher inside the Fastify API process.** No Bull, no Redis, no separate worker.

- Chokidar is registered during Fastify bootstrap alongside routes
- Detected files call `ingestLagBesFile(path, 'watcher')` directly — same function the upload route uses
- Concurrency with upload path is handled by the existing Phase 4 DB concurrency guard (`imports.status = 'running'` → 409 for upload; watcher waits/retries same mechanism — see D-04)
- `apps/worker/` remains a pino stub for now (kept for future isolation if needed)

**Why this deviates from ROADMAP:** ROADMAP.md §"Phase 5 Scope" says "Enqueues Bull job identical to upload path", but Phase 4 chose synchronous ingest + DB concurrency guard instead of adding Bull. Bull and Redis do not exist in the codebase. Adding them now for sub-second jobs would double scope and add ops burden for zero user-visible benefit. The DB concurrency guard already serializes ingestion correctly across both paths.

**Why not a dedicated worker process:** Would require lifting `ingestLagBesFile` into `packages/core` or wiring IPC — non-trivial refactor. The cost is not justified at Apollo data scale. Revisit if v2 adds a second data feed or sub-minute polling.

### File-stability check (D-02) — Claude's Discretion, locked

- **Check:** file `size` AND `mtime` (via `fs.statSync`) unchanged across two consecutive polls
- **Stability window:** 1 second (per ROADMAP)
- **Poll interval:** 5 seconds default, overridable via `WATCHER_POLL_INTERVAL_MS`
- **Stability window:** overridable via `WATCHER_STABILITY_WINDOW_MS`
- Chokidar config: `{ usePolling: true, interval: WATCHER_POLL_INTERVAL_MS, awaitWriteFinish: { stabilityThreshold: WATCHER_STABILITY_WINDOW_MS, pollInterval: 100 } }`

**Why not checksum:** SMB mounts make full-file reads expensive; size+mtime is sufficient for non-adversarial internal file drops and matches chokidar's built-in `awaitWriteFinish` support.

### Startup catch-up (D-03)

**On startup, process any `LagBes*` files sitting in the watched folder root** as if they just arrived. Stability check still applies (so a file mid-write at boot is not grabbed).

- Protects against data loss if the watcher was down when a file landed
- `processed/**` and `failed/**` are always excluded — chokidar's `ignored` list covers them
- Side effect: if a human manually copies a file from `failed/2026-04-08/LagBes.csv` back to the watched root, chokidar fires a root-level event and it gets reprocessed. This is the **documented human-recovery path** — no special command needed.

### Subfolder handling (D-04)

**`processed/**` and `failed/**` are always ignored by chokidar.** Files there are terminal. Human recovery is "copy the file back to the root" (see D-03).

### Error handling (D-05)

**No retries — fail fast.**

- Any error thrown by `ingestLagBesFile` → move file to `failed/YYYY-MM-DD/` immediately
- Write `.error.json` sidecar file (see D-07)
- No classification of transient vs permanent errors (DB connection blips are extremely rare on a single-host Docker Compose; parse errors are deterministic; both are treated the same)
- Operator fixes root cause and manually copies file back to root if reprocessing is desired

**Why:** Simplicity. Deterministic parse errors dominate the failure space at Apollo data scale. Retry logic adds code paths with little real benefit.

**Interaction with Phase 4 DB concurrency guard (IN-02 corner case):** If an upload is in progress when the watcher picks up a file, `ingestLagBesFile` will throw the same 409-equivalent error the upload route sees. This would currently treat a concurrent upload as a hard failure and move the file to `failed/`. To avoid that specific collision:
- The watcher **checks `imports.status = 'running'` before calling `ingestLagBesFile`** and, if busy, **delays** pickup by one poll interval (simple setTimeout-then-retry, bounded to ~5 retries = ~25s at default poll interval; after that it fails to `failed/`)
- This is a narrow exception to "no retries" — it's a **busy-wait**, not a failure retry
- Decision logged explicitly so downstream planner/researcher don't reintroduce a generic retry budget

### Path collisions (D-06)

**Overwrite on filename collision in `processed/YYYY-MM-DD/` and `failed/YYYY-MM-DD/`.**

- Apollo exports typically reuse the same filename pattern (e.g., `LagBes.csv`) so same-day collisions are common
- Overwriting matches the v1 snapshot-replace philosophy used everywhere else in the product: latest export = truth
- Trade-off: if a corrupted file arrives after a good one with the same name, the archive loses the good one. Acceptable at v1 scale — evidence lives in the DB (ingest audit log preserves each import attempt with timestamp + hash).
- **Planner note:** ensure the ingest audit log captures enough info (timestamp + row count + KPI snapshot) that a lost archive file is recoverable in spirit.

### Error log format (D-07)

**Structured JSON:** `{filename}.error.json` sidecar file next to the failed file in `failed/YYYY-MM-DD/`.

Shape (matches upload endpoint error response — reuses `UploadErrorResponse` from `@acm-kpi/core`):
```json
{
  "timestamp": "2026-04-09T14:23:45.000Z",
  "file": "LagBes.csv",
  "source": "watcher",
  "errorType": "parse | validation | db | unknown",
  "message": "Human-readable error",
  "rowErrors": [{"row": 42, "field": "Wert", "message": "..."}]
}
```

- Same shape as `UploadErrorResponse` so monitoring tools can parse both paths uniformly
- Reuse the existing error-shaping helper from Phase 4's upload route (extract into a small `packages/core/src/ingest/error.ts` if needed)

### Configuration (D-08) — Claude's Discretion

Environment variables only (no separate config file), read at boot:

| Env var | Purpose | Default |
|---|---|---|
| `WATCHER_ENABLED` | Master on/off switch for the watcher | `true` in production, `false` in local dev |
| `WATCHER_SHARE_PATH` | Absolute path to the mounted SMB dir | required if enabled |
| `WATCHER_FILE_PATTERN` | Glob for matching files | `LagBes*.csv` |
| `WATCHER_POLL_INTERVAL_MS` | Chokidar poll interval | `5000` |
| `WATCHER_STABILITY_WINDOW_MS` | Stability threshold | `1000` |
| `WATCHER_BUSY_WAIT_MAX_RETRIES` | Max busy-wait retries when upload in progress (D-05) | `5` |

### Observability (D-09) — Claude's Discretion

- Pino logger (already in the stack) — structured JSON logs
- Log events: `watcher.started`, `watcher.file_detected`, `watcher.stability_passed`, `watcher.ingest_succeeded`, `watcher.ingest_failed`, `watcher.busy_wait`
- Each log event includes `file`, `source: 'watcher'`, relevant durations
- `/healthz` adds a `watcher` block: `{ enabled, lastIngestionAt, lastIngestionStatus, lastFile, queueDepth: 0 }`
- `lastIngestionAt` feeds the Phase 3 stale-data banner (already consumes `/healthz`)

### Claude's Discretion

- Worker architecture (D-01) and file-stability specifics (D-02) — user deferred these, recommended defaults locked
- Configuration surface (D-08) and observability shape (D-09)
- Exact file layout inside `apps/api/src/watcher/` (suggested: `index.ts`, `stability.ts`, `path-resolver.ts`, `__tests__/*`)
- Whether to extract shared ingest error helpers into `packages/core/src/ingest/error.ts` or keep in-place

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 5 scope
- `.planning/ROADMAP.md` §"### Phase 5: SMB Folder Watcher" — scope list, pitfalls, exit criteria
- `.planning/REQUIREMENTS.md` — `WAT-01` through `WAT-07`, plus `IN-02` (marked complete but Phase 5 is the primary owner)

### Upstream dependencies (Phase 2 ingest + Phase 4 upload path)
- `apps/api/src/ingest/index.ts` — `ingestLagBesFile(path, source)` — the entry point the watcher will call
- `apps/api/src/routes/upload.ts` — Phase 4 upload route; reference for RBAC-free watcher path, concurrency guard pattern, error shaping
- `apps/api/src/kpi/helpers.ts` — `buildKpiDelta`, `getHeadlineKpis` (called by ingest path; not re-done by watcher)
- `packages/core/src/upload/types.ts` — `UploadErrorResponse` shape (reused for `.error.json`)
- `.planning/phases/04-upload-page/04-CONTEXT.md` §"File constraints (D-02)" — 10 MB limit; watcher should enforce the same cap before calling ingest
- `.planning/phases/04-upload-page/04-SUMMARY.md` §"Concurrency guard" — how `imports.status = 'running'` is used

### Data-source context
- `.claude/projects/.../project_csv_quirks.md` (auto-memory) — Apollo NTS LagBes CSV quirks (decimal-comma, Win-1252, DD.MM.YY) — already handled by Phase 2 parser but planner should verify watcher path doesn't bypass encoding detection
- `samples/LagBes-sample.csv` and `samples/README.md` (if present) — representative input

### Chokidar / SMB research targets
- Chokidar README, specifically: `usePolling`, `awaitWriteFinish`, `ignored` patterns, `depth` option
- Node `fs.stat` semantics over SMB mounts (mtime resolution can be 1-2s on some SMB servers — may affect stability window)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ingestLagBesFile(path, source)` at `apps/api/src/ingest/index.ts` — watcher's sole ingestion entry point. Accepts `source: 'upload' | 'watcher'`.
- `imports` table + status column — already tracks per-import lifecycle; watcher piggybacks for concurrency + `/healthz` last-ingestion status
- `UploadErrorResponse` DTO in `@acm-kpi/core` — reused for `.error.json` shape
- Pino logger bootstrap in `apps/api/src/server.ts` — watcher logs through the same pipeline
- `/healthz` endpoint (Phase 1) — add `watcher` block

### Established Patterns
- **Synchronous ingest + DB concurrency guard**, not Bull queue (Phase 4 precedent)
- **Fastify plugin / lifecycle hooks** for background processes (same pattern as multipart plugin registration in `server.ts`)
- **Structured JSON logging** via pino with event-name fields
- **Env var config**, flat, no config files

### Integration Points
- `apps/api/src/server.ts` — register watcher startup in Fastify `onReady` / `ready` hook; cleanup in `onClose`
- `apps/api/src/routes/healthz.ts` (or wherever `/healthz` lives) — extend response with `watcher` block
- `packages/core/src/upload/types.ts` — potentially add `WatcherErrorLog` type (or alias to `UploadErrorResponse`)
- `docker-compose.yml` — mount an SMB-ish volume for local dev (can be a regular folder in dev; real SMB in prod)

</code_context>

<specifics>
## Specific Ideas

- **"Overwrite on collision" rationale:** The user explicitly accepted the archive-loss trade-off on the grounds that Apollo exports routinely share filenames and "latest = truth" matches v1 snapshot-replace semantics. The ingest audit log is the authoritative record, not the file archive.
- **"Fail fast, no retries" rationale:** User wants the failure mode to be loud and obvious, not masked by background retries. Human operator is expected to notice `failed/` directory growing and act.
- **Worker architecture deviation from roadmap** was raised by the user when Phase 4 chose synchronous + DB guard; Phase 5 inherits that choice rather than reintroducing Bull retroactively.

</specifics>

<deferred>
## Deferred Ideas

- **Admin UI for watcher status / recent imports** — belongs in a future phase or v1.x. `/healthz` + logs are the v1 surface.
- **Multi-share / multi-pattern watching** — v2 when a second data feed (scrap/quality) is added.
- **Sub-minute polling or event-driven notifications** — deferred with "real-time" per PROJECT.md out-of-scope list.
- **Manual "re-scan" command / CLI** — deferred; human-copy-back-to-root is the v1 recovery path.
- **Classification of transient vs permanent errors with retry budgets** — explicitly rejected for v1; revisit only if real-world failures show a pattern.
- **Timezone handling for `YYYY-MM-DD` subfolder naming** — deferred to planner's discretion; default to server local time with an explicit comment.

</deferred>

---

*Phase: 05-smb-folder-watcher*
*Context gathered: 2026-04-09*
