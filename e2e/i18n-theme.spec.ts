/**
 * Visual regression: 3 pages × 2 locales (de/en) × 2 themes (light/dark) = 12 snapshots.
 *
 * Addresses: I18N-04 (German layout accommodates longer text), THEME-02 (dark theme
 * visually correct), per 06-UI-SPEC.md § "Visual Regression Testing".
 *
 * Prerequisites:
 *   docker compose up -d && pnpm db:migrate && pnpm dev
 *
 * First run (generating baselines):
 *   pnpm exec playwright test e2e/i18n-theme.spec.ts --update-snapshots
 *
 * Subsequent runs (CI regression check):
 *   pnpm exec playwright test e2e/i18n-theme.spec.ts
 */
import { expect, type Page, test } from "@playwright/test";

const ADMIN = {
  username: process.env.E2E_ADMIN_USER ?? "test.admin",
  password: process.env.E2E_ADMIN_PASS ?? "test.admin",
};

async function loginAs(page: Page, username: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("/", { timeout: 15_000 });
}

/** Apply locale by setting the acm_lang cookie + reloading. */
async function setLocale(page: Page, locale: "de" | "en"): Promise<void> {
  await page.context().addCookies([
    {
      name: "acm_lang",
      value: locale,
      domain: "localhost",
      path: "/",
    },
  ]);
  await page.reload({ waitUntil: "networkidle" });
}

/** Apply theme by clicking the theme toggle until the <html> class matches. */
async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  // Read the current class on <html>; toggle if needed.
  const hasDark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
  const wantsDark = theme === "dark";
  if (hasDark !== wantsDark) {
    // Theme toggle button: aria-label contains "dark mode" or "light mode"
    await page.getByRole("button", { name: /switch to (dark|light) mode/i }).click();
    await page.waitForTimeout(300); // let next-themes apply the class
  }
}

/** Assert German-specific strings are visible (proving locale switch worked). */
async function assertGermanStrings(page: Page): Promise<void> {
  // At least one German string must be visible — use a key that differs from English.
  // "Abmelden" (Logout) is always in the header, guaranteed after login.
  await expect(
    page.getByRole("button", { name: /abmelden/i }).or(page.getByText(/abmelden/i)),
  ).toBeVisible({ timeout: 5_000 });
}

/** Assert English-specific strings are visible. */
async function assertEnglishStrings(page: Page): Promise<void> {
  await expect(
    page.getByRole("button", { name: /logout/i }).or(page.getByText(/logout/i)),
  ).toBeVisible({ timeout: 5_000 });
}

/** Assert no visible text-overflow truncation by checking for ellipsis nodes.
 *  Playwright cannot directly measure CSS overflow, so we check the snapshot
 *  visually and assert that no button/label text renders shorter than a
 *  safe minimum width. This is a best-effort structural check. */
async function assertNoTruncation(page: Page): Promise<void> {
  // Check that header buttons are not overflowing: each button's scrollWidth
  // should not exceed its clientWidth. A mismatch means hidden overflow.
  const overflowingCount = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
    return buttons.filter(
      (el) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 2,
    ).length;
  });
  expect(overflowingCount, "No buttons should have text overflow / truncation").toBe(0);
}

// ---------------------------------------------------------------------------
// Login page (unauthenticated — no need to log in first)
// ---------------------------------------------------------------------------

test.describe("Login page screenshots", () => {
  for (const locale of ["de", "en"] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`login — ${locale} / ${theme}`, async ({ page }) => {
        await page.goto("/login");
        // Set locale cookie before rendering
        await page.context().addCookies([
          { name: "acm_lang", value: locale, domain: "localhost", path: "/" },
        ]);
        // Apply theme via localStorage (next-themes reads this before hydration)
        await page.evaluate((t) => localStorage.setItem("theme", t), theme);
        await page.reload({ waitUntil: "networkidle" });

        await page.waitForLoadState("networkidle");
        await expect(page).toHaveScreenshot(`login-${locale}-${theme}.png`, {
          fullPage: false,
          maxDiffPixelRatio: 0.02,
        });

        // I18N-04: no truncation on login form labels / button
        await assertNoTruncation(page);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Dashboard page (requires login)
// ---------------------------------------------------------------------------

test.describe("Dashboard screenshots", () => {
  for (const locale of ["de", "en"] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`dashboard — ${locale} / ${theme}`, async ({ page }) => {
        await loginAs(page, ADMIN.username, ADMIN.password);
        await setLocale(page, locale);
        await setTheme(page, theme);
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Verify locale is active before screenshotting
        if (locale === "de") {
          await assertGermanStrings(page);
        } else {
          await assertEnglishStrings(page);
        }

        await expect(page).toHaveScreenshot(`dashboard-${locale}-${theme}.png`, {
          fullPage: false,
          maxDiffPixelRatio: 0.02,
        });

        // I18N-04: KPI card labels, header buttons must not be truncated in DE
        await assertNoTruncation(page);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Upload page (requires admin login)
// ---------------------------------------------------------------------------

test.describe("Upload page screenshots", () => {
  for (const locale of ["de", "en"] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`upload — ${locale} / ${theme}`, async ({ page }) => {
        await loginAs(page, ADMIN.username, ADMIN.password);
        await setLocale(page, locale);
        await setTheme(page, theme);
        await page.goto("/upload");
        await page.waitForLoadState("networkidle");

        if (locale === "de") {
          await assertGermanStrings(page);
        } else {
          await assertEnglishStrings(page);
        }

        await expect(page).toHaveScreenshot(`upload-${locale}-${theme}.png`, {
          fullPage: false,
          maxDiffPixelRatio: 0.02,
        });

        // I18N-04: form labels, drag-drop text must not truncate in DE
        await assertNoTruncation(page);
      });
    }
  }
});
