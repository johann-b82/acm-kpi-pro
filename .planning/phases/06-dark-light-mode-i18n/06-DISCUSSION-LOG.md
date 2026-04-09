# Phase 6: Dark/Light Mode + i18n - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 06-dark-light-mode-i18n
**Areas discussed:** Persistence & defaults, Toggle UX + dark palette, Recharts theming

---

## Gray area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Persistence & defaults | DB vs cookie vs localStorage; first-visit default | ✓ |
| Toggle UX + dark palette | Header controls + WCAG dark palette | ✓ |
| i18n architecture | Key structure, typed keys, CI parity, formatting helper |  |
| Recharts theming | CSS vars vs context for chart colors | ✓ |

**User's choice:** Three areas selected. i18n architecture deferred to Claude's Discretion with recommended defaults.

---

## Persistence & defaults

### Storage location

| Option | Description | Selected |
|--------|-------------|----------|
| DB column on users (Recommended) | Add `theme` + `locale` to users table; cross-device; needs migration + endpoint | ✓ |
| Cookie (sealed, iron-session) | Zero migration; per-browser only; not truly per-user | |
| LocalStorage (client-only) | Fastest; per-device; survives logout; contradicts "per user" | |

**User's choice:** DB column on users.

### First-visit default

| Option | Description | Selected |
|--------|-------------|----------|
| System + browser (Recommended) | `prefers-color-scheme` + `Accept-Language` → DE or EN | ✓ |
| Always DE + Light | Hardcoded German light | |
| Always DE + System theme | German always, theme follows OS | |

**User's choice:** System + browser.

### Pre-login language

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — cookie even when logged out (Recommended) | Login page respects last-chosen language via separate lightweight cookie | ✓ |
| No — login is always DE | Hardcoded DE login | |
| No — login follows Accept-Language | Login reads browser header | |

**User's choice:** Pre-login cookie.

---

## Toggle UX + dark palette

### Header controls

| Option | Description | Selected |
|--------|-------------|----------|
| Sun/moon icon + DE/EN text pills (Recommended) | lucide Sun/Moon + two `DE | EN` text pills | ✓ |
| Sun/moon icon + flag icons | 🇩🇪 / 🇬🇧 emoji flags — flags ≠ languages | |
| Unified settings dropdown | Gear icon → dropdown | |

**User's choice:** Sun/moon + DE/EN text pills.

### Dark palette approach

| Option | Description | Selected |
|--------|-------------|----------|
| Refine the existing stub (Recommended) | Keep shadcn-style stub; tune HSL until WCAG passes | ✓ |
| Custom ACM-branded palette | Bespoke design pass | |
| Claude's discretion | Planner decides | |

**User's choice:** Refine existing stub.

### KPI status colors

| Option | Description | Selected |
|--------|-------------|----------|
| Separate tokens per theme (Recommended) | `--kpi-ok` etc. distinct in `:root` and `.dark`; hand-tuned to 7:1 | ✓ |
| Same hue, different saturation | Auto-lighten in dark mode | |

**User's choice:** Separate tokens per theme.

---

## Recharts theming

### Color source

| Option | Description | Selected |
|--------|-------------|----------|
| CSS variable lookup at render (Recommended) | `useThemeColors()` reads computed styles; single source of truth | ✓ |
| Explicit ThemeProvider context | JS objects with light/dark colors; type-safe but duplicates | |
| Tailwind class-based inline | `dark:` variant + hardcoded hex | |

**User's choice:** CSS variable lookup.

### Formatting layer

| Option | Description | Selected |
|--------|-------------|----------|
| Shared `useLocale()` hook (Recommended) | One `lib/format.ts` with `formatNumber/Currency/Date`; reads i18next locale | ✓ |
| Inline `Intl.NumberFormat` | Each component constructs its own | |

**User's choice:** Shared helper in `lib/format.ts`.

---

## Wrap-up

| Option | Description | Selected |
|--------|-------------|----------|
| Write CONTEXT.md (Recommended) | Capture decisions; remaining tech choices → Claude's Discretion | ✓ |
| Discuss i18n architecture | Drill into namespacing, typed keys, CI script | |
| Discuss screenshot test strategy | Playwright vs Vitest visual regression | |

**User's choice:** Write CONTEXT.md.

---

## Claude's Discretion

- i18n namespace structure (recommended: feature-split)
- Typed translation keys library (recommended: i18next TS augmentation)
- CI parity check implementation (recommended: small Node script)
- Visual regression tool (recommended: Playwright `toHaveScreenshot`)
- Exact HSL values for dark palette (tune until WCAG passes)
- `useThemeColors()` subscription mechanism (MutationObserver or React context)
- Toast library for save-preference failure

## Deferred Ideas

- Full i18n architecture deep-dive (→ Claude's Discretion for this phase)
- Screenshot test strategy deep-dive (→ Claude's Discretion)
- Third language (French/Italian) → v2
- User settings page beyond header toggles → v2
- Per-locale currency → out of scope (EUR fixed)
- Custom font per locale → not needed
- Dark-mode polish of `/docs` content → Phase 7
- Localized CSV/PDF export → v2
- date-fns / dayjs → not needed, native Intl suffices
