# Plan 3: PostgreSQL + Drizzle + Minimal Schema

**Phase:** 1 — Foundation & Auth
**Depends on:** Plan 2 (monorepo scaffold) — needs workspace package.json + tsconfig references
**Can run in parallel with:** Plan 6 (frontend shell) — no shared files
**Requirements covered:** (Database foundation for AUTH-03 sessions, OBS-02 imports table; schema enables all other plans)

## Goal

After this plan commits, the project has a PostgreSQL 16 service definition (for docker-compose), a Drizzle ORM schema defining `users`, `imports`, and a placeholder `stock_rows` table, and a drizzle-kit migration that creates those tables on a live DB. A dev seed script inserts a test user row (LDAP DN + role) for local development. Running `docker compose up postgres` and then `npm -w apps/api run db:migrate` creates the schema cleanly.

## Assumptions (flag for IT)

- **ASSUMPTION:** PostgreSQL 16-alpine image is accessible from the build machine (requires internet for first pull; cached on subsequent runs). For fully air-gapped environments, IT must mirror `postgres:16-alpine` to an internal registry and update the `image:` field in docker-compose.yml.
- **ASSUMPTION:** The `sessions` table is scaffolded here but iron-session in Phase 1 uses sealed cookies (no DB-backed sessions). The `sessions` table is available if Phase 2+ requires persistent session tracking.

## Tasks

### Task 1: Drizzle schema + drizzle-kit config

**Files to create:**
- `apps/api/src/db/schema.ts` — Drizzle table definitions
- `apps/api/src/db/index.ts` — PostgreSQL connection pool (re-exported for all routes)
- `apps/api/drizzle.config.ts` — drizzle-kit configuration
- `apps/api/src/db/migrate.ts` — migration runner script (called on container startup)

**Action:**

Create `apps/api/src/db/schema.ts`:
```typescript
import { pgTable, serial, text, integer, numeric, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * users — one row per authenticated LDAP user who has ever logged in.
 * Role is synced from AD group membership on each login (not stored long-term;
 * this table is audit/display only in Phase 1).
 */
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  ldapDn: text('ldap_dn').unique().notNull(),
  username: text('username').notNull(),
  email: text('email'),
  role: text('role').notNull().default('Viewer'), // 'Viewer' | 'Admin'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * sessions — placeholder for server-side session tracking (Phase 2+).
 * Phase 1 uses iron-session (sealed cookies); this table is not written to.
 */
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * imports — append-only audit log for every import attempt.
 * Written by Phase 2 ingestion. Phase 1 scaffolds the table.
 */
export const imports = pgTable(
  'imports',
  {
    id: serial('id').primaryKey(),
    filename: text('filename').notNull(),
    rowCount: integer('row_count'),
    status: text('status').notNull().default('pending'), // 'pending'|'success'|'failed'
    errorMessage: text('error_message'),
    operator: text('operator'), // username; NULL = automated watcher
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index('idx_imports_status').on(t.status),
    createdAtIdx: index('idx_imports_created_at').on(t.createdAt),
  })
);

/**
 * stock_rows — placeholder (full schema implemented in Phase 2).
 * Exists here so Phase 1 healthz can verify the table is present.
 */
export const stockRows = pgTable(
  'stock_rows',
  {
    id: serial('id').primaryKey(),
    importId: integer('import_id').references(() => imports.id),
    articleNumber: text('article_number'),
    warehouse: text('warehouse'),
    quantity: numeric('quantity', { precision: 18, scale: 4 }),
    value: numeric('value', { precision: 18, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    importIdx: index('idx_stock_rows_import').on(t.importId),
    articleIdx: index('idx_stock_rows_article').on(t.articleNumber),
  })
);
```

Create `apps/api/src/db/index.ts`:
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Singleton pool — shared across all route handlers.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  // Log pool errors without crashing the process.
  // The individual query will fail and the route error handler will catch it.
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

export const db = drizzle(pool, { schema });

/**
 * Check database connectivity — used by /healthz endpoint.
 * Returns true if a simple query succeeds; false on error.
 */
export async function checkDbConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
```

Create `apps/api/drizzle.config.ts`:
```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:dev@localhost:5432/acm_kpi',
  },
  verbose: true,
  strict: true,
} satisfies Config;
```

Create `apps/api/src/db/migrate.ts` (run at container startup before the Fastify server starts):
```typescript
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run all pending drizzle-kit migrations.
 * Called once at startup. Safe to re-run (idempotent).
 */
export async function runMigrations(): Promise<void> {
  const migrationsFolder = path.resolve(__dirname, '../../drizzle');
  console.log(`Running migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log('Migrations complete');
}

// If invoked directly (npm run db:migrate), run and exit.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => pool.end())
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
```

Update `apps/api/package.json` scripts section to include:
```json
"db:migrate": "tsx src/db/migrate.ts",
"db:generate": "drizzle-kit generate",
"db:studio": "drizzle-kit studio"
```

### Task 2: Initial migration SQL + dev seed

**Files to create:**
- `apps/api/drizzle/0000_init_schema.sql` — hand-written initial migration (drizzle-kit push also works but this gives a reviewable SQL artifact)
- `apps/api/src/db/seed.ts` — dev seed (inserts test Viewer + test Admin row; runs only in development)

**Action:**

Generate the initial migration SQL by running:
```bash
cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro"
# Start a temporary Postgres for schema generation only
docker compose up postgres -d
# Wait for postgres to be healthy (pg_isready)
until docker compose exec postgres pg_isready -U postgres 2>/dev/null; do sleep 1; done
# Run drizzle-kit generate to produce migration files
DATABASE_URL=postgresql://postgres:changeme_secure_password_here@localhost:5432/acm_kpi \
  npm -w apps/api run db:generate
# Then push to verify
DATABASE_URL=postgresql://postgres:changeme_secure_password_here@localhost:5432/acm_kpi \
  npm -w apps/api run db:migrate
```

If drizzle-kit generate is not yet available (first run), manually create `apps/api/drizzle/0000_init_schema.sql` matching the schema defined in Task 1:
```sql
-- drizzle-kit generated migration: 0000_init_schema
CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "ldap_dn" text NOT NULL UNIQUE,
  "username" text NOT NULL,
  "email" text,
  "role" text NOT NULL DEFAULT 'Viewer',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "imports" (
  "id" serial PRIMARY KEY NOT NULL,
  "filename" text NOT NULL,
  "row_count" integer,
  "status" text NOT NULL DEFAULT 'pending',
  "error_message" text,
  "operator" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_imports_status" ON "imports" ("status");
CREATE INDEX IF NOT EXISTS "idx_imports_created_at" ON "imports" ("created_at");

CREATE TABLE IF NOT EXISTS "stock_rows" (
  "id" serial PRIMARY KEY NOT NULL,
  "import_id" integer REFERENCES "imports"("id"),
  "article_number" text,
  "warehouse" text,
  "quantity" numeric(18, 4),
  "value" numeric(18, 2),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_stock_rows_import" ON "stock_rows" ("import_id");
CREATE INDEX IF NOT EXISTS "idx_stock_rows_article" ON "stock_rows" ("article_number");
```

Create `apps/api/src/db/seed.ts`:
```typescript
/**
 * Dev seed — inserts test users for local development.
 * Run with: DATABASE_URL=... tsx src/db/seed.ts
 * NEVER run in production (guarded by NODE_ENV check).
 */
import { db, pool } from './index.js';
import { users } from './schema.js';

if (process.env.NODE_ENV === 'production') {
  console.error('seed.ts: refusing to run in production');
  process.exit(1);
}

async function seed(): Promise<void> {
  console.log('Seeding development data...');

  // Upsert test users (safe to re-run)
  await db
    .insert(users)
    .values([
      {
        ldapDn: 'cn=test.viewer,ou=users,dc=acm,dc=local',
        username: 'test.viewer',
        email: 'viewer@acm.local',
        role: 'Viewer',
      },
      {
        ldapDn: 'cn=test.admin,ou=users,dc=acm,dc=local',
        username: 'test.admin',
        email: 'admin@acm.local',
        role: 'Admin',
      },
    ])
    .onConflictDoUpdate({
      target: users.ldapDn,
      set: { updatedAt: new Date() },
    });

  console.log('Seed complete: test.viewer (Viewer) + test.admin (Admin) upserted');
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
```

## Files Touched

- `apps/api/src/db/schema.ts` — created (Drizzle table definitions)
- `apps/api/src/db/index.ts` — created (pg Pool + drizzle instance + checkDbConnection)
- `apps/api/src/db/migrate.ts` — created (migration runner)
- `apps/api/src/db/seed.ts` — created (dev seed)
- `apps/api/drizzle.config.ts` — created (drizzle-kit config)
- `apps/api/drizzle/0000_init_schema.sql` — created (initial migration SQL)
- `apps/api/package.json` — modified (add db:migrate, db:generate, db:studio scripts)

## Exit Criteria

- [ ] `docker compose up postgres -d` starts PostgreSQL 16 without errors
- [ ] `docker compose exec postgres pg_isready -U postgres` exits 0 within 15 seconds
- [ ] `npm -w apps/api run db:migrate` (with correct DATABASE_URL) exits 0
- [ ] After migration, all four tables exist: `select tablename from pg_tables where schemaname='public'` returns `users`, `sessions`, `imports`, `stock_rows`
- [ ] Drizzle TypeScript types infer correctly: `typeof users.$inferSelect` has `ldapDn: string`, `role: string`, `createdAt: Date`
- [ ] Dev seed runs without errors and inserts/upserts 2 rows in `users`

## Verification

```bash
cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro"

# Start postgres only
docker compose up postgres -d

# Wait for ready
until docker compose exec postgres pg_isready -U postgres 2>/dev/null; do
  echo "Waiting for postgres..."; sleep 2
done
echo "Postgres ready"

# Run migration
DATABASE_URL=postgresql://postgres:changeme_secure_password_here@localhost:5432/acm_kpi \
  npm -w apps/api run db:migrate
# Expected: "Migrations complete"

# Verify tables
docker compose exec postgres psql -U postgres -d acm_kpi \
  -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"
# Expected output:
#  tablename
# -----------
#  imports
#  sessions
#  stock_rows
#  users
# (4 rows)

# Run seed in dev mode
DATABASE_URL=postgresql://postgres:changeme_secure_password_here@localhost:5432/acm_kpi \
  NODE_ENV=development tsx apps/api/src/db/seed.ts
# Expected: "Seed complete: test.viewer (Viewer) + test.admin (Admin) upserted"

# Verify seed data
docker compose exec postgres psql -U postgres -d acm_kpi \
  -c "SELECT username, role FROM users;"
# Expected:
#   username   |  role
# -------------+--------
#  test.viewer | Viewer
#  test.admin  | Admin

# Teardown
docker compose down
```

## Commit

```
feat(01): add Drizzle schema (users, imports, stock_rows), drizzle-kit config, dev seed
```
