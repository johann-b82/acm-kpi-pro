import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { LDAPService } from "../services/ldap.service.js";
import { getSession } from "../session.js";

const loginBodySchema = z.object({
  username: z.string().min(1).max(256),
  password: z.string().min(1).max(512),
});

export async function registerAuthRoutes(
  server: FastifyInstance,
  config: AppConfig,
  ldapService: LDAPService,
): Promise<void> {
  /**
   * POST /api/v1/auth/login
   * Validates credentials against AD, creates session, returns user.
   * (AUTH-01, AUTH-03)
   */
  server.post("/api/v1/auth/login", async (request, reply) => {
    const bodyResult = loginBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      reply.code(400).send({ error: "username and password are required" });
      return;
    }

    const { username, password } = bodyResult.data;

    try {
      const user = await ldapService.authenticate(username, password);

      const session = await getSession(request, reply, config);
      session.user = user;
      await session.save();

      // Never return password in response
      reply.code(200).send({ user: { username: user.username, role: user.role } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      // Log sanitized error (never log the password)
      server.log.warn({ username }, `Login failed: ${message}`);
      reply.code(401).send({ error: "Invalid credentials or unauthorized" });
    }
  });

  /**
   * POST /api/v1/auth/logout
   * Destroys the session cookie.
   * (AUTH-03)
   */
  server.post("/api/v1/auth/logout", async (request, reply) => {
    const session = await getSession(request, reply, config);
    session.destroy();
    reply.code(200).send({ success: true });
  });

  /**
   * GET /api/v1/auth/me
   * Returns the current user from session, or 401 if not authenticated.
   * Used by the React frontend's ProtectedRoute to check auth on load.
   * (AUTH-06)
   */
  server.get("/api/v1/auth/me", async (request, reply) => {
    const session = await getSession(request, reply, config);
    if (!session.user) {
      reply.code(401).send({ error: "Not authenticated" });
      return;
    }

    const dbUser = await db
      .select({ theme: users.theme, locale: users.locale })
      .from(users)
      .where(eq(users.username, session.user.username))
      .limit(1);

    const prefs = dbUser[0] ?? { theme: "system", locale: "de" };

    reply.send({
      username: session.user.username,
      role: session.user.role,
      loginAt: session.user.loginAt,
      theme: prefs.theme,
      locale: prefs.locale,
    });
  });
}
