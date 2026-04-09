# Phase 5: SMB Folder Watcher — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 05-smb-folder-watcher
**Areas discussed:** Startup & existing files, Error handling & path collisions
**Areas deferred to Claude's discretion:** Worker architecture, File-stability check

---

## Gray area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Worker architecture | In-process vs dedicated worker vs Bull+Redis | |
| File-stability check | size/mtime/checksum + window + poll interval | |
| Startup & existing files | Boot-time behavior + subfolder handling | ✓ |
| Error handling & path collisions | Retries, collisions, .error log format | ✓ |

**Notes:** User deferred Worker architecture and Stability check to Claude. Defaults locked in CONTEXT.md D-01 and D-02.

---

## Startup & existing files

### Q1: On startup, what should the watcher do with pre-existing files?

| Option | Description | Selected |
|--------|-------------|----------|
| Process them | Treat as just-arrived, stability check still applies | ✓ |
| Ignore them | Only react to post-startup files | |
| Log and alert, don't touch | Human-in-the-loop | |

**User's choice:** Process them (recommended)
**Notes:** Protects against data loss if watcher was down during a file drop.

### Q2: Should processed/ and failed/ subfolders be re-processable?

| Option | Description | Selected |
|--------|-------------|----------|
| Always ignore | Chokidar excludes processed/** and failed/** | ✓ |
| Re-process if moved back to root | Human drag from failed/ → root re-picks up | |

**User's choice:** Always ignore (recommended)
**Notes:** Side effect — human can manually copy a file from failed/ back to root and it will fire a new root-level event anyway. Documented as the v1 human-recovery path.

---

## Error handling & path collisions

### Q3: Retry policy on ingestion failure?

| Option | Description | Selected |
|--------|-------------|----------|
| No retries — fail fast | Any error → move to failed/ + .error log | ✓ |
| Retry transient errors only | Classify DB blips; retry 3x with backoff | |
| Retry everything 3x | Simplest but wastes time on parse errors | |

**User's choice:** No retries — fail fast (recommended)
**Notes:** Parse errors dominate failure space at Apollo data scale; retry logic adds code with little benefit. Narrow exception: busy-wait when a concurrent upload holds the DB concurrency guard (D-05 in CONTEXT.md).

### Q4: Filename collision handling in processed/YYYY-MM-DD/?

| Option | Description | Selected |
|--------|-------------|----------|
| Timestamp suffix | LagBes_2026-04-09T14-23-45Z.csv | |
| Overwrite | Newer replaces older | ✓ |
| Sequence suffix | LagBes_(1).csv, LagBes_(2).csv | |

**User's choice:** Overwrite
**Notes:** User accepted archive-loss trade-off. Matches v1 snapshot-replace philosophy (latest export = truth). Apollo exports routinely share filenames. Ingest audit log is the authoritative record, not the file archive.

### Q5: .error log file format?

| Option | Description | Selected |
|--------|-------------|----------|
| Structured JSON | Matches UploadErrorResponse shape | ✓ |
| Plain text | Human-readable only | |
| Both (.error.json + .error.txt) | Machine + human | |

**User's choice:** Structured JSON (recommended)
**Notes:** Reuses `UploadErrorResponse` DTO from `@acm-kpi/core` — monitoring tools parse both upload and watcher paths uniformly.

---

## Claude's Discretion

- **Worker architecture (D-01):** In-process watcher inside Fastify API process. No Bull/Redis. Deviates from roadmap wording but matches Phase 4 reality.
- **File-stability check (D-02):** size+mtime unchanged for 1s, poll interval 5s default, both env-overridable.
- **Configuration surface (D-08):** env vars only, flat.
- **Observability shape (D-09):** pino structured logs + `/healthz` watcher block.

## Deferred Ideas

- Admin UI for watcher status (future phase / v1.x)
- Multi-share / multi-pattern watching (v2)
- Sub-minute polling (per PROJECT.md out-of-scope)
- Manual re-scan CLI (human-copy-back-to-root is the v1 recovery path)
- Transient/permanent error classification with retry budgets (rejected for v1)
- Timezone handling for YYYY-MM-DD subfolder naming (planner discretion)
