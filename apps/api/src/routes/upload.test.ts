/**
 * Route-level tests for POST /api/v1/upload (Phase 4 Plan 01).
 *
 * Mocks:
 *   - db.select (concurrency guard + any incidental reads)
 *   - db.execute (getHeadlineKpis MV lookup)
 *   - ingestLagBesFile (captures call args; never touches the filesystem)
 *   - LDAPService.authenticate (used to obtain a real session cookie)
 *
 * Coverage in this plan:
 *   - admin_required: Viewer session → 403
 *   - concurrent_rejected: imports.status='running' row exists → 409
 *   - ingest_source: Admin upload → ingestLagBesFile invoked with source='upload'
 *
 * Not covered here (moved to plan 05 e2e or left as vi.todo):
 *   - file_too_large (exercise via real multipart body, plan 05)
 *   - success/failure response shapes (plan 05, with real fixture)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../config.js";
import { createServer } from "../server.js";

// ── Mocks (vi.mock is hoisted by vitest above imports) ──────────────────────

const mockSelect = vi.fn();
const mockExecute = vi.fn();

vi.mock("../db/index.js", () => ({
  checkDbConnection: vi.fn().mockResolvedValue(true),
  pool: { end: vi.fn() },
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}));

const mockIngest = vi.fn();
vi.mock("../ingest/index.js", () => ({
  ingestLagBesFile: (...args: unknown[]) => mockIngest(...args),
}));

// LDAP mock — supports both Viewer and Admin logins
vi.mock("../services/ldap.service.js", () => ({
  LDAPService: vi.fn().mockImplementation(() => ({
    ping: vi.fn().mockResolvedValue(true),
    authenticate: vi.fn().mockImplementation(async (username: string) => {
      if (username === "viewer") {
        return {
          userId: "cn=viewer,dc=acm,dc=local",
          username: "Viewer User",
          role: "Viewer",
          loginAt: new Date().toISOString(),
        };
      }
      if (username === "admin") {
        return {
          userId: "cn=admin,dc=acm,dc=local",
          username: "Admin User",
          role: "Admin",
          loginAt: new Date().toISOString(),
        };
      }
      throw new Error("Invalid credentials");
    }),
  })),
}));

// ── Test config ──────────────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

async function login(
  server: Awaited<ReturnType<typeof createServer>>,
  username: "viewer" | "admin",
): Promise<string> {
  const res = await server.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { username, password: "pass" },
  });
  return res.headers["set-cookie"] as string;
}

/**
 * Build a minimal multipart/form-data payload by hand so we do not need to
 * pull in a `form-data` dev-dep for a single integration test. Matches
 * RFC 7578 closely enough for @fastify/multipart to accept it.
 */
function makeMultipartPayload(
  filename: string,
  content: string,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = "----acm-kpi-test-boundary-0xCAFE";
  const crlf = "\r\n";
  const body =
    `--${boundary}${crlf}` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"${crlf}` +
    `Content-Type: text/csv${crlf}${crlf}` +
    `${content}${crlf}` +
    `--${boundary}--${crlf}`;
  const payload = Buffer.from(body, "utf8");
  return {
    payload,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(payload.length),
    },
  };
}

/**
 * Chainable select() mock — Drizzle: db.select().from(x).where(y).limit(n)
 * Accepts a final resolved value and returns a proxy that resolves to it when
 * awaited at the end of the chain.
 */
function makeSelectChain<T>(finalValue: T) {
  const chain: {
    from: () => typeof chain;
    where: () => typeof chain;
    limit: () => Promise<T>;
  } = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(finalValue),
  };
  return chain;
}

// Empty MV (first-import edge case) — used by default in tests
function mockEmptyMv() {
  mockExecute.mockResolvedValue({ rows: [] });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/v1/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmptyMv();
  });

  it("admin_required: returns 403 for Viewer role", async () => {
    const server = await createServer(testConfig);
    const cookie = await login(server, "viewer");

    // The RBAC preHandler runs BEFORE body parsing, so we do not send a
    // multipart body here — a 0-byte POST is sufficient to prove the role
    // gate rejects the request before reaching saveRequestFiles(). Sending
    // a real multipart payload would cause fastify.inject to hang waiting
    // for the stream to drain after preHandler short-circuits the response.
    mockSelect.mockReturnValue(makeSelectChain([]));

    const res = await server.inject({
      method: "POST",
      url: "/api/v1/upload",
      headers: {
        cookie,
        "content-type": "multipart/form-data; boundary=irrelevant",
        "content-length": "0",
      },
      payload: "",
    });

    expect(res.statusCode).toBe(403);
    expect(mockIngest).not.toHaveBeenCalled();
    await server.close();
  });

  it("concurrent_rejected: returns 409 when imports.status='running' row exists", async () => {
    const server = await createServer(testConfig);
    const cookie = await login(server, "admin");

    // Simulate an already-running import
    mockSelect.mockReturnValue(makeSelectChain([{ id: 42 }]));

    const { payload, headers } = makeMultipartPayload(
      "LagBes.csv",
      "artikelnr;typ\n123;ART\n",
    );

    const res = await server.inject({
      method: "POST",
      url: "/api/v1/upload",
      headers: { ...headers, cookie },
      payload,
    });

    expect(res.statusCode).toBe(409);
    const body = res.json<{ error: string }>();
    expect(body.error).toBe("ingest_already_running");
    expect(mockIngest).not.toHaveBeenCalled();
    await server.close();
  });

  it("ingest_source: calls ingestLagBesFile with source=upload and a temp tmpPath", async () => {
    const server = await createServer(testConfig);
    const cookie = await login(server, "admin");

    // No running import → proceed to ingest
    mockSelect.mockReturnValue(makeSelectChain([]));

    // ingest returns success with 10 rows
    mockIngest.mockResolvedValue({
      status: "success",
      filename: "LagBes.csv",
      rowsInserted: 10,
      errors: [],
      durationMs: 42,
      correlationId: "test-corr-id",
    });

    const { payload, headers } = makeMultipartPayload(
      "LagBes.csv",
      "artikelnr;typ\n123;ART\n",
    );

    const res = await server.inject({
      method: "POST",
      url: "/api/v1/upload",
      headers: { ...headers, cookie },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(mockIngest).toHaveBeenCalledTimes(1);
    const [tmpPath, source, opts] = mockIngest.mock.calls[0]!;
    expect(source).toBe("upload");
    expect(typeof tmpPath).toBe("string");
    expect(tmpPath.length).toBeGreaterThan(0);
    expect(opts).toMatchObject({ correlationId: expect.any(String) });

    const body = res.json<{ status: string; rowsInserted: number }>();
    expect(body.status).toBe("success");
    expect(body.rowsInserted).toBe(10);
    await server.close();
  });

  it.todo("file_too_large: returns 413 when body exceeds 10MB limit");
  it.todo(
    "success_response: returns UploadSuccessResponse with kpiDelta on valid file",
  );
  it.todo(
    "failure_response: returns UploadErrorResponse with errors[] on invalid file",
  );
});
