---
phase: "01"
plan: "03"
subsystem: database
tags: [postgresql, drizzle-orm, drizzle-kit, migrations, seed, docker-compose]
dependency_graph:
  requires: [02-monorepo-scaffold]
  provides: [db-schema, migration-runner, drizzle-instance, checkDbConnection, docker-compose-postgres]
  affects: [04-api-skeleton, 05-ldap-auth, 06-frontend-shell, 07-caddy-compose]
tech_stack:
  added: []
  patterns: [drizzle-orm node-postgres, drizzle-kit migrations, pg Pool singleton]
key_files:
  created:
    - apps/api/src/db/schema.ts
    - apps/api/src/db/index.ts
    - apps/api/src/db/migrate.ts
    - apps/api/src/db/seed.ts
    - apps/api/drizzle.config.ts
    - apps/api/drizzle/0000_init_schema.sql
    - apps/api/drizzle/meta/_journal.json
    - apps/api/drizzle/meta/0000_snapshot.json
    - docker-compose.yml
  modified:
    - apps/api/package.json
decisions:
  - "Replaced hand-written 0000 SQL with drizzle-kit generated output to keep schema/migration in sync"
  - "docker-compose.yml created at project root as minimal postgres:16-alpine service; Plan 07 will add Caddy + full stack"
  - "Migration journal restructured to single entry 0000_init_schema after drizzle-kit generate confirmed no-diff"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-08"
  tasks_completed: 2
  files_created: 9
---

# Phase 01 Plan 03: PostgreSQL + Drizzle ORM Schema + Migrations + Dev Seed Summary

**One-liner:** Drizzle ORM schema for users/sessions/imports/stock_rows with drizzle-kit generated migration, pg Pool singleton, migration runner callable at startup, dev seed, and minimal docker-compose postgres service.

## Tasks Completed

| # | Task | Status |
|---|------|--------|
| 1 | Drizzle schema + drizzle-kit config + db connection + migrate script | Done |
| 2 | Migration SQL (drizzle-kit generated) + dev seed + docker-compose.yml | Done |

## Files Created

**Database layer (Task 1):**
- `apps/api/src/db/schema.ts` — pgTable definitions: `users` (id, ldap_dn, username, email, role, timestamps), `sessions` (placeholder, phase 2+), `imports` (audit log with status/error/operator), `stock_rows` (placeholder, phase 2 full schema)
- `apps/api/src/db/index.ts` — pg Pool singleton (max:10, timeouts), drizzle instance with schema, `checkDbConnection()` for `/healthz`
- `apps/api/src/db/migrate.ts` — `runMigrations()` using drizzle-orm migrator; also executable directly via `npm -w apps/api run db:migrate`
- `apps/api/drizzle.config.ts` — drizzle-kit config (dialect: postgresql, schema: ./src/db/schema.ts, out: ./drizzle)

**Migrations + seed (Task 2):**
- `apps/api/drizzle/0000_init_schema.sql` — drizzle-kit generated SQL: CREATE TABLE for all 4 tables + FK constraints + 4 indexes
- `apps/api/drizzle/meta/_journal.json` — migration journal with single entry (0000_init_schema)
- `apps/api/drizzle/meta/0000_snapshot.json` — drizzle-kit schema snapshot (used for diff detection)
- `apps/api/src/db/seed.ts` — upserts test.viewer (Viewer) + test.admin (Admin) via `onConflictDoUpdate`; refuses to run in NODE_ENV=production
- `docker-compose.yml` — `postgres:16-alpine` service with healthcheck, volume, port 5432; Plan 07 will extend with Caddy + API + worker

**Modified:**
- `apps/api/package.json` — replaced `db:migrate: drizzle-kit push` with `tsx src/db/migrate.ts`; added `db:generate`, `db:studio`

## Exit Criteria Verification

- [x] `docker-compose.yml` created with postgres:16-alpine and healthcheck — Docker not installed on this machine (see Docker Gate below); file structure verified
- [x] `npm -w apps/api run db:generate` exits 0 — confirmed "No schema changes, nothing to migrate" after restructuring journal
- [x] Drizzle TypeScript types infer correctly — `tsc --noEmit` exits 0; runtime smoke test confirms schema columns (id, ldapDn, username, email, role, createdAt, updatedAt)
- [x] `apps/api/drizzle/0000_init_schema.sql` contains CREATE TABLE for all 4 tables with indexes and FK constraints
- [x] `npm run lint` exits 0 — Biome checked 24 files, no errors
- [ ] `docker compose up postgres -d` + `npm -w apps/api run db:migrate` — BLOCKED: Docker not installed on build machine (see Docker Gate)
- [ ] Dev seed runs + inserts 2 rows — BLOCKED same as above (seed script is correct; blocked by Docker gate)

## Docker Gate

**Docker Desktop is not installed** on this development machine. The exit criteria requiring a live Postgres container (migration run, table verification, seed verification) cannot be completed locally.

**Action required:** On a machine with Docker installed (or when Docker Desktop is installed here):
```bash
cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro"
docker compose up postgres -d
until docker compose exec postgres pg_isready -U postgres 2>/dev/null; do sleep 1; done
DATABASE_URL=postgresql://postgres:changeme_secure_password_here@localhost:5432/acm_kpi \
  npm -w apps/api run db:migrate
# Expected: "Migrations complete"
docker compose exec postgres psql -U postgres -d acm_kpi \
  -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"
DATABASE_URL=postgresql://postgres:changeme_secure_password_here@localhost:5432/acm_kpi \
  NODE_ENV=development tsx apps/api/src/db/seed.ts
```

All other non-Docker exit criteria pass. The schema, migration files, and runner are structurally correct and verified via drizzle-kit's own tooling.

## Deviations from Plan

### 1. [Rule 2 - Missing Critical File] docker-compose.yml created by this plan

- **Found during:** Task 2 — plan references `docker compose up postgres -d` but no docker-compose.yml existed
- **Issue:** Plan 02 (monorepo scaffold) did not create docker-compose.yml. Plan 07 is described as "Caddy + Compose + TLS" but the postgres service was needed for this plan's exit criteria and for Plan 04 (api-skeleton) development.
- **Fix:** Created minimal `docker-compose.yml` at project root with only the `postgres:16-alpine` service + health check + named volume. Plan 07 will extend with Caddy, API, worker services.
- **Files created:** `docker-compose.yml`

### 2. [Rule 1 - Bug] Hand-written 0000 SQL replaced with drizzle-kit generated output

- **Found during:** Task 2 — after writing hand-written SQL and running `db:generate`, drizzle-kit created a second migration (0001) because the hand-written SQL differed from what drizzle introspects
- **Issue:** drizzle-kit's migrator tracks schema state via snapshots. A hand-written SQL file without a matching snapshot causes drizzle-kit to detect drift and generate new migrations.
- **Fix:** Ran `db:generate` to let drizzle-kit produce the authoritative SQL + snapshot; moved those to `0000_init_schema`; deleted the generated `0001` artifact; updated `_journal.json` to single entry. Verified with a second `db:generate` run: "No schema changes, nothing to migrate."
- **Impact:** The final SQL is functionally equivalent (same tables, same constraints, same indexes) but uses drizzle-kit's exact syntax with `-->statement-breakpoint` markers and `USING btree` index qualifiers.

### 3. [Rule 1 - Bug] Biome lint: node: protocol + import sort + JSON formatting

- **Found during:** Task 1 lint verification
- **Issue:** `migrate.ts` used `import path from "path"` and `import { fileURLToPath } from "url"` — Biome requires `node:path` and `node:url` protocols. Also import sort order and JSON array formatting in snapshot.
- **Fix:** `npm run lint:fix` + `--unsafe` flag applied all safe and node-protocol fixes automatically. Snapshot JSON reformatted by Biome.
- **Files modified:** `apps/api/src/db/migrate.ts`, `apps/api/drizzle/meta/0000_snapshot.json`

## Known Stubs

| File | Description | Future Plan |
|------|-------------|-------------|
| `apps/api/src/db/schema.ts` — `stockRows` | Minimal columns only (article_number, warehouse, quantity, value); full LagBes schema | Phase 2 (CSV ingestion) |
| `apps/api/src/db/schema.ts` — `sessions` | Table scaffolded but never written to in Phase 1; iron-session uses sealed cookies | Phase 2+ (server-side sessions) |

## Commit

- `32be971` — `feat(01): add Drizzle schema (users, imports, stock_rows), drizzle-kit config, dev seed`

## Self-Check: PASSED

Files verified:
- `apps/api/src/db/schema.ts` — FOUND
- `apps/api/src/db/index.ts` — FOUND
- `apps/api/src/db/migrate.ts` — FOUND
- `apps/api/src/db/seed.ts` — FOUND
- `apps/api/drizzle.config.ts` — FOUND
- `apps/api/drizzle/0000_init_schema.sql` — FOUND (drizzle-kit generated)
- `apps/api/drizzle/meta/_journal.json` — FOUND
- `apps/api/drizzle/meta/0000_snapshot.json` — FOUND
- `docker-compose.yml` — FOUND
- `apps/api/package.json` — db:migrate/db:generate/db:studio scripts added

Commit `32be971` verified in git log.
