import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../config.js";
import { createServer } from "../server.js";

// Mock DB to avoid needing real Postgres
vi.mock("../db/index.js", () => ({
  checkDbConnection: vi.fn().mockResolvedValue(true),
  pool: { end: vi.fn() },
  db: {},
}));

// Mock the LDAPService so tests don't need a real AD server.
// This tests the route layer; ldap.service.ts has its own test (see ldap.service.test.ts).
vi.mock("../services/ldap.service.js", () => ({
  LDAPService: vi.fn().mockImplementation(() => ({
    ping: vi.fn().mockResolvedValue(true),
    authenticate: vi.fn().mockImplementation(async (username: string, password: string) => {
      if (username === "admin.user" && password === "correct-password") {
        return {
          userId: "cn=admin.user,ou=users,dc=acm,dc=local",
          username: "Admin User",
          role: "Admin",
          loginAt: new Date().toISOString(),
        };
      }
      if (username === "viewer.user" && password === "correct-password") {
        return {
          userId: "cn=viewer.user,ou=users,dc=acm,dc=local",
          username: "Viewer User",
          role: "Viewer",
          loginAt: new Date().toISOString(),
        };
      }
      throw new Error("Invalid credentials");
    }),
  })),
}));

const testConfig: AppConfig = {
  NODE_ENV: "test",
  API_PORT: 3000,
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  LDAP_URL: "ldaps://test.local:636",
  LDAP_BIND_DN: "cn=svc,dc=test,dc=local",
  LDAP_BIND_PASSWORD: "test",
  LDAP_USER_SEARCH_BASE: "ou=users,dc=test,dc=local",
  LDAP_GROUP_SEARCH_BASE: "ou=groups,dc=test,dc=local",
  LDAP_VIEWER_GROUP_DN: "cn=viewers,dc=test,dc=local",
  LDAP_ADMIN_GROUP_DN: "cn=admins,dc=test,dc=local",
  LDAP_TLS: true,
  LDAP_SKIP_CERT_CHECK: false,
  SESSION_SECRET: "test-secret-32-chars-long-minimum!!",
  LOG_LEVEL: "silent",
};

describe("POST /api/v1/auth/login", () => {
  it("returns 200 and sets cookie on valid admin credentials", async () => {
    const server = await createServer(testConfig);
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "admin.user", password: "correct-password" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
    const body = res.json<{ user: { username: string; role: string } }>();
    expect(body.user.role).toBe("Admin");
    await server.close();
  });

  it("returns 200 with role:Viewer for viewer credentials", async () => {
    const server = await createServer(testConfig);
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "viewer.user", password: "correct-password" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ user: { role: string } }>();
    expect(body.user.role).toBe("Viewer");
    await server.close();
  });

  it("returns 401 on invalid credentials", async () => {
    const server = await createServer(testConfig);
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "admin.user", password: "wrong" },
    });
    expect(res.statusCode).toBe(401);
    await server.close();
  });

  it("returns 400 when username is missing", async () => {
    const server = await createServer(testConfig);
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { password: "test" },
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });
});

describe("GET /api/v1/auth/me", () => {
  it("returns 401 when not authenticated", async () => {
    const server = await createServer(testConfig);
    const res = await server.inject({ method: "GET", url: "/api/v1/auth/me" });
    expect(res.statusCode).toBe(401);
    await server.close();
  });
});

describe("GET /api/v1/admin/ping — role enforcement", () => {
  it("returns 401 when not authenticated", async () => {
    const server = await createServer(testConfig);
    const res = await server.inject({ method: "GET", url: "/api/v1/admin/ping" });
    expect(res.statusCode).toBe(401);
    await server.close();
  });

  it("returns 200 for Admin role after login", async () => {
    const server = await createServer(testConfig);
    // Login first to get session cookie
    const loginRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "admin.user", password: "correct-password" },
    });
    const cookie = loginRes.headers["set-cookie"] as string;

    const pingRes = await server.inject({
      method: "GET",
      url: "/api/v1/admin/ping",
      headers: { cookie },
    });
    expect(pingRes.statusCode).toBe(200);
    await server.close();
  });

  it("returns 403 for Viewer role after login", async () => {
    const server = await createServer(testConfig);
    const loginRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "viewer.user", password: "correct-password" },
    });
    const cookie = loginRes.headers["set-cookie"] as string;

    const pingRes = await server.inject({
      method: "GET",
      url: "/api/v1/admin/ping",
      headers: { cookie },
    });
    expect(pingRes.statusCode).toBe(403);
    await server.close();
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("returns 200 and clears session", async () => {
    const server = await createServer(testConfig);
    // Login
    const loginRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "admin.user", password: "correct-password" },
    });
    const loginCookie = loginRes.headers["set-cookie"] as string;

    // Logout — iron-session destroy() sends a Set-Cookie with maxAge=0
    // to tell the browser to delete the cookie. The old sealed cookie
    // is a stateless sealed token; "logout" is client-side expiry.
    const logoutRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { cookie: loginCookie },
    });
    expect(logoutRes.statusCode).toBe(200);

    // Use the cookie from the logout response (the expired/empty session cookie
    // that iron-session sends to clear the browser's cookie jar).
    // This simulates what a real browser would do after receiving Set-Cookie with maxAge=0.
    const clearedCookie = logoutRes.headers["set-cookie"] as string;

    // /me with the cleared cookie returns 401
    const meRes = await server.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { cookie: clearedCookie },
    });
    expect(meRes.statusCode).toBe(401);

    await server.close();
  });
});
