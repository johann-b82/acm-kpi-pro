/**
 * Zod validation schemas for the KPI API layer (Plan 03-05).
 *
 * - kpiColorSchema: enum of valid color values
 * - kpiSummaryResponseSchema: validates the GET /api/v1/kpi/summary response
 * - articleQuerySchema: validates GET /api/v1/kpi/articles query params
 * - articleResponseSchema: validates GET /api/v1/kpi/articles response
 * - kpiMetaResponseSchema: validates GET /api/v1/kpi/meta response
 */

import { z } from "zod";

// ─── Primitives ───────────────────────────────────────────────────────────────

export const kpiColorSchema = z.enum(["green", "yellow", "red", "neutral"]);

// ─── Summary response schema ──────────────────────────────────────────────────

export const kpiSummaryResponseSchema = z.object({
  has_data: z.boolean(),
  last_updated_at: z.string().datetime().nullable(),
  last_import: z
    .object({
      filename: z.string(),
      row_count: z.number().int().nonnegative(),
      source: z.enum(["upload", "watcher", "cli"]),
    })
    .nullable(),
  total_inventory_value: z.object({
    value_eur: z.number(),
    color: z.literal("neutral"),
  }),
  days_on_hand: z.object({
    days: z.number().int().nonnegative(),
    color: kpiColorSchema,
  }),
  slow_dead_stock: z.object({
    buckets: z.array(
      z.object({
        label: z.enum(["active", "slow", "dead"]),
        count: z.number().int().nonnegative(),
        value_eur: z.number(),
        pct: z.number().min(0).max(100),
      }),
    ),
    clutter_excluded_count: z.number().int().nonnegative(),
    samples_excluded_count: z.number().int().nonnegative(),
    color: kpiColorSchema,
  }),
  stockouts: z.object({
    count: z.number().int().nonnegative(),
    items_preview: z.array(
      z.object({
        artikelnr: z.string(),
        bezeichnung_1: z.string().nullable(),
        bestand_basiseinheit: z.number(),
        wert_mit_abw: z.number(),
        abc_kennz_vk: z.enum(["A", "B", "C"]),
      }),
    ),
    color: kpiColorSchema,
  }),
  abc_distribution: z.object({
    a: z.object({ count: z.number().int(), value_eur: z.number() }),
    b: z.object({ count: z.number().int(), value_eur: z.number() }),
    c: z.object({ count: z.number().int(), value_eur: z.number() }),
  }),
  inventory_turnover: z.object({
    ratio: z.number(),
    color: z.literal("neutral"),
  }),
  devaluation: z.object({
    total_eur: z.number(),
    pct_of_value: z.number().min(0).max(100),
    color: z.literal("neutral"),
  }),
});

// ─── Articles query schema ────────────────────────────────────────────────────

export const articleQuerySchema = z.object({
  filter: z.enum(["slow", "dead", "stockout", "search"]).optional(),
  bucket: z.enum(["active", "slow", "dead"]).optional(),
  warehouse: z.string().optional(),
  wgr: z.string().optional(),
  abc: z.enum(["A", "B", "C"]).optional(),
  typ: z.enum(["ART", "MAT", "HLB", "WKZ"]).optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── Articles response schema ─────────────────────────────────────────────────

export const articleResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      id: z.number().int(),
      artikelnr: z.string(),
      bezeichnung_1: z.string().nullable(),
      typ: z.enum(["ART", "MAT", "HLB", "WKZ"]),
      lagername: z.string(),
      bestand_basiseinheit: z.number(),
      einh: z.string().nullable(),
      wert_mit_abw: z.number(),
      letzt_zugang: z.string().nullable(),
      lagerabgang_dat: z.string().nullable(),
      abc_kennz_vk: z.enum(["A", "B", "C"]),
    }),
  ),
});

// ─── Meta response schema ─────────────────────────────────────────────────────

export const kpiMetaResponseSchema = z.object({
  warehouses: z.array(z.string()),
  product_groups: z.array(z.string()),
  abc_classes: z.array(z.enum(["A", "B", "C"])),
  article_types: z.array(z.enum(["ART", "MAT", "HLB", "WKZ"])),
});
