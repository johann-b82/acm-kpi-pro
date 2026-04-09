---
phase: 04-upload-page
plan: "02"
type: execute
wave: 1
depends_on:
  - "04-01"
files_modified:
  - apps/frontend/src/features/upload/components/UploadPage.tsx
  - apps/frontend/src/features/upload/components/DropZone.tsx
  - apps/frontend/src/features/upload/components/AdminAccessDenied.tsx
  - apps/frontend/src/features/upload/hooks/useUpload.ts
  - apps/frontend/src/features/upload/types.ts
  - apps/frontend/src/components/Header.tsx
  - apps/frontend/src/main.tsx
  - apps/frontend/src/features/upload/__tests__/Header.test.tsx
  - apps/frontend/src/features/upload/__tests__/DropZone.test.tsx
  - apps/frontend/src/features/upload/__tests__/UploadPage.test.tsx
autonomous: true
requirements:
  - UP-01
  - UP-02
  - UP-03
  - UP-07

must_haves:
  truths:
    - "Upload icon in Header is visible only when user.role === 'Admin'"
    - "Viewer visiting /upload sees 'Admin access required' card with no drop zone"
    - "Admin visiting /upload sees the DropZone component"
    - "DropZone accepts click-to-browse and drag-drop, calls onChange(File)"
    - "DropZone rejects non-.csv/.txt files with inline error: 'Only .csv and .txt files are accepted. Apollo NTS exports use .txt by default.'"
    - "DropZone takes only first file on multi-drop and renders: 'Only one file at a time — using {filename}.'"
    - "DropZone rejects files >10 MB with inline error: 'File too large — maximum 10 MB. Apollo exports should be well under this.'"
    - "main.tsx /upload route now imports UploadPage (not UploadStubPage)"
  artifacts:
    - path: "apps/frontend/src/features/upload/components/UploadPage.tsx"
      provides: "Page wrapper + state orchestration (idle/uploading/parsing/success/error)"
      exports: ["UploadPage"]
    - path: "apps/frontend/src/features/upload/components/DropZone.tsx"
      provides: "Native drag-drop + file picker, extension + size guards"
      exports: ["DropZone"]
    - path: "apps/frontend/src/features/upload/components/AdminAccessDenied.tsx"
      provides: "Viewer fallback card"
      exports: ["AdminAccessDenied"]
    - path: "apps/frontend/src/features/upload/hooks/useUpload.ts"
      provides: "XHR upload state machine (idle → uploading → parsing → done)"
      exports: ["useUpload"]
    - path: "apps/frontend/src/features/upload/types.ts"
      provides: "Local prop types for upload components"
  key_links:
    - from: "apps/frontend/src/components/Header.tsx"
      to: "user.role"
      via: "useAuth() → conditionally render Upload Link"
      pattern: "user.*role.*Admin"
    - from: "apps/frontend/src/main.tsx"
      to: "apps/frontend/src/features/upload/components/UploadPage.tsx"
      via: "Route path='/upload' element={<ProtectedRoute><UploadPage /></ProtectedRoute>}"
      pattern: "UploadPage"
    - from: "apps/frontend/src/features/upload/components/UploadPage.tsx"
      to: "user.role"
      via: "useAuth() → if role !== Admin render AdminAccessDenied"
      pattern: "AdminAccessDenied"
---

<objective>
Create the upload feature folder with UploadPage, DropZone, AdminAccessDenied, and the useUpload hook (state machine only — ProgressView/SuccessSummary/ErrorSummary are plan 03/04). Wire Header role gate and swap UploadStubPage in main.tsx. Create Wave 0 frontend test stubs.

Purpose: Delivers the navigable /upload route with proper RBAC gating and a functional drag-drop zone. Plans 03 and 04 slot ProgressView/SuccessSummary/ErrorSummary into the UploadPage state machine.
Output: Feature folder scaffold + role-gated Header + route swap + test stubs for UP-01, UP-02, UP-03, UP-07 (frontend half).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04-upload-page/04-CONTEXT.md
@.planning/phases/04-upload-page/04-UI-SPEC.md
@.planning/phases/04-upload-page/04-VALIDATION.md

@apps/frontend/src/main.tsx
@apps/frontend/src/components/Header.tsx
@apps/frontend/src/components/ProtectedRoute.tsx
@apps/frontend/src/hooks/useAuth.ts
@apps/frontend/src/features/kpi/components/KpiGrid.tsx
@packages/core/src/upload/types.ts
</context>

<interfaces>
<!-- Existing contracts to use as-is. Do not rediscover. -->

From apps/frontend/src/hooks/useAuth.ts:
```typescript
// Returns: { user: { username: string; role: 'Viewer'|'Admin'; ... } | null; loading: boolean; logout(); refetch() }
// user.role is 'Admin' (capital A) — matches Role type from @acm-kpi/core
import { useAuth } from '../hooks/useAuth.js'
```

From apps/frontend/src/components/Header.tsx (current state — to be modified):
```typescript
// Upload icon Link already at line ~62-73. Phase 4 wraps it in: {user?.role === 'Admin' && <Link .../>}
// useAuth() already imported at line 3
```

From packages/core/src/upload/types.ts (created in plan 01):
```typescript
export interface UploadSuccessResponse { status: 'success'; filename: string; rowsInserted: number; durationMs: number; kpiDelta: UploadKpiDelta }
export interface UploadErrorResponse { status: 'failed'; filename: string; rowsInserted: 0; errors: Array<{ row: number; field: string; value: unknown; reason: string }>; durationMs: number }
export type UploadResponse = UploadSuccessResponse | UploadErrorResponse
```

From apps/frontend/src/features/kpi/ (structural pattern):
```
features/kpi/
├── components/   ← React components
├── hooks/        ← Data hooks
```
Phase 4 mirrors this under features/upload/
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Wave 0 — Frontend test stubs</name>
  <files>
    apps/frontend/src/features/upload/__tests__/Header.test.tsx
    apps/frontend/src/features/upload/__tests__/DropZone.test.tsx
    apps/frontend/src/features/upload/__tests__/UploadPage.test.tsx
  </files>
  <read_first>
    - .planning/phases/04-upload-page/04-VALIDATION.md (exact test file names + -t filter strings required per Wave 0)
    - apps/frontend/src/features/kpi/__tests__/ (if it exists — use as structural pattern for test setup)
    - apps/frontend/vitest.config.ts (to understand jsdom setup, aliases)
  </read_first>
  <behavior>
    Create test stubs with vi.todo() so they show as "pending" in Vitest output.
    File: apps/frontend/src/features/upload/__tests__/Header.test.tsx
    - describe('Header upload icon') with vi.todo() stubs:
      - 'upload-icon: renders upload Link for Admin user'
      - 'upload-icon: hides upload Link for Viewer user'

    File: apps/frontend/src/features/upload/__tests__/DropZone.test.tsx
    - describe('DropZone') with vi.todo() stubs:
      - 'extension: rejects .xlsx file with inline error message'
      - 'extension: accepts .csv file and calls onChange'
      - 'extension: accepts .txt file and calls onChange'
      - 'size: rejects file >10MB with inline error message'
      - 'multi-drop: uses first file and shows warning when multiple files dropped'
      - 'click: opens file picker on button click'

    File: apps/frontend/src/features/upload/__tests__/UploadPage.test.tsx
    - describe('UploadPage') with vi.todo() stubs:
      - 'viewer-forbidden: renders AdminAccessDenied for Viewer role'
      - 'viewer-forbidden: does not render DropZone for Viewer role'
      - 'admin: renders DropZone for Admin role'

    Each file needs: import { describe, it, vi } from 'vitest'; (React import only if needed).
    Use vi.todo() not vi.skip() — vi.todo() documents intent without marking as failing.
  </behavior>
  <action>
    Create the three test stub files with vi.todo() entries as described. The __tests__/ directory must be inside apps/frontend/src/features/upload/. Do NOT import DropZone or UploadPage in stubs (they do not exist yet) — stubs describe behavior only.
  </action>
  <verify>
    <automated>
      npm -w apps/frontend run test -- features/upload/ 2>&1 | tail -15
    </automated>
  </verify>
  <done>
    - Three test files exist under apps/frontend/src/features/upload/__tests__/
    - npm -w apps/frontend run test -- features/upload/ runs without import errors
    - All stubs show as "todo" or "pending" in Vitest output (not failing)
    - 04-VALIDATION.md Wave 0 requirements for Header, DropZone, UploadPage stubs satisfied
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Feature folder — DropZone + useUpload hook + UploadPage scaffold</name>
  <files>
    apps/frontend/src/features/upload/types.ts
    apps/frontend/src/features/upload/hooks/useUpload.ts
    apps/frontend/src/features/upload/components/AdminAccessDenied.tsx
    apps/frontend/src/features/upload/components/DropZone.tsx
    apps/frontend/src/features/upload/components/UploadPage.tsx
    apps/frontend/src/components/Header.tsx
    apps/frontend/src/main.tsx
  </files>
  <read_first>
    - apps/frontend/src/hooks/useAuth.ts (user.role type)
    - apps/frontend/src/components/Header.tsx (current upload Link block to add role gate)
    - apps/frontend/src/main.tsx (UploadStubPage import to replace)
    - .planning/phases/04-upload-page/04-UI-SPEC.md (copywriting contract, color tokens, component states)
    - .planning/phases/04-upload-page/04-CONTEXT.md decisions D-01, D-02, D-05
    - packages/core/src/upload/types.ts (UploadResponse DTO shape)
    - apps/frontend/src/features/upload/__tests__/DropZone.test.tsx (tests to make green)
    - apps/frontend/src/features/upload/__tests__/UploadPage.test.tsx (tests to make green)
    - apps/frontend/src/features/upload/__tests__/Header.test.tsx (tests to make green)
  </read_first>
  <behavior>
    Create apps/frontend/src/features/upload/types.ts:
    Local prop types (not in @acm-kpi/core). Export:
    - type UploadState = 'idle' | 'uploading' | 'parsing' | 'success' | 'error'
    - interface DropZoneProps { onFileSelected: (file: File) => void; disabled?: boolean; error?: string | null }

    Create apps/frontend/src/features/upload/hooks/useUpload.ts:
    State machine managing: { state: UploadState; uploadPercent: number; result: UploadResponse | null; error: string | null }
    Export function useUpload():
    - uploadFile(file: File): void — uses XMLHttpRequest (per D-01, NOT fetch):
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => { if (e.lengthComputable) setUploadPercent(Math.round(e.loaded/e.total*100)) });
      xhr.upload.addEventListener('load', () => { setState('parsing') });
      xhr.open('POST', '/api/v1/upload', true);
      xhr.withCredentials = true;
      xhr.onload = () => { const result = JSON.parse(xhr.responseText) as UploadResponse; setResult(result); setState(result.status === 'success' ? 'success' : 'error') }
      xhr.onerror = () => { setError('Upload failed — network error'); setState('error') }
      const formData = new FormData(); formData.append('file', file); xhr.send(formData);
      Handle 409: xhr.onload — if xhr.status === 409 set error = 'An ingest is already running — please wait a moment and try again.'
      Handle 403: if xhr.status === 403 set error = 'Admin role required.'
    - reset(): sets state back to 'idle', clears result and error
    - Returns: { state, uploadPercent, result, error, uploadFile, reset }

    Create apps/frontend/src/features/upload/components/AdminAccessDenied.tsx:
    - Import Card, CardHeader, CardTitle, CardContent from '@/components/ui/card'
    - Import ShieldOff from 'lucide-react'
    - Render: Card with red-50 bg + red-200 border
      - CardHeader: ShieldOff icon (red-600) + CardTitle "Admin access required"
      - CardContent: p "Uploading new data is restricted to administrators. Contact your ACM admin to refresh the dashboard."
    - aria-live="polite" on the Card

    Create apps/frontend/src/features/upload/components/DropZone.tsx (per D-02, UI-SPEC):
    Props: { onFileSelected: (file: File) => void; disabled?: boolean; error?: string | null }
    Implement:
    - Hidden <input type="file" accept=".csv,.txt" ref={inputRef} onChange={handleFileInput} hidden aria-hidden="true" />
    - Visible <button type="button" role="button" tabIndex={0} ...> with drag-drop listeners on containing div
    - State: isDragOver (boolean) for visual feedback
    - dragover handler: e.preventDefault(); setIsDragOver(true)
    - dragleave handler: setIsDragOver(false)
    - drop handler: e.preventDefault(); setIsDragOver(false); const files = Array.from(e.dataTransfer?.files ?? []); handleFiles(files)
    - click handler: inputRef.current?.click()
    - handleFiles(files: File[]): 
        if files.length > 1: call onFileSelected(files[0]) AND show inline warning "Only one file at a time — using {files[0].name}." (multi-drop per D-02)
        else if files.length === 1: validate single file
        validateFile(file):
          ext = file.name.split('.').pop()?.toLowerCase()
          if ext !== 'csv' && ext !== 'txt': set localError "Only .csv and .txt files are accepted. Apollo NTS exports use .txt by default."
          else if file.size > 10 * 1024 * 1024: set localError "File too large — maximum 10 MB. Apollo exports should be well under this."
          else: setLocalError(null); onFileSelected(file)
    - Styling (from UI-SPEC): 
        idle: border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:bg-brand-50 transition-colors
        drag-over: border-brand-400 bg-brand-50 border-solid
        disabled: opacity-50 cursor-not-allowed
    - Content: Upload icon (Lucide Upload h-8 w-8 text-slate-400) + p "Drop your LagBes CSV or TXT file here" + span "or click to browse" + p "Maximum file size: 10 MB" (text-xs text-muted-foreground)
    - Inline error (below button, not above): {(error || localError) && <p role="alert" className="mt-2 text-sm text-destructive">{error || localError}</p>}
    - Keyboard: onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
    - ARIA: aria-label="File upload area. Drop your CSV or TXT file or press Enter to browse."

    Create apps/frontend/src/features/upload/components/UploadPage.tsx:
    - Import useAuth from '@/hooks/useAuth' — check user.role === 'Admin'
    - Import useUpload hook
    - If !user: return null (ProtectedRoute handles loading/redirect)
    - If user.role !== 'Admin': return <AdminAccessDenied /> (per D-05)
    - Render page layout:
        <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
          <h1 className="text-2xl font-bold">Upload Data</h1>
          {state === 'idle' || state === 'uploading' || state === 'parsing' ? (
            <DropZone onFileSelected={uploadFile} disabled={state !== 'idle'} error={state === 'idle' ? error : null} />
          ) : null}
          {(state === 'uploading' || state === 'parsing') && (
            <div>ProgressView placeholder — wired in plan 03</div>
          )}
          {state === 'success' && result?.status === 'success' && (
            <div>SuccessSummary placeholder — wired in plan 04</div>
          )}
          {state === 'error' && (
            <div>ErrorSummary placeholder — wired in plan 04</div>
          )}
        </div>
    - The "placeholder" divs have data-testid="progress-placeholder", "success-placeholder", "error-placeholder" so plans 03/04 know exactly where to slot in the real components.

    Modify apps/frontend/src/components/Header.tsx:
    - Find the Upload icon Link block (lines ~62-73 in current file)
    - Wrap it: {user?.role === 'Admin' && <Link to="/upload" ...>...</Link>}
    - user is already available from useAuth() at line 3. No new imports needed.

    Modify apps/frontend/src/main.tsx:
    - Remove: import { UploadStubPage } from './pages/UploadStubPage.js'
    - Add: import { UploadPage } from './features/upload/components/UploadPage.js'
    - In Route path="/upload": replace <UploadStubPage /> with <UploadPage />

    Convert vi.todo() stubs to real implementations in the three test files:
    For Header.test.tsx: mock useAuth (vi.mock('../hooks/useAuth.js', () => ({ useAuth: vi.fn() }))); test that Upload Link renders for Admin, hidden for Viewer using renderWithProviders or render()+queries.
    For DropZone.test.tsx: render <DropZone onFileSelected={vi.fn()} />, simulate drop/change events. For extension tests: create File object with specific name and fire drop event.
    For UploadPage.test.tsx: mock useAuth; test that AdminAccessDenied renders for Viewer; DropZone renders for Admin. Also mock useUpload.
  </behavior>
  <action>
    Create files in this order:
    1. apps/frontend/src/features/upload/types.ts
    2. apps/frontend/src/features/upload/hooks/useUpload.ts
    3. apps/frontend/src/features/upload/components/AdminAccessDenied.tsx
    4. apps/frontend/src/features/upload/components/DropZone.tsx
    5. apps/frontend/src/features/upload/components/UploadPage.tsx
    6. Modify apps/frontend/src/components/Header.tsx — add role gate around Upload Link
    7. Modify apps/frontend/src/main.tsx — swap UploadStubPage → UploadPage

    Then update the three test stub files to implement real assertions.

    Key constraints from CONTEXT.md:
    - Per D-01: XMLHttpRequest only (NO fetch for upload) — useUpload.ts must use XHR
    - Per D-02: 10 MB limit enforced in DropZone before any upload attempt
    - Per D-05: role check is inside UploadPage (after ProtectedRoute confirms auth), rendering AdminAccessDenied for non-Admin
    - shadcn/ui card, button primitives already installed; no new shadcn installs needed for this plan
    - Import paths use '@/...' alias (per vitest.config.ts and vite.config.ts from Phase 1/3)
    - File extension is .tsx for React components, .ts for hooks/types
    - All components are named exports (not default exports) — per Phase 3 pattern
  </action>
  <verify>
    <automated>
      npm -w apps/frontend run test -- features/upload/ 2>&1 | tail -20
    </automated>
  </verify>
  <done>
    - All 7 new/modified files created or updated
    - npm -w apps/frontend run test -- features/upload/ exits 0 with Header (upload-icon), DropZone (extension, size), UploadPage (viewer-forbidden, admin) tests green
    - grep "UploadPage" apps/frontend/src/main.tsx exits 0 (UploadStubPage no longer referenced)
    - grep "user?.role.*Admin" apps/frontend/src/components/Header.tsx exits 0
    - TypeScript build passes: npm -w apps/frontend run typecheck 2>&1 | grep -c error → 0
    - 04-VALIDATION.md tests UP-01, UP-02, UP-03, UP-07 (frontend half) pass
  </done>
</task>

</tasks>

<verification>
After both tasks complete:

1. Frontend test suite for upload feature:
   `npm -w apps/frontend run test -- features/upload/`
   Header upload-icon, DropZone extension/size, UploadPage viewer-forbidden/admin must be green.

2. Header role gate present:
   `grep "role.*Admin" apps/frontend/src/components/Header.tsx`
   Must match.

3. Route swap confirmed:
   `grep "UploadPage\|UploadStubPage" apps/frontend/src/main.tsx`
   UploadPage present, UploadStubPage absent.

4. Frontend type check:
   `npm -w apps/frontend run typecheck 2>&1 | grep error | head -5`
   Zero new errors.

5. Feature folder structure:
   `ls apps/frontend/src/features/upload/components/ apps/frontend/src/features/upload/hooks/`
   UploadPage.tsx, DropZone.tsx, AdminAccessDenied.tsx; useUpload.ts.
</verification>

<success_criteria>
- /upload route renders UploadPage (not UploadStubPage stub)
- Header Upload icon hidden for Viewers, visible for Admins (per D-05 / UP-01)
- DropZone rejects wrong extension and oversized files with exact error copy from CONTEXT.md (per D-02 / UP-02 / UP-03)
- Viewing /upload as a Viewer shows AdminAccessDenied card (per D-05 / UP-07)
- useUpload hook implements XHR state machine (per D-01) with idle/uploading/parsing/success/error states
- UploadPage has placeholder divs with data-testid for ProgressView, SuccessSummary, ErrorSummary (plans 03/04 slot in)
- All Wave 0 frontend test stubs converted to passing tests (Header, DropZone, UploadPage)
</success_criteria>

<output>
After completion, create `.planning/phases/04-upload-page/04-02-SUMMARY.md` following the summary template at @$HOME/.claude/get-shit-done/templates/summary.md
</output>
