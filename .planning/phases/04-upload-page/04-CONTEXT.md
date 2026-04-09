# Phase 4: Upload Page — Context

**Gathered:** 2026-04-09
**Status:** Ready for research and planning
**Source:** /gsd:discuss-phase interactive session

<domain>
## Phase Boundary

**In scope:**
- `/upload` route (replaces the Phase 1 `UploadStubPage`) — drag-and-drop zone + file picker fallback
- File-type validation client-side: only `.csv` and `.txt` accepted
- Two-stage progress UI: real upload % during transfer, then indeterminate "Parsing & validating…" state while the server runs the Phase 2 ingest pipeline
- Success view: row count + 4 headline KPI deltas (before → after), rendered on the same page
- Error view: grouped-by-field summary + full scrollable per-row error table
- Admin-only: header button hidden for Viewers; `/upload` route shows "Admin access required" for Viewers
- `POST /api/v1/upload` endpoint on Fastify — multipart form upload, calls `ingestLagBesFile(path, 'upload')` from Phase 2
- Server-side RBAC: `POST /api/v1/upload` requires Admin role (UP-07)
- Playwright e2e test: login as Admin → upload sample file → /dashboard reflects new KPI values

**Out of scope:**
- Multi-file / queued upload (single file at a time; snapshot-replace semantics make multi moot)
- Cancellation mid-upload
- Row-level parse progress (SSE / polling) — ingest is sub-second at Apollo data scale; theatre not justified
- Upload history / past imports list (v2 — imports table exists but no UI for it)
- German translations of upload strings (Phase 6 localizes)
- German number formatting of KPI deltas (Phase 6)
- Dark-mode polish of the upload page specifically (Phase 6 handles theming globally)
- Any changes to the Phase 2 ingest pipeline itself (reused as-is)

</domain>

<decisions>
## Implementation Decisions

### Progress reporting (D-01)

**Two-stage progress with a single HTTP request.**

- Client uses `XMLHttpRequest` (or `fetch` with a `ReadableStream` body + `TransformStream` for byte counting) to track real upload byte progress → renders as a determinate progress bar (0–100 %).
- Once the request body has finished uploading (`xhr.upload.onload`), the UI switches to an **indeterminate** shadcn spinner with the label **"Parsing & validating…"**. This state lasts as long as the server takes to run `ingestLagBesFile()` (sub-second for typical Apollo exports, a few seconds worst case for a maxed-out 10 MB file).
- The same HTTP response returns the final `IngestResult` — the client does not need to poll or subscribe to anything.
- No SSE, no WebSocket, no import-status polling endpoint. If ingest times ever grow past ~30 s in future data sizes, we revisit with a polling endpoint then.

**Why:** Apollo LagBes exports are small (thousands of rows, a few MB). Measured Phase 2 ingest is sub-second for 10k rows. Row-level progress would require new infra and provide no meaningful UX win.

### File constraints (D-02)

- **Max file size:** 10 MB (enforced both client-side before upload and server-side in the multipart handler). Rejects with a clear error above the drop zone: `"File too large — maximum 10 MB. Apollo exports should be well under this."`
- **Single file at a time.** If the user drops multiple files, the client takes only the first and shows a warning toast: `"Only one file at a time — using {filename}."`
- **Accepted extensions:** `.csv`, `.txt` (checked client-side by filename; server re-checks). Any other extension → inline error, no upload attempted.
- **Concurrency:** If an upload is already in progress (either from this user or another admin), the server returns HTTP 409 Conflict with message `"An ingest is already running — please wait a moment and try again."` Client surfaces this as a dismissible error banner. Detection: server checks `imports` table for any row with `status='running'` before starting a new one.
- **No cancellation in v1.** Once upload bytes are flowing, the user waits it out. (Aborting mid-transaction would leave the `imports` row in an awkward state; defer to v2 if it becomes a real pain.)

### Success summary (D-03)

**Layout:** shadcn `Card` stacked below the drop zone. Contents:

1. **Header:** green check icon + `"Import successful"`
2. **Meta line:** `filename · {rows_inserted} rows imported · completed in {duration_ms / 1000} s`
3. **KPI delta grid:** 2×2 grid of 4 headline KPIs showing before → after values + absolute delta:
   - **Total inventory value** (€)
   - **Days-on-hand** (weighted avg)
   - **Stockouts count**
   - **Dead-stock % of value**
4. **Primary button:** `"Go to Dashboard"` → navigates to `/` and invalidates the React Query cache for `/api/v1/kpi/summary` so fresh numbers land immediately (not waiting for the 30 s poll).
5. **Secondary button:** `"Upload another file"` → resets the upload component to its initial empty state.

**Delta computation:** Server-side. The API handler captures a snapshot of these 4 KPIs BEFORE calling `ingestLagBesFile` (or reads the pre-import MV row) and another snapshot AFTER the ingest completes. The upload response returns:

```ts
{
  status: 'success',
  filename: string,
  rowsInserted: number,
  durationMs: number,
  kpiDelta: {
    totalInventoryValue: { before: number, after: number, delta: number },
    daysOnHand:          { before: number, after: number, delta: number },
    stockoutsCount:      { before: number, after: number, delta: number },
    deadStockPct:        { before: number, after: number, delta: number },
  },
}
```

Pre-import snapshot may be `null` on the very first import (no prior data) — the UI handles this by hiding the "before" column and showing only "after" values.

### Error summary (D-04)

**Layout:** shadcn `Card` (error variant: red border) stacked below the drop zone. Two sections:

1. **Grouped header:** `"Import failed — {errorCount} errors across {fieldCount} fields"`, followed by a bulleted list grouped by field:
   ```
   • Wert mit Abw. — 42 rows
   • letzt.Zugang — 12 rows
   • Bestand — 3 rows
   ```
   Sorted by count descending. Helps the user spot patterns (e.g. "all my Wert columns broke — probably an encoding issue") before diving into details.

2. **Detail table:** shadcn `Table` (scrollable, max-height ~400 px) with columns: `Row | Field | Value | Reason`. Shows every error (no pagination, no truncation). Playwright test pins the scrollable container height.

3. **Action row:**
   - `"Copy all errors"` button — copies the full error list as plain text to clipboard (tab-separated), for pasting into an IT ticket
   - `"Try another file"` button — resets to the empty state

**No server changes required** — the Phase 2 validator already returns the full `errors[]` array on IN-11 failures. The upload response on failure is:

```ts
{
  status: 'failed',
  filename: string,
  rowsInserted: 0,
  errors: Array<{ row: number, field: string, value: unknown, reason: string }>,
  durationMs: number,
}
```

No CSV export of errors in v1 — "Copy all errors" covers the hand-off use case with less code.

### Admin-only UX (D-05)

**Client-side (cosmetic, not security):**
- **Header icon button:** hidden for Viewers. `Header.tsx` already exists from Phase 1 — planner wires in a role check from the auth session and conditionally renders the Upload `Link`. The Docs button stays visible to everyone.
- **Route `/upload`:** accessible to any logged-in user, but renders different content:
  - **Admin:** the full upload page
  - **Viewer:** a friendly message card — `"Admin access required"` / `"Uploading new data is restricted to administrators. Contact your ACM admin to refresh the dashboard."` — no upload UI rendered
- Uses the existing `ProtectedRoute` wrapper from Phase 1; this adds a role-check variant (or a new `<AdminOnly>` helper) rather than duplicating auth logic.

**Server-side (authoritative):**
- `POST /api/v1/upload` uses `requireAuth()` AND a new `requireAdmin()` middleware (or inline role check). Viewers get HTTP 403 with body `{ error: 'admin_required' }`. This is the binding security check — the client hiding is purely UX.

### Route-level technical decisions (researcher/planner may refine)

- **Fastify multipart:** use `@fastify/multipart` (official plugin) with `limits: { fileSize: 10 * 1024 * 1024, files: 1 }`. Files are written to a temp dir (`os.tmpdir()`) using the plugin's `saveRequestFiles()` helper, then `ingestLagBesFile(tmpPath, 'upload')` is called. Temp file is deleted in a `finally` block regardless of outcome.
- **Response type:** shared DTO added to `packages/core/src/upload/types.ts` (`UploadSuccessResponse`, `UploadErrorResponse`) — imported by both API handler and frontend component. Follows the Phase 3 pattern of co-locating contract types in `@acm-kpi/core`.
- **Component structure:** `apps/frontend/src/features/upload/` with `UploadPage.tsx`, `DropZone.tsx`, `ProgressView.tsx`, `SuccessSummary.tsx`, `ErrorSummary.tsx`. Mirrors the Phase 3 `features/kpi/` layout.
- **No third-party drop-zone library** — native HTML `<input type="file">` + `dragover` / `drop` handlers are ~30 LOC and avoid an offline-runtime dependency (PROJECT.md: offline/air-gap tolerance).
- **KPI delta source:** new helper in `apps/api/src/kpi/` that reads the 4 headline KPIs from the MV (same query as `/api/v1/kpi/summary` but narrowed). Called once before ingest (may return null if MV is empty) and once after the MV refresh inside the same request handler. Concurrency is protected by the `imports.status='running'` check, so no race with other uploads.
- **React Query cache invalidation:** on "Go to Dashboard" click, call `queryClient.invalidateQueries({ queryKey: ['kpi', 'summary'] })` before navigation so the dashboard re-fetches on mount.

### Claude's Discretion

- Exact styling of the drop zone (dashed border intensity, hover/drag states)
- Whether the `requireAdmin()` check is a standalone middleware file or inlined as part of `requireAuth({ role: 'admin' })`
- Exact Zod schema shape for the multipart request in the handler
- Whether `ProgressView` is one component with conditional states or two siblings
- Whether the concurrency check uses a DB row lock or an in-memory mutex in the Fastify app (planner to pick based on single-instance constraint from PROJECT.md)
- Whether the error detail table uses `tanstack/react-table` or plain `<table>` (shadcn `Table` is the latter)
- Copy for all user-facing strings — English-only in Phase 4; Phase 6 localizes. Keep them short and executive-friendly.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before researching or planning.**

### Phase 4 inputs (this phase)

- `.planning/ROADMAP.md` §Phase 4 — scope, exit criteria, dependencies
- `.planning/REQUIREMENTS.md` — UP-01..UP-07, IN-02, TEST-03
- `.planning/PROJECT.md` — offline/air-gap constraint, on-prem deployment, RBAC roles

### Phase 4 depends on Phase 1 artifacts

- `apps/frontend/src/pages/UploadStubPage.tsx` — stub to be REPLACED
- `apps/frontend/src/components/Header.tsx` — contains the upload icon button (L62-71); Phase 4 adds the role gate here
- `apps/frontend/src/components/ProtectedRoute.tsx` — Phase 1 auth wrapper; Phase 4 extends or wraps it for admin gating
- `apps/frontend/src/main.tsx` — routes wiring (L12, L33-36); Phase 4 swaps `UploadStubPage` for the real `UploadPage`
- `apps/api/src/server.ts` — Fastify factory; Phase 4 registers `@fastify/multipart` and the `/api/v1/upload` route here
- `apps/api/src/middleware/rbac.ts` — `requireAuth()`; Phase 4 adds or composes an admin check
- `apps/api/src/routes/admin.ts` — pattern reference for admin-gated routes

### Phase 4 depends on Phase 2 artifacts

- `apps/api/src/ingest/index.ts` — `ingestLagBesFile(filePath, source, opts)` is the entry point; Phase 4 calls this with `source: 'upload'`. Already supports the 'upload' source tag.
- `apps/api/src/ingest/writer.ts` — context only (Phase 4 does not touch this)
- `@acm-kpi/core` `IngestResult` type — Phase 4 response wraps this shape
- `apps/api/src/db/schema.ts` — `imports` table; Phase 4 reads `status='running'` for concurrency check

### Phase 4 depends on Phase 3 artifacts

- `apps/api/src/kpi/` — Phase 3 endpoint handlers + KPI query helpers; Phase 4 reuses the "headline KPI" queries to compute the success delta
- `packages/core/src/kpi/types.ts` — `KpiSummary` DTO; Phase 4 picks 4 fields for the delta shape
- `apps/frontend/src/features/kpi/` — Phase 3 directory layout; Phase 4 mirrors it under `features/upload/`

### External specs & plugins

- `@fastify/multipart` docs — multipart parsing, `saveRequestFiles()`, limits config
- `samples/LagBes-sample.csv` — golden fixture for the Playwright e2e test
- `samples/README.md` — CSV quirk doc (context only — parsing already solved in Phase 2)

### Prior CONTEXT (precedent)

- `.planning/phases/03-kpi-layer-dashboard/03-CONTEXT.md` — accessibility rules, color-never-sole-signal, English-first / Phase 6 localization, React Query polling pattern, shadcn/ui primitive inventory

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **shadcn/ui primitives** (`apps/frontend/src/components/ui/`): `badge`, `button`, `card`, `dialog`, `input`, `select`, `table`, `tooltip` — the upload page needs only `card`, `button`, `table`, and probably `progress` (not yet installed — planner adds via shadcn CLI).
- **`ingestLagBesFile()`** — Phase 2 orchestrator already accepts `source: 'upload'`. Phase 4 only wires the HTTP entry point; no ingest changes.
- **`Header.tsx`** — already renders the upload icon button and routes to `/upload`. Phase 4 adds a role-based conditional render.
- **`ProtectedRoute.tsx`** — Phase 1 auth wrapper; a small extension handles the admin-only case.
- **React Query `queryClient`** — from Phase 3; use `invalidateQueries` to refresh the dashboard on navigation.
- **`imports` table** — has `status` column; queryable for the concurrency check.

### Established Patterns
- **Feature folder layout:** `apps/frontend/src/features/<feature>/` with `components/`, page entry at `pages/`. Follow the Phase 3 `features/kpi/` structure.
- **Shared DTOs in `@acm-kpi/core`:** Phase 3 put KPI types in `packages/core/src/kpi/`; Phase 4 puts upload DTOs in `packages/core/src/upload/`.
- **English-first, Phase 6 localizes:** no `Intl.NumberFormat('de-DE')` or i18n keys in Phase 4. Keep strings inline and readable.
- **Vitest + React Testing Library** for component tests; Playwright for e2e.
- **Pino structured logs** in the API handler for audit (OBS-01): log `upload_received`, `upload_validated`, `upload_ingest_start`, `upload_done` / `upload_failed` with correlationId threaded from the ingest orchestrator.

### Integration Points
- `main.tsx` route table — swap `UploadStubPage` for `UploadPage`
- `Header.tsx` — add role check around the upload `Link`
- `server.ts` — register multipart plugin + `/api/v1/upload` route
- `packages/core/src/upload/types.ts` — NEW file for shared DTOs
- Dashboard `DashboardPage.tsx` — no changes; React Query cache invalidation on navigation handles the refresh

### Constraints from Architecture
- **Single-instance deployment** (docker-compose) — the concurrency check can use either an in-memory lock or the DB `imports.status='running'` query. DB is more robust (survives restart, works if ever scaled out).
- **Offline / air-gapped** — no CDN deps. `@fastify/multipart` is a plain npm package (fine). Native browser drag-drop, no libraries (fine).

</code_context>

<specifics>
## Specific Ideas & Constraints

### Progress UX copy (English-first, Phase 6 localizes)

- Idle: `"Drop your LagBes CSV or TXT file here"` / secondary: `"or click to browse"`
- Uploading: `"Uploading {filename}… {percent}%"`
- Parsing: `"Parsing & validating… this usually takes a second"`
- Success: `"Import successful"` + KPI delta grid
- Failure: `"Import failed — {errorCount} errors across {fieldCount} fields"`

### File validation copy

- Wrong extension: `"Only .csv and .txt files are accepted. Apollo NTS exports use .txt by default."`
- Too large: `"File too large — maximum 10 MB. Apollo exports should be well under this."`
- Multi-file drop: `"Only one file at a time — using {filename}."`
- Concurrent upload: `"An ingest is already running — please wait a moment and try again."`

### KPI delta formatting

- Values in Phase 4 use **default browser formatting** (no `Intl.NumberFormat('de-DE')`) — consistent with Phase 3's deferred-to-Phase-6 rule.
- Deltas render with sign + color:
  - `+` and green for: inventory value ↑, days-on-hand ↑, dead-stock % ↓ *(careful — for dead-stock %, a negative delta is good)*
  - `−` and red for the opposite
  - `0` and neutral when unchanged
- **Color never sole signal** — each delta also shows an arrow icon (↑ / ↓ / →) and a textual sign.

### Playwright e2e (TEST-03)

Test flow:
1. Login as admin (seeded credential)
2. Navigate to `/upload`
3. Verify drop zone is visible
4. Upload `samples/LagBes-sample.csv` via file input
5. Assert progress transitions: upload % → "Parsing…" → success card visible
6. Assert row count and at least one KPI delta value are rendered
7. Click "Go to Dashboard"
8. Assert dashboard KPI values match the post-import snapshot (not the pre-import empty state)

Also a negative test: login as viewer → visit `/upload` → assert the "Admin access required" message is shown, no drop zone.

### Security / audit

- POST body size limit at Fastify level (matches the 10 MB client cap)
- Pino log on every upload attempt (success and failure) with: `correlationId`, `userId`, `role`, `filename`, `byteCount`, `durationMs`, `status`, `rowsInserted`, `errorCount`
- No raw file contents ever logged (PROJECT.md: data stays on-prem, no telemetry)
- Temp file deleted in `finally` — leaked temp files could eventually fill disk on a long-running container

### Accessibility (inherit from Phase 3 rules)

- Drop zone is a proper `<button>` or has `role="button"` + `tabIndex=0` + keyboard activation (Enter / Space opens the file picker)
- Progress bar has `role="progressbar"` with `aria-valuenow` during the determinate phase and `aria-busy="true"` during the indeterminate phase
- Success + error cards announce via `aria-live="polite"`
- Error detail table is a real `<table>` with `<th scope="col">` headers
- Color never sole signal — arrows/text labels accompany all color cues

</specifics>

<deferred>
## Deferred Ideas

- **Multi-file upload / queued ingestion** — v2 at earliest; snapshot-replace semantics make this moot for v1 (only the last file's data survives)
- **Cancellation mid-upload** — v2 if it becomes a real complaint; requires a clean abort path through the ingest transaction
- **Upload history UI** — v2; the `imports` table already captures every attempt, but there's no UI for it yet
- **Import diff viewer** (row-level added/removed/changed since last import) — v2+; would require snapshot history which PROJECT.md rules out for v1
- **CSV export of errors** — defer; "Copy all errors" button covers the IT-ticket hand-off use case with far less code
- **SSE / WebSocket progress** — v2 if data sizes grow past ~30 s ingest time
- **Row-level parse progress** — v2 if data sizes ever justify it
- **Configurable file size limit via env var** — v2 if anyone asks; 10 MB is a reasonable static default
- **Auto-ingest on drop without a confirm** — current design uploads immediately on drop; if users request a "review before upload" step, that's a v2 idea
- **German number formatting of the KPI delta** — Phase 6 localization handles this
- **Drag-drop from email attachments / browser downloads** — v2 if requested; native drag-drop only in v1
- **Upload from URL / paste raw CSV** — out of scope; v1 is file-only

</deferred>

---

*Phase: 04-upload-page*
*Context gathered: 2026-04-09 via interactive discussion*
