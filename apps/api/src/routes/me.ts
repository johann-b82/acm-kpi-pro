import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getSession } from "../session.js";

const updatePreferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  locale: z.enum(["de", "en"]).optional(),
});

export async function registerMeRoutes(
  server: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  /**
   * PATCH /api/me/preferences
   * Write-through preference persistence (D-05).
   * Requires authenticated session.
   */
  server.patch("/api/me/preferences", async (request, reply) => {
    const session = await getSession(request, reply, config);
    if (!session.user) {
      reply.code(401).send({ error: "Not authenticated" });
      return;
    }

    const bodyResult = updatePreferencesSchema.safeParse(request.body);
    if (!bodyResult.success) {
      reply.code(400).send({ error: "Invalid preferences body", details: bodyResult.error.flatten() });
      return;
    }

    const updates = bodyResult.data;
    if (Object.keys(updates).length === 0) {
      reply.code(400).send({ error: "No preference fields provided" });
      return;
    }

    // Update users table — username is the stable identifier from session
    const [updated] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.username, session.user.username))
      .returning({ id: users.id, username: users.username, role: users.role, theme: users.theme, locale: users.locale });

    if (!updated) {
      // User in session but not yet in DB (edge case: first login race)
      reply.code(404).send({ error: "User record not found" });
      return;
    }

    reply.send(updated);
  });
}
