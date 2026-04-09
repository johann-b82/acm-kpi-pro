# Phase 4: Upload Page — Research

**Researched:** 2026-04-09
**Domain:** File upload UI + multipart API handler + RBAC + progress tracking + KPI delta
**Confidence:** HIGH

## Summary

Phase 4 implements a dedicated `/upload` route with drag-and-drop file input, two-stage progress reporting (upload % → indeterminate spinner), and a detailed success/error summary. The implementation reuses the Phase 2 ingest pipeline unchanged and gates the feature to Admin users only. Core technologies are stable: `@fastify/multipart` v9.x for the backend, XMLHttpRequest `upload.onprogress` for client-side progress tracking (the only pragmatic way to track upload progress in browsers), and shadcn/ui components for consistent styling. The implementation follows established patterns from Phase 3 for feature structure and shared DTOs in `@acm-kpi/core`.

**Primary recommendation:** Use XMLHttpRequest for upload progress tracking (not Fetch), register `@fastify/multipart` v9.x in `server.ts` with 10 MB file size limit, add `requireRole('Admin', config)` middleware to the `/api/v1/upload` endpoint, extend `ProtectedRoute` with an optional role check, and mirror the Phase 3 `features/kpi/` structure under `features/upload/`.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Two-stage progress with a single HTTP request (D-01): XMLHttpRequest `upload.onprogress` tracks real bytes → indeterminate spinner once body uploaded → single HTTP response returns final `IngestResult`
- File constraints (D-02): 10 MB max (client + server), single file at a time, `.csv`/`.txt` only, 409 Conflict if another upload is running
- Success summary (D-03): green card with row count, 4 headline KPI deltas (before/after/delta), "Go to Dashboard" + "Upload another file" buttons
- Error summary (D-04): red card with grouped field-level summary, scrollable detail table (Row | Field | Value | Reason), "Copy all errors" + "Try another file" buttons
- Admin-only UX (D-05): header icon hidden for Viewers, `/upload` route shows "Admin access required" for Viewers, server-side `requireAdmin()` on POST endpoint
- Route-level technical decisions (D-05 detail): `@fastify/multipart` with `saveRequestFiles()`, shared DTO in `packages/core/src/upload/types.ts`, feature folder `apps/frontend/src/features/upload/`, no third-party drop-zone library

### Claude's Discretion
- Exact styling of drop zone (dashed border intensity, hover/drag states)
- Whether `requireAdmin()` is a standalone middleware or composed into `requireAuth()`
- Exact Zod schema shape for multipart request in handler
- Whether `ProgressView` is one component with conditional states or two siblings
- Concurrency check via DB row lock or in-memory mutex (planner picks based on single-instance constraint)
- Error detail table: `tanstack/react-table` vs plain `<table>` (shadcn `Table` is the latter)
- Copy for user-facing strings (English-only in Phase 4; Phase 6 localizes)

### Deferred Ideas (OUT OF SCOPE)
- Multi-file / queued upload, cancellation mid-upload, row-level parse progress, upload history UI, German translations of upload strings (Phase 6), German number formatting of KPI deltas (Phase 6), dark-mode polish (Phase 6), CSV export of errors

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UP-01 | Upload page route reachable via icon button in top-right corner | Header.tsx already has Upload icon link; Phase 4 adds role-based conditional render and extends route with role gate |
| UP-02 | Drag-and-drop + file picker fallback | XMLHttpRequest + native HTML `<input type="file">` + dragover/drop listeners ~30 LOC (no third-party lib) |
| UP-03 | Accept `.csv` and `.txt` files only | Client-side validation on filename extension + server-side `saveRequestFiles()` multipart handler validates MIME type |
| UP-04 | Progress indicator during upload and parsing | XMLHttpRequest `upload.onprogress` (0–100% determinate) + switch to indeterminate spinner at `xhr.upload.onload` |
| UP-05 | Success summary with row count + KPI delta | Server-side snapshot before/after ingest, response includes 4 headline KPI values (totalInventoryValue, daysOnHand, stockoutsCount, deadStockPct) with before/after/delta |
| UP-06 | Error summary with all validation issues | Phase 2 validator already returns full `errors[]` array on IN-11 failures; API handler wraps in response DTO |
| UP-07 | Admin role required | `requireRole('Admin', config)` on POST endpoint; client-side ProtectedRoute extension gates the `/upload` content |
| IN-02 | System accepts same file via SMB folder watcher | Phase 4 calls `ingestLagBesFile(path, 'upload')` which shares code path with Phase 5 watcher (source tag disambiguates) |
| TEST-03 | E2E test: login → upload file → dashboard updates | Playwright `setInputFiles()` on hidden file input (not real drag-drop in e2e); invalidate React Query cache on success |

## Standard Stack

### Core Libraries
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @fastify/multipart | v9.x (current 9.4.0) | Multipart form handling, file storage to temp dir | Official Fastify plugin; battle-tested; `saveRequestFiles()` helper simplifies lifecycle |
| Fastify | 5.8.4 | Already in apps/api/package.json | Compatible with @fastify/multipart v9.x (requires ^5.0.0) |
| @tanstack/react-query | 5.96.2 | Cache management, invalidation | Already in use Phase 3; `queryClient.invalidateQueries()` invalidates KPI summary on successful upload |
| shadcn/ui | pre-initialized | UI components for card, button, table, progress | Already initialized Phase 1; `progress` component must be added via `npx shadcn add progress` |
| Radix UI (via shadcn) | pre-installed | Accessibility primitives | Inherited from Phase 1 initialization; Progress uses Radix Progress |
| Lucide React | 0.400.0 | Icons (Upload, CheckCircle2, AlertCircle, Loader2, Copy, ArrowUp/Down) | Already in use Phase 3; consistent icon library |
| native HTML5 Drag-Drop API | browser-native | Drag-over / drop listeners | Avoids third-party dependency (offline/air-gap constraint) |
| XMLHttpRequest | browser-native | Upload progress tracking | Only pragmatic way to track upload progress; Fetch API lacks native upload progress support |

### Installation
```bash
# Progress component (frontend only)
cd apps/frontend
npx shadcn add progress

# @fastify/multipart (if not already present)
npm -w apps/api add @fastify/multipart
```

**Version verification:**
- Fastify 5.8.4: ✅ installed (apps/api/package.json)
- @fastify/multipart: NOT YET installed; recommend v9.4.0 (compatible with Fastify ^5.0.0)
- shadcn/ui progress: NOT YET installed; install via CLI
- React Query: 5.96.2 ✅ installed (apps/frontend/package.json)

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| XMLHttpRequest `upload.onprogress` | Fetch + ReadableStream + TransformStream | Fetch has no native upload progress API; custom TransformStream adds ~100 LOC, more complex, non-standard |
| shadcn/ui Progress | react-progress-bar, NProgress | Less accessible; not part of existing component library; adds dependency |
| Native drag-drop | react-dropzone | Adds offline runtime dependency; on-prem air-gap constraint makes this non-ideal |
| `requireRole('Admin')` middleware | Inline role check in handler | Middleware is reusable pattern; already established in Phase 1 (admin.ts uses `requireRole`) |

## Architecture Patterns

### Recommended Project Structure
```
apps/frontend/src/features/upload/
├── components/
│   ├── UploadPage.tsx          # Page wrapper + state orchestration
│   ├── DropZone.tsx            # Drag-drop + file picker button (with hidden <input>)
│   ├── ProgressView.tsx        # Determinate (% bar) + indeterminate (spinner) states
│   ├── SuccessSummary.tsx      # Green card, row count, KPI delta grid (2×2 desktop, 1×4 mobile)
│   ├── ErrorSummary.tsx        # Red card, grouped error list, detail table, actions
│   └── AdminAccessDenied.tsx   # "Admin access required" card for Viewers
├── hooks/
│   └── useUpload.ts            # useState + XMLHttpRequest handler + state machine
└── types.ts                    # Local prop types (response types in @acm-kpi/core)

apps/api/src/
├── routes/upload.ts            # NEW: POST /api/v1/upload handler (register in server.ts)
├── kpi/helpers.ts              # NEW: getHeadlineKpis() helper to snapshot KPI delta
└── server.ts                   # MODIFY: register @fastify/multipart + upload route

packages/core/src/upload/
├── types.ts                    # NEW: UploadSuccessResponse, UploadErrorResponse, UploadResponse
└── index.ts                    # Export shared types
```

### Pattern 1: XMLHttpRequest Upload Progress Tracking
**What:** XMLHttpRequest is the ONLY browser API with native upload progress events. The `xhr.upload.onprogress` event fires repeatedly during body transmission, allowing real-time byte tracking.

**When to use:** Any file upload that needs to display progress to users. Fetch API has no equivalent.

**Example:**
```typescript
// Source: MDN Web APIs https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/upload
const xhr = new XMLHttpRequest();
xhr.upload.addEventListener('loadstart', () => setState({ progress: 0 }));
xhr.upload.addEventListener('progress', (e) => {
  if (e.lengthComputable) {
    const percent = Math.round((e.loaded / e.total) * 100);
    setState({ progress: percent });
  }
});
xhr.upload.addEventListener('load', () => {
  // Body uploaded; switch to indeterminate spinner
  setState({ uploading: false, parsing: true });
});
xhr.upload.addEventListener('error', () => {
  setState({ error: 'Upload failed' });
});

xhr.open('POST', '/api/v1/upload', true);
xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded'); // multipart set by FormData
xhr.send(formData);
```

**Key insight:** No polling or SSE needed. The same HTTP request's response contains the final `IngestResult` after server-side ingest completes. Client waits for `xhr.onload` to receive the result.

### Pattern 2: @fastify/multipart Handler with Concurrency Check
**What:** `@fastify/multipart` provides `req.saveRequestFiles()` which writes files to OS temp directory and returns file metadata + parsed form fields. Concurrency is checked by querying `imports.status='running'` before starting a new ingest.

**When to use:** Any multipart form upload handler needing file storage, size limits, and safety checks.

**Example:**
```typescript
// Source: @fastify/multipart GitHub https://github.com/fastify/fastify-multipart
server.post(
  '/api/v1/upload',
  { preHandler: requireRole('Admin', config) },
  async (request, reply) => {
    // Check for concurrent ingest
    const isRunning = await db.select().from(imports).where(eq(imports.status, 'running')).limit(1);
    if (isRunning.length > 0) {
      return reply.code(409).send({ error: 'ingest_already_running' });
    }

    // Save files to temp dir (max 10 MB per file, 1 file total)
    const { files, values } = await request.saveRequestFiles({
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    });

    if (!files || files.length === 0) {
      return reply.code(400).send({ error: 'No file provided' });
    }

    const file = files[0];
    const tmpPath = file.filepath;

    try {
      // Call shared Phase 2 ingest (source='upload')
      const startTime = Date.now();
      const result = await ingestLagBesFile(tmpPath, 'upload', { db });
      const durationMs = Date.now() - startTime;

      // Compute KPI delta (before/after snapshot)
      const kpiDelta = await computeKpiDelta(result);

      return reply.code(200).send({
        status: result.errors?.length ? 'failed' : 'success',
        filename: file.filename,
        rowsInserted: result.rowsInserted ?? 0,
        durationMs,
        ...(result.errors ? { errors: result.errors } : { kpiDelta }),
      });
    } finally {
      // Temp file cleaned up automatically by @fastify/multipart
    }
  }
);
```

**Key insight:** `saveRequestFiles()` automatically writes to `os.tmpdir()` and cleans up when response ends. No manual cleanup needed (though you may add a `finally` for auditing). Size limits throw `RequestFileTooLargeError` by default.

### Pattern 3: React Query Cache Invalidation on Success
**What:** After successful upload, the frontend invalidates the KPI summary query key so the dashboard re-fetches fresh data instead of relying on the cached 30-second-old snapshot.

**When to use:** Any user action that modifies backend state and should immediately reflect in the UI (avoid stale cache).

**Example:**
```typescript
// Source: Phase 3 patterns + React Query docs
const { mutate: uploadFile } = useMutation({
  mutationFn: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/v1/upload', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  },
  onSuccess: () => {
    // Invalidate kpi/summary so dashboard re-fetches on mount
    queryClient.invalidateQueries({ queryKey: ['kpi', 'summary'] });
    // Navigate to dashboard (onSuccess handler in component)
  },
});
```

**Key insight:** Query key must match exactly: `['kpi', 'summary']` matches `kpiKeys.summary()` from Phase 3. Any typo leaves cache stale.

### Pattern 4: KPI Delta Computation (Server-Side Before/After Snapshot)
**What:** The upload handler captures headline KPI values from the MV (or pre-import state if first import) BEFORE ingest, then captures AFTER the ingest + MV refresh completes. Response includes both values + computed delta.

**When to use:** Success view needs to show impact of the import (what changed?).

**Example:**
```typescript
async function getHeadlineKpis(db: IngestDb): Promise<HeadlineKpis | null> {
  const rows = await db.execute(sql`
    SELECT 
      total_value_eur,
      days_on_hand,
      COALESCE((stockouts->>'count')::int, 0) as stockouts_count,
      (devaluation->>'pct')::numeric as dead_stock_pct
    FROM kpi_dashboard_data LIMIT 1
  `);
  const row = rows.rows[0];
  if (!row) return null; // First import, no prior data
  return {
    totalInventoryValue: parseFloat(row.total_value_eur),
    daysOnHand: row.days_on_hand ? parseFloat(row.days_on_hand) : null,
    stockoutsCount: row.stockouts_count,
    deadStockPct: parseFloat(row.dead_stock_pct),
  };
}

// In handler:
const kpiBeforeIngest = await getHeadlineKpis(db); // May be null on first import
const ingestResult = await ingestLagBesFile(tmpPath, 'upload', { db }); // Refreshes MV
const kpiAfterIngest = await getHeadlineKpis(db);

const delta = {
  totalInventoryValue: {
    before: kpiBeforeIngest?.totalInventoryValue ?? null,
    after: kpiAfterIngest!.totalInventoryValue,
    delta: (kpiAfterIngest!.totalInventoryValue) - (kpiBeforeIngest?.totalInventoryValue ?? 0),
  },
  // ... repeat for other 3 KPIs
};
```

**Key insight:** Concurrency control via `imports.status='running'` check ensures no race between snapshot and ingest. The MV refresh happens inside the ingest transaction (Phase 2), so `kpiAfterIngest` always reflects post-ingest state.

### Anti-Patterns to Avoid
- **Polling for ingest completion:** Phase 2 showed that ingest is sub-second; a single HTTP request containing the full result (no polling) is the pragmatic choice. SSE/WebSocket overkill for v1.
- **File size limit only on client:** Server-side limit is authoritative (UP-02 compliance). Client-side check is UX convenience; never trust client validation alone.
- **Re-parsing CSV on the frontend:** All validation happens once (server-side in Phase 2). UI just displays pre-computed errors from the API response.
- **Manually cleaning up temp files:** `@fastify/multipart` handles this automatically when the response ends. No explicit cleanup needed (though can add logging in `finally`).
- **Race condition on concurrency check + ingest:** Atomicity is guaranteed by the `imports.status='running'` check in the same transaction as the ingest. No lock needed for single-instance deployment.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multipart form file handling | Custom body parser, streaming temp file writes | `@fastify/multipart` + `saveRequestFiles()` | Handles encoding, file size limits, cleanup, and MIME type validation. Reinventing this is error-prone (missing Content-Disposition parsing, tmp cleanup races). |
| Upload progress tracking | Custom Fetch + ReadableStream + TransformStream byte counting | XMLHttpRequest `upload.onprogress` event | Fetch API has no native upload progress; custom Transform streams add ~100 LOC and are non-standard. XHR is 10 lines and battle-tested since 2006. |
| Drag-and-drop file input | Roll dragover/dragenter/drop handlers | HTML5 native events (no library) + hidden `<input type="file">` | Drag-drop is ~30 LOC with vanilla JS. Third-party libraries (react-dropzone) add offline runtime dependency; on-prem constraint disfavors this. |
| Concurrency check during upload | Manual locking/semaphore in app code | Query `imports.status='running'` from DB | Single-instance deployment means DB row is sufficient. In-memory mutex would need restart; DB survives uptime events. |
| KPI delta display math | Custom value formatting, delta sign logic | Simple `delta = after - before` calculation + Tailwind color classes | Delta math is 3 lines. Custom formatting breaks i18n later (Phase 6 adds `Intl.NumberFormat`). Keep formatting concerns out of the delta computation. |
| File type validation on upload | MIME type sniffing, header inspection | Filename extension check (client) + MIME type check (server via `saveRequestFiles().mimetype`) | Extension check is instant UX feedback. Server-side MIME check is defense-in-depth. Sniffing is unreliable and CPU-intensive. |

**Key insight:** The upload domain has many deceptive "we can just build it" spots (progress tracking, temp file cleanup, concurrency handling). All three are harder than they look; existing libraries solve them correctly.

## Code Examples

### Example 1: DropZone Component with Drag-Drop + File Picker
```typescript
// Source: Phase 3 patterns + MDN Web APIs (https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API)
import { useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Upload } from 'lucide-react';

export function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    const validExts = ['.csv', '.txt'];
    const hasValidExt = validExts.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!hasValidExt) return 'Only .csv and .txt files are accepted.';
    if (file.size > 10 * 1024 * 1024) return 'File too large — maximum 10 MB.';
    return null;
  };

  const handleFiles = (files: FileList) => {
    setError(null);
    if (files.length === 0) return;

    const file = files[0];
    if (files.length > 1) {
      setError(`Only one file at a time — using ${file.name}.`);
    }

    const err = validateFile(file);
    if (err) {
      setError(err);
      return;
    }

    onFile(file);
  };

  return (
    <div
      className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
        isDragging ? 'border-brand-400 bg-brand-50' : 'border-slate-300'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <Button
        variant="ghost"
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center gap-2"
      >
        <Upload className="h-8 w-8" />
        <span>Drop your LagBes CSV or TXT file here</span>
        <span className="text-xs text-muted-foreground">or click to browse</span>
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt"
        hidden
        onChange={(e) => handleFiles(e.currentTarget.files!)}
      />

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

### Example 2: useUpload Hook with XMLHttpRequest Progress
```typescript
// Source: Phase 3 hook patterns + MDN XMLHttpRequest API (https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/upload)
import { useState, useCallback } from 'react';
import type { UploadResponse } from '@acm-kpi/core';

interface UploadState {
  status: 'idle' | 'uploading' | 'parsing' | 'success' | 'error';
  progress: number; // 0-100 during upload, -1 (indeterminate) during parsing
  result: UploadResponse | null;
  error: string | null;
}

export function useUpload() {
  const [state, setState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    result: null,
    error: null,
  });

  const upload = useCallback((file: File) => {
    setState({ status: 'uploading', progress: 0, result: null, error: null });

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setState((s) => ({ ...s, progress: percent }));
      }
    });

    xhr.upload.addEventListener('load', () => {
      // Body uploaded; server is now parsing
      setState((s) => ({ ...s, status: 'parsing', progress: -1 }));
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        const result = JSON.parse(xhr.responseText) as UploadResponse;
        setState({
          status: result.status === 'success' ? 'success' : 'error',
          progress: 100,
          result,
          error: null,
        });
      } else {
        setState({
          status: 'error',
          progress: 0,
          result: null,
          error: xhr.responseText || `HTTP ${xhr.status}`,
        });
      }
    });

    xhr.addEventListener('error', () => {
      setState({
        status: 'error',
        progress: 0,
        result: null,
        error: 'Upload failed — check network connection',
      });
    });

    xhr.open('POST', '/api/v1/upload', true);
    xhr.withCredentials = true; // Include cookies (Phase 1 iron-session)
    xhr.send(formData);
  }, []);

  return { ...state, upload };
}
```

### Example 3: POST /api/v1/upload Handler
```typescript
// Source: @fastify/multipart docs + Phase 2 ingest pattern
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { imports } from '../db/schema.js';
import { ingestLagBesFile } from '../ingest/index.js';
import { requireRole } from '../middleware/rbac.js';
import type { AppConfig } from '../config.js';

export async function registerUploadRoutes(
  server: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  server.post(
    '/api/v1/upload',
    { preHandler: requireRole('Admin', config) },
    async (request, reply) => {
      // Check concurrency: any running ingest?
      const running = await db
        .select()
        .from(imports)
        .where(eq(imports.status, 'running'))
        .limit(1);

      if (running.length > 0) {
        return reply.code(409).send({
          error: 'ingest_already_running',
          message: 'An ingest is already running — please wait a moment and try again.',
        });
      }

      // Parse multipart form (max 10 MB file)
      const { files, values } = await request.saveRequestFiles({
        limits: { fileSize: 10 * 1024 * 1024, files: 1 },
      });

      if (!files || files.length === 0) {
        return reply.code(400).send({ error: 'No file provided' });
      }

      const file = files[0];
      const tmpPath = file.filepath;
      const startTime = Date.now();

      try {
        // Call shared Phase 2 ingest (source='upload')
        const result = await ingestLagBesFile(tmpPath, 'upload', { db });
        const durationMs = Date.now() - startTime;

        if (result.errors && result.errors.length > 0) {
          return reply.code(400).send({
            status: 'failed',
            filename: file.filename,
            rowsInserted: 0,
            errors: result.errors,
            durationMs,
          });
        }

        // Success: compute KPI delta for response
        // (getHeadlineKpis already called before ingest in the handler)
        const kpiDelta = await getHeadlineKpis(db); // After-ingest snapshot

        return reply.code(200).send({
          status: 'success',
          filename: file.filename,
          rowsInserted: result.rowsInserted,
          durationMs,
          kpiDelta,
        });
      } catch (err) {
        request.log.error({ err, file: file.filename }, 'upload_failed');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    },
  );
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (unit/integration) + Playwright (e2e) |
| Config file | `vitest.config.ts` (apps/api, apps/frontend) + `playwright.config.ts` (root) |
| Quick run command | `npm -w apps/api run test -- src/routes/upload.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UP-01 | Upload icon visible in header (role-gated) | unit | `npm -w apps/frontend run test -- Header.test.ts` | ❌ Wave 0 |
| UP-02 | Drag-drop accepts files; click opens file picker | unit/integration | `npm -w apps/frontend run test -- DropZone.test.ts` | ❌ Wave 0 |
| UP-03 | `.csv`/`.txt` accepted; other extensions rejected | unit | `npm -w apps/frontend run test -- DropZone.test.ts -t extension` | ❌ Wave 0 |
| UP-04 | Progress bar shows during upload; switches to spinner | unit/integration | `npm -w apps/frontend run test -- ProgressView.test.ts` | ❌ Wave 0 |
| UP-05 | Success card renders row count + KPI delta grid | unit | `npm -w apps/frontend run test -- SuccessSummary.test.ts` | ❌ Wave 0 |
| UP-06 | Error card shows grouped list + detail table | unit | `npm -w apps/frontend run test -- ErrorSummary.test.ts` | ❌ Wave 0 |
| UP-07 | Admin-only: 403 if Viewer; "Admin access required" shown | integration | `npm -w apps/api run test -- routes/upload.test.ts -t admin_required` | ❌ Wave 0 |
| IN-02 | Upload calls `ingestLagBesFile(path, 'upload')` | integration | `npm -w apps/api run test -- routes/upload.test.ts -t ingest_source` | ❌ Wave 0 |
| TEST-03 | E2E: admin login → upload → dashboard updates | e2e | `npx playwright test e2e/upload.spec.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm -w apps/api run test -- src/routes/upload.test.ts && npm -w apps/frontend run test -- features/upload/`
- **Per wave merge:** `npm test` (full suite across all workspaces)
- **Phase gate:** Full suite green + Playwright e2e upload.spec.ts passing before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/routes/upload.test.ts` — covers UP-01, UP-03, UP-07, IN-02, req/resp shape validation
- [ ] `apps/frontend/src/features/upload/__tests__/` — DropZone.test.ts, ProgressView.test.ts, SuccessSummary.test.ts, ErrorSummary.test.ts (all fixtures + interactions)
- [ ] `e2e/upload.spec.ts` — login as admin, upload sample file, verify progress states, success card, dashboard KPI refresh (TEST-03)
- [ ] Framework install: `npm -w apps/api add -D vitest` / `npm -w apps/frontend add -D vitest` (already present)
- [ ] shadcn progress component: `npx shadcn add progress` (from apps/frontend)

## Common Pitfalls

### Pitfall 1: Fetch API Lacks Upload Progress
**What goes wrong:** Developer tries to use Fetch API with `xhr.upload.onprogress` equivalent, discovers it doesn't exist, wastes time searching for a workaround.

**Why it happens:** Fetch is modern and preferred for most tasks; developers assume it has feature parity with XHR. It doesn't. The WHATWG spec acknowledges this gap but has not prioritized it.

**How to avoid:** Always use XMLHttpRequest for upload progress. Fetch is fine for other operations (GET, download progress via ReadableStream), but upload progress is XHR-only.

**Warning signs:** "Why doesn't `fetch(...).upload.onprogress` work?" or "How do I track upload % with Fetch?" → immediately recommend XHR.

### Pitfall 2: File Size Limit Not Enforced on Server
**What goes wrong:** Client-side 10 MB check passes; user uploads a valid file; server has no limit, accepts 100+ MB, exhausts disk or memory.

**Why it happens:** Developer assumes client-side validation is sufficient, forgets that clients can be spoofed (curl, postman, malicious script).

**How to avoid:** Always set `limits: { fileSize: 10 * 1024 * 1024 }` on `req.saveRequestFiles()`. This is the authoritative check. Client-side is UX only.

**Warning signs:** "We check file size in React, so we're safe" → flag for server-side limit review.

### Pitfall 3: Concurrent Ingest Not Checked
**What goes wrong:** User 1 uploads a file; while Phase 2 ingest is running, User 2 uploads another file. Both start ingesting simultaneously, corrupt the database (atomic transaction per-request, but multiple parallel requests mean race condition at the app level).

**Why it happens:** Developer assumes a single HTTP request is atomic (it is), but doesn't realize multiple concurrent requests bypass atomicity.

**How to avoid:** Check `imports.status='running'` before starting a new ingest. Return 409 Conflict if another ingest is in progress. This is race-safe as long as the check and `ingestLagBesFile` call happen in the same transaction (they do).

**Warning signs:** "We use Drizzle transactions, so we're safe" → verify the concurrency check is in place before calling ingest.

### Pitfall 4: KPI Delta Shows Pre-Ingest State as "After"
**What goes wrong:** Developer snapshots KPI values AFTER ingest but BEFORE MV refresh, gets wrong "after" state (MV is still old).

**Why it happens:** Forgotten that Phase 2's `ingestLagBesFile` refreshes the MV inside the transaction. If you snapshot before that call returns, you get stale MV data.

**How to avoid:** Snapshot KPI values AFTER `ingestLagBesFile()` returns. The returned `result` object tells you if ingest succeeded; then query the MV (now refreshed).

**Warning signs:** "After uploading, the delta shows 0 for everything" → likely shadowing a pre-ingest KPI query.

### Pitfall 5: React Query Cache Not Invalidated After Upload
**What goes wrong:** User uploads file, success card shows new KPI values, clicks "Go to Dashboard", dashboard shows old stale values (from cached 30-second-old poll).

**Why it happens:** Developer calls `navigate()` but forgets to call `queryClient.invalidateQueries()` first. Cache is still valid (within staleTime), so React Query uses cached data.

**How to avoid:** Always invalidate the KPI summary query key on upload success: `queryClient.invalidateQueries({ queryKey: ['kpi', 'summary'] })`. This forces a fresh API call on the next mount.

**Warning signs:** "Dashboard doesn't update after upload" + stale timestamp in dashboard KPI card → cache invalidation issue.

### Pitfall 6: Temp File Leaked if Request Aborted
**What goes wrong:** User starts upload, network dies mid-request, temp file is left behind on disk. On a long-running container, thousands of orphaned temp files accumulate and fill /tmp.

**Why it happens:** Developer assumes `@fastify/multipart` cleans up temp files regardless of request outcome. It does for normal responses, but not if the connection is severed before response is sent.

**How to avoid:** Add explicit cleanup in a `finally` block. Fastify's built-in cleanup handles the happy path; `finally` handles ungraceful terminations.

**Warning signs:** Container `/tmp` filling up over weeks → likely orphaned upload temp files.

### Pitfall 7: Multi-File Drop Handled Silently
**What goes wrong:** User drags 3 files into the drop zone, expecting an error. Instead, the first file is silently used and the other two are ignored.

**Why it happens:** Naive handler that takes `files[0]` without warning the user about the others.

**How to avoid:** Check `files.length > 1` explicitly and show a toast warning: `"Only one file at a time — using {filename}."` (D-02 copy). Make the silent-drop behavior visible.

**Warning signs:** "User uploaded the wrong file but didn't notice we dropped it" → warning toast needed.

## Environment Availability

No external dependencies beyond npm packages detected. The upload feature requires:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | TypeScript build, runtime | ✓ | ≥22.0.0 | — |
| PostgreSQL | `imports` table query for concurrency check | ✓ | (existing from Phase 2) | — |
| Fastify | API server | ✓ | 5.8.4 | — |
| React | Frontend | ✓ | 19.2.4 | — |
| `@fastify/multipart` | Multipart handler | ✗ | NOT INSTALLED | Install v9.4.0 |
| shadcn/ui progress component | Progress bar rendering | ✗ | NOT INSTALLED | `npx shadcn add progress` |
| Playwright | E2E tests | Need to verify | (if installed globally) | `npm install -D @playwright/test` |

**Missing dependencies with no fallback:**
- `@fastify/multipart` v9.x — must install before implementation

**Missing dependencies with fallback:**
- shadcn progress component — fallback to custom Tailwind progress bar (not ideal; better to install)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fetch API with custom ReadableStream for upload progress | XMLHttpRequest `upload.onprogress` | Always (XHR ~2006, no Fetch upload progress as of 2026) | XMLHttpRequest is the only pragmatic choice; don't waste time on custom Fetch workarounds |
| Third-party drop-zone library (react-dropzone, uppy) | Native HTML5 drag-drop API + `<input type="file">` | Phase 4 decision (D-02: offline/air-gap constraint) | ~30 LOC native code is simpler than library dependency for this use case |
| Polling `/api/v1/import-status` for ingest completion | Single HTTP request, response contains final result | Phase 4 decision (D-01: ingest is sub-second) | No SSE/WebSocket overhead; pragmatic for on-prem CSV import cadence |
| Inline file size validation in component | `@fastify/multipart` `limits: { fileSize }` on server + client-side UX check | Phase 4 (security best practice) | Defense-in-depth; server check is authoritative |

**Deprecated/outdated:**
- XHR as a whole: Still the only way to track upload progress (2026). Fetch spec discussions continue but no concrete timeline for native upload progress support.

## Open Questions

1. **KPI delta query scope:** Should `getHeadlineKpis()` narrow the MV query to the 4 specific headline KPIs, or read the entire MV and pick 4 fields? (Impact: query clarity vs consistency with `/api/v1/kpi/summary`). **Recommendation:** Reuse the same MV query as `/api/v1/kpi/summary`, pick the 4 fields in the handler (maintains single source of truth).

2. **Concurrency lock strategy:** In-memory mutex vs DB `imports.status='running'` query? (Impact: simplicity vs persistence across restarts). **Recommendation:** DB query (single-instance deployment doesn't need restart-proof semantics, but DB is more transparent for auditing).

3. **Error grouping sort:** Group errors by field, sort by row count descending (D-04)? Or by field name alphabetically? (Impact: UX readability). **Recommendation:** Row count descending (helps users spot systematic issues like "all Wert columns broke").

4. **SuccessSummary KPI grid layout:** Fixed 2×2 desktop + 1×4 mobile (D-03)? Or responsive via CSS grid? (Impact: mobile readability at very small widths). **Recommendation:** Fixed 2×2 / 1×4 per UI spec.

5. **"Go to Dashboard" button behavior:** Navigate immediately + invalidate cache (D-03)? Or wait for cache invalidation to complete? (Impact: perceived speed). **Recommendation:** Invalidate, then navigate (same line, no perceived delay).

## Sources

### Primary (HIGH confidence)
- Fastify 5.8.4 installed in apps/api/package.json (verified in repo)
- @fastify/multipart GitHub README (https://github.com/fastify/fastify-multipart) — `saveRequestFiles()` API, limits configuration, return values
- MDN XMLHttpRequest API (https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/upload) — only native upload progress mechanism
- Phase 2 ingest pattern (apps/api/src/ingest/index.ts) — source tag pattern, error handling, audit logging
- Phase 3 KPI queries (apps/api/src/kpi/routes.ts) — MV query pattern, queryKey shape for React Query
- Existing Header.tsx, ProtectedRoute.tsx, useAuth.ts — auth context surface and role availability

### Secondary (MEDIUM confidence)
- @fastify/multipart v9.4.0 release notes (https://github.com/fastify/fastify-multipart/releases) — breaking changes v9→v10, per-route config, saveRequestFiles return values
- React Query v5.96.2 documentation — `invalidateQueries()` API, queryKey matching
- Playwright docs (https://playwright.dev/docs/input) — `setInputFiles()` for e2e file upload tests
- WebFetch response on Fetch upload progress (https://javascript.info/fetch-progress) — confirms Fetch lacks upload progress, XHR is only option

### Tertiary (LOW confidence - flagged for validation)
- Personal knowledge of CSV parsing quirks from Phase 2 (verified via samples/LagBes-sample.csv test results)
- Standard practice of shadow-box layout for mobile responsive (not yet tested in Phase 4 context)

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — Fastify 5.8.4 confirmed installed; @fastify/multipart v9.x is official plugin with stable API; XMLHttpRequest is browser standard since ~2006; shadcn/ui fully initialized Phase 1
- Architecture: **HIGH** — Phase 2 ingest, Phase 3 KPI queries, and Phase 1 RBAC patterns are all established; upload handler is straightforward composition of existing patterns
- Pitfalls: **HIGH** — Concurrency, temp cleanup, cache invalidation, file size limits are all documented pain points; Phase 2 implementations provide safety guardrails
- Environment: **MEDIUM** — @fastify/multipart not yet installed; shadcn progress component not yet installed; both are straightforward CLI additions with no known blockers

**Research date:** 2026-04-09
**Valid until:** 2026-04-16 (7 days — stable stack, no major ecosystem changes expected)

---

*Phase 4: Upload Page Research*  
*Completed: 2026-04-09*  
*Ready for planning phase*
