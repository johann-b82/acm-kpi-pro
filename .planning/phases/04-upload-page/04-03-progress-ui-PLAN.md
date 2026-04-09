---
phase: 04-upload-page
plan: "03"
type: execute
wave: 2
depends_on:
  - "04-01"
  - "04-02"
files_modified:
  - apps/frontend/src/features/upload/components/ProgressView.tsx
  - apps/frontend/src/features/upload/components/UploadPage.tsx
  - apps/frontend/src/features/upload/__tests__/ProgressView.test.tsx
autonomous: true
requirements:
  - UP-04

must_haves:
  truths:
    - "Determinate phase: shadcn Progress bar advances 0→100 with aria-valuenow={percent} and role=progressbar"
    - "Indeterminate phase: Loader2 spinner with aria-busy=true is shown after xhr.upload.onload fires"
    - "Label below bar reads 'Uploading {filename}… {percent}%' during determinate phase"
    - "Label during indeterminate phase reads 'Parsing & validating… this usually takes a second'"
    - "Both phases respect prefers-reduced-motion: reduce (spinner does not animate)"
    - "UploadPage replaces placeholder div with ProgressView when state === 'uploading' | 'parsing'"
  artifacts:
    - path: "apps/frontend/src/features/upload/components/ProgressView.tsx"
      provides: "Two-stage progress: determinate bar + indeterminate spinner"
      exports: ["ProgressView"]
    - path: "apps/frontend/src/features/upload/__tests__/ProgressView.test.tsx"
      provides: "Vitest unit test for UP-04 two-stage state + a11y"
  key_links:
    - from: "apps/frontend/src/features/upload/components/UploadPage.tsx"
      to: "apps/frontend/src/features/upload/components/ProgressView.tsx"
      via: "{state === 'uploading' | 'parsing' && <ProgressView .../>}"
      pattern: "ProgressView"
---

<objective>
Install the shadcn progress primitive, build ProgressView with determinate (upload %) and indeterminate (parsing spinner) states including full a11y attributes, and wire it into UploadPage replacing the plan 02 placeholder.

Purpose: Satisfies UP-04 — user sees meaningful feedback during both upload transmission and server-side parsing.
Output: ProgressView component, passing ProgressView tests, UploadPage updated to render it.
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
</context>

<interfaces>
<!-- From plan 02 state machine — use these exact prop shapes -->

From apps/frontend/src/features/upload/hooks/useUpload.ts (plan 02):
```typescript
// useUpload() returns:
{ state: 'idle'|'uploading'|'parsing'|'success'|'error'; uploadPercent: number; result: UploadResponse|null; error: string|null; uploadFile(file:File):void; reset():void }
// 'uploading' = XHR body sending (progress events firing)
// 'parsing'   = XHR body sent (xhr.upload.onload fired), waiting for xhr.onload response
```

From apps/frontend/src/features/upload/components/UploadPage.tsx (plan 02):
```tsx
// Contains placeholder:
{(state === 'uploading' || state === 'parsing') && (
  <div data-testid="progress-placeholder">ProgressView placeholder — wired in plan 03</div>
)}
// Replace this div with <ProgressView state={state} percent={uploadPercent} filename={...} />
```

From shadcn progress (to be installed):
```tsx
// apps/frontend/src/components/ui/progress.tsx (after npx shadcn add progress)
import { Progress } from '@/components/ui/progress'
// <Progress value={percent} className="..." />  — renders Radix Progress.Root + Indicator
// value prop: 0-100 number
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Install shadcn progress + build ProgressView + tests</name>
  <files>
    apps/frontend/src/features/upload/components/ProgressView.tsx
    apps/frontend/src/features/upload/__tests__/ProgressView.test.tsx
    apps/frontend/src/features/upload/components/UploadPage.tsx
  </files>
  <read_first>
    - apps/frontend/src/features/upload/__tests__/ProgressView.test.tsx (if exists — otherwise create; may already be a vi.todo() stub from plan 02 Wave 0 — check first)
    - apps/frontend/src/features/upload/components/UploadPage.tsx (current state with placeholder div from plan 02)
    - apps/frontend/src/features/upload/hooks/useUpload.ts (state/uploadPercent values)
    - .planning/phases/04-upload-page/04-UI-SPEC.md §"Interaction & States" ProgressView section
    - .planning/phases/04-upload-page/04-VALIDATION.md row for UP-04
  </read_first>
  <behavior>
    Install shadcn progress (one-time):
    cd apps/frontend && npx shadcn add progress --yes
    This creates apps/frontend/src/components/ui/progress.tsx

    Create apps/frontend/src/features/upload/components/ProgressView.tsx:
    Props interface: { state: 'uploading' | 'parsing'; percent: number; filename: string }

    Determinate phase (state === 'uploading'):
    - Render shadcn Progress component with value={percent}
    - Apply className="h-1.5 w-full" (4px height per UI-SPEC)
    - Wrapper div: role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${filename}`}
    - Label below: <p className="mt-2 text-sm text-muted-foreground">Uploading {filename}… {percent}%</p>

    Indeterminate phase (state === 'parsing'):
    - Remove progress bar, show spinner:
      <div aria-busy="true" aria-label="Parsing and validating file" className="flex items-center gap-3">
        <Loader2 className={cn("h-5 w-5 animate-spin text-primary", reducedMotion && "animate-none")} aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Parsing & validating… this usually takes a second</p>
      </div>
    - reducedMotion: const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    Outer wrapper:
    <div className="space-y-2" aria-live="polite">
      {state === 'uploading' ? <determinateBlock /> : <indeterminateBlock />}
    </div>

    Imports: import { Progress } from '@/components/ui/progress'; import { Loader2 } from 'lucide-react'; import { cn } from '@/lib/utils'

    Update apps/frontend/src/features/upload/__tests__/ProgressView.test.tsx:
    Convert vi.todo() stubs to real tests:
    - 'UP-04 determinate: renders progress bar with role=progressbar and aria-valuenow=42 when state=uploading and percent=42'
      render(<ProgressView state="uploading" percent={42} filename="LagBes.csv" />)
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
    - 'UP-04 indeterminate: renders spinner with aria-busy=true when state=parsing'
      render(<ProgressView state="parsing" percent={100} filename="LagBes.csv" />)
      expect(screen.getByLabelText('Parsing and validating file')).toHaveAttribute('aria-busy', 'true')
    - 'a11y: progress bar is absent in parsing state'
      render(<ProgressView state="parsing" percent={100} filename="LagBes.csv" />)
      expect(screen.queryByRole('progressbar')).toBeNull()
    - 'a11y: aria-live=polite on wrapper'
      const { container } = render(<ProgressView state="uploading" percent={0} filename="f.csv" />)
      expect(container.firstChild).toHaveAttribute('aria-live', 'polite')

    Update apps/frontend/src/features/upload/components/UploadPage.tsx:
    - Add import: import { ProgressView } from './ProgressView.js'
    - Replace the data-testid="progress-placeholder" div with:
      <ProgressView state={state as 'uploading' | 'parsing'} percent={uploadPercent} filename={/* last uploaded filename from hook */} />
    - The filename must be tracked in useUpload hook (add lastFilename state or pass filename from UploadPage via useRef after onFileSelected). Simplest: store filename in UploadPage component state when onFileSelected is called, pass down to ProgressView.
  </behavior>
  <action>
    1. Run: cd apps/frontend && npx shadcn add progress --yes
    2. Create ProgressView.tsx as specified above.
    3. Update ProgressView.test.tsx with real assertions.
    4. Update UploadPage.tsx to import and render ProgressView (replacing placeholder div). Track filename in UploadPage local state:
       const [currentFilename, setCurrentFilename] = useState('');
       In DropZone onFileSelected handler: setCurrentFilename(file.name); uploadFile(file);
    5. Ensure ProgressView only renders when state === 'uploading' || state === 'parsing'.

    Key a11y requirements (from UI-SPEC and CONTEXT.md):
    - role="progressbar" + aria-valuenow ONLY on the Progress wrapper div, not on shadcn Progress itself (shadcn Progress uses Radix which may add its own role — check rendered HTML and avoid duplication by wrapping in a div with the role)
    - aria-busy="true" on the indeterminate spinner container
    - aria-live="polite" on the outer wrapper so screen readers announce transitions
    - prefers-reduced-motion: animate-none on Loader2 if reduced motion is preferred
  </action>
  <verify>
    <automated>
      npm -w apps/frontend run test -- features/upload/ProgressView.test.tsx 2>&1 | tail -15
    </automated>
  </verify>
  <done>
    - apps/frontend/src/components/ui/progress.tsx exists (shadcn install succeeded)
    - ProgressView.tsx exports ProgressView component with two-state logic
    - ProgressView.test.tsx passes: 4 tests green (determinate aria-valuenow, indeterminate aria-busy, no progressbar in parsing, aria-live=polite)
    - UploadPage.tsx references ProgressView (grep "ProgressView" exits 0), placeholder div removed
    - npm -w apps/frontend run test -- features/upload/ passes (all feature tests green)
    - 04-VALIDATION.md UP-04 test command passes: npm -w apps/frontend run test -- ProgressView.test.tsx
  </done>
</task>

</tasks>

<verification>
After task completes:

1. ProgressView tests:
   `npm -w apps/frontend run test -- features/upload/ProgressView.test.tsx`
   4 tests green.

2. Full upload feature test suite:
   `npm -w apps/frontend run test -- features/upload/`
   All tests passing (no regressions from UploadPage changes).

3. shadcn progress installed:
   `ls apps/frontend/src/components/ui/progress.tsx`
   File exists.

4. ProgressView a11y attributes:
   `grep -n "role.*progressbar\|aria-valuenow\|aria-busy\|aria-live" apps/frontend/src/features/upload/components/ProgressView.tsx`
   All four attributes present.
</verification>

<success_criteria>
- shadcn Progress primitive installed (progress.tsx)
- ProgressView renders determinate bar (role=progressbar, aria-valuenow) in 'uploading' state
- ProgressView renders indeterminate spinner (aria-busy=true) in 'parsing' state
- aria-live="polite" on wrapper for screen reader announcements
- Spinner does not animate if prefers-reduced-motion: reduce
- UploadPage wires ProgressView instead of placeholder div
- All ProgressView tests pass per 04-VALIDATION.md UP-04 command
</success_criteria>

<output>
After completion, create `.planning/phases/04-upload-page/04-03-SUMMARY.md` following the summary template at @$HOME/.claude/get-shit-done/templates/summary.md
</output>
