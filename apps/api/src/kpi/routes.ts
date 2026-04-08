/**
 * KPI API route handlers (Plan 03-05).
 *
 * Three endpoints, all protected by requireAuth():
 *   GET /api/v1/kpi/summary  — reads MV + latest import, returns KpiSummary with computed colors
 *   GET /api/v1/kpi/articles — filtered drill-down rows from stock_rows
 *   GET /api/v1/kpi/meta    — distinct values for filter dropdowns
 *
 * Color computation happens here in the API layer, not in the frontend.
 */

import type { FastifyInstance } from "fastify";
import { and, desc, eq, ilike, not, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { imports, stockRows } from "../db/schema.js";
import { requireAuth } from "../middleware/rbac.js";
import type { AppConfig } from "../config.js";
import {
  articleQuerySchema,
  articleResponseSchema,
  kpiMetaResponseSchema,
  kpiSummaryResponseSchema,
} from "./schemas.js";
import { computeKpiColors } from "./colors.js";

export async function registerKpiRoutes(
  server: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  // ── GET /api/v1/kpi/summary ──────────────────────────────────────────────────
  server.get(
    "/api/v1/kpi/summary",
    { preHandler: requireAuth(config) },
    async (_req, reply) => {
      // Find the latest successful import
      const lastImport = await db.query.imports.findFirst({
        where: eq(imports.status, "success"),
        orderBy: desc(imports.finishedAt),
      });

      if (!lastImport) {
        // No successful import yet — return empty onboarding state
        const emptyResult = computeKpiColors(null, null);
        return reply.code(200).send(kpiSummaryResponseSchema.parse(emptyResult));
      }

      // Read the materialized view (single aggregate row)
      const mvRows = await db.execute(
        sql`SELECT * FROM kpi_dashboard_data LIMIT 1`,
      );
      const mvRow = mvRows.rows[0] as Record<string, unknown> | undefined;

      const summary = computeKpiColors(
        mvRow
          ? {
              total_value_eur: mvRow.total_value_eur as string | number,
              days_on_hand: mvRow.days_on_hand as string | number | null,
              slow_dead_stock: mvRow.slow_dead_stock as import("./colors.js").MvRow["slow_dead_stock"],
              stockouts: mvRow.stockouts as import("./colors.js").MvRow["stockouts"],
              abc_distribution: mvRow.abc_distribution as import("./colors.js").MvRow["abc_distribution"],
              inventory_turnover: mvRow.inventory_turnover as string | number,
              devaluation: mvRow.devaluation as import("./colors.js").MvRow["devaluation"],
            }
          : null,
        lastImport
          ? {
              filename: lastImport.filename,
              row_count: lastImport.rowCount ?? null,
              source: lastImport.source,
              finished_at: lastImport.finishedAt ?? null,
            }
          : null,
      );

      return reply.code(200).send(kpiSummaryResponseSchema.parse(summary));
    },
  );

  // ── GET /api/v1/kpi/articles ─────────────────────────────────────────────────
  server.get(
    "/api/v1/kpi/articles",
    { preHandler: requireAuth(config) },
    async (req, reply) => {
      const parsed = articleQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.message });
      }
      const { filter, bucket, warehouse, wgr, abc, typ, q, limit, offset } =
        parsed.data;

      // Base condition: exclude deleted rows
      const conditions: ReturnType<typeof eq>[] = [eq(stockRows.geloescht, "N")];

      // Slice filters
      if (warehouse) conditions.push(eq(stockRows.lagername, warehouse));
      if (wgr) conditions.push(eq(stockRows.wgr, wgr));
      if (abc)
        conditions.push(
          eq(sql`COALESCE(${stockRows.abcKennzVk}, 'C')`, abc),
        );
      if (typ) conditions.push(eq(stockRows.typ, typ));

      // Filter type
      if (filter === "slow") {
        const relevantBucket = bucket ?? "slow";
        if (relevantBucket === "active") {
          conditions.push(
            sql`(${stockRows.lagerabgangDat} > CURRENT_DATE - INTERVAL '6 months' OR ${stockRows.letztZugang} > CURRENT_DATE - INTERVAL '6 months')`,
          );
        } else if (relevantBucket === "slow") {
          conditions.push(
            sql`((${stockRows.lagerabgangDat} BETWEEN CURRENT_DATE - INTERVAL '12 months' AND CURRENT_DATE - INTERVAL '6 months') OR (${stockRows.letztZugang} BETWEEN CURRENT_DATE - INTERVAL '12 months' AND CURRENT_DATE - INTERVAL '6 months'))`,
          );
        } else {
          // dead bucket
          conditions.push(
            sql`(${stockRows.lagerabgangDat} < CURRENT_DATE - INTERVAL '12 months' OR (${stockRows.lagerabgangDat} IS NULL AND (${stockRows.letztZugang} < CURRENT_DATE - INTERVAL '12 months' OR ${stockRows.letztZugang} IS NULL)))`,
          );
        }
      } else if (filter === "stockout" || filter === "dead") {
        // Stockout: bestand_lagereinheit <= 0 OR (reichw_mon < 1 AND NOT NULL)
        // Exclude museum rows (WKZ tool items + MUSTERRAUM warehouses)
        conditions.push(
          sql`(${stockRows.bestandLagereinheit} <= 0 OR (${stockRows.reichwMon} < 1 AND ${stockRows.reichwMon} IS NOT NULL))`,
        );
        conditions.push(not(eq(stockRows.typ, "WKZ")));
        conditions.push(not(sql`${stockRows.lagername} ILIKE 'MUSTERRAUM%'`));
      } else if (filter === "search" && q) {
        conditions.push(
          or(
            ilike(stockRows.artikelnr, `%${q}%`),
            ilike(stockRows.bezeichnung1, `%${q}%`),
          )!,
        );
      }

      const whereClause = and(...conditions);

      // Count total matching rows
      const countResult = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(stockRows)
        .where(whereClause);
      const total = Number(countResult[0]?.count ?? 0);

      // Fetch the requested page
      const items = await db
        .select({
          id: stockRows.id,
          artikelnr: stockRows.artikelnr,
          bezeichnung_1: stockRows.bezeichnung1,
          typ: stockRows.typ,
          lagername: stockRows.lagername,
          bestand_basiseinheit: stockRows.bestandBasiseinheit,
          einh: stockRows.einh,
          wert_mit_abw: stockRows.wertMitAbw,
          letzt_zugang: stockRows.letztZugang,
          lagerabgang_dat: stockRows.lagerabgangDat,
          abc_kennz_vk: sql<string>`COALESCE(${stockRows.abcKennzVk}, 'C')`,
        })
        .from(stockRows)
        .where(whereClause)
        .orderBy(desc(stockRows.wertMitAbw))
        .limit(limit)
        .offset(offset);

      return reply.code(200).send(articleResponseSchema.parse({ total, items }));
    },
  );

  // ── GET /api/v1/kpi/meta ─────────────────────────────────────────────────────
  server.get(
    "/api/v1/kpi/meta",
    { preHandler: requireAuth(config) },
    async (_req, reply) => {
      const [warehouses, productGroups] = await Promise.all([
        db
          .selectDistinct({ lagername: stockRows.lagername })
          .from(stockRows)
          .where(eq(stockRows.geloescht, "N"))
          .orderBy(stockRows.lagername),
        db
          .selectDistinct({ wgr: stockRows.wgr })
          .from(stockRows)
          .where(
            and(
              eq(stockRows.geloescht, "N"),
              not(sql`${stockRows.wgr} IS NULL`),
            ),
          )
          .orderBy(stockRows.wgr),
      ]);

      const meta = {
        warehouses: warehouses.map((r) => r.lagername),
        product_groups: productGroups.map((r) => r.wgr!),
        abc_classes: ["A", "B", "C"] as const,
        article_types: ["ART", "MAT", "HLB", "WKZ"] as const,
      };

      return reply.code(200).send(kpiMetaResponseSchema.parse(meta));
    },
  );
}
