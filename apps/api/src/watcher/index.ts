/**
 * apps/api/src/watcher/index.ts
 *
 * SMB Folder Watcher bootstrap — Phase 5 (WAT-01 through WAT-05, WAT-07, IN-08).
 *
 * Architecture (D-01): in-process inside the Fastify API. No Bull, no Redis.
 * The watcher calls ingestLagBesFile() directly — same function the upload route uses.
 *
 * Chokidar config (D-02, D-03):
 *   - usePolling: true          — required for SMB mounts (inotify does not work over SMB)
 *   - awaitWriteFinish          — chokidar-level stability gate; fires `add` only after
 *                                 size+mtime are stable for `stabilityThreshold` ms
 *   - ignoreInitial: false      — D-03 startup catch-up: fires `add` for every pre-existing
 *                                 root file on first scan so files present when the watcher
 *                                 was down are not silently skipped
 *   - ignored: [/processed|failed/] — terminal subfolders are never re-ingested
 *   - depth: 0                  — root files only
 *
 * Concurrency (D-05): if an ingest is already running (imports.status = 'running'),
 * the watcher busy-waits up to WATCHER_BUSY_WAIT_MAX_RETRIES × WATCHER_POLL_INTERVAL_MS
 * before treating the file as hard-failed. This is a narrow exception to the
 * "fail fast" rule — it prevents the upload+watcher race from creating spurious failures.
 */

import chokidar, { type FSWatcher } from "chokidar";
import { basename, dirname } from "node:path";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import type pino from "pino";
import type { AppConfig } from "../config.js";
import type { IngestDb } from "../ingest/index.js";
import { ingestLagBesFile } from "../ingest/index.js";
import { imports } from "../db/schema.js";
import {
  resolveProcessedPath,
  resolveFailedPath,
  resolveFailedErrorPath,
  buildErrorLog,
} from "./path-resolver.js";

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

/**
 * Returns true if `filename` matches the configured WATCHER_FILE_PATTERN.
 * Supports simple glob patterns ending with `*` (prefix match) and exact matches.
 * Example: "LagBes*" matches "LagBes.csv", "LagBesX.txt", etc.
 *
 * We avoid importing picomatch here because it is a CJS module and the workspace
 * is ESM — the interop is fragile across Node versions. Simple prefix/suffix/exact
 * matching covers all real-world patterns used by Apollo NTS exports.
 */
function matchesPattern(filename: string, pattern: string): boolean {
  if (pattern.includes("*")) {
    const [prefix, suffix] = pattern.split("*") as [string, string];
    return filename.startsWith(prefix) && filename.endsWith(suffix ?? "");
  }
  return filename === pattern;
}

// ---------------------------------------------------------------------------
// Health state
// ---------------------------------------------------------------------------

export interface WatcherStatus {
  enabled: boolean;
  lastIngestionAt: string | null;
  lastIngestionStatus: "success" | "failed" | null;
  lastFile: string | null;
}

const watcherStatus: WatcherStatus = {
  enabled: false,
  lastIngestionAt: null,
  lastIngestionStatus: null,
  lastFile: null,
};

/** Returns a snapshot of watcher state for /healthz. */
export function getWatcherStatus(): WatcherStatus {
  return { ...watcherStatus };
}

// ---------------------------------------------------------------------------
// Internal: handle a single detected file
// ---------------------------------------------------------------------------

/**
 * Process one file event: busy-wait if needed, call ingest, then archive.
 * All errors are caught — unhandled rejections must never crash Fastify.
 */
async function handleFile(
  filePath: string,
  config: AppConfig,
  logger: pino.Logger,
  db: IngestDb,
  retryCount = 0,
): Promise<void> {
  const filename = basename(filePath);
  const shareRoot = config.WATCHER_SHARE_PATH!;

  // ── Concurrency guard (D-05) ────────────────────────────────────────────────
  const running = await db
    .select({ id: imports.id })
    .from(imports)
    .where(eq(imports.status, "running"))
    .limit(1);

  if (running.length > 0) {
    if (retryCount < config.WATCHER_BUSY_WAIT_MAX_RETRIES) {
      logger.info(
        { file: filename, source: "watcher", retryCount },
        "watcher.busy_wait",
      );
      setTimeout(
        () =>
          void handleFile(filePath, config, logger, db, retryCount + 1).catch(
            (err: unknown) => {
              logger.error(
                { file: filename, source: "watcher", err },
                "watcher.retry_error",
              );
            },
          ),
        config.WATCHER_POLL_INTERVAL_MS,
      );
      return;
    }

    // Max retries exceeded — treat as hard failure (D-05)
    logger.error(
      { file: filename, source: "watcher", retryCount },
      "watcher.busy_wait_exceeded",
    );

    const failedPath = resolveFailedPath(shareRoot, filename);
    const errorPath = resolveFailedErrorPath(shareRoot, filename);
    const errorLog = {
      timestamp: new Date().toISOString(),
      file: filename,
      source: "watcher" as const,
      errorType: "db" as const,
      message: "Ingest busy: max retries exceeded",
      rowErrors: [],
    };

    try {
      await mkdir(dirname(failedPath), { recursive: true });
      await rename(filePath, failedPath);
      await writeFile(errorPath, JSON.stringify(errorLog, null, 2), "utf-8");
    } catch (moveErr: unknown) {
      logger.error(
        { file: filename, source: "watcher", err: moveErr },
        "watcher.archive_error",
      );
    }

    watcherStatus.lastIngestionAt = new Date().toISOString();
    watcherStatus.lastIngestionStatus = "failed";
    watcherStatus.lastFile = filename;
    return;
  }

  // ── Ingest ──────────────────────────────────────────────────────────────────
  const result = await ingestLagBesFile(filePath, "watcher", { db });

  if (result.status === "success") {
    // Archive to processed/YYYY-MM-DD/
    const processedPath = resolveProcessedPath(shareRoot, filename);
    try {
      await mkdir(dirname(processedPath), { recursive: true });
      await rename(filePath, processedPath);
    } catch (archiveErr: unknown) {
      logger.error(
        { file: filename, source: "watcher", err: archiveErr },
        "watcher.archive_error",
      );
    }

    logger.info(
      {
        file: filename,
        source: "watcher",
        rowsInserted: result.rowsInserted,
        durationMs: result.durationMs,
        dest: processedPath,
      },
      "watcher.ingest_succeeded",
    );

    watcherStatus.lastIngestionAt = new Date().toISOString();
    watcherStatus.lastIngestionStatus = "success";
    watcherStatus.lastFile = filename;
  } else {
    // Archive to failed/YYYY-MM-DD/ + .error.json sidecar
    const failedPath = resolveFailedPath(shareRoot, filename);
    const errorPath = resolveFailedErrorPath(shareRoot, filename);
    const errorLog = buildErrorLog(filename, result);

    try {
      await mkdir(dirname(failedPath), { recursive: true });
      await rename(filePath, failedPath);
      await writeFile(errorPath, JSON.stringify(errorLog, null, 2), "utf-8");
    } catch (archiveErr: unknown) {
      logger.error(
        { file: filename, source: "watcher", err: archiveErr },
        "watcher.archive_error",
      );
    }

    logger.warn(
      {
        file: filename,
        source: "watcher",
        errorCount: result.errors.length,
        durationMs: result.durationMs,
        dest: failedPath,
      },
      "watcher.ingest_failed",
    );

    watcherStatus.lastIngestionAt = new Date().toISOString();
    watcherStatus.lastIngestionStatus = "failed";
    watcherStatus.lastFile = filename;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates and starts the chokidar watcher.
 *
 * Returns null when WATCHER_ENABLED=false — caller (server.ts) must handle null.
 * The null return keeps the server boot path clean without a conditional type union.
 *
 * D-03 startup catch-up: `ignoreInitial: false` (chokidar default is also false,
 * but set explicitly so the intent is unambiguous in code review).
 * Chokidar fires `add` for every pre-existing file in the watched root on startup,
 * so files that landed while the watcher was down are processed automatically.
 * The `ignored` regex prevents processed/ and failed/ from triggering events.
 */
export async function startWatcher(
  config: AppConfig,
  logger: pino.Logger,
  db: IngestDb,
): Promise<FSWatcher | null> {
  if (!config.WATCHER_ENABLED) {
    logger.info({ source: "watcher" }, "watcher.disabled");
    return null;
  }

  if (!config.WATCHER_SHARE_PATH) {
    logger.error(
      { source: "watcher" },
      "watcher.config_error: WATCHER_ENABLED=true but WATCHER_SHARE_PATH is not set",
    );
    return null;
  }

  watcherStatus.enabled = true;

  const watcher = chokidar.watch(config.WATCHER_SHARE_PATH, {
    usePolling: true,
    interval: config.WATCHER_POLL_INTERVAL_MS,
    awaitWriteFinish: {
      stabilityThreshold: config.WATCHER_STABILITY_WINDOW_MS,
      pollInterval: 100,
    },
    // D-03 / D-04: processed/ and failed/ subfolders are terminal — never re-ingest
    ignored: [/[\\/](processed|failed)[\\/]/],
    depth: 0,
    persistent: true,
    ignoreInitial: false, // D-03: emit `add` for pre-existing root files on startup (catch-up)
  });

  watcher.on("add", (filePath: string) => {
    const filename = basename(filePath);

    // Skip files that don't match the configured pattern
    if (!matchesPattern(filename, config.WATCHER_FILE_PATTERN)) {
      return;
    }

    logger.info(
      { file: filename, source: "watcher" },
      "watcher.file_detected",
    );

    // chokidar already gated on awaitWriteFinish — stability_passed is implicit
    logger.debug(
      { file: filename, source: "watcher" },
      "watcher.stability_passed",
    );

    // Fire-and-forget — errors caught inside handleFile to prevent process crash
    void handleFile(filePath, config, logger, db).catch((err: unknown) => {
      logger.error(
        { file: filename, source: "watcher", err },
        "watcher.unhandled_error",
      );
    });
  });

  watcher.on("ready", () => {
    logger.info(
      {
        source: "watcher",
        sharePath: config.WATCHER_SHARE_PATH,
        pattern: config.WATCHER_FILE_PATTERN,
        pollIntervalMs: config.WATCHER_POLL_INTERVAL_MS,
        stabilityWindowMs: config.WATCHER_STABILITY_WINDOW_MS,
      },
      "watcher.started",
    );
  });

  watcher.on("error", (err: unknown) => {
    logger.error({ source: "watcher", err }, "watcher.chokidar_error");
  });

  return watcher;
}

/**
 * Gracefully closes the chokidar watcher. Call from Fastify `onClose` hook.
 */
export async function stopWatcher(watcher: FSWatcher): Promise<void> {
  await watcher.close();
}
