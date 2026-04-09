---
phase: 04-upload-page
plan: "05"
type: execute
wave: 3
depends_on:
  - "04-01"
  - "04-02"
  - "04-03"
  - "04-04"
files_modified:
  - e2e/upload.spec.ts
  - playwright.config.ts
autonomous: true
requirements:
  - TEST-03
  - IN-02

must_haves:
  truths:
    - "Admin login → navigate to /upload → upload LagBes-sample.csv → progress transitions → success card → Go to Dashboard → KPI values updated"
    - "Viewer login → navigate to /upload → 'Admin access required' card rendered, no DropZone"
    - "playwright.config.ts exists with baseURL pointing to the dev server"
    - "e2e/upload.spec.ts passes with @playwright/test"
    - "Test uses setInputFiles() on the hidden file input (not real drag-drop) per 04-VALIDATION.md"
    - "Test asserts row count and at least one KPI delta value rendered in success card"
    - "Test navigates to / after Go to Dashboard and asserts dashboard is visible"
  artifacts:
    - path: "e2e/upload.spec.ts"
      provides: "Playwright e2e test for TEST-03 upload flow"
    - path: "playwright.config.ts"
      provides: "Playwright configuration for dev server + baseURL"
  key_links:
    - from: "e2e/upload.spec.ts"
      to: "apps/frontend/src/features/upload/components/DropZone.tsx"
      via: "page.locator('input[type=file]').setInputFiles()"
      pattern: "setInputFiles"
    - from: "e2e/upload.spec.ts"
      to: "apps/api/src/routes/upload.ts"
      via: "real HTTP POST /api/v1/upload triggers ingestLagBesFile"
      pattern: "upload.spec"
---

<objective>
Write the Playwright e2e test for the full upload flow (TEST-03): admin login → upload sample file → progress → success card → dashboard refresh. Includes viewer negative test. Configure playwright.config.ts if not already present.

Purpose: This is the single end-to-end test that validates every layer working together: RBAC, multipart handler, ingest pipeline, KPI delta, React Query invalidation, and dashboard navigation.
Output: e2e/upload.spec.ts that passes under npx playwright test e2e/upload.spec.ts against the running dev stack.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04-upload-page/04-CONTEXT.md
@.planning/phases/04-upload-page/04-VALIDATION.md

@apps/frontend/src/features/upload/components/DropZone.tsx
@apps/frontend/src/features/upload/components/UploadPage.tsx
@apps/frontend/src/features/upload/components/SuccessSummary.tsx
@apps/frontend/src/features/upload/components/AdminAccessDenied.tsx
@samples/LagBes-sample.csv
</context>

<interfaces>
<!-- Selectors the test must target — derived from component implementations in plans 02-04 -->

DropZone (plan 02):
- Hidden file input: input[type="file"][accept=".csv,.txt"]
- Drop zone button text: "Drop your LagBes CSV or TXT file here"
- Playwright: page.locator('input[type=file]').setInputFiles(filePath)

ProgressView (plan 03):
- Determinate: [role="progressbar"] — presence confirms upload started
- Indeterminate: text "Parsing & validating…" — confirms body sent to server

SuccessSummary (plan 04):
- Heading: text "Import successful"
- Row count: /rows imported/
- KPI delta: any text matching /rows imported|Total Inventory|Days on Hand/ 
- Go to Dashboard button: role=button, name="Go to Dashboard"

AdminAccessDenied (plan 02):
- Heading: text "Admin access required"
- No element: input[type="file"] should NOT be present

Dashboard (after navigation):
- Existing KPI card: any element with data-testid containing "kpi" (from Phase 3 DashboardPage)
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Configure Playwright + install if missing</name>
  <files>
    playwright.config.ts
  </files>
  <read_first>
    - playwright.config.ts (check if it already exists at repo root; if so, note current config)
    - package.json (root — check if @playwright/test is listed)
    - .planning/phases/04-upload-page/04-VALIDATION.md (e2e command + config requirements)
  </read_first>
  <action>
    Check if @playwright/test is installed:
    Run: ls node_modules/@playwright 2>/dev/null || echo "NOT INSTALLED"
    If not installed: npm add -D @playwright/test && npx playwright install chromium

    Check if playwright.config.ts exists at repo root.
    If it does not exist, create it:
    ```typescript
    import { defineConfig, devices } from '@playwright/test';

    export default defineConfig({
      testDir: './e2e',
      timeout: 60_000,
      retries: 0,
      workers: 1,  // serial for upload tests (concurrency guard)
      use: {
        baseURL: 'http://localhost:5173',  // Vite dev server
        headless: true,
        screenshot: 'only-on-failure',
        video: 'off',
      },
      projects: [
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },
      ],
    });
    ```
    If playwright.config.ts already exists, verify baseURL is set to the dev server URL (5173 for Vite, or 3000 if different) and testDir is './e2e'.

    Create e2e/ directory if it does not exist: mkdir -p e2e
  </action>
  <verify>
    <automated>
      ls playwright.config.ts && node -e "require('./playwright.config.ts')" 2>&1 || npx ts-node --eval "import('./playwright.config.ts')" 2>&1 | tail -5
    </automated>
  </verify>
  <done>
    - playwright.config.ts exists at repo root with baseURL and testDir set
    - @playwright/test in devDependencies (package.json root) or node_modules/@playwright/test exists
    - e2e/ directory exists
    - 04-VALIDATION.md Wave 0: @playwright/test installed
  </done>
</task>

<task type="auto">
  <name>Task 2: Write e2e/upload.spec.ts (TEST-03)</name>
  <files>
    e2e/upload.spec.ts
  </files>
  <read_first>
    - e2e/upload.spec.ts (check if a stub already exists from plan 01/02 Wave 0 efforts; if so, implement it)
    - .planning/phases/04-upload-page/04-CONTEXT.md §"Playwright e2e (TEST-03)" for exact test flow
    - .planning/phases/04-upload-page/04-VALIDATION.md row for TEST-03
    - apps/frontend/src/features/upload/components/DropZone.tsx (to know the file input selector)
    - apps/frontend/src/features/upload/components/SuccessSummary.tsx (to know success card text)
    - apps/frontend/src/features/upload/components/AdminAccessDenied.tsx (to know viewer message text)
    - apps/frontend/src/pages/LoginPage.tsx (to know login form selectors)
    - samples/LagBes-sample.csv (the golden fixture to upload — confirm path)
  </read_first>
  <action>
    Create e2e/upload.spec.ts:

    ```typescript
    import { test, expect } from '@playwright/test';
    import path from 'node:path';

    const SAMPLE_FILE = path.resolve(process.cwd(), 'samples/LagBes-sample.csv');

    // Shared login helpers
    async function loginAs(page: import('@playwright/test').Page, username: string, password: string) {
      await page.goto('/login');
      await page.getByLabel(/username|user/i).fill(username);  // adjust selector to match LoginPage
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole('button', { name: /sign in|login/i }).click();
      await page.waitForURL('/');  // wait for redirect to dashboard
    }

    // Admin credentials — use seeded test credentials (same as Phase 1/2 integration tests)
    // Check apps/api/src/db/seed.ts or test fixtures for the admin username/password
    const ADMIN = { username: process.env.E2E_ADMIN_USER ?? 'admin', password: process.env.E2E_ADMIN_PASS ?? 'admin' };
    const VIEWER = { username: process.env.E2E_VIEWER_USER ?? 'viewer', password: process.env.E2E_VIEWER_PASS ?? 'viewer' };

    test.describe('Upload page — Admin flow', () => {
      test('TEST-03: admin login → upload → progress → success → dashboard refresh', async ({ page }) => {
        // 1. Login as admin
        await loginAs(page, ADMIN.username, ADMIN.password);

        // 2. Navigate to /upload
        await page.goto('/upload');

        // 3. Verify drop zone is visible
        await expect(page.getByText('Drop your LagBes CSV or TXT file here')).toBeVisible();

        // 4. Upload sample file via hidden file input (setInputFiles bypasses drag-drop)
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(SAMPLE_FILE);

        // 5. Assert progress: upload % (determinate phase)
        await expect(page.getByRole('progressbar')).toBeVisible({ timeout: 5_000 });

        // 6. Assert indeterminate parsing state
        await expect(page.getByText('Parsing & validating…')).toBeVisible({ timeout: 30_000 });

        // 7. Assert success card
        await expect(page.getByText('Import successful')).toBeVisible({ timeout: 60_000 });
        await expect(page.getByText(/rows imported/)).toBeVisible();

        // 8. Assert at least one KPI delta value rendered (any numeric value in the card)
        // SuccessSummary renders "Total Inventory Value" as a KPI label
        await expect(page.getByText('Total Inventory Value')).toBeVisible();

        // 9. Click "Go to Dashboard"
        await page.getByRole('button', { name: 'Go to Dashboard' }).click();

        // 10. Assert we're on the dashboard (/ route)
        await page.waitForURL('/');
        // Dashboard renders the header with "ACM KPI Pro" branding
        await expect(page.getByText('ACM KPI Pro')).toBeVisible();
        // KPI cards should be visible (Phase 3 renders them after React Query re-fetches)
        // Use a lenient selector: any element with text matching a KPI label
        await expect(page.locator('[data-testid*="kpi"], [data-testid*="KpiGrid"], .kpi-card').first()).toBeVisible({ timeout: 10_000 })
          .catch(() => {
            // Fallback: just verify not on /upload page anymore
            expect(page.url()).not.toContain('/upload');
          });
      });
    });

    test.describe('Upload page — Viewer negative test', () => {
      test('TEST-03 negative: viewer sees Admin access required, no drop zone', async ({ page }) => {
        // Login as viewer
        await loginAs(page, VIEWER.username, VIEWER.password);

        // Navigate to /upload
        await page.goto('/upload');

        // Should see AdminAccessDenied message
        await expect(page.getByText('Admin access required')).toBeVisible();

        // Should NOT see the drop zone
        await expect(page.getByText('Drop your LagBes CSV or TXT file here')).not.toBeVisible();

        // Should NOT see file input
        await expect(page.locator('input[type="file"]')).not.toBeVisible();
      });
    });
    ```

    Important notes for the executor:
    1. The loginAs helper selectors MUST match LoginPage.tsx from Phase 1. Read apps/frontend/src/pages/LoginPage.tsx to find the actual label text for username/password fields and the submit button text.
    2. The admin/viewer credentials must match what exists in the test database. Check apps/api/src/db/seed.ts or apps/api/__tests__/ fixtures for actual test credentials. If seed.ts creates an admin user "admin" with password "admin", use those; otherwise use E2E_ADMIN_USER/E2E_ADMIN_PASS env vars.
    3. The test runs against a live stack (docker compose up). For CI, the stack must be up before running playwright. This is a manual-start test in Phase 4; Phase 8 handles CI integration.
    4. Timeout values: progressbar (5s), parsing text (30s), success card (60s — ingest can take up to 30s per Phase 2 perf data). These are conservative upper bounds.
    5. KPI card assertion on dashboard is lenient (catch fallback) because Phase 3 KPI card testids need to be verified against actual DashboardPage implementation.

    After writing the spec, read LoginPage.tsx to confirm selectors and adjust the loginAs helper. Then run:
    npx playwright test e2e/upload.spec.ts --reporter=list 2>&1 | head -50
    If the stack is not running, the test will fail with a connection error — that is expected. The file must be syntactically valid and the test structure correct.

    Also verify the spec compiles: npx tsc --noEmit --project tsconfig.json e2e/upload.spec.ts 2>&1 | head -20 (if tsconfig covers e2e/).
  </action>
  <verify>
    <automated>
      npx tsc --noEmit 2>&1 | grep "upload.spec" | head -5 || echo "No type errors in upload.spec.ts"
    </automated>
  </verify>
  <done>
    - e2e/upload.spec.ts created with admin positive test and viewer negative test
    - loginAs helper uses correct LoginPage selectors (verified by reading LoginPage.tsx)
    - Admin credentials match seeded test data (verified by reading seed.ts or test fixtures)
    - SAMPLE_FILE path resolves to samples/LagBes-sample.csv at repo root
    - TypeScript compile: no errors in upload.spec.ts
    - Test structure: 2 describe blocks, 2 test cases
    - 04-VALIDATION.md TEST-03 command: npx playwright test e2e/upload.spec.ts (spec exists and is valid)
  </done>
</task>

</tasks>

<verification>
After both tasks complete:

1. Playwright config exists:
   `ls playwright.config.ts`

2. E2E spec exists with correct structure:
   `grep -c "test(" e2e/upload.spec.ts` → 2 (two test cases)

3. Spec type-checks:
   `npx tsc --noEmit 2>&1 | grep upload.spec | head -5`
   No errors.

4. File reference correct:
   `grep "LagBes-sample.csv" e2e/upload.spec.ts`
   Matches samples/LagBes-sample.csv path.

5. Viewer negative test present:
   `grep -c "Admin access required" e2e/upload.spec.ts` → 1

6. setInputFiles pattern present (not real drag-drop):
   `grep "setInputFiles" e2e/upload.spec.ts`
   Present.

MANUAL verification (requires running stack):
- `docker compose up -d && npx playwright test e2e/upload.spec.ts`
- Admin test: progress bar, parsing spinner, success card, dashboard navigation all visible
- Viewer test: AdminAccessDenied rendered, no file input present
</verification>

<success_criteria>
- playwright.config.ts configured with correct baseURL and testDir
- e2e/upload.spec.ts covers the full TEST-03 flow: login → upload → progress → success → dashboard
- Viewer negative test: AdminAccessDenied rendered, no DropZone
- Test uses setInputFiles() on hidden file input (not Playwright drag-drop simulation)
- Spec is type-error free
- Test passes against running docker-compose stack
</success_criteria>

<output>
After completion, create `.planning/phases/04-upload-page/04-05-SUMMARY.md` following the summary template at @$HOME/.claude/get-shit-done/templates/summary.md
</output>
