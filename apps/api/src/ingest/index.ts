/**
 * apps/api/src/ingest/index.ts
 *
 * Top-level LagBes ingestion orchestrator.
 *
 * Pipeline:
 *   1. Create imports audit row (status=running)             — IN-10: audit every attempt
 *   2. Parse file (Windows-1252 → csv-parse → decimal-comma re-merge)
 *   3. Validate all rows via Zod (fail-on-all — IN-11)
 *   4. Atomic swap into stock_rows                          — IN-09: no partial snapshot
 *   5. Update imports audit row (status=success/failed)
 *
 * On any failure: imports row is updated to status=failed with errorMessage.
 * stock_rows is untouched on failure (guaranteed by Drizzle transaction — IN-09).
 *
 * pino structured JSON logs emitted at each stage (OBS-01):
 *   ingest_start → parse_complete → validation_complete → insert_complete → ingest_end
 *   (or validation_failed / ingest_failed on error paths)
 */

import pino from "pino";
import { basename } from "path";
import { randomUUID } from "crypto";
import type { IngestResult } from "@acm-kpi/core";
import { parseAndRemergeLagBes } from "./parser.js";
import { validateAllRows } from "./validator.js";
import {
  createImportRecord,
  insertStockRowsAtomic,
  updateImportStatus,
} from "./writer.js";

// ---------------------------------------------------------------------------
// Logger — module-local pino instance (OBS-01)
// ---------------------------------------------------------------------------

const logger = pino({ name: "ingest" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IngestSource = "upload" | "watcher" | "cli";

// Minimal interface for the DB dependency — matches the subset used by writer.ts.
// Using `unknown` here would require unsafe casts throughout; `any` is intentional
// for a thin pass-through injection slot. Biome: noExplicitAny is warn-only per biome.json.
// biome-ignore lint/suspicious/noExplicitAny: intentional injection type
export type IngestDb = any;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Lazily resolve the db singleton.
 * Returns the injected db if provided, otherwise imports the module-level singleton.
 * This pattern keeps index.ts free of a top-level side-effectful import of db/index.ts
 * (which throws at module load when DATABASE_URL is not set), enabling clean unit testing.
 */
async function resolveDb(injectedDb?: IngestDb): Promise<IngestDb> {
  if (injectedDb !== undefined) {
    return injectedDb;
  }
  const mod = await import("../db/index.js");
  return mod.db;
}

// ---------------------------------------------------------------------------
// ingestLagBesFile — public API
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full LagBes ingest pipeline for a single file.
 *
 * @param filePath  Absolute path to the LagBes CSV/TXT file on disk.
 * @param source    Origin of the import: 'upload' (Phase 4), 'watcher' (Phase 5), 'cli'.
 * @param opts      Optional overrides: correlationId, injected db (for tests).
 * @returns         Structured IngestResult — always resolves (never rejects).
 *
 * Guarantee: the imports audit row is created BEFORE parsing and updated AFTER
 * the pipeline completes regardless of outcome (IN-10). If the update itself
 * fails (e.g. DB connection lost mid-run), the failure is logged but not re-thrown
 * so the caller always receives a deterministic result.
 */
export async function ingestLagBesFile(
  filePath: string,
  source: IngestSource,
  opts?: { correlationId?: string; db?: IngestDb },
): Promise<IngestResult> {
  const correlationId = opts?.correlationId ?? randomUUID();
  const filename = basename(filePath);
  const startTime = Date.now();

  // Resolve DB — uses injected db in tests, real singleton in production
  const db = await resolveDb(opts?.db);

  // ── Step 1: Create audit record (status=running) ──────────────────────────
  // Must happen FIRST so every pipeline attempt is traceable (IN-10).
  logger.info({ correlationId, file: filename, source }, "ingest_start");

  const importId = await createImportRecord(db, { filename, source });

  try {
    // ── Step 2: Parse ─────────────────────────────────────────────────────────
    const rawRows = await parseAndRemergeLagBes(filePath);
    logger.info({ correlationId, rows: rawRows.length }, "parse_complete");

    // ── Step 3: Validate (collect ALL errors — IN-11) ─────────────────────────
    const validation = await validateAllRows(rawRows);

    if (!validation.valid) {
      const errorCount = validation.errors!.length;
      const errorSummary = validation
        .errors!.slice(0, 20)
        .map((e) => `row ${e.row} [${e.field}]: ${e.reason}`)
        .join("; ");

      logger.error(
        { correlationId, errorCount, sample: errorSummary },
        "validation_failed",
      );

      await updateImportStatus(db, importId, {
        status: "failed",
        rowCount: 0,
        finishedAt: new Date(),
        errorMessage: `Validation failed on ${errorCount} row(s): ${errorSummary}`,
      });

      return {
        status: "failed",
        filename,
        rowsInserted: 0,
        errors: validation.errors!,
        durationMs: Date.now() - startTime,
        correlationId,
      };
    }

    const validRows = validation.rows!;
    logger.info(
      { correlationId, rows: validRows.length },
      "validation_complete",
    );

    // ── Step 4: Atomic swap — IN-09 ───────────────────────────────────────────
    const { inserted } = await insertStockRowsAtomic(db, importId, validRows);
    logger.info({ correlationId, inserted }, "insert_complete");

    // ── Step 5: Mark success ──────────────────────────────────────────────────
    await updateImportStatus(db, importId, {
      status: "success",
      rowCount: inserted,
      finishedAt: new Date(),
    });

    const durationMs = Date.now() - startTime;
    logger.info(
      {
        correlationId,
        status: "success",
        rows_inserted: inserted,
        durationMs,
      },
      "ingest_end",
    );

    return {
      status: "success",
      filename,
      rowsInserted: inserted,
      errors: [],
      durationMs,
      correlationId,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ correlationId, error: errorMessage }, "ingest_failed");

    // Update audit row — best effort. Don't throw if the update also fails
    // (e.g. DB connection lost during ingest) — caller receives a clean result.
    await updateImportStatus(db, importId, {
      status: "failed",
      rowCount: 0,
      finishedAt: new Date(),
      errorMessage,
    }).catch((updateErr: unknown) => {
      logger.error(
        { correlationId, updateErr },
        "failed_to_update_import_status",
      );
    });

    return {
      status: "failed",
      filename,
      rowsInserted: 0,
      errors: [{ row: 0, field: "pipeline", value: null, reason: errorMessage }],
      durationMs: Date.now() - startTime,
      correlationId,
    };
  }
}
