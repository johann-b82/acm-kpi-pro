---
phase: "01"
plan: "06"
subsystem: frontend
tags: [react, vite, tailwind, shadcn-ui, react-router, auth, protected-routes]
dependency_graph:
  requires: [02-monorepo-scaffold, 04-api-skeleton]
  provides: [frontend-spa, login-page, protected-layout, dashboard-stub, upload-stub, docs-stub]
  affects: [07-caddy-compose]
tech_stack:
  added: [vite@8.0.7, react@19.2.4, react-router-dom@6.30.3, tailwindcss@3.4.19, lucide-react@0.400.0]
  patterns: [react-spa, protected-routes, css-custom-properties, shadcn-ui-ready]
key_files:
  created:
    - apps/frontend/vite.config.ts
    - apps/frontend/tailwind.config.ts
    - apps/frontend/postcss.config.ts
    - apps/frontend/index.html
    - apps/frontend/components.json
    - apps/frontend/public/acm-logo.svg
    - apps/frontend/public/favicon.svg
    - apps/frontend/src/vite-env.d.ts
    - apps/frontend/src/styles/global.css
    - apps/frontend/src/lib/utils.ts
    - apps/frontend/src/main.tsx
    - apps/frontend/src/hooks/useAuth.ts
    - apps/frontend/src/components/ProtectedRoute.tsx
    - apps/frontend/src/components/Header.tsx
    - apps/frontend/src/components/KpiCard.tsx
    - apps/frontend/src/pages/LoginPage.tsx
    - apps/frontend/src/pages/DashboardPage.tsx
    - apps/frontend/src/pages/UploadStubPage.tsx
    - apps/frontend/src/pages/DocsStubPage.tsx
    - apps/frontend/src/pages/NotFoundPage.tsx
  modified: []
decisions:
  - "Vite 8 uses rolldown; manualChunks must be a function (object form raises TypeError at build time)"
  - "vite-env.d.ts (/// <reference types='vite/client' />) required for tsc to accept CSS side-effect imports"
  - "POST /api/v1/auth/login does not exist until Plan 05; login form mocks fetch in tests, live integration deferred"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-08"
  tasks_completed: 2
  files_created: 20
---

# Phase 01 Plan 06: React Frontend Shell Summary

**One-liner:** Vite 8 + React 19 SPA with React Router 6 protected routes, Tailwind 3.4 theming, ACM-branded header (logo + upload/docs icon buttons), login form, and dashboard stub with one KPI card.

## Tasks Completed

| # | Task | Status |
|---|------|--------|
| 1 | Vite config, Tailwind, shadcn/ui bootstrap, global styles, public assets | Done |
| 2 | React app structure — pages, components, routing | Done |

## Files Created

**Task 1 — Config + Styles:**
- `apps/frontend/vite.config.ts` — Vite 8 config; React plugin, `@/` alias, `/api` proxy to port 3000, function-form `manualChunks` for rolldown compatibility
- `apps/frontend/tailwind.config.ts` — Tailwind 3.4; ACM brand blue palette, dark-mode via class, Inter font
- `apps/frontend/postcss.config.ts` — PostCSS with tailwindcss + autoprefixer
- `apps/frontend/index.html` — HTML entry, favicon link, `<div id="root">`
- `apps/frontend/components.json` — shadcn/ui CLI config (style=default, CSS variables, `@/` aliases)
- `apps/frontend/public/acm-logo.svg` — placeholder ACM logo (blue circle, served statically)
- `apps/frontend/public/favicon.svg` — same SVG as favicon (BRAND-02)
- `apps/frontend/src/styles/global.css` — Tailwind directives + CSS custom properties for light/dark theming
- `apps/frontend/src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- `apps/frontend/src/vite-env.d.ts` — Vite client types reference (required for tsc to accept CSS imports)

**Task 2 — Components + Pages:**
- `apps/frontend/src/main.tsx` — React entry; BrowserRouter + Routes tree with protected wrapping
- `apps/frontend/src/hooks/useAuth.ts` — fetches `/api/v1/auth/me`, handles 401 → user null, exposes `logout()`
- `apps/frontend/src/components/ProtectedRoute.tsx` — redirects to `/login` when `useAuth` returns no user (AUTH-06)
- `apps/frontend/src/components/Header.tsx` — ACM logo (BRAND-01), Upload icon (lucide), Docs icon (lucide), Logout button
- `apps/frontend/src/components/KpiCard.tsx` — reusable KPI card with ok/warning/critical/loading status variants
- `apps/frontend/src/pages/LoginPage.tsx` — username + password form, POSTs to `/api/v1/auth/login`
- `apps/frontend/src/pages/DashboardPage.tsx` — Header + one KPI card "Total inventory value — loading…"
- `apps/frontend/src/pages/UploadStubPage.tsx` — "Upload — coming in Phase 4" stub
- `apps/frontend/src/pages/DocsStubPage.tsx` — "Documentation — coming in Phase 7" stub
- `apps/frontend/src/pages/NotFoundPage.tsx` — 404 page with link back to dashboard

## Exit Criteria Verification

- [x] `npm -w apps/frontend run build` exits 0 — `tsc --noEmit` + `vite build` both pass; 5 output chunks, 444 ms
- [x] TypeScript strict mode — 0 errors (`tsc --noEmit`)
- [x] Biome lint — 0 errors (`npm run lint`)
- [x] Build output includes `index.html`, `assets/` JS + CSS chunks, `acm-logo.svg`, `favicon.svg`
- [x] `public/acm-logo.svg` and `public/favicon.svg` present and served from build output
- [x] `<link rel="icon">` in `index.html` points to `/favicon.svg` (BRAND-02)
- [ ] `npm -w apps/frontend run dev` live redirect `/` → `/login` — deferred; requires API running (verified structurally via code inspection)
- [ ] Entering valid credentials redirects to `/` — deferred until Plan 05 adds `POST /api/v1/auth/login`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Vite 8 rolldown incompatibility with object `manualChunks`**
- **Found during:** Task 1 — first `vite build` attempt
- **Issue:** Plan specified `manualChunks: { vendor: [...] }` (object form). Vite 8 uses rolldown instead of rollup; rolldown raises `TypeError: manualChunks is not a function` when receiving an object.
- **Fix:** Changed to function form: `manualChunks(id) { if (id.includes("react") ...) return "vendor"; }`
- **Files modified:** `apps/frontend/vite.config.ts`
- **Commit:** 4aa4209

**2. [Rule 2 - Missing functionality] Vite client type reference missing**
- **Found during:** Task 1 — `tsc --noEmit` reported `error TS2882: Cannot find module or type declarations for side-effect import of './styles/global.css'`
- **Issue:** No `vite-env.d.ts` file existed; TypeScript strict mode rejects CSS side-effect imports without Vite's client type reference.
- **Fix:** Created `apps/frontend/src/vite-env.d.ts` with `/// <reference types="vite/client" />`
- **Files modified:** `apps/frontend/src/vite-env.d.ts` (created)
- **Commit:** 4aa4209

**3. [Rule 1 - Formatting] Biome import ordering + node: protocol**
- **Found during:** Post-task lint run
- **Issue:** 6 files had unsorted imports; `vite.config.ts` used `"path"` instead of `"node:path"` (Biome `useNodejsImportProtocol` rule)
- **Fix:** `npm run lint:fix` applied safe fixes; manually updated `node:path` in vite.config.ts (unsafe fix for Biome)
- **Files modified:** `vite.config.ts`, `main.tsx`, `useAuth.ts`, `Header.tsx`, `LoginPage.tsx`, `utils.ts`
- **Commit:** 4aa4209

## Known Stubs

| File | Description | Future Plan |
|------|-------------|-------------|
| `apps/frontend/src/pages/DashboardPage.tsx` | Single KPI card always shows "loading…" — no real data | Phase 3 (KPI routes) |
| `apps/frontend/src/pages/UploadStubPage.tsx` | "Coming in Phase 4" placeholder content | Phase 4 (upload) |
| `apps/frontend/src/pages/DocsStubPage.tsx` | "Coming in Phase 7" placeholder content | Phase 7 (docs) |
| `apps/frontend/src/hooks/useAuth.ts` (logout) | Calls `/api/v1/auth/logout` which does not yet exist | Plan 05 (auth) |
| `LoginPage.tsx` POST handler | POSTs to `/api/v1/auth/login` which does not yet exist | Plan 05 (auth) |

These stubs do NOT prevent the plan's goal from being achieved — the shell renders correctly, the protected route redirects work (once the API is running), and the dashboard structure is in place. The stubs are explicitly called out in the plan as Phase 1 scope boundaries.

## Commit

- `4aa4209` — `feat(01): add React frontend shell (login, protected layout, dashboard stub, upload/docs stubs)`

## Self-Check: PASSED

Files verified:
- `apps/frontend/vite.config.ts` — FOUND
- `apps/frontend/tailwind.config.ts` — FOUND
- `apps/frontend/postcss.config.ts` — FOUND
- `apps/frontend/index.html` — FOUND
- `apps/frontend/components.json` — FOUND
- `apps/frontend/public/acm-logo.svg` — FOUND
- `apps/frontend/public/favicon.svg` — FOUND
- `apps/frontend/src/vite-env.d.ts` — FOUND
- `apps/frontend/src/styles/global.css` — FOUND
- `apps/frontend/src/lib/utils.ts` — FOUND
- `apps/frontend/src/main.tsx` — FOUND
- `apps/frontend/src/hooks/useAuth.ts` — FOUND
- `apps/frontend/src/components/ProtectedRoute.tsx` — FOUND
- `apps/frontend/src/components/Header.tsx` — FOUND
- `apps/frontend/src/components/KpiCard.tsx` — FOUND
- `apps/frontend/src/pages/LoginPage.tsx` — FOUND
- `apps/frontend/src/pages/DashboardPage.tsx` — FOUND
- `apps/frontend/src/pages/UploadStubPage.tsx` — FOUND
- `apps/frontend/src/pages/DocsStubPage.tsx` — FOUND
- `apps/frontend/src/pages/NotFoundPage.tsx` — FOUND
- `apps/frontend/dist/index.html` — FOUND (build output)

Commit `4aa4209` verified in git log.
