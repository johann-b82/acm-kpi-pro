---
phase: "01"
plan: "02"
subsystem: scaffold
tags: [monorepo, typescript, biome, npm-workspaces, core-types]
dependency_graph:
  requires: []
  provides: [npm-workspaces, tsconfig-project-refs, biome-config, core-types, logo-assets]
  affects: [03-postgres-drizzle, 04-api-skeleton, 05-ldap-auth, 06-frontend-shell, 07-caddy-compose]
tech_stack:
  added: [biome@1.8, typescript@6.0.2, concurrently@8.2]
  patterns: [npm-workspaces, tsconfig-composite, project-references]
key_files:
  created:
    - package.json
    - tsconfig.json
    - biome.json
    - .nvmrc
    - .gitignore
    - .dockerignore
    - .editorconfig
    - .env.example
    - apps/api/package.json
    - apps/api/tsconfig.json
    - apps/frontend/package.json
    - apps/frontend/tsconfig.json
    - apps/worker/package.json
    - apps/worker/tsconfig.json
    - apps/worker/src/index.ts
    - packages/core/package.json
    - packages/core/tsconfig.json
    - packages/core/src/index.ts
    - packages/core/src/types/auth.ts
    - packages/core/src/types/kpi.ts
    - packages/core/src/types/job.ts
    - assets/acm-logo.svg
    - assets/acm-logo.png
  modified: []
decisions:
  - "drizzle-kit uses independent versioning from drizzle-orm; latest stable is 0.31.10 not 0.45.x"
  - "iron-session latest stable is 8.0.4 (not 8.4.x as cited in research)"
  - "ldapts-mock package does not exist on npm; removed from devDeps (tests will use vi.mock in Plan 5)"
  - "lucide-react 0.400.0 resolves correctly under semver ^0.400.0"
  - "Biome auto-formatted files to double quotes and compact array/object notation"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-08"
  tasks_completed: 2
  files_created: 23
---

# Phase 01 Plan 02: Monorepo Scaffold + Tooling Summary

**One-liner:** npm-workspaces monorepo with 4 packages, TypeScript project references, Biome 1.8 linting, and shared core types (AuthUser, AuthProvider, Role, KpiSummary, CsvIngestionJobPayload).

## Tasks Completed

| # | Task | Status |
|---|------|--------|
| 1 | Root workspace configuration (package.json, tsconfig, biome, .nvmrc, .gitignore, .dockerignore, .editorconfig, .env.example) | Done |
| 2 | Workspace package stubs + logo placeholder (apps/api, apps/frontend, apps/worker, packages/core, assets) | Done |

## Files Created

**Root config (Task 1):**
- `package.json` — npm workspaces root, scripts: dev/build/test/lint/db:migrate
- `tsconfig.json` — base TS config, strict mode, composite, project references to core/api/worker
- `biome.json` — Biome 1.8 linter + formatter, double-quote style, 100-char line width
- `.nvmrc` — Node 22 pin
- `.gitignore` — node_modules, dist, .env, logs, docker data, editor files, test artifacts, Caddy data
- `.dockerignore` — dev artifacts excluded from Docker builds
- `.editorconfig` — utf-8, LF, 2-space indent, final newline
- `.env.example` — all required env vars with inline ASSUMPTION comments for IT

**Workspace stubs (Task 2):**
- `apps/api/package.json` — Fastify 5.8.4, ldapts, iron-session, drizzle-orm, pg, pino, zod
- `apps/api/tsconfig.json` — extends root, NodeNext module resolution
- `apps/frontend/package.json` — Vite 8.0.7, React 19.2.4, React Router 6, Tailwind, next-themes, lucide-react
- `apps/frontend/tsconfig.json` — ESNext/Bundler moduleResolution, react-jsx, DOM libs
- `apps/worker/package.json` — pino only (Phase 2 stub)
- `apps/worker/tsconfig.json` — extends root
- `apps/worker/src/index.ts` — Phase 2 CSV ingestion stub
- `packages/core/package.json` — TypeScript-only package, package exports for dist/index.js
- `packages/core/tsconfig.json` — extends root, composite build
- `packages/core/src/types/auth.ts` — Role, AuthUser, AuthProvider interface
- `packages/core/src/types/kpi.ts` — KpiSummary scaffold type
- `packages/core/src/types/job.ts` — CsvIngestionJobPayload scaffold type
- `packages/core/src/index.ts` — re-exports all public types
- `assets/acm-logo.svg` — blue circle with "ACM" text, canonical placeholder
- `assets/acm-logo.png` — 1×1 blue pixel PNG placeholder (68 bytes)

## Exit Criteria Verification

- [x] `npm install` from project root — 282 packages installed, zero errors
- [x] `npm run lint` exits 0 — Biome checked 17 files, no errors
- [x] `npm -w packages/core run build` exits 0 — dist/ folder created with index.js, index.d.ts
- [x] Node version >= 22 — v25.9.0 satisfies `>=22.0.0`
- [x] `assets/acm-logo.svg` exists — blue circle SVG, valid
- [x] `assets/acm-logo.png` exists — 68-byte 1×1 blue placeholder
- [x] `packages/core/src/types/auth.ts` exports Role, AuthUser, AuthProvider — confirmed

## Deviations from Plan

### Version Resolution Failures (Rule 1 - Bug)

**1. drizzle-kit version mismatch**
- **Found during:** Task 2 npm install
- **Issue:** Plan specified `drizzle-kit@^0.45.2` to match drizzle-orm, but drizzle-kit uses an independent versioning scheme. No 0.45.x versions exist for drizzle-kit; latest stable is 0.31.10.
- **Fix:** Changed `apps/api/package.json` devDependency to `"drizzle-kit": "^0.31.10"`
- **Files modified:** `apps/api/package.json`
- **Impact:** drizzle-kit 0.31.10 is compatible with drizzle-orm 0.45.x (same team, API stable)

**2. iron-session version does not exist**
- **Found during:** Task 2 npm install
- **Issue:** Plan specified `iron-session@^8.4.0` but latest stable is `8.0.4`. No 8.4.x release exists.
- **Fix:** Changed to `"iron-session": "^8.0.4"` — latest stable with identical API
- **Files modified:** `apps/api/package.json`

**3. ldapts-mock package does not exist on npm**
- **Found during:** Task 2 npm install
- **Issue:** Plan specified `ldapts-mock@^0.2.0` as a devDependency for API tests. The package is not published on npm (E404 on all versions).
- **Fix:** Removed the dependency entirely. Plan 5 (LDAP auth) will use Vitest's built-in `vi.mock()` to mock ldapts directly — no external mock library needed.
- **Files modified:** `apps/api/package.json`
- **Action required for Plan 5:** Use `vi.mock('ldapts', ...)` pattern instead of ldapts-mock

### Biome Formatting Normalization (Rule 1 - Formatting)

- **Found during:** Task 2 lint verification
- **Issue:** Files written with single quotes and multi-line array formatting failed Biome format check
- **Fix:** Ran `npm run lint:fix` to auto-apply safe formatting; manually fixed `process.env['LOG_LEVEL']` → `process.env.LOG_LEVEL` (Biome `useLiteralKeys` rule)
- **Files modified:** package.json, apps/api/tsconfig.json, apps/frontend/tsconfig.json, apps/worker/tsconfig.json, apps/worker/src/index.ts, packages/core/src/index.ts, packages/core/src/types/auth.ts, packages/core/src/types/kpi.ts

## Known Stubs

| File | Description | Future Plan |
|------|-------------|-------------|
| `apps/worker/src/index.ts` | Logs one line, no CSV processing | Plan (Phase 2) |
| `apps/api/package.json` | No src/ files yet | Plan 04 (api-skeleton) |
| `apps/frontend/package.json` | No src/ files yet | Plan 06 (frontend-shell) |
| `packages/core/src/types/kpi.ts` | KpiSummary scaffold only | Phase 3 (KPI routes) |
| `packages/core/src/types/job.ts` | CsvIngestionJobPayload scaffold only | Phase 2 (worker) |
| `assets/acm-logo.png` | 1×1 pixel placeholder | Replace with real ACM logo from IT |

These stubs are intentional and expected at this scaffolding stage — they are explicitly called out in the plan.

## Commit

- `5579bdd` — `feat(01): scaffold monorepo workspaces, Biome config, core types, logo placeholder`

## Self-Check: PASSED

Files verified:
- `package.json` — FOUND
- `tsconfig.json` — FOUND
- `biome.json` — FOUND
- `apps/api/package.json` — FOUND
- `apps/frontend/package.json` — FOUND
- `apps/worker/src/index.ts` — FOUND
- `packages/core/dist/index.js` — FOUND (build succeeded)
- `packages/core/src/types/auth.ts` — FOUND
- `assets/acm-logo.svg` — FOUND
- `assets/acm-logo.png` — FOUND (68 bytes)

Commit `5579bdd` verified in git log.
