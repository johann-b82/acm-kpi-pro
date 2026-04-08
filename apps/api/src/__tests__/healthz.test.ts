import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../config.js";
import { createServer } from "../server.js";

// Mock DB connection to avoid needing a real Postgres in unit tests
vi.mock("../db/index.js", () => ({
  checkDbConnection: vi.fn().mockResolvedValue(true),
  pool: { end: vi.fn() },
  db: {},
}));

// Mock LDAPService to avoid real AD connections
vi.mock("../services/ldap.service.js", () => ({
  LDAPService: vi.fn().mockImplementation(() => ({
    ping: vi.fn().mockResolvedValue(true),
    authenticate: vi.fn(),
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

describe("GET /api/v1/healthz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with db_connected:true when DB is healthy", async () => {
    const server = await createServer(testConfig);
    const res = await server.inject({ method: "GET", url: "/api/v1/healthz" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string; db_connected: boolean; ldap_reachable: boolean }>();
    expect(body.status).toBe("ok");
    expect(body.db_connected).toBe(true);
    expect(typeof body.ldap_reachable).toBe("boolean");
    await server.close();
  });

  it("returns 503 when DB is unreachable", async () => {
    const { checkDbConnection } = await import("../db/index.js");
    vi.mocked(checkDbConnection).mockResolvedValueOnce(false);
    const server = await createServer(testConfig);
    const res = await server.inject({ method: "GET", url: "/api/v1/healthz" });
    expect(res.statusCode).toBe(503);
    const body = res.json<{ status: string }>();
    expect(body.status).toBe("degraded");
    await server.close();
  });
});

describe("GET /api/v1/auth/me", () => {
  it("returns 401 when no session cookie is present", async () => {
    const server = await createServer(testConfig);
    const res = await server.inject({ method: "GET", url: "/api/v1/auth/me" });
    expect(res.statusCode).toBe(401);
    await server.close();
  });
});

describe("Error handler", () => {
  it("returns 404 for unknown routes", async () => {
    const server = await createServer(testConfig);
    const res = await server.inject({ method: "GET", url: "/does-not-exist" });
    expect(res.statusCode).toBe(404);
    await server.close();
  });
});
