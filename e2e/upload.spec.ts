import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

// ESM: __dirname is not defined at runtime; derive from import.meta.url.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * TEST-03: End-to-end upload flow (Phase 04 Plan 05).
 *
 * Covers the full vertical slice:
 *   RBAC → multipart upload → ingest pipeline → KPI delta →
 *   React Query cache invalidation → dashboard navigation.
 *
 * Runs against a live dev stack (`npm run dev` or `docker compose up`).
 * The stack must be reachable at http://localhost:5173 (Vite dev server
 * which proxies /api/v1 to the Fastify API on :3001).
 *
 * Seeded credentials come from apps/api/src/db/seed.ts:
 *   - Admin : test.admin
 *   - Viewer: test.viewer
 *
 * Passwords are LDAP-bound in production but the dev stack stubs them;
 * the E2E_*_PASS env vars let CI override without touching the file.
 */

const REPO_ROOT = path.resolve(__dirname, "..");
const SAMPLE_FILE = path.resolve(REPO_ROOT, "samples/LagBes-sample.csv");

const ADMIN = {
  username: process.env.E2E_ADMIN_USER ?? "test.admin",
  password: process.env.E2E_ADMIN_PASS ?? "test.admin",
};

const VIEWER = {
  username: process.env.E2E_VIEWER_USER ?? "test.viewer",
  password: process.env.E2E_VIEWER_PASS ?? "test.viewer",
};

async function loginAs(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // LoginPage navigates to "/" on success.
  await page.waitForURL("/", { timeout: 15_000 });
}

test.describe("Upload page — Admin flow", () => {
  test("TEST-03: admin login → upload → progress → success → dashboard refresh", async ({
    page,
  }) => {
    // 1. Login as admin.
    await loginAs(page, ADMIN.username, ADMIN.password);

    // 2. Navigate to /upload.
    await page.goto("/upload");

    // 3. Drop zone is visible (Admin sees DropZone, not AdminAccessDenied).
    await expect(
      page.getByText("Drop your LagBes CSV or TXT file here"),
    ).toBeVisible();
    await expect(page.getByText("Admin access required")).not.toBeVisible();

    // 4. Upload the sample file via the hidden file input (setInputFiles
    //    bypasses drag-drop entirely — see 04-VALIDATION.md).
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(SAMPLE_FILE);

    // 5. Determinate upload phase: progress bar visible with role=progressbar.
    await expect(page.getByRole("progressbar")).toBeVisible({
      timeout: 5_000,
    });

    // 6. Indeterminate parsing phase: text appears once body is in flight.
    //    On very fast local ingests this may flash by; waitFor handles either
    //    the visible-then-gone race or the steady-state case.
    await expect(page.getByText(/Parsing & validating…/)).toBeVisible({
      timeout: 30_000,
    });

    // 7. Success card appears. Ingest of the 900-row sample is well under 30s
    //    on the dev stack; 60s upper bound leaves headroom for cold caches.
    await expect(page.getByText("Import successful")).toBeVisible({
      timeout: 60_000,
    });

    // 8. Row count + at least one KPI label rendered in the delta grid.
    await expect(page.getByText(/rows imported/)).toBeVisible();
    await expect(page.getByText("Total Inventory Value")).toBeVisible();

    // 9. Click "Go to Dashboard" — invalidates ['kpi','summary'] and navigates.
    await page.getByRole("button", { name: "Go to Dashboard" }).click();

    // 10. Dashboard is reachable and branded header is present. The dashboard
    //     KPI cards don't expose a stable data-testid in Phase 3, so we verify
    //     on the branding marker + URL change rather than a specific card.
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(page.getByText("ACM KPI Pro")).toBeVisible();
    expect(page.url()).not.toContain("/upload");
  });
});

test.describe("Upload page — Viewer negative flow", () => {
  test("TEST-03 negative: viewer sees Admin access required, no drop zone", async ({
    page,
  }) => {
    await loginAs(page, VIEWER.username, VIEWER.password);

    await page.goto("/upload");

    // Viewer branch: AdminAccessDenied card rendered.
    await expect(page.getByText("Admin access required")).toBeVisible();

    // DropZone must NOT be present anywhere in the DOM.
    await expect(
      page.getByText("Drop your LagBes CSV or TXT file here"),
    ).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });
});
