/**
 * POST /api/v1/upload — Phase 4 upload route (UP-07, IN-02).
 *
 * Contract (see packages/core/src/upload/types.ts):
 *   - Admin only (requireRole('Admin', config))
 *   - multipart/form-data, single file, 10 MB limit (@fastify/multipart plugin
 *     registered globally in server.ts sets the byte limit; this handler trusts
 *     that configuration and catches the resulting RequestFileTooLargeError).
 *   - Returns 409 when another import is already running (D-02).
 *   - On validation failure: 400 + UploadErrorResponse.
 *   - On success: 200 + UploadSuccessResponse including a before/after KPI delta.
 *
 * Temp file handling: @fastify/multipart v9 auto-cleans files created by
 * saveRequestFiles() after the response is sent, so no explicit finally block
 * is required — the plugin handles it.
 *
 * Observability (OBS-01): structured pino logs at start + end with correlationId.
 */

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import type {
  HeadlineKpis,
  KpiDeltaField,
  UploadErrorResponse,
  UploadKpiDelta,
  UploadSuccessResponse,
} from "@acm-kpi/core";
import type { AppConfig } from "../config.js";
import { db } from "../db/index.js";
import { imports } from "../db/schema.js";
import { ingestLagBesFile } from "../ingest/index.js";
import { getHeadlineKpis } from "../kpi/helpers.js";
import { requireRole } from "../middleware/rbac.js";

/**
 * Build a KpiDeltaField from before/after scalar values.
 * `before` becomes null only when the pre-ingest snapshot itself was null
 * (first-ever import). `after` and `delta` always resolve to numbers.
 */
function buildDeltaField(
  before: number | null,
  after: number | null,
): KpiDeltaField {
  const afterNum = after ?? 0;
  const beforeNum = before ?? 0;
  return {
    before: before === null ? null : beforeNum,
    after: afterNum,
    delta: afterNum - beforeNum,
  };
}

function buildKpiDelta(
  before: HeadlineKpis | null,
  after: HeadlineKpis,
): UploadKpiDelta {
  return {
    totalInventoryValue: buildDeltaField(
      before?.totalInventoryValue ?? null,
      after.totalInventoryValue,
    ),
    daysOnHand: buildDeltaField(before?.daysOnHand ?? null, after.daysOnHand),
    stockoutsCount: buildDeltaField(
      before?.stockoutsCount ?? null,
      after.stockoutsCount,
    ),
    deadStockPct: buildDeltaField(
      before?.deadStockPct ?? null,
      after.deadStockPct,
    ),
  };
}

export async function registerUploadRoutes(
  server: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  server.post(
    "/api/v1/upload",
    { preHandler: requireRole("Admin", config) },
    async (request, reply) => {
      const correlationId = request.id;
      const startedAt = Date.now();

      server.log.info(
        { correlationId, event: "upload_received" },
        "upload_received",
      );

      // ── Concurrency guard (D-02) ─────────────────────────────────────────
      const running = await db
        .select({ id: imports.id })
        .from(imports)
        .where(eq(imports.status, "running"))
        .limit(1);

      if (running.length > 0) {
        server.log.warn(
          { correlationId, event: "upload_rejected_concurrent" },
          "upload_rejected_concurrent",
        );
        return reply.code(409).send({
          error: "ingest_already_running",
          message:
            "An ingest is already running — please wait a moment and try again.",
        });
      }

      // ── Parse multipart body ─────────────────────────────────────────────
      // @fastify/multipart v9 throws RequestFileTooLargeError automatically
      // when a single file exceeds the limit configured at plugin registration.
      let savedFiles: Awaited<
        ReturnType<typeof request.saveRequestFiles>
      >;
      try {
        savedFiles = await request.saveRequestFiles();
      } catch (err) {
        const e = err as Error & { code?: string };
        if (
          e.code === "FST_REQ_FILE_TOO_LARGE" ||
          e.code === "FST_FILES_LIMIT" ||
          e.constructor?.name === "RequestFileTooLargeError"
        ) {
          server.log.warn(
            { correlationId, event: "upload_rejected_too_large", err: e.message },
            "upload_rejected_too_large",
          );
          return reply
            .code(413)
            .send({ error: "file_too_large", message: "File exceeds 10 MB limit" });
        }
        throw err;
      }

      if (!savedFiles || savedFiles.length === 0) {
        return reply
          .code(400)
          .send({ error: "no_file", message: "No file provided" });
      }

      const file = savedFiles[0]!;
      const tmpPath = file.filepath;
      const filename = file.filename ?? "unknown";

      // ── Pre-ingest KPI snapshot (null on first import) ───────────────────
      const kpiBefore = await getHeadlineKpis(db);

      // ── Run ingest ───────────────────────────────────────────────────────
      const result = await ingestLagBesFile(tmpPath, "upload", {
        db,
        correlationId,
      });

      if (result.status === "failed") {
        server.log.warn(
          {
            correlationId,
            event: "upload_failed",
            filename,
            errorCount: result.errors.length,
            durationMs: result.durationMs,
          },
          "upload_failed",
        );
        const body: UploadErrorResponse = {
          status: "failed",
          filename,
          rowsInserted: 0,
          errors: result.errors,
          durationMs: result.durationMs,
        };
        return reply.code(400).send(body);
      }

      // ── Post-ingest KPI snapshot ─────────────────────────────────────────
      const kpiAfter = await getHeadlineKpis(db);
      if (!kpiAfter) {
        // Should not happen: ingest succeeded so MV must have a row. Fall back
        // to zeros rather than throw, so the client still gets a 200.
        server.log.error(
          { correlationId },
          "upload_post_snapshot_empty",
        );
      }

      const safeAfter: HeadlineKpis = kpiAfter ?? {
        totalInventoryValue: 0,
        daysOnHand: null,
        stockoutsCount: 0,
        deadStockPct: 0,
      };

      const kpiDelta = buildKpiDelta(kpiBefore, safeAfter);
      const durationMs = Date.now() - startedAt;

      server.log.info(
        {
          correlationId,
          event: "upload_done",
          filename,
          rowsInserted: result.rowsInserted,
          durationMs,
          ingestDurationMs: result.durationMs,
        },
        "upload_done",
      );

      const body: UploadSuccessResponse = {
        status: "success",
        filename,
        rowsInserted: result.rowsInserted,
        durationMs: result.durationMs,
        kpiDelta,
      };
      return reply.code(200).send(body);
    },
  );
}
