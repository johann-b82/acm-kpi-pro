---
phase: 04-upload-page
plan: "04"
type: execute
wave: 2
depends_on:
  - "04-01"
  - "04-02"
files_modified:
  - apps/frontend/src/features/upload/components/SuccessSummary.tsx
  - apps/frontend/src/features/upload/components/ErrorSummary.tsx
  - apps/frontend/src/features/upload/components/UploadPage.tsx
  - apps/frontend/src/features/upload/__tests__/SuccessSummary.test.tsx
  - apps/frontend/src/features/upload/__tests__/ErrorSummary.test.tsx
  - apps/frontend/src/lib/queryClient.ts
autonomous: true
requirements:
  - UP-05
  - UP-06

must_haves:
  truths:
    - "Success card shows green border, 'Import successful' heading, filename/rowsInserted/durationMs metadata line"
    - "KPI delta grid shows Before/After/Change columns for all 4 KPIs; Before column hidden (shows only After+Change) when before=null"
    - "Delta sign + arrow + color: positive = green + up arrow + '+' prefix; negative = red + down arrow + '−' prefix; zero = neutral dash"
    - "Dead-stock % is an inverted KPI: lower is better — delta sign colors are reversed relative to other KPIs"
    - "'Go to Dashboard' invalidates React Query ['kpi','summary'] and navigates to /"
    - "'Upload another file' calls reset() and returns to idle state"
    - "Error card shows red border, 'Import failed' heading, errorCount+fieldCount summary"
    - "Grouped field list sorted by error count descending with bullet points"
    - "Scrollable error detail table with Row|Field|Value|Reason columns (max-h-96 overflow-y-auto)"
    - "'Copy all errors' copies tab-separated rows to clipboard"
    - "'Try another file' calls reset() and returns to idle state"
    - "Success and error cards have aria-live=polite (success) and aria-live=assertive (error)"
  artifacts:
    - path: "apps/frontend/src/features/upload/components/SuccessSummary.tsx"
      provides: "Green success card with KPI delta grid and action buttons"
      exports: ["SuccessSummary"]
    - path: "apps/frontend/src/features/upload/components/ErrorSummary.tsx"
      provides: "Red error card with grouped field list and detail table"
      exports: ["ErrorSummary"]
    - path: "apps/frontend/src/features/upload/__tests__/SuccessSummary.test.tsx"
      provides: "Tests for UP-05 including null-before branch"
    - path: "apps/frontend/src/features/upload/__tests__/ErrorSummary.test.tsx"
      provides: "Tests for UP-06 grouped list + detail table"
  key_links:
    - from: "apps/frontend/src/features/upload/components/SuccessSummary.tsx"
      to: "apps/frontend/src/lib/queryClient.ts"
      via: "queryClient.invalidateQueries({ queryKey: ['kpi', 'summary'] }) on Go to Dashboard click"
      pattern: "invalidateQueries.*kpi.*summary"
    - from: "apps/frontend/src/features/upload/components/UploadPage.tsx"
      to: "SuccessSummary + ErrorSummary"
      via: "replaces success-placeholder and error-placeholder divs from plan 02"
      pattern: "SuccessSummary|ErrorSummary"
---

<objective>
Build SuccessSummary (green KPI delta card) and ErrorSummary (red grouped error card) components, wire them into UploadPage replacing plan 02 placeholders. Implement React Query cache invalidation on dashboard navigation.

Purpose: Satisfies UP-05 and UP-06 — gives the Admin the full import outcome: either a meaningful KPI delta view or actionable error details.
Output: Two components with full UI-SPEC compliance, passing unit tests, and UploadPage updated with real success/error state rendering.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04-upload-page/04-CONTEXT.md
@.planning/phases/04-upload-page/04-UI-SPEC.md
@.planning/phases/04-upload-page/04-VALIDATION.md

@apps/frontend/src/features/upload/components/UploadPage.tsx
@apps/frontend/src/features/upload/hooks/useUpload.ts
@packages/core/src/upload/types.ts
@apps/frontend/src/lib/queryClient.ts
</context>

<interfaces>
<!-- Exact DTO shapes from plan 01 and hook from plan 02 -->

From packages/core/src/upload/types.ts (created in plan 01):
```typescript
interface KpiDeltaField { before: number | null; after: number; delta: number }
interface UploadKpiDelta {
  totalInventoryValue: KpiDeltaField;
  daysOnHand: KpiDeltaField;
  stockoutsCount: KpiDeltaField;
  deadStockPct: KpiDeltaField;
}
interface UploadSuccessResponse {
  status: 'success'; filename: string; rowsInserted: number; durationMs: number; kpiDelta: UploadKpiDelta
}
interface UploadErrorResponse {
  status: 'failed'; filename: string; rowsInserted: 0; durationMs: number;
  errors: Array<{ row: number; field: string; value: unknown; reason: string }>
}
```

From apps/frontend/src/features/upload/hooks/useUpload.ts (plan 02):
```typescript
// reset() clears result and returns state to 'idle'
```

From apps/frontend/src/features/upload/components/UploadPage.tsx (plan 02/03):
```tsx
// Plan 02 placeholders to replace:
{state === 'success' && result?.status === 'success' && (
  <div data-testid="success-placeholder">SuccessSummary placeholder — wired in plan 04</div>
)}
{state === 'error' && (
  <div data-testid="error-placeholder">ErrorSummary placeholder — wired in plan 04</div>
)}
```

React Query queryClient (already in apps/frontend/src/lib/queryClient.ts):
```typescript
import { queryClient } from '@/lib/queryClient'
queryClient.invalidateQueries({ queryKey: ['kpi', 'summary'] })
// Key must be exactly ['kpi', 'summary'] — matches Phase 3 kpiKeys.summary()
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: SuccessSummary component + tests</name>
  <files>
    apps/frontend/src/features/upload/components/SuccessSummary.tsx
    apps/frontend/src/features/upload/__tests__/SuccessSummary.test.tsx
  </files>
  <read_first>
    - apps/frontend/src/features/upload/__tests__/SuccessSummary.test.tsx (may be vi.todo() stub from plan 02 Wave 0)
    - .planning/phases/04-upload-page/04-CONTEXT.md D-03 (success summary spec)
    - .planning/phases/04-upload-page/04-UI-SPEC.md §"Success Summary Card" and §Color assignments
    - .planning/phases/04-upload-page/04-VALIDATION.md row for UP-05
    - apps/frontend/src/lib/queryClient.ts (to confirm export name)
  </read_first>
  <behavior>
    Create apps/frontend/src/features/upload/components/SuccessSummary.tsx:

    Props: { result: UploadSuccessResponse; onReset: () => void }

    KPI metadata for rendering:
    Define in component file:
    ```typescript
    const KPI_DEFS = [
      { key: 'totalInventoryValue' as const, label: 'Total Inventory Value', unit: '€', invertedSign: false },
      { key: 'daysOnHand' as const, label: 'Days on Hand', unit: 'd', invertedSign: false },
      { key: 'stockoutsCount' as const, label: 'Stockouts', unit: '', invertedSign: false },
      { key: 'deadStockPct' as const, label: 'Dead Stock %', unit: '%', invertedSign: true },
    ] as const
    ```
    invertedSign=true means: a DECREASE is good (green), increase is bad (red).

    Helper: function formatDeltaSign(delta: number, invertedSign: boolean): { color: string; arrow: ReactNode; prefix: string }
    - effectivePositive = invertedSign ? delta < 0 : delta > 0
    - if effectivePositive: { color: 'text-green-600', arrow: <ArrowUp className="h-3 w-3" />, prefix: '+' }
    - if !effectivePositive && delta !== 0: { color: 'text-red-600', arrow: <ArrowDown className="h-3 w-3" />, prefix: '−' }
    - if delta === 0: { color: 'text-muted-foreground', arrow: <Minus className="h-3 w-3" />, prefix: '' }

    Layout:
    ```tsx
    <Card className="border-2 border-green-200" aria-live="polite">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />
          <CardTitle className="text-lg">Import successful</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          {result.filename} · {result.rowsInserted} rows imported · completed in {(result.durationMs / 1000).toFixed(1)}s
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI Delta Grid */}
        <div>
          {/* Column headers — hide Before column if any before=null */}
          {showBeforeCol && <div>Before / After / Change headers</div>}
          {/* KPI rows */}
          {KPI_DEFS.map(kpi => { const field = result.kpiDelta[kpi.key]; ... })}
        </div>
        {/* showBeforeCol logic: const showBeforeCol = Object.values(result.kpiDelta).some(f => f.before !== null) */}

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button onClick={() => { queryClient.invalidateQueries({ queryKey: ['kpi', 'summary'] }); navigate('/') }}>
            Go to Dashboard
          </Button>
          <Button variant="outline" onClick={onReset}>Upload another file</Button>
        </div>
      </CardContent>
    </Card>
    ```

    "Go to Dashboard" uses useNavigate() from react-router-dom.
    Import queryClient from '@/lib/queryClient' (NOT from React Query hook — direct import of singleton).

    Each KPI row (desktop: table-like grid cols-3 or cols-4 depending on showBeforeCol; mobile: stack):
    ```
    | Total Inventory Value | €0 (before, or "—" if null+no showBeforeCol) | €125,000 (after) | +€125,000 ↑ (green) |
    ```
    Formatting: Just Number.toFixed(0) for large numbers + unit suffix. No Intl (Phase 6 handles locale).
    For the delta cell: <span className={cn('flex items-center gap-1', deltaSign.color)}>{deltaSign.prefix}{formatValue(field.delta, kpi.unit)}{deltaSign.arrow}</span>

    Imports needed: Card, CardHeader, CardTitle, CardContent from '@/components/ui/card'; Button from '@/components/ui/button'; CheckCircle2, ArrowUp, ArrowDown, Minus from 'lucide-react'; useNavigate from 'react-router-dom'; queryClient from '@/lib/queryClient'; UploadSuccessResponse from '@acm-kpi/core'; cn from '@/lib/utils'

    Convert SuccessSummary.test.tsx vi.todo() stubs to real tests:
    - 'UP-05 success card renders Import successful heading'
      const result: UploadSuccessResponse = { status:'success', filename:'test.csv', rowsInserted:100, durationMs:1500, kpiDelta:{ totalInventoryValue:{before:0,after:125000,delta:125000}, daysOnHand:{before:30,after:45,delta:15}, stockoutsCount:{before:5,after:3,delta:-2}, deadStockPct:{before:10,after:8,delta:-2} } }
      render(<SuccessSummary result={result} onReset={vi.fn()} />)
      expect(screen.getByText('Import successful')).toBeInTheDocument()
      expect(screen.getByText(/100 rows imported/)).toBeInTheDocument()
    - 'UP-05 null-before branch: hides Before column header when all before=null'
      const result = { ...base, kpiDelta:{ totalInventoryValue:{before:null,after:125000,delta:125000}, daysOnHand:{before:null,after:45,delta:45}, stockoutsCount:{before:null,after:3,delta:3}, deadStockPct:{before:null,after:8,delta:8} } }
      render(<SuccessSummary result={result} onReset={vi.fn()} />)
      expect(screen.queryByText('Before')).toBeNull()
    - 'UP-05 delta positive renders green ArrowUp'
      render(<SuccessSummary result={positiveResult} onReset={vi.fn()} />)
      const deltaCell = screen.getAllByRole('cell')[/* delta column */]  // or just text match
      expect(screen.getByTitle('arrow-up') OR screen.getByLabelText('increase')).toBeInTheDocument()
    - 'UP-05 dead stock inverted: negative delta renders green (decrease is good)'
      // Ensure deadStockPct delta=-2 renders with text-green-600 class
  </behavior>
  <action>
    Create SuccessSummary.tsx with the full implementation as described. Update SuccessSummary.test.tsx with real assertions. Do NOT modify UploadPage.tsx yet — that is done in Task 3 alongside ErrorSummary wiring.

    Critical: The React Query invalidation must use queryKey: ['kpi', 'summary'] (exact two-element array). The queryClient imported directly (not useQueryClient hook) since "Go to Dashboard" navigates away immediately after.

    Dead-stock % inversion: deadStockPct delta of -2 means "dead stock decreased" → good → green + down arrow (because decrease is good) — this requires the invertedSign=true logic. Verify with test.
  </action>
  <verify>
    <automated>
      npm -w apps/frontend run test -- SuccessSummary.test.tsx 2>&1 | tail -15
    </automated>
  </verify>
  <done>
    - SuccessSummary.tsx created, exports SuccessSummary component
    - All 4 SuccessSummary tests pass: heading, null-before, positive delta, inverted dead-stock
    - grep "invalidateQueries.*kpi.*summary" apps/frontend/src/features/upload/components/SuccessSummary.tsx exits 0
    - 04-VALIDATION.md UP-05 test command passes
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: ErrorSummary component + tests + UploadPage wiring</name>
  <files>
    apps/frontend/src/features/upload/components/ErrorSummary.tsx
    apps/frontend/src/features/upload/__tests__/ErrorSummary.test.tsx
    apps/frontend/src/features/upload/components/UploadPage.tsx
  </files>
  <read_first>
    - apps/frontend/src/features/upload/__tests__/ErrorSummary.test.tsx (may be vi.todo() stub)
    - .planning/phases/04-upload-page/04-CONTEXT.md D-04 (error summary spec)
    - .planning/phases/04-upload-page/04-UI-SPEC.md §"Error Summary Card"
    - .planning/phases/04-upload-page/04-VALIDATION.md row for UP-06
    - apps/frontend/src/features/upload/components/UploadPage.tsx (current state — replace success/error placeholders)
    - apps/frontend/src/features/upload/hooks/useUpload.ts (reset() signature)
  </read_first>
  <behavior>
    Create apps/frontend/src/features/upload/components/ErrorSummary.tsx:

    Props: { result: UploadErrorResponse; onReset: () => void }

    Grouped error computation (run in component or useMemo):
    ```typescript
    type FieldGroup = { field: string; count: number }
    const fieldGroups: FieldGroup[] = Object.entries(
      result.errors.reduce((acc, e) => { acc[e.field] = (acc[e.field] ?? 0) + 1; return acc }, {} as Record<string, number>)
    )
      .map(([field, count]) => ({ field, count }))
      .sort((a, b) => b.count - a.count)  // descending by count per D-04
    const errorCount = result.errors.length
    const fieldCount = fieldGroups.length
    ```

    Copy function:
    ```typescript
    const handleCopyErrors = async () => {
      const header = 'Row\tField\tValue\tReason'
      const rows = result.errors.map(e => `${e.row}\t${e.field}\t${String(e.value ?? '')}\t${e.reason}`)
      await navigator.clipboard.writeText([header, ...rows].join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
    ```
    useState<boolean> for copied state (button label: "Copied!" for 2 seconds, then back to "Copy all errors").

    Layout:
    ```tsx
    <Card className="border-2 border-red-200" aria-live="assertive">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
          <CardTitle className="text-lg">Import failed</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          {errorCount} errors across {fieldCount} fields:
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Grouped field summary (bulleted list) */}
        <ul className="space-y-1 text-sm">
          {fieldGroups.map(g => (
            <li key={g.field} className="flex items-center gap-1">
              <span aria-hidden="true">•</span>
              <span className="font-medium">{g.field}</span>
              <span className="text-muted-foreground">— {g.count} rows</span>
            </li>
          ))}
        </ul>

        {/* Detail table (scrollable) */}
        <div>
          <h3 className="mb-2 text-sm font-semibold">Error Details</h3>
          <div className="max-h-96 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Row</TableHead>
                  <TableHead scope="col">Field</TableHead>
                  <TableHead scope="col">Value</TableHead>
                  <TableHead scope="col">Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.errors.map((e, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{e.row}</TableCell>
                    <TableCell>{e.field}</TableCell>
                    <TableCell className="max-w-[120px] truncate">{String(e.value ?? '')}</TableCell>
                    <TableCell>{e.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Action row */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => void handleCopyErrors()}>
            {copied ? 'Copied!' : 'Copy all errors'}
          </Button>
          <Button variant="outline" onClick={onReset}>Try another file</Button>
        </div>
      </CardContent>
    </Card>
    ```

    Imports: Card, CardHeader, CardTitle, CardContent; Button; Table, TableHeader, TableBody, TableRow, TableHead, TableCell; AlertCircle from 'lucide-react'; UploadErrorResponse from '@acm-kpi/core'

    Convert ErrorSummary.test.tsx vi.todo() stubs:
    - 'UP-06 grouped list: errors grouped by field sorted by count descending'
      const result: UploadErrorResponse = { status:'failed', filename:'bad.csv', rowsInserted:0, durationMs:200, errors:[
        {row:1,field:'Wert mit Abw.',value:'abc',reason:'not numeric'},
        {row:2,field:'Wert mit Abw.',value:'xyz',reason:'not numeric'},
        {row:3,field:'letzt.Zugang',value:'13.13.2025',reason:'invalid date'},
      ]}
      render(<ErrorSummary result={result} onReset={vi.fn()} />)
      const listItems = screen.getAllByRole('listitem')
      expect(listItems[0]).toHaveTextContent('Wert mit Abw.')  // 2 errors first
      expect(listItems[1]).toHaveTextContent('letzt.Zugang')   // 1 error second
    - 'UP-06 detail table: renders all error rows in table'
      // Same result above
      expect(screen.getAllByRole('row')).toHaveLength(4)  // 1 header + 3 data rows
    - 'UP-06 detail table: has th scope=col headers'
      const headers = screen.getAllByRole('columnheader')
      expect(headers[0]).toHaveTextContent('Row')
      expect(headers[1]).toHaveTextContent('Field')

    Update apps/frontend/src/features/upload/components/UploadPage.tsx:
    - Import SuccessSummary and ErrorSummary
    - Replace data-testid="success-placeholder" div with: <SuccessSummary result={result as UploadSuccessResponse} onReset={reset} />
    - Replace data-testid="error-placeholder" div with: <ErrorSummary result={result as UploadErrorResponse} onReset={reset} /> — also show ErrorSummary when error (network/403/409) without a result object: render an inline error card or pass a synthetic UploadErrorResponse
    - For network/auth errors without result: render a simple error Card: <Card className="border-red-200"><CardContent>{error}</CardContent></Card> inline in UploadPage (not via ErrorSummary which needs result)
  </behavior>
  <action>
    Create ErrorSummary.tsx with full implementation. Update ErrorSummary.test.tsx with real assertions. Then update UploadPage.tsx to replace both placeholder divs.

    Table component notes: 'table', 'columnheader', 'row', 'cell' ARIA roles come automatically from semantic <table>/<th>/<tr>/<td> elements. The shadcn Table components render these correctly. Use scope="col" on <TableHead> — shadcn TableHead renders <th> so pass as HTML attribute: <TableHead scope="col">.

    UploadPage error vs result handling:
    - When state==='success': result.status==='success' is guaranteed → cast to UploadSuccessResponse
    - When state==='error' and result exists: result.status==='failed' → cast to UploadErrorResponse → pass to ErrorSummary
    - When state==='error' and result is null (network failure, 403, 409): render inline error card with error string from useUpload
  </action>
  <verify>
    <automated>
      npm -w apps/frontend run test -- features/upload/ 2>&1 | tail -20
    </automated>
  </verify>
  <done>
    - ErrorSummary.tsx created with grouped error list, detail table (th scope=col), Copy all errors button
    - SuccessSummary.tsx and ErrorSummary.tsx both imported in UploadPage.tsx (grep exits 0)
    - UploadPage.tsx has no remaining "placeholder" references (grep "placeholder" returns nothing)
    - ErrorSummary tests green: grouped-list-sorted-desc, detail-table-rows, columnheader-scope
    - Full upload feature test suite passes: npm -w apps/frontend run test -- features/upload/
    - 04-VALIDATION.md UP-05 + UP-06 test commands both pass
  </done>
</task>

</tasks>

<verification>
After both tasks complete:

1. Full upload feature tests:
   `npm -w apps/frontend run test -- features/upload/`
   All tests green including SuccessSummary and ErrorSummary.

2. React Query invalidation:
   `grep "invalidateQueries.*kpi.*summary" apps/frontend/src/features/upload/components/SuccessSummary.tsx`
   Must match.

3. No placeholder divs remaining:
   `grep "placeholder" apps/frontend/src/features/upload/components/UploadPage.tsx`
   Must return empty.

4. Table accessibility:
   `grep "scope.*col" apps/frontend/src/features/upload/components/ErrorSummary.tsx`
   Must match (th scope=col on all column headers).

5. Frontend type check:
   `npm -w apps/frontend run typecheck 2>&1 | grep error | head -5`
   Zero new errors.
</verification>

<success_criteria>
- SuccessSummary renders green card with KPI delta grid (Before/After/Change), handles null-before branch correctly
- Dead-stock % delta is inverted (decrease = green, increase = red) per CONTEXT.md accessibility rule
- "Go to Dashboard" invalidates ['kpi','summary'] query cache and navigates to /
- ErrorSummary renders red card with grouped field summary (sorted desc by count) and full detail table
- Detail table uses real <th scope="col"> headers per WCAG (a11y)
- "Copy all errors" copies TSV to clipboard; button shows "Copied!" confirmation for 2 seconds
- UploadPage renders SuccessSummary or ErrorSummary with no placeholder divs remaining
- All SuccessSummary and ErrorSummary tests pass per 04-VALIDATION.md UP-05/UP-06 commands
</success_criteria>

<output>
After completion, create `.planning/phases/04-upload-page/04-04-SUMMARY.md` following the summary template at @$HOME/.claude/get-shit-done/templates/summary.md
</output>
