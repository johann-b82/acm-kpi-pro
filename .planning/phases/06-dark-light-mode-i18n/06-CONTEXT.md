# Phase 6: Dark/Light Mode + i18n - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver dark/light theming and DE/EN internationalization across the existing ACM KPI Pro UI (dashboard, upload page, auth screens). Both preferences persist per user. Numbers, currencies, and dates render in locale-correct form. Charts (Recharts) render correctly in both themes. All user-facing strings are pulled from translation files with CI-enforced key parity.

**In scope for this phase:**
- Theme + language toggles in the app header
- Dark palette refinement (WCAG AA body / ≥7:1 KPI values in both themes)
- Per-user persistence in the `users` table (new `theme` + `locale` columns)
- i18n scaffold (`i18next` + `react-i18next`), `de.json` / `en.json`, typed keys
- Shared `useLocale()` formatting helpers covering every number/date surface from Phase 3+4
- Pre-login language cookie so the login screen honors last choice
- CI key-parity check fails build when `de.json` ≠ `en.json`
- Screenshot/visual regression tests in both languages × both themes

**Not in scope (deferred to other phases):**
- `/docs` route content itself (Phase 7 — consumes this i18n system but writes its own translation namespaces)
- Deployment/TLS hardening (Phase 8)
- Any new dashboard features (phase is pure theming + localization of existing UI)
- Adding a third language (French etc.) — v2
- User settings page beyond the two header toggles — v2

</domain>

<decisions>
## Implementation Decisions

### Persistence & defaults
- **D-01:** Theme and language are persisted on the `users` table. Add two columns via Drizzle migration: `theme text not null default 'system'` and `locale text not null default 'de'`. Values: `theme ∈ {light, dark, system}`, `locale ∈ {de, en}`.
- **D-02:** First-visit default (no stored preference, or `theme = 'system'`): honor `prefers-color-scheme` media query for theme; read `Accept-Language` header for locale — if browser indicates German, default to `de`, otherwise `en`. Users can always override via header toggles.
- **D-03:** Theme changes are stored as the literal user choice (`light` / `dark`), not resolved against system. Only `system` means "follow OS". This lets users opt back into system tracking later.
- **D-04:** Pre-login language: a separate lightweight cookie (`acm_lang`, plain, non-HTTPOnly, SameSite=Lax, 1-year expiry) stores the last chosen language so the login screen renders in the right language on return visits. On successful login, this cookie is synced from `users.locale` (server authoritative). Logout keeps the cookie.
- **D-05:** Persistence is write-through: toggle click → optimistic local state change → `PATCH /api/me/preferences` → on success do nothing extra, on failure revert + toast error. Do NOT block UI on the network round-trip.

### Header UX
- **D-06:** Theme toggle: single icon button in the existing header top-right row, using `lucide` `Sun` / `Moon` icons. Icon reflects the *current* theme (shows moon in light mode — "click to go dark"). Position: left of the Upload icon.
- **D-07:** Language toggle: two small text pills `DE | EN` immediately after the theme toggle. Current language is bold/filled, the other is muted. Click swaps instantly. No dropdown, no flag icons (flags ≠ languages, plus German executives find Union Jack → "English" jarring).
- **D-08:** Toggles must be keyboard accessible (Tab-focusable, Enter/Space activates), carry `aria-label` reflecting the *action* ("Switch to dark mode", "Switch to English"), and live within the existing `<header>` landmark.

### Dark palette & WCAG contrast
- **D-09:** Refine the existing `.dark` CSS variable stub in [apps/frontend/src/styles/index.css](apps/frontend/src/styles/index.css) rather than redesigning from scratch. Keep shadcn-style HSL tokens as the base; adjust values until every token pair hits the required contrast.
- **D-10:** KPI status colors (`ok` / `warn` / `critical`) get **dedicated, theme-specific tokens**: `--kpi-ok`, `--kpi-warn`, `--kpi-critical` defined separately in `:root` and `.dark`. Each must hit ≥7:1 against its card background in its own theme (THEME-03 for KPI values). Amber/warn is historically the hardest — expect to shift hue toward orange in dark mode.
- **D-11:** ACM brand blue (`--primary`) remains the identity color in both themes; only lightness shifts to preserve contrast against the theme's background. Brand blue at its dark-theme value must still hit ≥4.5:1 for body-sized text and ≥3:1 for large text.
- **D-12:** Color is **never** the only signal (inherited from Phase 3 P3). Every color-coded KPI card also shows a directional arrow or text label. This rule is re-verified for the dark palette since dark-mode colors are perceptually different.
- **D-13:** Every translation change must be accompanied by a contrast-check screenshot in both themes — CI check or manual in the verification step. Downstream planner decides the mechanism.

### Recharts theming
- **D-14:** Recharts components read theme colors via **CSS variable lookup at render**. Implementation: a `useThemeColors()` hook that reads `getComputedStyle(document.documentElement).getPropertyValue('--kpi-ok')` etc., wrapped in a `ThemeContext` that re-evaluates on theme toggle so charts re-render with new colors automatically.
- **D-15:** Do NOT duplicate colors in a JS object — CSS variables in [index.css](apps/frontend/src/styles/index.css) stay the single source of truth. Any chart that needs a color imports it through the hook, never as a hex literal.
- **D-16:** The KpiCard sparkline (from Phase 3) is the first consumer. Any future charts follow the same pattern.

### Locale formatting
- **D-17:** Create a shared formatting module at `apps/frontend/src/lib/format.ts` exporting `formatNumber()`, `formatCurrency()`, `formatDate()`, `formatDateTime()`, `formatPercent()` — each reads the current locale from `i18next` (via `useTranslation()` or direct `i18n.language`) and returns the `Intl.*`-formatted string.
- **D-18:** Every hardcoded number/date currently in Phase 3 (KPI cards, LastUpdatedBadge, dashboard table) and Phase 4 (upload progress, delta display) gets swept and replaced with the helper. This is part of the phase scope, not a follow-up.
- **D-19:** Number format targets (verification): German → `1.234.567,89 €` (thousands separator `.`, decimal `,`, currency suffix with NBSP). English → `1,234,567.89 €` (or browser default currency position). Date format targets: German → `31.12.2025`, English → `2025-12-31` (ISO) or browser default.
- **D-20:** Currency: Euro (`€`) in both locales — ACM is German, the money is always EUR. Do not infer currency from locale.

### i18n architecture (Claude's Discretion — with guardrails)
- **D-21:** Use `i18next` + `react-i18next` (called out in roadmap). Planner decides exact package versions and plugin set (backend, detector, etc.) during research.
- **D-22:** Translation files live at `apps/frontend/src/locales/{de,en}.json`. Planner decides whether to split by feature namespace (`common`, `dashboard`, `upload`, `auth`) or keep flat — recommended: **namespaced by feature** to keep files reviewable for native speakers.
- **D-23:** Typed translation keys: planner picks between (a) `i18next` built-in TypeScript augmentation via `resources` interface, (b) `typesafe-i18n`, (c) manual union type. Non-negotiable: missing-key usage must be a compile error in `pnpm -w typecheck`.
- **D-24:** CI parity check: a script (Node, lives in `scripts/` or a monorepo workspace) that loads both JSON files, flattens nested keys, and fails CI with a clean diff if sets diverge. Triggered in the existing `pnpm -w lint` or a new `pnpm -w check:i18n` step. TEST-04 is verified against this script.

### Visual regression (Claude's Discretion)
- **D-25:** Screenshot tests cover the four-cell matrix (DE/EN × light/dark) for at least: login page, dashboard main view with KPI cards, upload page. Planner picks the tool (Playwright `toHaveScreenshot` is the default candidate — already likely present or minimal to add).

### German layout verification
- **D-26:** I18N-04 "German layouts accommodate longer text" — German strings are reliably 25-40% longer than English. Every header button, KPI card label, form control, and error message gets manually reviewed (or snapshot-tested) against a DE locale render. Any truncation/wrap at `md:` and `lg:` breakpoints blocks phase exit.

### Claude's Discretion
- i18n namespace structure (flat vs feature-split) — recommend feature-split
- Typed-keys library choice — recommend i18next TS augmentation, zero new deps
- CI parity check implementation — small Node script over JSON, no parser library needed
- Visual regression tool — Playwright's built-in `toHaveScreenshot`
- Exact HSL values in the dark palette — tune until WCAG passes
- Whether `useThemeColors()` subscribes via `MutationObserver` on `<html class>` or via React context update — either works
- Toast library for the "save preference failed" fallback — use whatever is already in the project (shadcn toast if present)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level specs
- `.planning/PROJECT.md` — v1 scope, non-negotiable principles (minimal RBAC, LDAP-first, on-prem stack)
- `.planning/REQUIREMENTS.md` — I18N-01..05, THEME-01..04, DASH-09, DASH-10, TEST-04 acceptance criteria
- `.planning/ROADMAP.md` §"Phase 6: Dark/Light Mode + i18n" — scope and exit criteria

### Prior phase context (patterns to inherit)
- `.planning/phases/03-kpi-layer-dashboard/03-CONTEXT.md` — "English-first, Phase 6 localizes" rule, accessibility (color-never-sole-signal), WCAG AA requirement, Recharts usage in KpiCard
- `.planning/phases/04-upload-page/04-CONTEXT.md` — English-first strings to sweep, inline-Intl to replace with helper, existing shadcn primitive inventory
- `.planning/phases/05-smb-folder-watcher/05-CONTEXT.md` — no user-facing strings (watcher is background), but any error messages surfaced to the dashboard need i18n keys

### Existing code insights (must read before implementing)
- `apps/frontend/src/styles/index.css` — CSS variable stub for `:root` + `.dark`, body background/foreground wiring. Base for the dark palette refinement.
- `apps/frontend/tailwind.config.ts` — `darkMode: "class"` already set, ACM brand colors (`brand.50..950`) defined. Tailwind reads the class on `<html>`.
- `apps/frontend/src/components/Header.tsx` — target for new theme + language toggle icons. Existing icon-button pattern is the reference.
- `apps/api/src/db/schema.ts:19` — `users` table needs new `theme` + `locale` columns via Drizzle migration.
- Phase 3's KpiCard sparkline (Recharts) — first `useThemeColors()` consumer.

### Accessibility standard
- WCAG 2.1 AA contrast reference (AA body 4.5:1, AAA / KPI-value target 7:1). No external file — standard is web-public.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **CSS variable system** ([apps/frontend/src/styles/index.css](apps/frontend/src/styles/index.css)): shadcn-style HSL tokens for `--background`, `--foreground`, `--card`, `--border`, `--primary`, etc., with a `.dark` stub already present. Refine the dark values + add KPI status tokens.
- **Tailwind `darkMode: "class"`** ([apps/frontend/tailwind.config.ts](apps/frontend/tailwind.config.ts)): class-based toggle already configured. Adding `dark` class to `<html>` switches everything.
- **Header icon row** ([apps/frontend/src/components/Header.tsx](apps/frontend/src/components/Header.tsx)): existing lucide icon buttons (Upload, BookOpen, LogOut) establish the styling pattern. New toggles follow the same `inline-flex h-9 w-9` mold.
- **iron-session** (Phase 1): already gates login; can read/write the `acm_lang` cookie via the same session middleware or a plain cookie parser.
- **Drizzle migrations** (Phase 1+2): `apps/api/src/db/schema.ts` is the migration source of truth — add two columns, generate migration, apply.
- **React Query** (Phase 3/4): `PATCH /api/me/preferences` plus `/api/me` GET fit the existing data-fetching pattern.

### Established Patterns
- shadcn/ui primitives read `hsl(var(--*))` — theming is just swapping CSS variables.
- All user-facing strings currently inline English literals (Phase 3/4 explicit decision) → Phase 6 sweeps them all into `t('...')` calls.
- Monorepo: shared DTOs in `@acm-kpi/core` — the `UserPreferences` DTO (the PATCH body) belongs in `packages/core/src/user/`.
- Tests: Vitest + React Testing Library for unit/component, Playwright for e2e. Visual regression adds on to Playwright.

### Integration Points
- `<html>` element in [apps/frontend/index.html](apps/frontend/index.html) (or whatever root is): must apply `class="dark"` before React mounts to avoid flash. A small inline `<script>` in `index.html` reads the `acm_lang`+theme cookie and sets the class synchronously.
- `main.tsx` bootstraps React — i18next init happens before `<RouterProvider>` renders.
- Every existing component using numbers/dates (LastUpdatedBadge, KpiCard, upload delta, import history if any) is a touch point for the formatting sweep.
- API needs a new route: `PATCH /api/me/preferences` + extension of the `/api/me` response to include `theme` and `locale`.

</code_context>

<specifics>
## Specific Ideas

- **"Sun/moon icon + DE/EN text pills"** — the user explicitly chose text over flags because flags misrepresent languages and rendering is inconsistent.
- **Currency is always €** — not locale-derived. ACM is German-only; even English-mode users see `€`.
- **German executives are the primary audience** — so DE is the *implicit* default even when `Accept-Language` detection is enabled (it kicks in only if the browser lacks German).
- **Amber/warn in dark mode is historically the hardest color to get to 7:1** — expect the planner to spend extra iteration here.
- **No flash of wrong theme** — the initial theme class must be applied synchronously before React hydrates, via an inline script in `index.html`.

</specifics>

<deferred>
## Deferred Ideas

- **Full i18n architecture deep-dive** (namespacing strategy, typed-key library choice, CI parity script implementation) — user chose to leave these as Claude's Discretion with recommended defaults captured above.
- **Screenshot test strategy deep-dive** — Claude's Discretion, Playwright default.
- **Third language (French / Italian)** — v2.
- **User settings page** (beyond the two header toggles) — v2. Notifications, email digest, display preferences all deferred.
- **Per-locale currency** — out of scope (EUR is fixed).
- **Custom font per locale** — not needed, Inter handles both DE and EN.
- **Dark-mode polish of `/docs` route content** — belongs to Phase 7 (docs site).
- **Export to CSV/PDF with localized numbers** — v2 differentiator.
- **Date-fns or dayjs** for more advanced date operations — not needed in v1, native `Intl.*` suffices.

</deferred>

---

*Phase: 06-dark-light-mode-i18n*
*Context gathered: 2026-04-09*
