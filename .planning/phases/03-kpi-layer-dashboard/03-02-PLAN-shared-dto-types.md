---
phase: 03-kpi-layer-dashboard
plan: "03-02"
type: execute
wave: 1
depends_on: []
can_run_parallel_with: ["03-03"]
files_modified:
  - packages/core/src/kpi/types.ts
  - packages/core/src/index.ts
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

must_haves:
  truths:
    - "Both apps/api and apps/frontend can import KpiSummary, ArticleListResponse, KpiMeta, KpiColor from @acm-kpi/core without error"
    - "The types are pure TypeScript (no runtime code, no imports from external packages)"
    - "ArticleFilterQuery captures all 8 query parameters used by the /articles endpoint"
  artifacts:
    - path: packages/core/src/kpi/types.ts
      provides: "All shared DTOs for Phase 3 KPI layer"
      exports:
        - KpiColor
        - KpiSummary
        - SlowMoverBucket
        - ArticleSummary
        - ArticleFilterQuery
        - ArticleListResponse
        - KpiMeta
        - ArticleType
        - AbcClass
        - ImportSource
    - path: packages/core/src/index.ts
      provides: "Barrel export updated to include kpi/types"
  key_links:
    - from: packages/core/src/kpi/types.ts
      to: apps/api/src/kpi/routes.ts
      via: "import type { KpiSummary } from '@acm-kpi/core'"
    - from: packages/core/src/kpi/types.ts
      to: apps/frontend/src/features/kpi/hooks/useKpiSummary.ts
      via: "import type { KpiSummary } from '@acm-kpi/core'"
---

<objective>
Create the shared DTO types that form the contract between the API and the frontend for Phase 3's KPI layer. This plan produces pure TypeScript types with zero runtime overhead — no Zod, no imports, just interfaces and type aliases that both apps/api and apps/frontend reference.

Purpose: A single source of truth for the KPI response shape means the API and frontend cannot silently diverge. If the API handler returns a field the frontend doesn't expect, TypeScript catches it at compile time in both packages.

Output: `packages/core/src/kpi/types.ts` (all DTOs) and an updated `packages/core/src/index.ts` barrel.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/03-kpi-layer-dashboard/03-CONTEXT.md
@.planning/phases/03-kpi-layer-dashboard/01-RESEARCH.md

<interfaces>
<!-- Existing barrel export to be extended -->
From packages/core/src/index.ts (current):
```typescript
export type { Role, AuthUser, AuthProvider } from "./types/auth.js";
export type { KpiSummary } from "./types/kpi.js";
export type { CsvIngestionJobPayload } from "./types/job.js";
export * from "./ingest/types.js";
```

Note: `./types/kpi.js` already exists as a stub from Phase 1.
Phase 3 REPLACES it with the full KPI types in `./kpi/types.js`.
Remove the old stub export and replace with the new path.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create packages/core/src/kpi/types.ts with all Phase 3 DTOs</name>
  <files>packages/core/src/kpi/types.ts</files>
  <action>
Create the file `packages/core/src/kpi/types.ts`. This is a pure TypeScript file — no imports, no runtime code.

Export the following types exactly as specified (names are the contract; API and frontend both depend on them):

```typescript
// ─── Primitives ───────────────────────────────────────────────────────────────

export type KpiColor = "green" | "yellow" | "red" | "neutral";

export type ArticleType = "ART" | "MAT" | "HLB" | "WKZ";

export type AbcClass = "A" | "B" | "C";

export type ImportSource = "upload" | "watcher" | "cli";

// ─── Slow-mover sub-types ─────────────────────────────────────────────────────

/** One of the three value-weighted aging buckets (Active / Slow / Dead). */
export interface SlowMoverBucket {
  label: "active" | "slow" | "dead";
  /** Article count in this bucket */
  count: number;
  /** Total € value in this bucket */
  value_eur: number;
  /** Percentage of total non-excluded stock value (0–100) */
  pct: number;
}

// ─── Article summary (used in stockout preview + articles endpoint) ───────────

export interface ArticleSummary {
  artikelnr: string;
  bezeichnung_1: string | null;
  bestand_basiseinheit: number;
  wert_mit_abw: number;
  abc_kennz_vk: AbcClass;
}

// ─── Full article row (from /kpi/articles endpoint) ──────────────────────────

export interface ArticleRow {
  id: number;
  artikelnr: string;
  bezeichnung_1: string | null;
  typ: ArticleType;
  lagername: string;
  bestand_basiseinheit: number;
  einh: string | null;
  wert_mit_abw: number;
  letzt_zugang: string | null;   // ISO date string "YYYY-MM-DD"
  lagerabgang_dat: string | null; // ISO date string "YYYY-MM-DD"
  abc_kennz_vk: AbcClass;
}

// ─── Main KPI summary (GET /api/v1/kpi/summary) ───────────────────────────────

export interface KpiSummary {
  /** true when at least one successful import has been run */
  has_data: boolean;
  /** ISO 8601 timestamp of the latest successful import, or null */
  last_updated_at: string | null;
  /** Metadata from the latest successful import, or null */
  last_import: {
    filename: string;
    row_count: number;
    source: ImportSource;
  } | null;
  /** KPI-03: SUM(wert_mit_abw) for non-deleted rows */
  total_inventory_value: {
    value_eur: number;
    color: "neutral";
  };
  /** KPI-04: Weighted average days-on-hand (reichw_mon * 30, weighted by wert_mit_abw) */
  days_on_hand: {
    days: number;
    color: KpiColor; // green >=90d, yellow 30-89d, red <30d
  };
  /** KPI-05: Slow-mover / dead-stock aging buckets */
  slow_dead_stock: {
    buckets: SlowMoverBucket[];
    /** Dead-stock items with wert_mit_abw < €100, excluded from bucket totals */
    clutter_excluded_count: number;
    /** WKZ + MUSTERRAUM rows excluded from slow-mover analysis entirely */
    samples_excluded_count: number;
    color: KpiColor; // based on dead-stock % of total value: green <5%, yellow 5-15%, red >15%
  };
  /** KPI-06: Rows where bestand_lagereinheit <= 0 OR reichw_mon < 1 (non-deleted, non-museum) */
  stockouts: {
    count: number;
    /** Top 5 by wert_mit_abw DESC */
    items_preview: ArticleSummary[];
    color: KpiColor; // green =0, yellow 1-10, red >10
  };
  /** KPI-07: ABC distribution by count and value */
  abc_distribution: {
    a: { count: number; value_eur: number };
    b: { count: number; value_eur: number };
    c: { count: number; value_eur: number };
  };
  /** KPI-08: Proxy turnover ratio: SUM(umsatz_me_j) / SUM(bestand_basiseinheit) */
  inventory_turnover: {
    ratio: number;
    color: "neutral";
  };
  /** KPI-09: SUM(wert - wert_mit_abw) in € and as % of total wert */
  devaluation: {
    total_eur: number;
    pct_of_value: number; // 0–100
    color: "neutral";
  };
}

// ─── Articles query params (GET /api/v1/kpi/articles) ─────────────────────────

export interface ArticleFilterQuery {
  filter?: "slow" | "dead" | "stockout" | "search";
  bucket?: "active" | "slow" | "dead";
  warehouse?: string;
  wgr?: string;
  abc?: AbcClass;
  typ?: ArticleType;
  /** Search by Artikelnr or Bezeichnung 1 (partial match) */
  q?: string;
  limit?: number;
  offset?: number;
}

// ─── Articles list response ───────────────────────────────────────────────────

export interface ArticleListResponse {
  /** Total matching rows (before limit/offset) */
  total: number;
  items: ArticleRow[];
}

// ─── Filter metadata (GET /api/v1/kpi/meta) ───────────────────────────────────

export interface KpiMeta {
  /** Distinct lagername values from stock_rows */
  warehouses: string[];
  /** Distinct wgr values from stock_rows */
  product_groups: string[];
  abc_classes: AbcClass[];
  article_types: ArticleType[];
}
```

Do NOT add Zod schemas to this file. Schemas live in `apps/api/src/kpi/schemas.ts` (Plan 03-05).
  </action>
  <verify>
    <automated>cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro" && npx tsc --noEmit -p packages/core/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>File exists at packages/core/src/kpi/types.ts; all 10 types/interfaces exported; `tsc --noEmit` on packages/core reports 0 errors</done>
</task>

<task type="auto">
  <name>Task 2: Update packages/core/src/index.ts barrel export</name>
  <files>packages/core/src/index.ts</files>
  <action>
Read the current `packages/core/src/index.ts`. It contains:

```typescript
export type { Role, AuthUser, AuthProvider } from "./types/auth.js";
export type { KpiSummary } from "./types/kpi.js";
export type { CsvIngestionJobPayload } from "./types/job.js";
export * from "./ingest/types.js";
```

Replace the `export type { KpiSummary } from "./types/kpi.js";` line with:

```typescript
export type {
  KpiColor,
  KpiSummary,
  SlowMoverBucket,
  ArticleSummary,
  ArticleRow,
  ArticleFilterQuery,
  ArticleListResponse,
  KpiMeta,
  ArticleType,
  AbcClass,
  ImportSource,
} from "./kpi/types.js";
```

Keep the other three export lines unchanged. The old `./types/kpi.js` stub can remain on disk (it contained only the Phase 1 placeholder `KpiSummary` which is now superseded). The barrel no longer re-exports it.

Check if `packages/core/src/types/kpi.ts` exists. If it does, delete it to avoid confusion:
```bash
rm -f packages/core/src/types/kpi.ts packages/core/src/types/kpi.js
```
  </action>
  <verify>
    <automated>cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro" && node -e "const c = require('./packages/core/dist/index.js'); console.log(typeof c)" 2>/dev/null || npx tsc --noEmit -p packages/core/tsconfig.json 2>&1 | head -10</automated>
  </verify>
  <done>packages/core/src/index.ts exports all 10 KPI types from ./kpi/types.js; `tsc --noEmit` on packages/core passes with 0 errors</done>
</task>

</tasks>

<verification>
```bash
# Full TypeScript check across the monorepo
cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro"

# Core package compiles cleanly
npx tsc --noEmit -p packages/core/tsconfig.json

# Test that both api and frontend can resolve the types
grep -r "from '@acm-kpi/core'" apps/api/src/ apps/frontend/src/ | head -5
# Expected: existing imports continue resolving

# Verify all expected exports exist
node -e "
const src = require('fs').readFileSync('packages/core/src/kpi/types.ts', 'utf8');
const expected = ['KpiColor','KpiSummary','SlowMoverBucket','ArticleSummary','ArticleRow','ArticleFilterQuery','ArticleListResponse','KpiMeta','ArticleType','AbcClass','ImportSource'];
expected.forEach(name => {
  if (!src.includes(name)) console.error('MISSING:', name);
  else console.log('OK:', name);
});
"
```
</verification>

<success_criteria>
- `packages/core/src/kpi/types.ts` exists with all 10 exports
- `packages/core/src/index.ts` barrel re-exports all 10 types
- `npx tsc --noEmit -p packages/core/tsconfig.json` exits 0
- No Zod or runtime code in the types file
- `KpiSummary.has_data: boolean` is the field that controls empty-state rendering (downstream plans depend on this exact field name)
</success_criteria>

<output>
After completion, create `.planning/phases/03-kpi-layer-dashboard/03-02-SUMMARY-shared-dto-types.md` with:
- Files created/modified
- Export names confirmed
- Any deviations from this plan (with reason)
</output>
