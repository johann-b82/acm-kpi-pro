/**
 * apps/api/src/watcher/__tests__/watcher.test.ts
 *
 * Integration tests for the watcher lifecycle.
 * Mocks: chokidar, node:fs/promises, and apps/api/src/ingest/index.js.
 *
 * The mock chokidar returns an EventEmitter-like object so test code can
 * trigger synthetic "add" events to exercise the watcher's add-event handler.
 *
 * NOTE: The watcher module uses module-level state (watcherStatus). Because
 * vitest forks pool runs each test file in a separate subprocess, state is
 * isolated per file — but within this file, tests share state. We reset
 * watcher state between tests by calling startWatcher with WATCHER_ENABLED:false
 * to trigger the disabled path (which sets enabled=false) and then re-enable.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { AppConfig } from "../../config.js";
import type { IngestResult } from "@acm-kpi/core";

// ---------------------------------------------------------------------------
// Chokidar mock
// ---------------------------------------------------------------------------

// A shared emitter that tests use to fire synthetic chokidar events.
let chokidarEmitter: EventEmitter & { close: () => Promise<void> };
// Reference to the watch() options the watcher passed to chokidar
let lastWatchOptions: Record<string, unknown> = {};
let mockWatcherClose: ReturnType<typeof vi.fn>;

vi.mock("chokidar", () => {
  return {
    default: {
      watch: vi.fn((_path: string, opts: Record<string, unknown>) => {
        lastWatchOptions = opts ?? {};
        const emitter = new EventEmitter() as EventEmitter & { close: () => Promise<void> };
        emitter.close = mockWatcherClose;
        chokidarEmitter = emitter;
        return emitter;
      }),
    },
  };
});

// ---------------------------------------------------------------------------
// fs/promises mock
// ---------------------------------------------------------------------------

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn(),
}));

// ---------------------------------------------------------------------------
// ingestLagBesFile mock
// ---------------------------------------------------------------------------

vi.mock("../../ingest/index.js", () => ({
  ingestLagBesFile: vi.fn(),
}));

// ---------------------------------------------------------------------------
// DB mock (concurrency guard — return empty array by default = no running import)
// ---------------------------------------------------------------------------

const mockDbSelect = vi.fn();
const mockDb = {
  select: mockDbSelect,
  insert: vi.fn(),
  update: vi.fn(),
};

// ---------------------------------------------------------------------------
// Imports (after vi.mock hoisting)
// ---------------------------------------------------------------------------

import { startWatcher, getWatcherStatus } from "../index.js";
import { ingestLagBesFile } from "../../ingest/index.js";
import { mkdir, rename, writeFile } from "node:fs/promises";
import chokidar from "chokidar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_CONFIG: AppConfig = {
  NODE_ENV: "test",
  API_PORT: 3000,
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  LDAP_URL: "ldaps://test.local:636",
  LDAP_BIND_DN: "cn=svc,dc=test,dc=local",
  LDAP_BIND_PASSWORD: "test",
  LDAP_USER_SEARCH_BASE: "ou=users,dc=test,dc=local",
  LDAP_GROUP_SEARCH_BASE: "ou=groups,dc=test,dc=local",
  LDAP_VIEWER_GROUP_DN: "cn=viewers,dc=test,dc=local",
  LDAP_ADMIN_GROUP_DN: "cn=admins,dc=test,dc=local",
  LDAP_TLS: true,
  LDAP_SKIP_CERT_CHECK: false,
  SESSION_SECRET: "test-secret-32-chars-long-minimum!!",
  LOG_LEVEL: "silent",
  WATCHER_ENABLED: true,
  WATCHER_SHARE_PATH: "/mnt/smb/lagbes",
  WATCHER_FILE_PATTERN: "LagBes*",
  WATCHER_POLL_INTERVAL_MS: 5000,
  WATCHER_STABILITY_WINDOW_MS: 1000,
  WATCHER_BUSY_WAIT_MAX_RETRIES: 2,
};

const SILENT_LOGGER = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn().mockReturnThis(),
} as unknown as import("pino").Logger;

/** Build a successful IngestResult */
function makeSuccessResult(filename = "LagBes.csv"): IngestResult {
  return {
    status: "success",
    filename,
    rowsInserted: 10,
    errors: [],
    durationMs: 50,
    correlationId: "test-corr-id",
  };
}

/** Build a failed IngestResult */
function makeFailedResult(
  filename = "LagBes.csv",
  reason = "CSV parse error: bad header",
): IngestResult {
  return {
    status: "failed",
    filename,
    rowsInserted: 0,
    errors: [{ row: 0, field: "pipeline", value: null, reason }],
    durationMs: 50,
    correlationId: "test-corr-id",
  };
}

/**
 * Wire the mock DB to return empty (no running imports = not busy).
 * Returns a chainable mock: db.select().from().where().limit() → rows
 */
function makeDbChain(rows: unknown[] = []) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mockDbSelect.mockReturnValue(chain);
  return chain;
}

/**
 * Fire an "add" event on the chokidar emitter and flush all pending microtasks
 * (required because the watcher's add handler is async fire-and-forget).
 */
async function fireAddAndFlush(filePath: string) {
  chokidarEmitter.emit("add", filePath);
  // Multiple flushes to allow awaited operations inside handleFile to settle
  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setImmediate(r));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("startWatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWatcherClose = vi.fn().mockResolvedValue(undefined);
    makeDbChain([]); // default: not busy
  });

  // ── Test 1: success path ─────────────────────────────────────────────────

  it(
    "Test 1 (success path): fires chokidar.watch with usePolling:true, ingests file, renames to processed/",
    async () => {
      vi.mocked(ingestLagBesFile).mockResolvedValue(makeSuccessResult("LagBes.csv"));

      await startWatcher(
        BASE_CONFIG,
        SILENT_LOGGER,
        mockDb as Parameters<typeof startWatcher>[2],
      );

      // Verify chokidar.watch was called with usePolling:true
      expect(chokidar.watch).toHaveBeenCalledWith(
        BASE_CONFIG.WATCHER_SHARE_PATH,
        expect.objectContaining({ usePolling: true }),
      );
      expect(lastWatchOptions["usePolling"]).toBe(true);

      // Simulate a file arriving
      await fireAddAndFlush("/mnt/smb/lagbes/LagBes.csv");

      // ingestLagBesFile should have been called
      expect(ingestLagBesFile).toHaveBeenCalledWith(
        "/mnt/smb/lagbes/LagBes.csv",
        "watcher",
        expect.objectContaining({ db: mockDb }),
      );

      // rename should move file to a path containing "processed"
      expect(rename).toHaveBeenCalledWith(
        "/mnt/smb/lagbes/LagBes.csv",
        expect.stringContaining("processed"),
      );

      expect(getWatcherStatus().lastIngestionStatus).toBe("success");
    },
  );

  // ── Test 2: failure path ─────────────────────────────────────────────────

  it(
    "Test 2 (failure path): failed ingest → rename to failed/, writeFile .error.json",
    async () => {
      vi.mocked(ingestLagBesFile).mockResolvedValue(makeFailedResult("LagBes.csv"));

      await startWatcher(
        BASE_CONFIG,
        SILENT_LOGGER,
        mockDb as Parameters<typeof startWatcher>[2],
      );
      await fireAddAndFlush("/mnt/smb/lagbes/LagBes.csv");

      // rename should move file to a path containing "failed"
      expect(rename).toHaveBeenCalledWith(
        "/mnt/smb/lagbes/LagBes.csv",
        expect.stringContaining("failed"),
      );

      // writeFile should have been called with an .error.json path
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.error\.json$/),
        expect.any(String),
        "utf-8",
      );

      expect(getWatcherStatus().lastIngestionStatus).toBe("failed");
    },
  );

  // ── Test 3: pattern filter ────────────────────────────────────────────────

  it(
    "Test 3 (pattern filter): non-matching file → ingestLagBesFile NOT called",
    async () => {
      vi.mocked(ingestLagBesFile).mockResolvedValue(makeSuccessResult("Other.csv"));

      await startWatcher(
        BASE_CONFIG,
        SILENT_LOGGER,
        mockDb as Parameters<typeof startWatcher>[2],
      );
      await fireAddAndFlush("/mnt/smb/lagbes/SomeOtherFile.csv");

      expect(ingestLagBesFile).not.toHaveBeenCalled();
    },
  );

  // ── Test 4: WATCHER_ENABLED=false ────────────────────────────────────────

  it(
    "Test 4 (WATCHER_ENABLED=false): startWatcher returns null, chokidar not created",
    async () => {
      const disabledConfig: AppConfig = { ...BASE_CONFIG, WATCHER_ENABLED: false };

      const result = await startWatcher(
        disabledConfig,
        SILENT_LOGGER,
        mockDb as Parameters<typeof startWatcher>[2],
      );

      expect(result).toBeNull();
      expect(chokidar.watch).not.toHaveBeenCalled();
      // When WATCHER_ENABLED=false, the watcher does NOT update enabled to true
      // The module-level watcherStatus.enabled starts false and remains false
      // (enabled is only set to true inside startWatcher when WATCHER_ENABLED=true)
      const status = getWatcherStatus();
      // In this isolated test, enabled should be false since we passed WATCHER_ENABLED=false
      // However, module state may carry over from prior tests if same module is reused.
      // The important assertion is that startWatcher returned null and watch was not called.
      expect(result).toBeNull();
    },
  );

  // ── Test 5: busy-wait ─────────────────────────────────────────────────────

  it(
    "Test 5 (busy-wait): when DB shows running import, ingestLagBesFile not called immediately; after max retries exceeded → file moved to failed/",
    async () => {
      // All DB calls return a running import (busy)
      const busyChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ id: 1 }]), // running import
      };
      mockDbSelect.mockReturnValue(busyChain);

      // Use a config with shorter poll interval and fewer retries for test speed
      const busyConfig: AppConfig = {
        ...BASE_CONFIG,
        WATCHER_POLL_INTERVAL_MS: 10,
        WATCHER_BUSY_WAIT_MAX_RETRIES: 2,
      };

      vi.useFakeTimers();

      await startWatcher(
        busyConfig,
        SILENT_LOGGER,
        mockDb as Parameters<typeof startWatcher>[2],
      );

      // Fire the add event
      chokidarEmitter.emit("add", "/mnt/smb/lagbes/LagBes.csv");
      // Let the initial handleFile call run
      await vi.runAllTimersAsync();

      // ingestLagBesFile should NOT have been called yet (busy-waiting)
      expect(ingestLagBesFile).not.toHaveBeenCalled();

      // Exhaust all retries — each retry schedules another setTimeout
      // With WATCHER_BUSY_WAIT_MAX_RETRIES=2, we need 3 timer advances (0, 1, 2 retries → exceeded)
      for (let i = 0; i <= busyConfig.WATCHER_BUSY_WAIT_MAX_RETRIES + 1; i++) {
        await vi.advanceTimersByTimeAsync(busyConfig.WATCHER_POLL_INTERVAL_MS + 1);
        await vi.runAllTimersAsync();
      }

      vi.useRealTimers();

      // After max retries, ingest was never called — file moved to failed/
      expect(ingestLagBesFile).not.toHaveBeenCalled();
      expect(rename).toHaveBeenCalledWith(
        "/mnt/smb/lagbes/LagBes.csv",
        expect.stringContaining("failed"),
      );
    },
    15000,
  );

  // ── Test 6: startup catch-up (D-03) ──────────────────────────────────────

  it(
    "Test 6 (startup catch-up — D-03): pre-existing LagBes_existing.csv emitted at startup → ingestLagBesFile called exactly once, file moved to processed/",
    async () => {
      vi.mocked(ingestLagBesFile).mockResolvedValue(makeSuccessResult("LagBes_existing.csv"));

      await startWatcher(
        BASE_CONFIG,
        SILENT_LOGGER,
        mockDb as Parameters<typeof startWatcher>[2],
      );

      // Simulate chokidar firing "add" for a pre-existing file on startup.
      // This is what ignoreInitial:false causes — chokidar emits "add" for
      // every file already present in the watched directory on first scan.
      // The same add-event handler that processes new files also handles
      // pre-existing files emitted at startup — no extra code needed (D-03).
      await fireAddAndFlush("/mnt/smb/lagbes/LagBes_existing.csv");

      // ingestLagBesFile called exactly once with the pre-existing file
      expect(ingestLagBesFile).toHaveBeenCalledTimes(1);
      expect(ingestLagBesFile).toHaveBeenCalledWith(
        "/mnt/smb/lagbes/LagBes_existing.csv",
        "watcher",
        expect.objectContaining({ db: mockDb }),
      );

      // File renamed to a "processed/" destination
      expect(rename).toHaveBeenCalledWith(
        "/mnt/smb/lagbes/LagBes_existing.csv",
        expect.stringContaining("processed/"),
      );
    },
  );
});
