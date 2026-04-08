# Plan 4: Fastify API Skeleton

**Phase:** 1 — Foundation & Auth
**Depends on:** Plan 3 (postgres-drizzle) — needs `apps/api/src/db/index.ts` + schema types
**Can run in parallel with:** Plan 6 (frontend shell) — no shared files
**Requirements covered:** OBS-02 (/healthz endpoint)

## Goal

After this plan commits, the Fastify API starts cleanly with `npm -w apps/api run dev` and exposes four working endpoints: `GET /api/v1/healthz` (reports DB connectivity + LDAP reachability placeholder), `GET /api/v1/me` (returns 401 stub until auth is wired in Plan 5), a Pino structured-JSON logger, a Zod-validated config loader that fails fast on missing env vars, a global error handler that never leaks stack traces to clients, and graceful shutdown on SIGTERM/SIGINT. No LDAP auth yet — that is Plan 5's scope.

## Assumptions (flag for IT)

- **ASSUMPTION:** `API_PORT` defaults to 3000. Caddy (Plan 7) proxies `:443 → api:3000` on the internal Docker network.
- **ASSUMPTION:** `LDAP_URL` is in `.env` but the healthz endpoint will report `ldap_reachable: false` until Plan 5 wires the real ldapts check. This is acceptable — healthz is the first thing operators check, and showing `false` is honest.

## Tasks

### Task 1: Config loader + Fastify server entry

**Files to create:**
- `apps/api/src/config.ts` — Zod schema for all environment variables; fails fast at startup if required vars are missing
- `apps/api/src/server.ts` — Fastify instance factory (not the entry point; factory pattern for testability)
- `apps/api/src/index.ts` — entry point: loads config, runs migrations, starts server, hooks shutdown

**Action:**

Create `apps/api/src/config.ts`:
```typescript
import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),

  // LDAP — required at startup to fail fast before docker compose looks healthy
  LDAP_URL: z.string().min(1),
  LDAP_BIND_DN: z.string().min(1),
  LDAP_BIND_PASSWORD: z.string().min(1),
  LDAP_USER_SEARCH_BASE: z.string().min(1),
  LDAP_GROUP_SEARCH_BASE: z.string().min(1),
  LDAP_VIEWER_GROUP_DN: z.string().min(1),
  LDAP_ADMIN_GROUP_DN: z.string().min(1),

  // LDAP Security (SEC-03)
  // LDAP_TLS=true → use LDAPS (preferred)
  // LDAP_TLS=false → plain LDAP (opt-in fallback; startup warning logged)
  LDAP_TLS: z
    .string()
    .transform((v) => v.toLowerCase() !== 'false')
    .default('true'),
  LDAP_SKIP_CERT_CHECK: z
    .string()
    .transform((v) => v.toLowerCase() === 'true')
    .default('false'),

  // Session
  SESSION_SECRET: z.string().min(32),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppConfig = z.infer<typeof configSchema>;

let _config: AppConfig | null = null;

/**
 * Load and validate config from process.env.
 * Throws a descriptive ZodError if any required variable is missing or invalid.
 * Call once at startup; subsequent calls return the cached result.
 */
export function loadConfig(): AppConfig {
  if (_config) return _config;

  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid or missing environment variables:');
    result.error.issues.forEach((issue) => {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }

  _config = result.data;

  // SEC-03: warn loudly if running without TLS
  if (!_config.LDAP_TLS) {
    console.warn(
      '[SECURITY WARNING] LDAP_TLS=false — connecting to LDAP without TLS. ' +
        'Enable LDAPS in production (set LDAP_TLS=true).'
    );
  }

  return _config;
}
```

Create `apps/api/src/server.ts`:
```typescript
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import type { AppConfig } from './config.js';
import { checkDbConnection } from './db/index.js';

/**
 * Create and configure the Fastify instance.
 * Separated from index.ts for testability (can be imported in tests).
 */
export async function createServer(config: AppConfig): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // Structured JSON logging (OBS-01: JSON to stdout → Docker captures + rotates)
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    // Disable X-Powered-By equivalent — Fastify doesn't set it by default
    disableRequestLogging: false,
  });

  // Register cookie plugin (required by iron-session — added in Plan 5)
  await server.register(fastifyCookie);

  // ─── Routes ───────────────────────────────────────────────────────────────

  // Health check — DB connectivity + LDAP reachability (OBS-02)
  server.get('/api/v1/healthz', async (_request, reply) => {
    const dbConnected = await checkDbConnection();

    // LDAP reachability check is wired in Plan 5; stub returns false until then.
    // This is honest: if the LDAP service is not yet initialized, we report false.
    const ldapReachable = server.ldapService ? await server.ldapService.ping() : false;

    const healthy = dbConnected;

    reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'degraded',
      db_connected: dbConnected,
      ldap_reachable: ldapReachable,
      // last_ingest_ts is populated in Phase 2 from the imports table
      last_ingest_ts: null,
      ts: new Date().toISOString(),
    });
  });

  // Auth routes placeholder — implemented fully in Plan 5
  server.get('/api/v1/auth/me', async (_request, reply) => {
    // Returns 401 until iron-session middleware is added in Plan 5
    reply.code(401).send({ error: 'Not authenticated' });
  });

  // ─── Global error handler ─────────────────────────────────────────────────
  server.setErrorHandler((error, _request, reply) => {
    server.log.error({ err: error }, 'Unhandled error');

    // Never leak stack traces or internal messages to clients
    const statusCode = error.statusCode ?? 500;
    const message =
      statusCode < 500
        ? error.message
        : 'Internal server error';

    reply.code(statusCode).send({ error: message });
  });

  // ─── 404 handler ──────────────────────────────────────────────────────────
  server.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: 'Not found' });
  });

  return server;
}

// Augment FastifyInstance to allow injecting the ldapService in Plan 5
declare module 'fastify' {
  interface FastifyInstance {
    ldapService?: { ping(): Promise<boolean> };
  }
}
```

Create `apps/api/src/index.ts`:
```typescript
import { loadConfig } from './config.js';
import { createServer } from './server.js';
import { runMigrations } from './db/migrate.js';
import { pool } from './db/index.js';

async function main(): Promise<void> {
  const config = loadConfig();

  // Run database migrations before accepting traffic
  await runMigrations();

  const server = await createServer(config);

  // Graceful shutdown (PITFALL #9: containers must drain in-flight requests)
  const shutdown = async (signal: string): Promise<void> => {
    server.log.info(`Received ${signal}, shutting down gracefully...`);
    await server.close();
    await pool.end();
    server.log.info('Server and DB pool closed. Exiting.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await server.listen({ port: config.API_PORT, host: '0.0.0.0' });
  server.log.info(`API listening on 0.0.0.0:${config.API_PORT}`);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
```

### Task 2: Fastify tests for /healthz and error handler

**Files to create:**
- `apps/api/src/__tests__/healthz.test.ts` — unit tests for health endpoint

**Action:**

Create `apps/api/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
});
```

Create `apps/api/src/__tests__/healthz.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServer } from '../server.js';
import type { AppConfig } from '../config.js';

// Mock DB connection to avoid needing a real Postgres in unit tests
vi.mock('../db/index.js', () => ({
  checkDbConnection: vi.fn().mockResolvedValue(true),
  pool: { end: vi.fn() },
  db: {},
}));

const testConfig: AppConfig = {
  NODE_ENV: 'test',
  API_PORT: 3000,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  LDAP_URL: 'ldaps://test.local:636',
  LDAP_BIND_DN: 'cn=svc,dc=test,dc=local',
  LDAP_BIND_PASSWORD: 'test',
  LDAP_USER_SEARCH_BASE: 'ou=users,dc=test,dc=local',
  LDAP_GROUP_SEARCH_BASE: 'ou=groups,dc=test,dc=local',
  LDAP_VIEWER_GROUP_DN: 'cn=viewers,dc=test,dc=local',
  LDAP_ADMIN_GROUP_DN: 'cn=admins,dc=test,dc=local',
  LDAP_TLS: true,
  LDAP_SKIP_CERT_CHECK: false,
  SESSION_SECRET: 'test-secret-32-chars-long-minimum!!',
  LOG_LEVEL: 'silent',
};

describe('GET /api/v1/healthz', () => {
  it('returns 200 with db_connected:true when DB is healthy', async () => {
    const server = await createServer(testConfig);
    const res = await server.inject({ method: 'GET', url: '/api/v1/healthz' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string; db_connected: boolean; ldap_reachable: boolean }>();
    expect(body.status).toBe('ok');
    expect(body.db_connected).toBe(true);
    expect(typeof body.ldap_reachable).toBe('boolean');
    await server.close();
  });

  it('returns 503 when DB is unreachable', async () => {
    const { checkDbConnection } = await import('../db/index.js');
    vi.mocked(checkDbConnection).mockResolvedValueOnce(false);
    const server = await createServer(testConfig);
    const res = await server.inject({ method: 'GET', url: '/api/v1/healthz' });
    expect(res.statusCode).toBe(503);
    const body = res.json<{ status: string }>();
    expect(body.status).toBe('degraded');
    await server.close();
  });
});

describe('GET /api/v1/auth/me (stub)', () => {
  it('returns 401 before auth middleware is registered', async () => {
    const server = await createServer(testConfig);
    const res = await server.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(res.statusCode).toBe(401);
    await server.close();
  });
});

describe('Error handler', () => {
  it('returns 404 for unknown routes', async () => {
    const server = await createServer(testConfig);
    const res = await server.inject({ method: 'GET', url: '/does-not-exist' });
    expect(res.statusCode).toBe(404);
    await server.close();
  });
});
```

## Files Touched

- `apps/api/src/config.ts` — created (Zod env config)
- `apps/api/src/server.ts` — created (Fastify factory with /healthz)
- `apps/api/src/index.ts` — created (entry point with graceful shutdown)
- `apps/api/src/__tests__/healthz.test.ts` — created (unit tests)
- `apps/api/vitest.config.ts` — created

## Exit Criteria

- [ ] `npm -w apps/api run test` passes all tests (3 test cases)
- [ ] `npm -w apps/api run dev` (with valid `.env`) starts server: `API listening on 0.0.0.0:3000` in logs
- [ ] `curl http://localhost:3000/api/v1/healthz` returns `{"status":"ok","db_connected":true,"ldap_reachable":false,...}` when Postgres is running
- [ ] `curl http://localhost:3000/api/v1/healthz` returns HTTP 503 when Postgres is down
- [ ] `curl http://localhost:3000/api/v1/auth/me` returns `{"error":"Not authenticated"}` with HTTP 401
- [ ] `curl http://localhost:3000/nonexistent` returns `{"error":"Not found"}` with HTTP 404
- [ ] Starting the server without DATABASE_URL exits with a descriptive error listing missing env vars
- [ ] Log output is structured JSON (not plaintext) when `NODE_ENV=production`

## Verification

```bash
cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro"

# Install api workspace deps
npm install

# Run unit tests (no real DB needed — DB is mocked)
npm -w apps/api run test
# Expected: all tests pass, exit 0

# Start postgres for integration check
docker compose up postgres -d
until docker compose exec postgres pg_isready -U postgres 2>/dev/null; do sleep 1; done

# Copy env file and fill required values
cp .env.example .env
# Edit .env: set DB_PASSWORD, SESSION_SECRET, LDAP_* values

# Start API in dev mode
npm -w apps/api run dev &
sleep 3

# Health check — DB connected
curl -s http://localhost:3000/api/v1/healthz | python3 -m json.tool
# Expected: {"status":"ok","db_connected":true,"ldap_reachable":false,...}

# Auth stub
curl -s http://localhost:3000/api/v1/auth/me
# Expected: {"error":"Not authenticated"} with 401

# 404
curl -s http://localhost:3000/nonexistent
# Expected: {"error":"Not found"} with 404

# Stop
kill %1
docker compose down
```

## Commit

```
feat(01): add Fastify skeleton (/healthz, /me stub, Zod config, pino logger, graceful shutdown)
```
