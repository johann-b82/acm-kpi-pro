import type { AuthUser } from "@acm-kpi/core";
import type { FastifyReply, FastifyRequest } from "fastify";
import { type IronSession, type SessionOptions, getIronSession } from "iron-session";
import type { AppConfig } from "./config.js";

export interface SessionData {
  user?: AuthUser;
}

export function getSessionOptions(config: AppConfig): SessionOptions {
  return {
    password: config.SESSION_SECRET,
    cookieName: "acm_session",
    cookieOptions: {
      secure: config.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 8 * 60 * 60, // 8 hours in seconds
      path: "/",
    },
  };
}

/**
 * Helper: get typed iron-session from a Fastify request/reply pair.
 * Uses the raw Node.js IncomingMessage and ServerResponse objects
 * that iron-session v8 expects.
 */
export async function getSession(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(request.raw, reply.raw, getSessionOptions(config));
}
