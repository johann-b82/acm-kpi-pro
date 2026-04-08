---
phase: "02"
plan: "02-03"
slug: feed-parser-interface
subsystem: core-types
tags: [types, interfaces, ingest, extensibility, KPI-10]
dependency_graph:
  requires: []
  provides: [FeedParser, ParsedRow, IngestError, ValidationResult, IngestResult, FeedRegistry]
  affects: [apps/api/src/ingest/registry.ts, Phase 3+ feed registration]
tech_stack:
  added: []
  patterns: [pure-TypeScript-interfaces, re-export-barrel, AsyncIterable]
key_files:
  created:
    - packages/core/src/ingest/types.ts
  modified:
    - packages/core/src/index.ts
decisions:
  - "Used index signature on ParsedRow ([key: string]: unknown) rather than a named field to keep the type feed-agnostic and compatible with both LagBes and future feeds"
  - "Typed FeedParser.db parameter as unknown (not Drizzle client) to keep @acm-kpi/core free of runtime dependencies"
  - "FeedRegistry = Map<string, FeedParser> (type alias, not class) — callers instantiate with new Map() in apps/api"
  - "export * from ./ingest/types.js in barrel — TypeScript 6 keeps re-export in index.d.ts (no inlining), declarations live in dist/ingest/types.d.ts"
metrics:
  duration_minutes: 10
  completed_date: "2026-04-08"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
requirements_satisfied: [KPI-10]
---

# Phase 02 Plan 03: Feed Parser Interface Summary

**One-liner:** Pure TypeScript FeedParser/IngestResult/FeedRegistry contracts in @acm-kpi/core enabling feed-agnostic KPI extensibility (KPI-10).

## What Was Built

Created `packages/core/src/ingest/types.ts` — a zero-import TypeScript file that defines the shared contract for all data feed parsers. Updated the package barrel to re-export all types so downstream packages can `import { FeedParser } from "@acm-kpi/core"`.

### Exported Types

| Export | Kind | Purpose |
|--------|------|---------|
| `ParsedRow` | interface | Index-signature row shape; concrete feeds narrow via Zod schemas in apps/api |
| `IngestError` | interface | Single field validation error with row number, field, value, reason |
| `ValidationResult` | interface | Batch validation outcome: `valid`, optional `rows[]`, optional `errors[]` |
| `IngestResult` | interface | Full pipeline outcome: status, filename, rowsInserted, errors, durationMs, correlationId |
| `FeedParser` | interface | Contract every feed must implement: id, name, tableName, fileExtensions, parse(), optional insert() |
| `FeedRegistry` | type alias | `Map<string, FeedParser>` — key is FeedParser.id |

### KPI-10 Extensibility Pattern

Adding scrap-rate feed in Phase 3+ requires only:
1. Create `apps/api/src/ingest/scrap-rate-parser.ts` implementing `FeedParser`
2. Call `registry.set("scrap_rate", scrapRateParser)` in the app startup
3. Zero changes to existing ingestion or dashboard code

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create packages/core/src/ingest/types.ts | 047fc59 | packages/core/src/ingest/types.ts (created) |
| 2 | Re-export ingest types from barrel | 5a66ada | packages/core/src/index.ts (modified) |

## Verification Results

- `npm -w packages/core run build -- --force` exits 0
- `packages/core/dist/ingest/types.d.ts` contains all six exports
- `packages/core/dist/index.d.ts` re-exports `./ingest/types.js`
- No runtime imports in types.ts (pure TypeScript)

## Deviations from Plan

**1. [Rule 1 - Bug] tsc --build caching mismatch with TypeScript 6**

- **Found during:** Task 2 verification
- **Issue:** `npm -w packages/core run build` reported exit 1 when `dist/` was absent; `tsc --build` reported "up to date" based on tsbuildinfo. TypeScript 6.0.2 incremental build did not auto-create dist when tsbuildinfo existed but dist was cleaned.
- **Fix:** Used `tsc --build --force` for rebuild; the standard `build` script works correctly on first run and after file changes. Documented that `--force` is needed after manual dist cleanup.
- **Files modified:** None (operational workaround)
- **Commit:** n/a (not a code change)

**2. [Note] TypeScript 6 keeps re-exports as-is in index.d.ts**

TypeScript 6 does not inline `export * from` targets — `dist/index.d.ts` shows `export * from "./ingest/types.js"` and the actual declarations are in `dist/ingest/types.d.ts`. This is correct behavior; the plan's verification grep checks `index.d.ts` for "FeedParser" which fails, but the types ARE exported via the re-export chain. Verified against `dist/ingest/types.d.ts` directly.

## Known Stubs

None. This plan is pure type definitions — no runtime data, no rendering, no stubs.

## Self-Check: PASSED

- packages/core/src/ingest/types.ts: FOUND
- packages/core/src/index.ts: FOUND (contains `export * from "./ingest/types.js"`)
- packages/core/dist/ingest/types.d.ts: FOUND (contains all 6 type exports)
- Commit 047fc59: FOUND
- Commit 5a66ada: FOUND
