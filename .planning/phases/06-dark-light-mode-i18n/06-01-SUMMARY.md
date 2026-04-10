---
phase: 06-dark-light-mode-i18n
plan: "01"
subsystem: api
tags: [fastify, drizzle, zod, postgres, preferences, theme, locale, i18n]

# Dependency graph
requires:
  - phase: 01-foundation-auth
    provides: users table schema, iron-session auth pattern, Fastify route registration pattern
  - phase: 05-smb-folder-watcher
    provides: server.ts wiring pattern for registerXRoutes
provides:
  - DB migration adding theme + locale columns to users table
  - PATCH /api/me/preferences endpoint with Zod validation and write-through persistence
  - GET /api/v1/auth/me extended with theme + locale from DB
  - UserPreferences, UpdatePreferencesBody, Theme, Locale types exported from @acm-kpi/core
affects: [06-02-frontend-theme, 06-03-frontend-i18n, plans depending on @acm-kpi/core types]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - PATCH route with Zod partial-schema validation (both fields optional)
    - DB lookup for preferences on GET /me (fallback to defaults if user not in DB)
    - Manual migration SQL (drizzle-kit bypassed — requires TTY)

key-files:
  created:
    - packages/core/src/user/preferences.ts
    - apps/api/drizzle/0003_add_user_preferences.sql
    - apps/api/src/routes/me.ts
  modified:
    - packages/core/src/index.ts
    - apps/api/src/db/schema.ts
    - apps/api/src/routes/auth.ts
    - apps/api/src/server.ts

key-decisions:
  - "AuthUser.username used as lookup key (not ldapDn) — AuthUser type has userId+username, not ldapDn field"
  - "Manual migration SQL written (drizzle-kit bypassed — same decision as Phase 02)"
  - "GET /me falls back to { theme: 'system', locale: 'de' } if user record not in DB (edge case: unauthenticated user)"

patterns-established:
  - "PATCH semantics: Zod partial schema + Object.keys check for at least one field"
  - "Preferences lookup on GET /me: .select({ theme, locale }).where(eq(users.username, ...)).limit(1)"

requirements-completed: [THEME-01, THEME-02, I18N-01, I18N-02]

# Metrics
duration: 15min
completed: 2026-04-10
---

# Phase 06 Plan 01: DB + API Backend for User Preferences Summary

**theme/locale columns added to users table via manual migration SQL; PATCH /api/me/preferences endpoint persists preferences via Zod-validated write-through; GET /me extended with DB-fetched theme+locale; UserPreferences DTO exported from @acm-kpi/core**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-10T07:28:00Z
- **Completed:** 2026-04-10T07:43:55Z
- **Tasks:** 2/2
- **Files modified:** 7

## Accomplishments
- Created `UserPreferences`, `UpdatePreferencesBody`, `Theme`, `Locale` types in `@acm-kpi/core` — shared DTO for frontend and backend
- Added `theme` (default 'system') and `locale` (default 'de') columns to users table with manual migration SQL
- Created `PATCH /api/me/preferences` route with Zod validation (partial update, requires at least one field, 401 guard)
- Extended `GET /api/v1/auth/me` to fetch and return theme + locale from DB, with fallback defaults

## Task Commits

Each task was committed atomically:

1. **Task 1: DB schema migration + UserPreferences DTO** - `9856098` (feat)
2. **Task 2: PATCH /api/me/preferences endpoint + extend GET /me** - `cfa1cc4` (feat)

## Files Created/Modified
- `packages/core/src/user/preferences.ts` - Theme, Locale, UserPreferences, UpdatePreferencesBody types
- `packages/core/src/index.ts` - Added export for user/preferences types
- `apps/api/src/db/schema.ts` - Added theme and locale columns to users table
- `apps/api/drizzle/0003_add_user_preferences.sql` - Migration SQL for new columns
- `apps/api/src/routes/me.ts` - New: registerMeRoutes with PATCH /api/me/preferences
- `apps/api/src/routes/auth.ts` - Extended GET /me to include theme+locale from DB
- `apps/api/src/server.ts` - Registered registerMeRoutes

## Decisions Made
- `AuthUser.username` used as DB lookup key for the WHERE clause — the `AuthUser` type in `@acm-kpi/core` has `userId` + `username` fields (no `ldapDn` field), so plan's suggested `ldapDn` fallback was adapted to use `username` directly
- Manual migration SQL written (drizzle-kit bypassed — requires TTY; consistent with Phase 02 decision)
- GET /me falls back to `{ theme: 'system', locale: 'de' }` if user not found in DB — handles edge cases gracefully

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PATCH endpoint uses username instead of ldapDn for DB lookup**
- **Found during:** Task 2 (reading AuthUser type definition)
- **Issue:** Plan suggested `eq(users.ldapDn, session.user.ldapDn ?? session.user.username)` but AuthUser has no `ldapDn` field — only `userId` and `username`
- **Fix:** Used `eq(users.username, session.user.username)` directly; this is the indexed, stable column used for the PATCH WHERE clause
- **Files modified:** apps/api/src/routes/me.ts
- **Verification:** tsc --noEmit passes with no new errors
- **Committed in:** `cfa1cc4` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — wrong field name from AuthUser)
**Impact on plan:** Necessary correctness fix; no scope change.

## Issues Encountered
None beyond the ldapDn field name discrepancy handled above.

## Next Phase Readiness
- Backend API is complete: migration SQL ready to apply, PATCH /api/me/preferences live, GET /me returns preferences
- Plans 06-02 (frontend theme) and 06-03 (frontend i18n) can now read/write preferences via the API
- Migration must be applied to the running DB before preferences will persist (ops step)

---
*Phase: 06-dark-light-mode-i18n*
*Completed: 2026-04-10*
