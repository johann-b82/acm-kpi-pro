# Phase 04 — Deferred Items

Out-of-scope issues discovered during Phase 04 execution. Not fixed here per
SCOPE BOUNDARY rule; tracked for a later cleanup plan.

## From 04-01-api-endpoint

Discovered during `npm -w apps/api run build` (post-implementation typecheck).
None of these files were touched by this plan; all errors pre-date phase 04.

- `src/__tests__/ldap.service.test.ts` — 13 TS2740 errors: test mocks for
  `ldapts` `Client` are missing 28+ internal properties. The mocks use a
  minimal `{ bind, unbind, search }` shape which satisfies runtime usage but
  fails structural assignment under `strict` + newer `ldapts` typings.
- `src/services/ldap.service.ts` — 6 errors (1× TS2379 tlsOptions optional,
  5× TS18048 `userEntry` possibly undefined). Pre-existing narrowing gaps.
- `src/ingest/__tests__/atomicity.test.ts` — TS2307 cannot find
  `../../../db/index.js` (path depth off by one) and TS2532 possibly undefined.
- `src/ingest/__tests__/mv-refresh.test.ts` — TS2307 cannot find
  `../../../db/index.js`.

**Why not fixed here:** These files are not on the `files_modified` list of
plan 04-01 and none of them reference upload/multipart/helpers work. Fixing
them would balloon the plan scope. Vitest execution (which is what CI actually
runs) passes because vitest uses its own resolver and the test files are
skipped / not imported by the upload route tests.
