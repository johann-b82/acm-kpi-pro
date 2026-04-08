#!/usr/bin/env tsx
/**
 * apps/api/src/scripts/ingest-local.ts
 *
 * Dev CLI for local LagBes CSV ingestion.
 *
 * Usage:
 *   npm -w apps/api run ingest:local -- samples/LagBes-sample.csv
 *   npm -w apps/api run ingest:local -- /abs/path/to/LagBes.csv
 *
 * Requires DATABASE_URL env var pointing to a reachable PostgreSQL instance.
 * If DATABASE_URL is not set or the DB is unreachable, exits 1 with a clear
 * error message instead of a confusing Node.js stack trace.
 *
 * Run from monorepo root:
 *   DATABASE_URL=postgres://user:pass@localhost:5432/acm_kpi \
 *     npm -w apps/api run ingest:local -- samples/LagBes-sample.csv
 */

import { resolve } from "path";
import pino from "pino";

const logger = pino({ name: "ingest-local" });

async function main(): Promise<void> {
  const rawPath = process.argv[2];

  if (!rawPath) {
    logger.error(
      "Usage: npm -w apps/api run ingest:local -- <path-to-csv>",
    );
    process.exit(1);
  }

  // Resolve relative to CWD — allows `npm run ingest:local -- samples/LagBes-sample.csv`
  // from the monorepo root (CWD = /path/to/acm-kpi-pro).
  const filePath = resolve(process.cwd(), rawPath);

  logger.info({ filePath }, "starting local ingest");

  // Guard: DATABASE_URL must be set before importing db/index.ts (it throws at
  // module load time to prevent silent misconfiguration in production).
  if (!process.env.DATABASE_URL) {
    logger.error(
      {
        hint: "Set DATABASE_URL=postgres://user:pass@host:5432/dbname before running",
      },
      "DATABASE_URL is not set — cannot connect to PostgreSQL",
    );
    process.exit(1);
  }

  // Dynamic import so db/index.ts is not loaded until DATABASE_URL is confirmed set.
  // Also wraps any connection-time errors in a friendly message.
  let ingestLagBesFile: (
    filePath: string,
    source: "upload" | "watcher" | "cli",
  ) => Promise<import("@acm-kpi/core").IngestResult>;

  try {
    const mod = await import("../ingest/index.js");
    ingestLagBesFile = mod.ingestLagBesFile;
  } catch (loadErr: unknown) {
    const message = loadErr instanceof Error ? loadErr.message : String(loadErr);
    logger.error(
      { error: message, hint: "Check DATABASE_URL and that PostgreSQL is reachable" },
      "Failed to load ingest module — possible DB connection error",
    );
    process.exit(1);
  }

  try {
    const result = await ingestLagBesFile(filePath, "cli");

    // Pretty-print IngestResult for CLI inspection
    console.log(JSON.stringify(result, null, 2));

    if (result.status === "success") {
      logger.info(
        {
          rowsInserted: result.rowsInserted,
          durationMs: result.durationMs,
          correlationId: result.correlationId,
        },
        "ingest:local complete",
      );
      process.exit(0);
    } else {
      logger.error(
        {
          errors: result.errors.slice(0, 10),
          correlationId: result.correlationId,
        },
        "ingest:local failed",
      );
      process.exit(1);
    }
  } catch (err: unknown) {
    // Unexpected runtime error (e.g. DB connection lost mid-ingest)
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { error: message, hint: "Check PostgreSQL connectivity and DATABASE_URL" },
      "Fatal ingest error",
    );
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Fatal:", message);
  process.exit(1);
});
