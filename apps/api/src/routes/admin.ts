import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { requireRole } from "../middleware/rbac.js";

/**
 * Admin-only routes.
 * In Phase 1, these routes exist solely to prove role enforcement works.
 * (AUTH-04)
 */
export async function registerAdminRoutes(
  server: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  /**
   * GET /api/v1/admin/ping
   * Returns 200 for Admin, 403 for Viewer, 401 for unauthenticated.
   * This is the Phase 1 sentinel for role enforcement.
   */
  server.get(
    "/api/v1/admin/ping",
    { preHandler: requireRole("Admin", config) },
    async (_request, reply) => {
      reply.send({ message: "Admin access confirmed", ts: new Date().toISOString() });
    },
  );
}
