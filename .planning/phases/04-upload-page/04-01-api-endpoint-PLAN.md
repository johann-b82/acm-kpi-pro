---
phase: 04-upload-page
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/core/src/upload/types.ts
  - packages/core/src/index.ts
  - apps/api/src/routes/upload.ts
  - apps/api/src/kpi/helpers.ts
  - apps/api/src/server.ts
  - apps/api/src/routes/upload.test.ts
autonomous: true
requirements:
  - UP-07
  - IN-02

must_haves:
  truths:
    - "POST /api/v1/upload returns 403 when caller has Viewer role"
    - "POST /api/v1/upload returns 409 when imports.status='running' row exists"
    - "POST /api/v1/upload calls ingestLagBesFile(tmpPath, 'upload', { db }) and returns UploadSuccessResponse on success"
    - "POST /api/v1/upload returns UploadErrorResponse with errors[] array on ingest validation failure"
    - "POST /api/v1/upload is rejected by @fastify/multipart before ingest when body >10 MB"
    - "kpiDelta includes before/after/delta for totalInventoryValue, daysOnHand, stockoutsCount, deadStockPct"
    - "before values are null on first import (MV empty)"
    - "temp file deleted in finally block even on ingest failure"
  artifacts:
    - path: "packages/core/src/upload/types.ts"
      provides: "UploadSuccessResponse, UploadErrorResponse, UploadResponse DTOs"
      exports: ["UploadSuccessResponse", "UploadErrorResponse", "UploadResponse", "HeadlineKpis"]
    - path: "apps/api/src/routes/upload.ts"
      provides: "POST /api/v1/upload handler"
      exports: ["registerUploadRoutes"]
    - path: "apps/api/src/kpi/helpers.ts"
      provides: "getHeadlineKpis() for KPI delta snapshot"
      exports: ["getHeadlineKpis"]
    - path: "apps/api/src/routes/upload.test.ts"
      provides: "Vitest integration tests for the upload route"
  key_links:
    - from: "apps/api/src/server.ts"
      to: "apps/api/src/routes/upload.ts"
      via: "registerUploadRoutes(server, config)"
      pattern: "registerUploadRoutes"
    - from: "apps/api/src/routes/upload.ts"
      to: "apps/api/src/ingest/index.ts"
      via: "ingestLagBesFile(tmpPath, 'upload', { db })"
      pattern: "ingestLagBesFile.*upload"
    - from: "apps/api/src/routes/upload.ts"
      to: "apps/api/src/kpi/helpers.ts"
      via: "getHeadlineKpis(db) before + after ingest"
      pattern: "getHeadlineKpis"
---

<objective>
Install @fastify/multipart, define shared upload DTOs in @acm-kpi/core, implement the POST /api/v1/upload endpoint with Admin RBAC, concurrency guard, KPI delta computation, and temp-file cleanup. Write Wave 0 integration test stubs so subsequent plans have verifiable automated checks.

Purpose: This is the authoritative API contract that all other plans depend on. The shared DTO types in packages/core are the interface contract consumed by the frontend in plan 02+.
Output: registerUploadRoutes() function wired into server.ts, packages/core/src/upload/types.ts with DTOs, apps/api/src/kpi/helpers.ts, and a passing (but initially stubbed) upload.test.ts.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/04-upload-page/04-CONTEXT.md
@.planning/phases/04-upload-page/04-RESEARCH.md
@.planning/phases/04-upload-page/04-VALIDATION.md

@apps/api/src/server.ts
@apps/api/src/middleware/rbac.ts
@apps/api/src/ingest/index.ts
@apps/api/src/db/schema.ts
@apps/api/src/kpi/routes.ts
@packages/core/src/index.ts
@packages/core/src/kpi/types.ts
</context>

<interfaces>
<!-- Key existing contracts the executor MUST use. Do not rediscover. -->

From apps/api/src/middleware/rbac.ts:
```typescript
export function requireRole(minimumRole: Role, config: AppConfig): preHandlerHookHandler
// Usage: { preHandler: requireRole('Admin', config) }
```

From apps/api/src/ingest/index.ts:
```typescript
export async function ingestLagBesFile(
  filePath: string,
  source: IngestSource,  // 'upload' | 'watcher' | 'cli'
  opts?: { correlationId?: string; db?: IngestDb },
): Promise<IngestResult>
// IngestResult: { status: 'success'|'failed'; filename; rowsInserted; errors; durationMs; correlationId }
// On validation failure: status='failed', errors[] contains { row, field, value, reason }
// On success: status='success', rowsInserted>0, errors=[]
```

From apps/api/src/db/schema.ts:
```typescript
export const imports = pgTable('imports', {
  id: serial, filename: text, rowCount: integer, status: text, // 'running'|'success'|'failed'
  errorMessage: text, operator: text, source: text,
  startedAt: timestamp, finishedAt: timestamp, createdAt: timestamp, updatedAt: timestamp,
})
```

From packages/core/src/kpi/types.ts (KpiSummary fields to snapshot):
```typescript
// MV table: kpi_dashboard_data
// Relevant SQL columns: total_value_eur, days_on_hand, stockouts (jsonb), devaluation (jsonb)
// devaluation->>'pct' = deadStockPct; (stockouts->>'count')::int = stockoutsCount
```

From apps/api/src/server.ts pattern:
```typescript
await registerKpiRoutes(server, config);  // existing pattern — add upload route same way
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Wave 0 — Install deps + shared DTOs + test stubs</name>
  <files>
    packages/core/src/upload/types.ts
    packages/core/src/index.ts
    apps/api/src/routes/upload.test.ts
  </files>
  <read_first>
    - packages/core/src/index.ts (to know current exports before adding upload)
    - packages/core/src/kpi/types.ts (reference pattern for DTO structure)
    - apps/api/src/routes/upload.test.ts (if exists — otherwise create fresh)
    - .planning/phases/04-upload-page/04-VALIDATION.md (test stubs required by Wave 0)
  </read_first>
  <behavior>
    Install @fastify/multipart@^9.4.0:
    - Run: npm -w apps/api add @fastify/multipart@^9.4.0

    Create packages/core/src/upload/types.ts with exact interfaces from 04-UI-SPEC.md / 04-CONTEXT.md:
    - HeadlineKpis interface: { totalInventoryValue: number; daysOnHand: number | null; stockoutsCount: number; deadStockPct: number }
    - KpiDeltaField interface: { before: number | null; after: number; delta: number }
    - UploadKpiDelta interface: { totalInventoryValue: KpiDeltaField; daysOnHand: KpiDeltaField; stockoutsCount: KpiDeltaField; deadStockPct: KpiDeltaField }
    - UploadSuccessResponse: { status: 'success'; filename: string; rowsInserted: number; durationMs: number; kpiDelta: UploadKpiDelta }
    - UploadErrorResponse: { status: 'failed'; filename: string; rowsInserted: 0; errors: Array<{ row: number; field: string; value: unknown; reason: string }>; durationMs: number }
    - UploadResponse = UploadSuccessResponse | UploadErrorResponse

    Add to packages/core/src/index.ts:
    export type { UploadSuccessResponse, UploadErrorResponse, UploadResponse, HeadlineKpis, KpiDeltaField, UploadKpiDelta } from './upload/types.js'

    Create apps/api/src/routes/upload.test.ts with FAILING stubs:
    - describe('POST /api/v1/upload') with vi.todo() stubs for:
      - 'admin_required: returns 403 for Viewer role'
      - 'ingest_source: calls ingestLagBesFile with source=upload and correct tmpPath'
      - 'concurrent_rejected: returns 409 when imports.status=running'
      - 'file_too_large: returns 413 when body exceeds 10MB limit'
      - 'success_response: returns UploadSuccessResponse with kpiDelta on valid file'
      - 'failure_response: returns UploadErrorResponse with errors[] on invalid file'
    Note: Use vi.todo() so tests are pending (not failing) but documented.
    Test file pattern: mirror apps/api/src/routes/admin.test.ts or kpi/__tests__/ structure.
  </behavior>
  <action>
    Run in order:
    1. npm -w apps/api add @fastify/multipart@^9.4.0
    2. Create packages/core/src/upload/types.ts with the exact TypeScript interfaces above.
    3. Append export line to packages/core/src/index.ts for all 6 upload types.
    4. Create apps/api/src/routes/upload.test.ts with vi.todo() stubs as documented above.
    Do NOT implement the route handler yet — that is Task 2.
  </action>
  <verify>
    <automated>
      cd /Users/johannbechtold/Documents/Claude\ Code/acm-kpi\ pro && npm -w packages/core run build 2>&1 | tail -5 && npm -w apps/api run build --noEmit 2>&1 | tail -10
    </automated>
  </verify>
  <done>
    - @fastify/multipart appears in apps/api/package.json dependencies
    - packages/core/src/upload/types.ts exists with all 6 exported types
    - packages/core/src/index.ts exports all 6 upload types
    - apps/api/src/routes/upload.test.ts exists with vi.todo() stubs for 6 cases
    - npm -w packages/core run build exits 0
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Upload route handler + KPI helper + server registration</name>
  <files>
    apps/api/src/kpi/helpers.ts
    apps/api/src/routes/upload.ts
    apps/api/src/server.ts
  </files>
  <read_first>
    - apps/api/src/kpi/routes.ts (pattern for registerKpiRoutes — registerUploadRoutes follows same signature)
    - apps/api/src/middleware/rbac.ts (requireRole usage)
    - apps/api/src/ingest/index.ts (ingestLagBesFile signature)
    - apps/api/src/db/schema.ts (imports table — status field for concurrency check)
    - packages/core/src/upload/types.ts (DTOs just created in Task 1)
    - .planning/phases/04-upload-page/04-RESEARCH.md lines 144–195 (Pattern 2: multipart handler example)
    - .planning/phases/04-upload-page/04-RESEARCH.md lines 229–268 (Pattern 4: KPI delta computation)
    - apps/api/src/server.ts (where to register the route)
  </read_first>
  <behavior>
    Create apps/api/src/kpi/helpers.ts:
    - Export async function getHeadlineKpis(db: IngestDb): Promise<HeadlineKpis | null>
    - Executes raw SQL: SELECT total_value_eur, days_on_hand, stockouts, devaluation FROM kpi_dashboard_data LIMIT 1
    - Returns null if no row (first import — MV empty)
    - Maps row: { totalInventoryValue: parseFloat(row.total_value_eur), daysOnHand: row.days_on_hand ? parseFloat(row.days_on_hand) : null, stockoutsCount: parseInt((row.stockouts as any)?.count ?? '0', 10), deadStockPct: parseFloat((row.devaluation as any)?.pct ?? '0') }
    - Imports: import { sql } from 'drizzle-orm'; import type { IngestDb } from '../ingest/index.js'; import type { HeadlineKpis } from '@acm-kpi/core'

    Create apps/api/src/routes/upload.ts:
    - Export async function registerUploadRoutes(server: FastifyInstance, config: AppConfig): Promise<void>
    - Register server.post('/api/v1/upload', { preHandler: requireRole('Admin', config) }, handler)
    - Handler body (per D-01, D-02, D-03, D-04 from CONTEXT.md):
      a. Import db from '../db/index.js' (same pattern as kpi/routes.ts)
      b. Concurrency check: const running = await db.select().from(imports).where(eq(imports.status, 'running')).limit(1); if (running.length > 0) return reply.code(409).send({ error: 'ingest_already_running', message: 'An ingest is already running — please wait a moment and try again.' })
      c. Save files: const savedFiles = await request.saveRequestFiles(); — @fastify/multipart v9 throws RequestFileTooLargeError automatically when >limits.fileSize (configured at plugin registration)
      d. Validate: if (!savedFiles.length) return reply.code(400).send({ error: 'no_file', message: 'No file provided' })
      e. const file = savedFiles[0]; const tmpPath = file.filepath; const filename = file.filename ?? 'unknown';
      f. Get pre-ingest KPI snapshot: const kpiBefore = await getHeadlineKpis(db); — may return null
      g. Call ingest: const result = await ingestLagBesFile(tmpPath, 'upload', { db, correlationId: request.id });
      h. if (result.status === 'failed'): return reply.code(400).send({ status: 'failed', filename, rowsInserted: 0, errors: result.errors, durationMs: result.durationMs } satisfies UploadErrorResponse)
      i. Get post-ingest KPI snapshot: const kpiAfter = await getHeadlineKpis(db); (guaranteed non-null after success)
      j. Build kpiDelta using helper: for each of 4 fields, compute { before: kpiBefore?.[field] ?? null, after: kpiAfter![field] ?? 0, delta: (kpiAfter![field] ?? 0) - (kpiBefore?.[field] ?? 0) }
      k. Return reply.code(200).send({ status: 'success', filename, rowsInserted: result.rowsInserted, durationMs: result.durationMs, kpiDelta } satisfies UploadSuccessResponse)
      l. No explicit finally needed — @fastify/multipart v9 auto-cleans temp files after response. Add a comment explaining this.
    - Add error handler for RequestFileTooLargeError: if (error.code === 'FST_FILES_LIMIT_REACHED' || error instanceof mulitpart.RequestFileTooLargeError) return reply.code(413).send({ error: 'file_too_large' })
    - Pino structured logs (OBS-01): log upload_received at start, upload_done/upload_failed at end with { correlationId: request.id, filename, byteCount: file.size, durationMs, status, rowsInserted, errorCount }

    Modify apps/api/src/server.ts:
    - Add import: import { registerUploadRoutes } from './routes/upload.js'
    - Add after registerKpiRoutes: await registerUploadRoutes(server, config)
    - Also register @fastify/multipart plugin ONCE at server level (before routes):
      import multipart from '@fastify/multipart'
      await server.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } })

    Plugin registration note: @fastify/multipart must be registered BEFORE any route that uses saveRequestFiles(). Register it right after fastifyCookie, before routes section.
  </behavior>
  <action>
    Implement in this order:
    1. Create apps/api/src/kpi/helpers.ts with getHeadlineKpis() as specified.
    2. Create apps/api/src/routes/upload.ts with registerUploadRoutes() as specified. Import: FastifyInstance from 'fastify'; AppConfig from '../config.js'; requireRole from '../middleware/rbac.js'; ingestLagBesFile from '../ingest/index.js'; db from '../db/index.js'; imports from '../db/schema.js'; eq from 'drizzle-orm'; getHeadlineKpis from '../kpi/helpers.js'; UploadSuccessResponse, UploadErrorResponse from '@acm-kpi/core'.
    3. Modify apps/api/src/server.ts: register multipart plugin (after cookie, before routes) + call registerUploadRoutes.

    Verification tests that were stubs in Task 1 — convert vi.todo() to actual test implementations using vitest + supertest/inject pattern (same as admin.test.ts). Each test should mock ingestLagBesFile and db queries. Specifically implement:
    - admin_required test: inject POST /api/v1/upload with Viewer session cookie → assert 403
    - concurrent_rejected test: mock db.select returning [{status:'running'}] → assert 409
    - file_too_large test: mock RequestFileTooLargeError thrown → assert 413 (or rely on @fastify/multipart limits in integration)
    - ingest_source test: mock ingestLagBesFile, capture call args → assert source==='upload'
    Tests for success/failure response shapes can remain vi.todo() at this stage — they require a real file and are covered by TEST-03 e2e in plan 05.
  </action>
  <verify>
    <automated>
      npm -w apps/api run test -- src/routes/upload.test.ts 2>&1 | tail -20
    </automated>
  </verify>
  <done>
    - apps/api/src/kpi/helpers.ts exports getHeadlineKpis(db): Promise<HeadlineKpis | null>
    - apps/api/src/routes/upload.ts exports registerUploadRoutes(server, config)
    - apps/api/src/server.ts registers @fastify/multipart plugin and calls registerUploadRoutes
    - npm -w apps/api run test -- src/routes/upload.test.ts passes (admin_required + concurrent_rejected + ingest_source tests green; file_too_large + response shape tests may be vi.todo())
    - grep "registerUploadRoutes" apps/api/src/server.ts exits 0
    - grep "register.*multipart" apps/api/src/server.ts exits 0
    - 04-VALIDATION.md rows for UP-07 and IN-02: test command referenced passes
  </done>
</task>

</tasks>

<verification>
After both tasks complete:

1. API integration smoke test:
   `npm -w apps/api run test -- src/routes/upload.test.ts`
   Must pass admin_required (403) and concurrent_rejected (409) cases.

2. Core package builds:
   `npm -w packages/core run build`
   Must exit 0 — UploadSuccessResponse, UploadErrorResponse, UploadResponse, HeadlineKpis exported.

3. API type check:
   `npm -w apps/api run typecheck 2>&1 | grep -c error || true`
   Zero type errors introduced by this plan.

4. Server registration check:
   `grep -n "registerUploadRoutes\|fastify/multipart" apps/api/src/server.ts`
   Both lines present.

5. DTO shape check:
   `grep -n "UploadSuccessResponse\|UploadErrorResponse" packages/core/src/upload/types.ts`
   Both exported interfaces present.
</verification>

<success_criteria>
- @fastify/multipart@^9.4.0 installed in apps/api
- packages/core/src/upload/types.ts declares and exports UploadSuccessResponse, UploadErrorResponse, UploadResponse, HeadlineKpis, KpiDeltaField, UploadKpiDelta
- POST /api/v1/upload registered in server.ts, gated by requireRole('Admin', config)
- Handler calls getHeadlineKpis(db) before + after ingestLagBesFile(tmpPath, 'upload', { db })
- 409 returned when imports.status='running' row exists (per D-02)
- 403 returned for Viewer role (per D-05 / UP-07)
- UploadSuccessResponse returned on success; UploadErrorResponse on ingest failure
- Pino audit log emitted per upload attempt (OBS-01)
- upload.test.ts passes for admin_required and concurrent_rejected cases
</success_criteria>

<output>
After completion, create `.planning/phases/04-upload-page/04-01-SUMMARY.md` following the summary template at @$HOME/.claude/get-shit-done/templates/summary.md
</output>
