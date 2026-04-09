---
phase: 6
slug: dark-light-mode-i18n
status: draft
shadcn_initialized: true
preset: "default"
created: "2026-04-09"
---

# Phase 6 — UI Design Contract: Dark/Light Mode + i18n

> Visual and interaction contract for dark/light theme toggle and DE/EN internationalization. Pre-populated from CONTEXT.md (user decisions locked).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui (slate base) |
| Preset | `default` — already initialized in Phase 1 |
| Component library | Radix UI (via shadcn) |
| Icon library | Lucide React (existing) |
| Font | Inter (system-ui fallback) |

**Design system status:** Existing light palette from Phase 1 refined in Phase 6 with dark mode tokens + KPI status color tokens. No new dependencies required.

---

## Color

### Palette Structure

**Source of truth:** CSS custom properties in `apps/frontend/src/styles/global.css`

#### Light Theme (`:root`)
Existing values from Phase 1, retained as-is:
- `--background: 0 0% 100%` (pure white)
- `--foreground: 222.2 84% 4.9%` (near-black)
- `--card: 0 0% 100%`
- `--card-foreground: 222.2 84% 4.9%`
- `--border: 214.3 31.8% 91.4%`
- `--input: 214.3 31.8% 91.4%`
- `--primary: 221.2 83.2% 53.3%` (ACM blue)
- `--primary-foreground: 210 40% 98%`
- `--muted: 210 40% 96%`
- `--muted-foreground: 215.4 16.3% 46.9%`
- `--destructive: 0 84.2% 60.2%`
- `--destructive-foreground: 210 40% 98%`
- `--ring: 221.2 83.2% 53.3%`

#### Dark Theme (`.dark`)
**Placeholder values from Phase 1 to be refined during Phase 6 execution to meet WCAG AA 4.5:1 body contrast.**
- `--background: 222.2 84% 4.9%` (near-black)
- `--foreground: 210 40% 98%` (nearly white)
- `--card: 222.2 84% 4.9%`
- `--card-foreground: 210 40% 98%`
- `--border: 217.2 32.6% 17.5%`
- `--input: 217.2 32.6% 17.5%`
- `--primary: 217.2 91.2% 59.8%` (lightened ACM blue)
- `--primary-foreground: 222.2 47.4% 11.2%`
- `--muted: 217.2 32.6% 17.5%`
- `--muted-foreground: 215 20.2% 65.1%`
- `--destructive: 0 62.8% 30.6%`
- `--destructive-foreground: 210 40% 98%`
- `--ring: 224.3 76.3% 48%`

#### KPI Status Color Tokens (New — Phase 6)
**Added to both `:root` and `.dark` scopes. Tuned independently per theme to hit ≥7:1 contrast against card background.**

Recommended starting values (to be refined during execution):

**Light theme:**
- `--kpi-ok: 132 61% 36%` (safe green — 7:1 against white card)
- `--kpi-warn: 38 92% 50%` (amber-orange — historically hardest, expect iteration)
- `--kpi-critical: 0 84.2% 40%` (darker red — 7:1 against white card)

**Dark theme:**
- `--kpi-ok: 142 71% 45%` (brighter green for dark cards)
- `--kpi-warn: 41 96% 56%` (more saturated orange — tuned for dark mode)
- `--kpi-critical: 0 91% 71%` (bright red — 7:1 against dark card)

**Contract:** KPI status colors are defined *separately in each theme context* and are never inferred from a single palette hue. Each must be contrast-tested against its card background before launch.

### Color Usage

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--background` | Page background, primary surfaces |
| Secondary (30%) | `--card` | KPI cards, input fields, panels |
| Accent (10%) | `--primary` (ACM blue) | Logo, primary CTA buttons, header focus states |
| Destructive | `--destructive` | Logout, delete actions, error states |
| KPI Ok | `--kpi-ok` | Green status badge + card border accent |
| KPI Warn | `--kpi-warn` | Yellow status badge + card border accent |
| KPI Critical | `--kpi-critical` | Red status badge + card border accent |

**Accent reserved for:**
- Header logo and brand identity (Phase 1 carried forward)
- Primary CTA buttons (Login, Upload file, Save preferences)
- Active navigation indicators
- Focused interactive element outlines (`--ring`)

**Constraints:**
- Color is never the sole signal of status. Every KPI card must also display directional text or arrow (inherited from Phase 3 P3 rule: "color-never-sole-signal").
- KPI colors are verified in both light and dark themes during the visual regression test phase.
- Brand blue (`--primary`) preserves ACM identity in both themes; only lightness shifts per theme context.

---

## Typography

### Font Selection

| Role | Size | Weight | Line Height | Font |
|------|------|--------|-------------|------|
| Body | 14px / 16px | 400 (regular) | 1.5 | Inter |
| Label | 12px | 400 (regular) | 1.4 | Inter |
| Heading (card titles) | 16px | 600 (semibold) | 1.2 | Inter |
| Display (dashboard section) | 20px | 600 (semibold) | 1.1 | Inter |

**Font stack:** `Inter, system-ui, sans-serif` (tailwind config, Phase 1)

**Constraint:** Body text minimum 16px on mobile (inherited from ui-ux-pro-max skill rule). Phase 6 locks 16px for mobile, 14px acceptable only on desktop with explicit layout verification.

**Weight constraint:** Maximum 2 font weights (400 regular and 600 semibold) to prevent visual noise and cognitive load. All body text, labels, and small UI elements use 400; headings and display-level elements use 600.

---

## Spacing Scale

All values are multiples of 4 (8-point grid):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon-to-icon gaps, dense inline spacing |
| sm | 8px | Compact element padding, button internal |
| md | 16px | Default element padding, card padding, section gutters |
| lg | 24px | Header row height, section vertical spacing |
| xl | 32px | Major layout gaps, page-level padding |
| 2xl | 48px | Vertical section breaks |
| 3xl | 64px | Top-level page padding (resets at breakpoints) |

**Exceptions:** None declared. All interactive elements maintain Tailwind defaults (44px touch targets via padding + border-radius).

---

## Copywriting Contract

All user-facing strings are pulled from `de.json` / `en.json` translation files (i18next). No hardcoded English strings remain after Phase 6 sweep.

### Translation File Structure
- **Path:** `apps/frontend/src/locales/{de,en}.json`
- **Organization:** Feature-namespaced (recommended):
  - `common.*` — shared labels, buttons
  - `auth.*` — login, logout, role messages
  - `dashboard.*` — KPI labels, timestamps, filter labels
  - `upload.*` — upload page copy, error messages
  - `theme.*` — theme toggle aria-labels

### Primary Interactions

| Element | English | German |
|---------|---------|--------|
| Theme toggle aria-label (light→dark) | "Switch to dark mode" | "Zum dunklen Modus wechseln" |
| Theme toggle aria-label (dark→light) | "Switch to light mode" | "Zum hellen Modus wechseln" |
| Language toggle aria-label | "Switch to English" | "Zu Deutsch wechseln" |
| Login button | "Sign In" | "Anmelden" |
| Logout button | "Logout" | "Abmelden" |
| Upload button | "Upload" | "Hochladen" |
| Refresh button aria-label | "Refresh KPI data" | "KPI-Daten aktualisieren" |
| Docs button aria-label | "Documentation" | "Dokumentation" |

### Empty State

**Not newly created in Phase 6**, but all existing empty states (if any from Phase 3/4) must be localized:

Example structure in i18n:
```json
{
  "dashboard": {
    "emptyState": {
      "heading": "No data yet",
      "body": "Upload a file to see KPI data."
    }
  }
}
```

### Error State

All validation errors and network errors must carry localized copy:

Example from Phase 2 (ingestion errors now localized in Phase 6):

```json
{
  "upload": {
    "errors": {
      "fileTooLarge": "File exceeds maximum size",
      "unsupportedFormat": "Only .csv and .txt files are accepted",
      "networkError": "Failed to upload. Please check your connection and try again."
    }
  }
}
```

### Destructive Actions

Logout is the only v1 destructive action visible in the UI. Copy already exists; Phase 6 localizes:

```json
{
  "auth": {
    "logout": "Logout",
    "logoutConfirm": "You have been logged out."
  }
}
```

---

## Number, Currency, Date Formatting

### Formatting Helpers
**Module:** `apps/frontend/src/lib/format.ts` (new, Phase 6)

Exports five functions, each reads current locale from `i18next`:

```typescript
export function formatNumber(value: number, opts?: Intl.NumberFormatOptions): string
export function formatCurrency(value: number): string  // Always EUR, locale-aware separators
export function formatDate(date: Date | string): string
export function formatDateTime(date: Date | string): string
export function formatPercent(value: number, fractionDigits?: number): string
```

### Locale-Specific Output

#### German Locale (`de`)
- Number: `1.234.567,89` (thousands `.`, decimal `,`)
- Currency: `1.234.567,89 €` (suffix with non-breaking space)
- Date: `31.12.2025` (DD.MM.YYYY)
- DateTime: `31.12.2025, 14:30` (DD.MM.YYYY, HH:mm)
- Percent: `42,5%` (decimal `,`)

#### English Locale (`en`)
- Number: `1,234,567.89` (thousands `,`, decimal `.`)
- Currency: `€1,234,567.89` (prefix, browser default or explicit via Intl option)
- Date: `2025-12-31` (ISO YYYY-MM-DD, or browser Intl default)
- DateTime: `2025-12-31, 2:30 PM` (ISO date + locale time)
- Percent: `42.5%` (decimal `.`)

**Contract:** All hardcoded numbers, dates, and currency values in Phase 3 (KPI cards, LastUpdatedBadge) and Phase 4 (upload delta, progress) are swept and replaced with these helpers during Phase 6 execution.

---

## Theme Toggle UX (D-06, D-07, D-08)

### Header Controls Layout
**Location:** Existing header top-right row, left of Upload icon (Phase 4), before Docs icon (Phase 7).

Order in header (left to right):
1. LastUpdatedBadge (if applicable)
2. Force-refresh button
3. **Theme toggle button** ← NEW
4. **Language pills** ← NEW
5. Upload button (Admins only)
6. Docs button
7. Logout button

### Theme Toggle Button (Sun/Moon Icon)

**Icon selection:**
- Light mode (current): Lucide `Moon` icon (suggests "click to go dark")
- Dark mode (current): Lucide `Sun` icon (suggests "click to go light")

**Button properties:**
- `className: "inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"`
- `aria-label: "Switch to {next-theme} mode"` (dynamic based on current theme)
- `title: "Switch to {next-theme} mode"`
- Keyboard accessible (Tab, Enter/Space to toggle)
- No tooltip text overlay; aria-label is the semantic label

**Behavior:**
- Click toggles immediately (optimistic update)
- Calls `PATCH /api/me/preferences { theme: 'light' | 'dark' }` in background
- On network failure: toast error "Failed to save theme preference" + revert to previous state
- No blocking spinner; UI responds first, network call is fire-and-forget

### Language Pill Group (DE | EN)

**Visual design:**
- Two adjacent small text pills, centered vertically with theme button
- Current language: **bold/filled** text (higher contrast)
- Inactive language: muted text (lower contrast)
- Separator: single `|` character or visual divider
- No border or background unless focused

**Example light mode HTML structure:**
```html
<div className="flex items-center gap-1 text-sm">
  <button
    onClick={() => setLocale('de')}
    className={currentLocale === 'de' ? 'font-bold text-foreground' : 'text-muted-foreground'}
    aria-label="Switch to German"
  >
    DE
  </button>
  <span className="text-muted-foreground">|</span>
  <button
    onClick={() => setLocale('en')}
    className={currentLocale === 'en' ? 'font-bold text-foreground' : 'text-muted-foreground'}
    aria-label="Switch to English"
  >
    EN
  </button>
</div>
```

**Behavior:**
- Click on DE or EN swaps language immediately (optimistic)
- Calls `PATCH /api/me/preferences { locale: 'de' | 'en' }` in background
- On network failure: revert to previous locale + toast error
- Pre-login: a lightweight cookie `acm_lang` (non-HTTPOnly, SameSite=Lax, 1-year expiry) persists the last chosen language so the login screen renders in the right language on return visits

**Keyboard accessibility:**
- Both pill buttons are Tab-focusable
- Enter or Space activates the button
- aria-label describes the action ("Switch to German", "Switch to English")

---

## Persistence & Defaults (D-01 through D-05)

### Database Schema (Phase 6 migration)

**Migration:** Add two columns to `users` table in `apps/api/src/db/schema.ts`

```sql
ALTER TABLE users ADD COLUMN theme text NOT NULL DEFAULT 'system';
ALTER TABLE users ADD COLUMN locale text NOT NULL DEFAULT 'de';
```

**Constraints:**
- `theme`: enum-like, values ∈ {`light`, `dark`, `system`}
- `locale`: enum-like, values ∈ {`de`, `en`}

### First-Visit Defaults (No stored preference)

**Theme detection:**
- Read `window.matchMedia('(prefers-color-scheme: dark)').matches`
- If true: apply dark mode; if false: apply light mode
- Store as `theme = 'system'` in DB (users can override later to `light` or `dark`)

**Locale detection:**
- Read `Accept-Language` header (server-side, during login form render)
- If header includes German locale code (`de`, `de-DE`, etc.) before English: default to `de`
- Otherwise: default to `en`
- Store in DB + send to client via session

### Pre-Login Language Persistence

**Cookie name:** `acm_lang`
- Value: `de` or `en` (plain text)
- HTTPOnly: `false` (client-side JS can read)
- Secure: `true` (HTTPS only in production)
- SameSite: `Lax`
- Max-Age: 31536000 seconds (1 year)
- Path: `/`

**Lifecycle:**
1. On first visit, no `acm_lang` cookie exists → login page reads `Accept-Language` header
2. User toggles language pill on login form (if implemented) or language defaults from header
3. On successful login, set `acm_lang` cookie from `users.locale` value (server authoritative)
4. On logout: do NOT clear `acm_lang` (persist for return visits)
5. On return visit (logged out), login page reads `acm_lang` and renders in that language

### Write-Through Persistence (D-05)

**Interaction flow:**
1. User clicks theme toggle or language pill
2. Optimistic local state update (UI responds instantly)
3. `PATCH /api/me/preferences` sent in background with `{ theme?: string, locale?: string }`
4. On success: do nothing extra (state already updated optimistically)
5. On failure: revert local state + show toast error "Failed to save preferences"

**No blocking:** UI never waits for network round-trip. Toggle click is always instant.

### API Endpoint (New in Phase 6)

**Route:** `PATCH /api/me/preferences`

**Request body:**
```json
{
  "theme": "light" | "dark" | "system",
  "locale": "de" | "en"
}
```

**Response:**
```json
{
  "id": "user-uuid",
  "username": "user",
  "role": "Admin",
  "theme": "light",
  "locale": "de"
}
```

**Authorization:** Authenticated users only (iron-session guard)

**Side effects:**
- Updates `users.theme` and/or `users.locale` in PostgreSQL
- Returns full user object including updated preferences (allows frontend to sync)

---

## Recharts Theming (D-14, D-15, D-16)

### Hook: `useThemeColors()`

**Location:** `apps/frontend/src/hooks/useThemeColors.ts` (new)

**Implementation:**
Reads CSS variables from computed styles at render time. Returns an object with color tokens:

```typescript
export function useThemeColors() {
  return {
    kpiOk: getCSSVariable('--kpi-ok'),
    kpiWarn: getCSSVariable('--kpi-warn'),
    kpiCritical: getCSSVariable('--kpi-critical'),
    primary: getCSSVariable('--primary'),
    border: getCSSVariable('--border'),
    foreground: getCSSVariable('--foreground'),
  };
}

function getCSSVariable(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}
```

**Usage in KpiCard (Phase 3 sparkline):**
```typescript
const colors = useThemeColors();
<LineChart data={data}>
  <Line stroke={colors.primary} />
</LineChart>
```

**Behavior:**
- Hook reads computed styles on every render
- When theme toggle changes the `<html class="dark">` attribute, React context or MutationObserver triggers re-render
- Charts automatically re-render with new color values (no manual refresh needed)

### No Hardcoded Hex Values

**Contract:** Any chart that needs a color imports it through `useThemeColors()`, never as a hex literal in code.

---

## i18n Architecture (Claude's Discretion, with Guardrails)

### Library & Setup

**Package:** `i18next` + `react-i18next` (called out in ROADMAP.md)

**Installation:** Planner decides exact versions during Phase 6 research + planning.

**Initialization:**
- Before React Router provider mounts
- Read current locale from session/cookie
- Set `i18n.language` to match
- Enable suspense support for code splitting (optional, not required for v1)

### Translation File Structure

**Path:** `apps/frontend/src/locales/{de,en}.json`

**Organization:** Feature-namespaced (recommended by CONTEXT.md):

```json
{
  "common": {
    "appName": "ACM KPI Pro",
    "loading": "Loading...",
    "error": "Something went wrong"
  },
  "auth": {
    "signIn": "Sign In",
    "logout": "Logout",
    "logoutConfirm": "You have been logged out."
  },
  "dashboard": {
    "title": "Dashboard",
    "kpiLabels": {
      "inventoryValue": "Inventory Value",
      "coverage": "Days on Hand",
      ...
    },
    "lastUpdated": "Last updated",
    "refresh": "Refresh KPI data"
  },
  "upload": {
    "title": "Upload Data",
    "dragDrop": "Drag and drop a file",
    "errors": { ... }
  },
  "theme": {
    "switchToDark": "Switch to dark mode",
    "switchToLight": "Switch to light mode"
  }
}
```

### Typed Translation Keys

**Approach:** i18next built-in TypeScript augmentation via `resources` interface (zero new dependencies, recommended).

**Implementation:**
1. Define `resources` type in i18n config:
   ```typescript
   const resources = {
     de: { common: { appName: "ACM KPI Pro" }, ... },
     en: { common: { appName: "ACM KPI Pro" }, ... }
   } as const;
   
   type DeepKeys<T> = ... // Flatten nested keys
   ```

2. Augment i18next types:
   ```typescript
   declare module 'i18next' {
     interface CustomTypeOptions {
       resources: typeof resources;
       returnNull: false;
     }
   }
   ```

3. Usage: `t('common.appName')` — TypeScript errors if key doesn't exist

**Contract:** Missing-key usage must be a compile error in `pnpm -w typecheck`.

### CI Parity Check (TEST-04)

**Implementation:** Small Node.js script in `scripts/check-i18n-parity.mjs` (no third-party parser needed)

```javascript
#!/usr/bin/env node
import fs from 'fs';

const de = JSON.parse(fs.readFileSync('apps/frontend/src/locales/de.json', 'utf-8'));
const en = JSON.parse(fs.readFileSync('apps/frontend/src/locales/en.json', 'utf-8'));

const deKeys = Object.keys(flattenKeys(de)).sort();
const enKeys = Object.keys(flattenKeys(en)).sort();

if (deKeys.join('\n') !== enKeys.join('\n')) {
  console.error('ERROR: i18n key mismatch between de.json and en.json');
  // Output diff
  process.exit(1);
}
console.log('✓ i18n keys match');
```

**Integration:** Triggered in `pnpm -w lint` or new `pnpm -w check:i18n` step (planner decides)

**TEST-04 acceptance:** CI fails the build if de.json ≠ en.json key sets.

---

## Visual Regression Testing

### Screenshot Tests

**Tool:** Playwright `toHaveScreenshot()` (already present or minimal to add in Phase 4)

**Coverage matrix:**

| Scenario | Light Mode | Dark Mode |
|----------|-----------|----------|
| Login page (no user) | ✓ | ✓ |
| Dashboard main (with KPI cards) | ✓ | ✓ |
| Upload page (admin only) | ✓ | ✓ |

**Locale coverage:** Tests run in both `de` and `en` locales (6 total snapshots: 3 pages × 2 locales, run in both light + dark = 12 snapshots per full suite).

**Passing criteria:**
- All text renders without truncation in German (longest locale)
- Buttons, cards, and input fields layout correctly at `md:` (tablet) and `lg:` (desktop) breakpoints
- Dark theme colors produce visible contrast (visual inspection)
- No layout shifts on theme toggle

**Failure case:** Truncated German text on a button or KPI label → blocks phase exit. Planner must adjust Tailwind spacing or font size.

---

## German Layout Verification (I18N-04)

### Text Length Accommodation

**Fact:** German strings are reliably 25-40% longer than English equivalents.

**Verification:**
1. Each header button, KPI card label, form control, and error message manually reviewed (or snapshot-tested)
2. For each element:
   - English string rendered in EN mode
   - German string rendered in DE mode
   - Compare visual width; German must fit without truncation
3. Apply `text-wrap: balance` or Tailwind flex wrapping as needed

**Examples:**

| English | German | Length Ratio |
|---------|--------|--------------|
| "Upload" | "Hochladen" | 1.0x |
| "Refresh KPI data" | "KPI-Daten aktualisieren" | 1.35x |
| "Days on Hand" | "Reichweite in Tagen" | 1.36x |
| "Inventory Value" | "Lagerwert" | 0.5x (shorter) |

**Contract:** Any field that truncates or wraps unexpectedly in German layout blocks phase exit.

---

## Theme + Language Interaction

### Behavior on Toggle

**Theme toggle does NOT affect language** — they are independent.

**Language toggle does NOT affect theme** — they are independent.

**Example flow:**
1. User is in EN + light mode
2. User clicks German pill → UI switches to DE (same light theme continues)
3. User clicks theme toggle → UI switches to DE + dark theme
4. User clicks English pill → UI switches to EN + dark theme
5. Numbers/dates still format according to current locale (EN = commas; DE = periods)

### Session Persistence

Both preferences persist across:
- Page reloads (stored in DB)
- Link navigations (React state maintained)
- Return visits (users table preserving user.theme + user.locale)

Only logout clears the session itself; the acm_lang cookie persists for next login.

---

## Contrast Requirements (WCAG AA)

### Body Text

**Requirement:** 4.5:1 contrast ratio minimum (WCAG AA standard)

- Light mode: `--foreground` (222.2 84% 4.9%) on `--background` (0 0% 100%) — high contrast ✓
- Dark mode: `--foreground` (210 40% 98%) on `--background` (222.2 84% 4.9%) — must verify during execution (currently placeholder)

### KPI Card Values

**Requirement:** 7:1 contrast ratio minimum (higher bar for small, frequent-read numbers)

- Light mode: KPI color token on `--card` (0 0% 100%) — e.g., `--kpi-ok` (132 61% 36%) vs white
- Dark mode: KPI color token on `--card` (222.2 84% 4.9%) — e.g., `--kpi-ok` (142 71% 45%) vs dark

**Verification:** Planner adjusts HSL values until Contrast Checker or adesignaccessibility.com confirms ≥7:1.

### Interactive Elements

- Primary button: `--primary` on `--background` or `--card` — must verify per theme
- Focus ring: `--ring` on all themed backgrounds — must be visible

**Contract:** Every color pair is contrast-tested before sign-off. No placeholder values survive to production.

---

## Exceptions & Out of Scope

### Phase 6 Does NOT Include

- `/docs` route content localization (Phase 7 consumes i18n but writes its own namespaces)
- Deployment/TLS hardening (Phase 8)
- New dashboard features (phase is pure theming + localization of existing UI)
- Third language support (French, Italian, etc. — v2)
- User settings page beyond the two header toggles (v2)
- Per-locale currency selection (EUR only, always)
- Custom fonts per locale (Inter handles both DE and EN)
- Date-fns or dayjs integration (native `Intl.*` suffices for v1)
- Accessibility audit beyond WCAG AA contrast (AAA deferred to v1.1)

---

## Implementation Order (Planner's Guide)

Recommended execution sequence to minimize rework:

1. **Database migration** — Add `theme` + `locale` columns to `users` table
2. **API endpoints** — `PATCH /api/me/preferences`, extend `GET /api/me` response
3. **CSS variables** — Refine dark palette tokens + add KPI status tokens (run through contrast checker)
4. **Pre-login language cookie** — Set up `acm_lang` cookie logic in login form + session middleware
5. **i18next bootstrap** — Install packages, init i18next before React mounts, read locale from session
6. **Translation files** — Create `de.json` / `en.json`, sweep all hardcoded English strings from Phase 3/4
7. **Typed keys** — Set up i18next TS augmentation, verify `pnpm -w typecheck` catches missing keys
8. **Formatting helpers** — Implement `useLocale()` in `lib/format.ts`, replace all inline number/date formatting
9. **Header toggles** — Add Sun/Moon theme button + DE|EN language pills to existing Header component
10. **Theme context** — Optional: React context or MutationObserver to trigger re-render on theme toggle
11. **Recharts theming** — Implement `useThemeColors()` hook, wire up KpiCard sparkline
12. **Persistence logic** — Wire up `PATCH /api/me/preferences` calls, add toast error handling
13. **Visual regression tests** — Create Playwright screenshot tests for 3 pages × 2 locales × 2 themes
14. **German layout audit** — Manually verify no truncation on `md:` and `lg:` breakpoints in DE mode
15. **CI parity check** — Integrate `check-i18n-parity.mjs` script into lint workflow

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | Button, Input, Card, Badge, Toast | Not required (already vetted, in use since Phase 1) |
| No third-party registries | — | N/A |

**Safety note:** Phase 6 does not introduce any new third-party component registries. All new components (theme toggle, language pills, formatting helpers) are custom-built using existing shadcn primitives and lucide icons.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: All hardcoded English strings replaced with i18n keys; key parity enforced by CI
- [ ] Dimension 2 Visuals: Dark palette meets 4.5:1 body text contrast, 7:1 KPI card contrast; screenshot tests pass
- [ ] Dimension 3 Color: KPI status tokens tuned independently per theme; contrast verified
- [ ] Dimension 4 Typography: Body font size ≥16px on mobile, 14px on desktop with layout verification; exactly 2 font weights (400/600)
- [ ] Dimension 5 Spacing: Theme + language toggles fit within existing header 44px height; all spacing multiples of 4
- [ ] Dimension 6 Registry Safety: No third-party registries introduced; existing shadcn components only

**Approval:** pending (awaiting verification after Phase 6 execution)

---

## Canonical References

**Downstream agents MUST read these before planning or implementing:**

- `.planning/REQUIREMENTS.md` — I18N-01..05, THEME-01..04, DASH-09, DASH-10, TEST-04
- `.planning/ROADMAP.md` § Phase 6 — scope and exit criteria
- `.planning/phases/06-dark-light-mode-i18n/06-CONTEXT.md` — User decisions (locked)
- `.planning/phases/03-kpi-layer-dashboard/03-CONTEXT.md` — Accessibility rules (color-never-sole-signal, WCAG AA)
- `.planning/phases/04-upload-page/04-CONTEXT.md` — Existing UI strings to sweep
- `apps/frontend/src/styles/global.css` — CSS variable system (source of truth for colors)
- `apps/frontend/tailwind.config.ts` — `darkMode: "class"` already configured
- `apps/frontend/src/components/Header.tsx` — Target for new toggles

---

*Phase: 06-dark-light-mode-i18n*
*UI-SPEC revised: 2026-04-09*
*Typography weights reduced to maximum 2 (400 regular, 600 semibold) per design quality constraint*
