---
phase: 03-kpi-layer-dashboard
plan: "03-05"
type: execute
wave: 2
depends_on: ["03-02", "03-03"]
can_run_parallel_with: ["03-04", "03-06"]
files_modified:
  - apps/api/src/kpi/routes.ts
  - apps/api/src/kpi/schemas.ts
  - apps/api/src/kpi/colors.ts
  - apps/api/src/kpi/routes.test.ts
  - apps/api/src/server.ts
autonomous: true
requirements:
  - KPI-02
  - KPI-03
  - KPI-04
  - KPI-05
  - KPI-06
  - KPI-07
  - KPI-08
  - KPI-09
  - DASH-01
  - DASH-02
  - DASH-03
  - DASH-04
  - DASH-05
  - DASH-06
  - DASH-07
  - DASH-08
  - DASH-11
  - TEST-02

must_haves:
  truths:
    - "GET /api/v1/kpi/summary returns 200 with has_data: true when a successful import exists"
    - "GET /api/v1/kpi/summary returns 200 with has_data: false and all-zeros payload when no successful import exists (onboarding empty state)"
    - "GET /api/v1/kpi/summary returns 401 for unauthenticated requests"
    - "Color computation happens in the API layer, not the frontend (days_on_hand.color, stockouts.color, slow_dead_stock.color are in the JSON response)"
    - "GET /api/v1/kpi/articles?filter=stockout returns the stockout rows"
    - "GET /api/v1/kpi/meta returns distinct warehouses and product groups"
    - "All 3 endpoints are mounted at /api/v1/kpi/* in server.ts"
  artifacts:
    - path: apps/api/src/kpi/routes.ts
      provides: "3 route handlers: GET /summary, GET /articles, GET /meta"
      exports: ["registerKpiRoutes"]
    - path: apps/api/src/kpi/schemas.ts
      provides: "Zod schemas for request validation and response parsing"
      exports:
        - kpiSummaryResponseSchema
        - articleQuerySchema
        - articleResponseSchema
        - kpiMetaResponseSchema
    - path: apps/api/src/kpi/colors.ts
      provides: "Pure color computation function (no DB dependency)"
      exports: ["computeKpiColors"]
    - path: apps/api/src/kpi/routes.test.ts
      provides: "Vitest unit tests with vi.mock for DB"
    - path: apps/api/src/server.ts
      provides: "Route registration: registerKpiRoutes(server, config)"
  key_links:
    - from: apps/api/src/kpi/routes.ts
      to: packages/core/src/kpi/types.ts
      via: "import type { KpiSummary, ArticleListResponse, KpiMeta } from '@acm-kpi/core'"
    - from: apps/api/src/kpi/routes.ts
      to: apps/api/src/kpi/colors.ts
      via: "computeKpiColors(mvRow) returns color fields"
    - from: apps/api/src/server.ts
      to: apps/api/src/kpi/routes.ts
      via: "await registerKpiRoutes(server, config) after auth routes"
---

<objective>
Create the three KPI API endpoints and mount them in the Fastify server. All endpoints require authentication via `requireAuth(config)` (any Viewer or Admin). Color computation happens exclusively in the API layer — the frontend receives pre-computed color strings.

The three endpoints:
1. `GET /api/v1/kpi/summary` — reads the MV + latest import metadata, computes colors, returns `KpiSummary`
2. `GET /api/v1/kpi/articles` — filtered drill-down from `stock_rows` with 8 query params
3. `GET /api/v1/kpi/meta` — distinct filter values (warehouses, product groups, etc.) for dropdowns

Purpose: These are the only backend surfaces Phase 3's dashboard consumes. The summary endpoint is polled every 30 seconds by React Query.

Output: `apps/api/src/kpi/` directory (new), updated `apps/api/src/server.ts`, Vitest tests covering summary empty-state, color thresholds, and 401 auth enforcement.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-kpi-layer-dashboard/03-CONTEXT.md
@.planning/phases/03-kpi-layer-dashboard/01-RESEARCH.md

<interfaces>
<!-- requireAuth signature from apps/api/src/middleware/rbac.ts -->
```typescript
export function requireAuth(config: AppConfig): preHandlerHookHandler
// Usage: { preHandler: requireAuth(config) }
```

<!-- existing server.ts route mount pattern -->
From apps/api/src/server.ts:
```typescript
await registerAuthRoutes(server, config, ldapService);
await registerAdminRoutes(server, config);
// Phase 3 adds:
// await registerKpiRoutes(server, config);
```

<!-- DB access pattern from Phase 2 -->
```typescript
import { db } from "../db/index.js";
import { eq, sql, desc, and, or, not, ilike } from "drizzle-orm";
import { stockRows, imports } from "../db/schema.js";
```

<!-- Color thresholds (LOCKED in CONTEXT.md) -->
Days-on-hand: >= 90 days → green, 30–89 → yellow, < 30 → red
Stockouts count: 0 → green, 1–10 → yellow, > 10 → red
Dead-stock % of total value: < 5% → green, 5–15% → yellow, > 15% → red
Total inventory value, inventory turnover, devaluation: always "neutral"
ABC distribution: always "neutral"
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create apps/api/src/kpi/schemas.ts and apps/api/src/kpi/colors.ts</name>
  <files>apps/api/src/kpi/schemas.ts, apps/api/src/kpi/colors.ts</files>
  <action>
**Create `apps/api/src/kpi/schemas.ts`** — Zod validation schemas for the 3 endpoints.

Import Zod: `import { z } from "zod";`

1. `kpiColorSchema`: `z.enum(["green", "yellow", "red", "neutral"])`

2. `kpiSummaryResponseSchema` — matches the `KpiSummary` interface from packages/core/src/kpi/types.ts exactly. Use the full schema from RESEARCH.md (lines ~460–524). Include all 9 top-level fields: `has_data`, `last_updated_at`, `last_import`, `total_inventory_value`, `days_on_hand`, `slow_dead_stock`, `stockouts`, `abc_distribution`, `inventory_turnover`, `devaluation`.

3. `articleQuerySchema` — validates query string params:
   ```typescript
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
   ```
   Note: `z.coerce.number()` handles query strings being passed as strings.

4. `articleResponseSchema` — matches `ArticleListResponse` from core/kpi/types.ts.

5. `kpiMetaResponseSchema`:
   ```typescript
   export const kpiMetaResponseSchema = z.object({
     warehouses: z.array(z.string()),
     product_groups: z.array(z.string()),
     abc_classes: z.array(z.enum(["A", "B", "C"])),
     article_types: z.array(z.enum(["ART", "MAT", "HLB", "WKZ"])),
   });
   ```

---

**Create `apps/api/src/kpi/colors.ts`** — pure color computation, no DB imports.

```typescript
import type { KpiSummary } from "@acm-kpi/core";

interface MvRow {
  total_value_eur: string | number;
  days_on_hand: string | number | null;
  slow_dead_stock: {
    dead: { pct: number };
    active: { count: number; value_eur: number; pct: number };
    slow: { count: number; value_eur: number; pct: number };
    clutter_count: number;
    samples_count: number;
  };
  stockouts: {
    count: number;
    items_preview: KpiSummary["stockouts"]["items_preview"];
  };
  abc_distribution: KpiSummary["abc_distribution"];
  inventory_turnover: string | number;
  devaluation: { total_eur: number; pct_of_value: number };
}

interface LastImport {
  filename: string;
  row_count: number | null;
  source: string;
  finished_at: Date | null;
}

export function computeKpiColors(
  mvRow: MvRow | null,
  lastImport: LastImport | null,
): KpiSummary {
  if (!mvRow || !lastImport) {
    return {
      has_data: false,
      last_updated_at: null,
      last_import: null,
      total_inventory_value: { value_eur: 0, color: "neutral" },
      days_on_hand: { days: 0, color: "neutral" },
      slow_dead_stock: {
        buckets: [
          { label: "active", count: 0, value_eur: 0, pct: 0 },
          { label: "slow", count: 0, value_eur: 0, pct: 0 },
          { label: "dead", count: 0, value_eur: 0, pct: 0 },
        ],
        clutter_excluded_count: 0,
        samples_excluded_count: 0,
        color: "neutral",
      },
      stockouts: { count: 0, items_preview: [], color: "neutral" },
      abc_distribution: {
        a: { count: 0, value_eur: 0 },
        b: { count: 0, value_eur: 0 },
        c: { count: 0, value_eur: 0 },
      },
      inventory_turnover: { ratio: 0, color: "neutral" },
      devaluation: { total_eur: 0, pct_of_value: 0, color: "neutral" },
    };
  }

  const daysOnHand = Number(mvRow.days_on_hand ?? 0);
  const stockoutCount = Number(mvRow.stockouts.count ?? 0);
  const deadPct = Number(mvRow.slow_dead_stock.dead.pct ?? 0);

  return {
    has_data: true,
    last_updated_at: lastImport.finished_at?.toISOString() ?? null,
    last_import: {
      filename: lastImport.filename,
      row_count: lastImport.row_count ?? 0,
      source: lastImport.source as KpiSummary["last_import"]["source"],
    },
    total_inventory_value: {
      value_eur: Number(mvRow.total_value_eur),
      color: "neutral",
    },
    days_on_hand: {
      days: Math.round(daysOnHand),
      color: daysOnHand >= 90 ? "green" : daysOnHand >= 30 ? "yellow" : "red",
    },
    slow_dead_stock: {
      buckets: [
        { label: "active", ...mvRow.slow_dead_stock.active },
        { label: "slow", ...mvRow.slow_dead_stock.slow },
        { label: "dead", ...mvRow.slow_dead_stock.dead },
      ],
      clutter_excluded_count: mvRow.slow_dead_stock.clutter_count,
      samples_excluded_count: mvRow.slow_dead_stock.samples_count,
      color: deadPct < 5 ? "green" : deadPct < 15 ? "yellow" : "red",
    },
    stockouts: {
      count: stockoutCount,
      items_preview: mvRow.stockouts.items_preview,
      color: stockoutCount === 0 ? "green" : stockoutCount <= 10 ? "yellow" : "red",
    },
    abc_distribution: mvRow.abc_distribution,
    inventory_turnover: { ratio: Number(mvRow.inventory_turnover), color: "neutral" },
    devaluation: { ...mvRow.devaluation, color: "neutral" },
  };
}
```
  </action>
  <verify>
    <automated>npx tsc --noEmit -p "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/tsconfig.json" 2>&1 | head -20</automated>
  </verify>
  <done>Both files exist; `tsc --noEmit` on apps/api reports 0 errors for the new files; `computeKpiColors(null, null)` returns `has_data: false`</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create apps/api/src/kpi/routes.ts and routes.test.ts; mount in server.ts</name>
  <files>apps/api/src/kpi/routes.ts, apps/api/src/kpi/routes.test.ts, apps/api/src/server.ts</files>
  <behavior>
    - Test: GET /api/v1/kpi/summary without session cookie → 401
    - Test: GET /api/v1/kpi/summary when imports table is empty → 200, body.has_data = false
    - Test: GET /api/v1/kpi/summary when a successful import exists → 200, body.has_data = true, body.days_on_hand.color is "green"|"yellow"|"red"
    - Test: GET /api/v1/kpi/summary color thresholds — days_on_hand: 95 days → green, 45 days → yellow, 20 days → red
    - Test: GET /api/v1/kpi/summary color thresholds — stockouts: 0 → green, 5 → yellow, 15 → red
    - Test: GET /api/v1/kpi/summary color thresholds — dead stock pct: 3% → green, 10% → yellow, 20% → red
    - Test: GET /api/v1/kpi/articles?filter=stockout → 200, body has .total and .items array
    - Test: GET /api/v1/kpi/articles?limit=abc → 400 (invalid coerced param)
    - Test: GET /api/v1/kpi/meta → 200, body has .warehouses array
  </behavior>
  <action>
**Step 1: Write failing tests (RED)**

Create `apps/api/src/kpi/routes.test.ts` with `vi.mock` for the DB module and `vi.mock` for `../middleware/rbac.js`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServer } from "../server.js";
// ... etc
```

Mock pattern (use the same pattern as existing Phase 2 tests in the codebase):
- `vi.mock("../db/index.js", () => ({ db: { ... } }))` with stubbed query results
- For unauthenticated tests: mock `requireAuth` to call `reply.code(401).send()`
- For authenticated tests: mock `requireAuth` to call `next()`

Tests must run without Docker — all DB access is mocked.

**Step 2: Create `apps/api/src/kpi/routes.ts` (GREEN)**

```typescript
import type { FastifyInstance } from "fastify";
import { eq, sql, desc, and, or, not, ilike } from "drizzle-orm";
import { db } from "../db/index.js";
import { stockRows, imports } from "../db/schema.js";
import { requireAuth } from "../middleware/rbac.js";
import type { AppConfig } from "../config.js";
import { kpiSummaryResponseSchema, articleQuerySchema, articleResponseSchema, kpiMetaResponseSchema } from "./schemas.js";
import { computeKpiColors } from "./colors.js";

export async function registerKpiRoutes(
  server: FastifyInstance,
  config: AppConfig,
): Promise<void> {

  // ── GET /api/v1/kpi/summary ─────────────────────────────────────────────────
  server.get(
    "/api/v1/kpi/summary",
    { preHandler: requireAuth(config) },
    async (_req, reply) => {
      // Read the latest successful import
      const lastImport = await db.query.imports.findFirst({
        where: eq(imports.status, "success"),
        orderBy: desc(imports.finishedAt),
      });

      if (!lastImport) {
        // No successful import — return empty state
        const emptyResult = computeKpiColors(null, null);
        return reply.code(200).send(kpiSummaryResponseSchema.parse(emptyResult));
      }

      // Read MV (single row)
      const mvRows = await db.execute(
        sql`SELECT * FROM kpi_dashboard_data LIMIT 1`
      );
      const mvRow = mvRows.rows[0] as Record<string, unknown> | undefined;

      const summary = computeKpiColors(
        mvRow ? {
          total_value_eur: mvRow.total_value_eur,
          days_on_hand: mvRow.days_on_hand,
          slow_dead_stock: mvRow.slow_dead_stock as any,
          stockouts: mvRow.stockouts as any,
          abc_distribution: mvRow.abc_distribution as any,
          inventory_turnover: mvRow.inventory_turnover,
          devaluation: mvRow.devaluation as any,
        } : null,
        mvRow ? lastImport : null,
      );

      return reply.code(200).send(kpiSummaryResponseSchema.parse(summary));
    },
  );

  // ── GET /api/v1/kpi/articles ────────────────────────────────────────────────
  server.get(
    "/api/v1/kpi/articles",
    { preHandler: requireAuth(config) },
    async (req, reply) => {
      const query = articleQuerySchema.safeParse(req.query);
      if (!query.success) {
        return reply.code(400).send({ error: query.error.message });
      }
      const { filter, bucket, warehouse, wgr, abc, typ, q, limit, offset } = query.data;

      // Build base query selecting the 10 essential columns
      const conditions = [eq(stockRows.geloescht, "N")];

      // Slice filters
      if (warehouse) conditions.push(eq(stockRows.lagername, warehouse));
      if (wgr) conditions.push(eq(stockRows.wgr, wgr));
      if (abc) conditions.push(eq(sql`COALESCE(${stockRows.abcKennzVk}, 'C')`, abc));
      if (typ) conditions.push(eq(stockRows.typ, typ));

      // Filter type
      if (filter === "slow") {
        const relevantBucket = bucket ?? "slow";
        if (relevantBucket === "active") {
          conditions.push(sql`(${stockRows.lagerabgangDat} > CURRENT_DATE - INTERVAL '6 months' OR ${stockRows.letztZugang} > CURRENT_DATE - INTERVAL '6 months')`);
        } else if (relevantBucket === "slow") {
          conditions.push(sql`((${stockRows.lagerabgangDat} BETWEEN CURRENT_DATE - INTERVAL '12 months' AND CURRENT_DATE - INTERVAL '6 months') OR (${stockRows.letztZugang} BETWEEN CURRENT_DATE - INTERVAL '12 months' AND CURRENT_DATE - INTERVAL '6 months'))`);
        } else if (relevantBucket === "dead") {
          conditions.push(sql`(${stockRows.lagerabgangDat} < CURRENT_DATE - INTERVAL '12 months' OR (${stockRows.lagerabgangDat} IS NULL AND (${stockRows.letztZugang} < CURRENT_DATE - INTERVAL '12 months' OR ${stockRows.letztZugang} IS NULL)))`);
        }
      } else if (filter === "stockout" || filter === "dead") {
        conditions.push(sql`(${stockRows.bestandLagereinheit} <= 0 OR (${stockRows.reichwMon} < 1 AND ${stockRows.reichwMon} IS NOT NULL))`);
        conditions.push(not(eq(stockRows.typ, "WKZ")));
        conditions.push(not(sql`${stockRows.lagername} ILIKE 'MUSTERRAUM%'`));
      } else if (filter === "search" && q) {
        conditions.push(or(
          ilike(stockRows.artikelnr, `%${q}%`),
          ilike(stockRows.bezeichnung1, `%${q}%`),
        )!);
      }

      const whereClause = and(...conditions);

      // Count total
      const countResult = await db
        .select({ count: sql`COUNT(*)::int` })
        .from(stockRows)
        .where(whereClause);
      const total = Number(countResult[0]?.count ?? 0);

      // Fetch page
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

  // ── GET /api/v1/kpi/meta ────────────────────────────────────────────────────
  server.get(
    "/api/v1/kpi/meta",
    { preHandler: requireAuth(config) },
    async (_req, reply) => {
      const [warehouses, productGroups] = await Promise.all([
        db.selectDistinct({ lagername: stockRows.lagername })
          .from(stockRows)
          .where(eq(stockRows.geloescht, "N"))
          .orderBy(stockRows.lagername),
        db.selectDistinct({ wgr: stockRows.wgr })
          .from(stockRows)
          .where(and(eq(stockRows.geloescht, "N"), not(sql`${stockRows.wgr} IS NULL`)))
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
```

**Step 3: Mount in server.ts**

In `apps/api/src/server.ts`, add after `await registerAdminRoutes(server, config);`:

```typescript
import { registerKpiRoutes } from "./kpi/routes.js";
// ...
await registerKpiRoutes(server, config);
```

Run `cd apps/api && npm test` — all tests including new routes.test.ts should pass.
  </action>
  <verify>
    <automated>cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api" && npm test 2>&1 | tail -25</automated>
  </verify>
  <done>All API tests pass; `GET /api/v1/kpi/summary`, `GET /api/v1/kpi/articles`, `GET /api/v1/kpi/meta` return correct status codes and bodies per test assertions; color threshold tests pass for all three color-coded KPIs; `tsc --noEmit` exits 0</done>
</task>

</tasks>

<verification>
```bash
# TypeScript check
npx tsc --noEmit -p "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/tsconfig.json" 2>&1 | head -10

# All API tests pass
cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api" && npm test

# Routes are mounted
grep "registerKpiRoutes" "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/src/server.ts"

# Color logic in API, not frontend
grep -r "computeKpiColors\|color.*green\|color.*yellow\|color.*red" \
  "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api/src/kpi/"
# Expected: colors.ts contains the logic

# Color logic NOT in frontend
grep -r "computeKpiColors" \
  "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend/src/"
# Expected: no matches
```
</verification>

<success_criteria>
- `apps/api/src/kpi/` directory created with 4 files: `routes.ts`, `schemas.ts`, `colors.ts`, `routes.test.ts`
- `apps/api/src/server.ts` calls `await registerKpiRoutes(server, config)`
- `cd apps/api && npm test` exits 0 (all tests pass)
- Color computation lives in `apps/api/src/kpi/colors.ts` (not in the frontend)
- Empty-state path (`has_data: false`) covered by test
- 401 for unauthenticated requests covered by test
- All 9 color threshold cases covered by tests (3 KPIs × 3 thresholds each)
</success_criteria>

<output>
After completion, create `.planning/phases/03-kpi-layer-dashboard/03-05-SUMMARY-api-endpoints.md` with:
- Files created
- Test count and coverage
- Any deviations from the plan (with reason)
- Confirmation that color computation is API-side only
</output>
