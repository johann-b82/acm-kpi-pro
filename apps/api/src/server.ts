import fastifyCookie from "@fastify/cookie";
import fastifyMultipart from "@fastify/multipart";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { checkDbConnection } from "./db/index.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerUploadRoutes } from "./routes/upload.js";
import { registerKpiRoutes } from "./kpi/routes.js";
import { LDAPService } from "./services/ldap.service.js";

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

  // Register cookie plugin (required by iron-session)
  await server.register(fastifyCookie);

  // Register multipart plugin — required by POST /api/v1/upload (Phase 4).
  // fileSize 10 MB per UP-07; files:1 enforces single-file upload at the plugin
  // level so the upload handler never has to deal with multi-file payloads.
  await server.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });

  // ─── Services ─────────────────────────────────────────────────────────────

  const ldapService = new LDAPService(config);

  // Decorate server with ldapService so /healthz can call ping()
  server.decorate("ldapService", ldapService);

  // ─── Routes ───────────────────────────────────────────────────────────────

  // Health check — DB connectivity + LDAP reachability (OBS-02)
  server.get("/api/v1/healthz", async (_request, reply) => {
    const dbConnected = await checkDbConnection();

    // Call ldapService.ping() via the decorated server reference (always present after Plan 5)
    const ldapSvc = server.ldapService;
    const ldapReachable = ldapSvc ? await ldapSvc.ping() : false;

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

  // Auth routes: /login, /logout, /me (AUTH-01, AUTH-03, AUTH-06)
  await registerAuthRoutes(server, config, ldapService);

  // Admin routes: /admin/ping and future admin endpoints (AUTH-04)
  await registerAdminRoutes(server, config);

  // KPI routes: /api/v1/kpi/summary, /api/v1/kpi/articles, /api/v1/kpi/meta (Phase 3)
  await registerKpiRoutes(server, config);

  // Upload route: POST /api/v1/upload (Phase 4 — UP-07, IN-02)
  await registerUploadRoutes(server, config);

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

// Augment FastifyInstance to allow injecting the ldapService
declare module "fastify" {
  interface FastifyInstance {
    ldapService?: { ping(): Promise<boolean> };
  }
}
