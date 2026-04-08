import fastifyCookie from "@fastify/cookie";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { checkDbConnection } from "./db/index.js";

/**
 * Create and configure the Fastify instance.
 * Separated from index.ts for testability (can be imported in tests).
 */
export async function createServer(config: AppConfig): Promise<FastifyInstance> {
  const server = Fastify({
    // Pino accepts `transport` at the top level; FastifyLoggerOptions types don't fully
    // expose it, so we use `as` to pass pino-pretty in development only.
    logger:
      config.NODE_ENV === "development"
        ? ({
            level: config.LOG_LEVEL,
            transport: { target: "pino-pretty", options: { colorize: true } },
          } as Parameters<typeof Fastify>[0]["logger"])
        : { level: config.LOG_LEVEL },
    disableRequestLogging: false,
  });

  // Register cookie plugin (required by iron-session — added in Plan 5)
  await server.register(fastifyCookie);

  // ─── Routes ───────────────────────────────────────────────────────────────

  // Health check — DB connectivity + LDAP reachability (OBS-02)
  server.get("/api/v1/healthz", async (_request, reply) => {
    const dbConnected = await checkDbConnection();

    // LDAP reachability check is wired in Plan 5; stub returns false until then.
    // This is honest: if the LDAP service is not yet initialized, we report false.
    const ldapService = server.ldapService;
    const ldapReachable = ldapService ? await ldapService.ping() : false;

    const healthy = dbConnected;

    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? "ok" : "degraded",
      db_connected: dbConnected,
      ldap_reachable: ldapReachable,
      // last_ingest_ts is populated in Phase 2 from the imports table
      last_ingest_ts: null,
      ts: new Date().toISOString(),
    });
  });

  // Auth routes placeholder — implemented fully in Plan 5
  server.get("/api/v1/auth/me", async (_request, reply) => {
    // Returns 401 until iron-session middleware is added in Plan 5
    return reply.code(401).send({ error: "Not authenticated" });
  });

  // ─── Global error handler ─────────────────────────────────────────────────
  server.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    server.log.error({ err: error }, "Unhandled error");

    // Never leak stack traces or internal messages to clients
    const statusCode = error.statusCode ?? 500;
    const message = statusCode < 500 ? (error.message ?? "Bad request") : "Internal server error";

    return reply.code(statusCode).send({ error: message });
  });

  // ─── 404 handler ──────────────────────────────────────────────────────────
  server.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: "Not found" });
  });

  return server;
}

// Augment FastifyInstance to allow injecting the ldapService in Plan 5
declare module "fastify" {
  interface FastifyInstance {
    ldapService?: { ping(): Promise<boolean> };
  }
}
