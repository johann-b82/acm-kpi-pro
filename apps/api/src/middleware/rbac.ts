import type { Role } from "@acm-kpi/core";
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import type { AppConfig } from "../config.js";
import { getSession } from "../session.js";

/**
 * RBAC middleware factory — returns a Fastify preHandler that enforces
 * minimum required role. Use as a route-level preHandler option.
 *
 * Usage:
 *   server.get('/api/v1/admin/ping', { preHandler: requireRole('Admin', config) }, handler)
 *
 * (AUTH-04, AUTH-06)
 */
export function requireRole(minimumRole: Role, config: AppConfig): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await getSession(request, reply, config);

    // Not authenticated (AUTH-06)
    if (!session.user) {
      reply.code(401).send({ error: "Not authenticated" });
      return;
    }

    // Role check: Admin > Viewer
    const roleRank: Record<Role, number> = { Viewer: 1, Admin: 2 };
    if (roleRank[session.user.role] < roleRank[minimumRole]) {
      reply.code(403).send({ error: "Insufficient permissions" });
      return;
    }
  };
}

/**
 * Convenience: middleware that just requires any authenticated user.
 */
export function requireAuth(config: AppConfig): preHandlerHookHandler {
  return requireRole("Viewer", config);
}
