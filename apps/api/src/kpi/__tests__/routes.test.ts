/**
 * Route-level tests for the KPI endpoints (Plan 03-05).
 *
 * All DB access is mocked — no real Postgres required.
 * Auth is tested via the real iron-session path (login → cookie → protected route).
 *
 * Test coverage:
 *   - GET /api/v1/kpi/summary: 401 without auth, empty state, data state, color thresholds
 *   - GET /api/v1/kpi/articles: 400 bad params, 200 with mocked rows, stockout filter
 *   - GET /api/v1/kpi/meta: 200 with 4 arrays
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../config.js";
import { createServer } from "../../server.js";

// ── Mock DB ─────────────────────────────────────────────────────────────────
// We need fine-grained control over each query result, so we set up individual
// mocks for each DB method used in routes.ts.

const mockFindFirst = vi.fn();
const mockExecute = vi.fn();
const mockSelect = vi.fn();
const mockSelectDistinct = vi.fn();

vi.mock("../../db/index.js", () => ({
  checkDbConnection: vi.fn().mockResolvedValue(true),
  pool: { end: vi.fn() },
  db: {
    query: {
      imports: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
    execute: (...args: unknown[]) => mockExecute(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    selectDistinct: (...args: unknown[]) => mockSelectDistinct(...args),
  },
}));

// Mock LDAP service for the login path used to get an auth cookie
vi.mock("../../services/ldap.service.js", () => ({
  LDAPService: vi.fn().mockImplementation(() => ({
    ping: vi.fn().mockResolvedValue(true),
    authenticate: vi.fn().mockImplementation(async (username: string, password: string) => {
      if (username === "viewer" && password === "pass") {
        return {
          userId: "cn=viewer,dc=acm,dc=local",
          username: "Viewer User",
          role: "Viewer",
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
  WATCHER_ENABLED: false,
  WATCHER_SHARE_PATH: undefined,
  WATCHER_FILE_PATTERN: "LagBes*",
  WATCHER_POLL_INTERVAL_MS: 5000,
  WATCHER_STABILITY_WINDOW_MS: 1000,
  WATCHER_BUSY_WAIT_MAX_RETRIES: 5,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Login and return the Set-Cookie header string for subsequent requests. */
async function loginAndGetCookie(server: Awaited<ReturnType<typeof createServer>>): Promise<string> {
  const loginRes = await server.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { username: "viewer", password: "pass" },
  });
  return loginRes.headers["set-cookie"] as string;
}

/** A realistic MV row (from kpi_dashboard_data) */
function makeMvRow(overrides: { days_on_hand?: number; stockout_count?: number; dead_pct?: number } = {}) {
  return {
    total_value_eur: "1000000.00",
    days_on_hand: String(overrides.days_on_hand ?? 60),
    slow_dead_stock: {
      dead: { pct: overrides.dead_pct ?? 3, count: 10, value_eur: 30000 },
      active: { count: 200, value_eur: 800000, pct: 80 },
      slow: { count: 50, value_eur: 170000, pct: 17 },
      clutter_count: 15,
      samples_count: 5,
    },
    stockouts: {
      count: overrides.stockout_count ?? 0,
      items_preview: [],
    },
    abc_distribution: {
      a: { count: 50, value_eur: 700000 },
      b: { count: 100, value_eur: 200000 },
      c: { count: 200, value_eur: 100000 },
    },
    inventory_turnover: "4.2",
    devaluation: { total_eur: 15000, pct_of_value: 1.5 },
  };
}

function makeLastImport() {
  return {
    id: 1,
    filename: "LagBes-20260408.csv",
    rowCount: 1234,
    status: "success",
    source: "cli",
    finishedAt: new Date("2026-04-08T12:34:56Z"),
    createdAt: new Date("2026-04-08T12:00:00Z"),
    updatedAt: new Date("2026-04-08T12:34:56Z"),
    errorMessage: null,
    operator: null,
    startedAt: new Date("2026-04-08T12:00:00Z"),
  };
}

// ── Auth guard tests ─────────────────────────────────────────────────────────

describe("GET /api/v1/kpi/summary — auth", () => {
  it("returns 401 without a session cookie", async () => {
    const server = await createServer(testConfig);
    const res = await server.inject({ method: "GET", url: "/api/v1/kpi/summary" });
    expect(res.statusCode).toBe(401);
    await server.close();
  });
});

describe("GET /api/v1/kpi/articles — auth", () => {
  it("returns 401 without a session cookie", async () => {
    const server = await createServer(testConfig);
    const res = await server.inject({ method: "GET", url: "/api/v1/kpi/articles" });
    expect(res.statusCode).toBe(401);
    await server.close();
  });
});

describe("GET /api/v1/kpi/meta — auth", () => {
  it("returns 401 without a session cookie", async () => {
    const server = await createServer(testConfig);
    const res = await server.inject({ method: "GET", url: "/api/v1/kpi/meta" });
    expect(res.statusCode).toBe(401);
    await server.close();
  });
});

// ── GET /summary — empty state ───────────────────────────────────────────────

describe("GET /api/v1/kpi/summary — empty state (no successful imports)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No successful import found
    mockFindFirst.mockResolvedValue(undefined);
  });

  it("returns 200 with has_data: false", async () => {
    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);

    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/summary",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ has_data: boolean }>();
    expect(body.has_data).toBe(false);
    await server.close();
  });

  it("returns zeros and neutral colors in empty state", async () => {
    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);

    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/summary",
      headers: { cookie },
    });

    const body = res.json<{
      total_inventory_value: { value_eur: number; color: string };
      days_on_hand: { days: number; color: string };
      stockouts: { count: number; color: string };
    }>();
    expect(body.total_inventory_value.value_eur).toBe(0);
    expect(body.total_inventory_value.color).toBe("neutral");
    expect(body.days_on_hand.days).toBe(0);
    expect(body.days_on_hand.color).toBe("neutral");
    expect(body.stockouts.count).toBe(0);
    await server.close();
  });
});

// ── GET /summary — with data ─────────────────────────────────────────────────

describe("GET /api/v1/kpi/summary — with data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with has_data: true when a successful import exists", async () => {
    mockFindFirst.mockResolvedValue(makeLastImport());
    mockExecute.mockResolvedValue({ rows: [makeMvRow()] });

    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);

    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/summary",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ has_data: boolean }>();
    expect(body.has_data).toBe(true);
    await server.close();
  });

  it("returns computed colors for days_on_hand", async () => {
    mockFindFirst.mockResolvedValue(makeLastImport());
    mockExecute.mockResolvedValue({ rows: [makeMvRow({ days_on_hand: 95 })] });

    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);

    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/summary",
      headers: { cookie },
    });

    const body = res.json<{ days_on_hand: { days: number; color: string } }>();
    expect(body.days_on_hand.color).toBe("green");
    expect(body.days_on_hand.days).toBe(95);
    await server.close();
  });

  it("returns yellow for 45 days on hand", async () => {
    mockFindFirst.mockResolvedValue(makeLastImport());
    mockExecute.mockResolvedValue({ rows: [makeMvRow({ days_on_hand: 45 })] });

    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/summary",
      headers: { cookie },
    });
    const body = res.json<{ days_on_hand: { color: string } }>();
    expect(body.days_on_hand.color).toBe("yellow");
    await server.close();
  });

  it("returns red for 20 days on hand", async () => {
    mockFindFirst.mockResolvedValue(makeLastImport());
    mockExecute.mockResolvedValue({ rows: [makeMvRow({ days_on_hand: 20 })] });

    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/summary",
      headers: { cookie },
    });
    const body = res.json<{ days_on_hand: { color: string } }>();
    expect(body.days_on_hand.color).toBe("red");
    await server.close();
  });

  it("returns green for 0 stockouts", async () => {
    mockFindFirst.mockResolvedValue(makeLastImport());
    mockExecute.mockResolvedValue({ rows: [makeMvRow({ stockout_count: 0 })] });

    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/summary",
      headers: { cookie },
    });
    const body = res.json<{ stockouts: { color: string } }>();
    expect(body.stockouts.color).toBe("green");
    await server.close();
  });

  it("returns yellow for 5 stockouts", async () => {
    mockFindFirst.mockResolvedValue(makeLastImport());
    mockExecute.mockResolvedValue({ rows: [makeMvRow({ stockout_count: 5 })] });

    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/summary",
      headers: { cookie },
    });
    const body = res.json<{ stockouts: { color: string } }>();
    expect(body.stockouts.color).toBe("yellow");
    await server.close();
  });

  it("returns red for 15 stockouts", async () => {
    mockFindFirst.mockResolvedValue(makeLastImport());
    mockExecute.mockResolvedValue({ rows: [makeMvRow({ stockout_count: 15 })] });

    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/summary",
      headers: { cookie },
    });
    const body = res.json<{ stockouts: { color: string } }>();
    expect(body.stockouts.color).toBe("red");
    await server.close();
  });

  it("returns green for 3% dead stock share", async () => {
    mockFindFirst.mockResolvedValue(makeLastImport());
    mockExecute.mockResolvedValue({ rows: [makeMvRow({ dead_pct: 3 })] });

    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/summary",
      headers: { cookie },
    });
    const body = res.json<{ slow_dead_stock: { color: string } }>();
    expect(body.slow_dead_stock.color).toBe("green");
    await server.close();
  });

  it("returns yellow for 10% dead stock share", async () => {
    mockFindFirst.mockResolvedValue(makeLastImport());
    mockExecute.mockResolvedValue({ rows: [makeMvRow({ dead_pct: 10 })] });

    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/summary",
      headers: { cookie },
    });
    const body = res.json<{ slow_dead_stock: { color: string } }>();
    expect(body.slow_dead_stock.color).toBe("yellow");
    await server.close();
  });

  it("returns red for 20% dead stock share", async () => {
    mockFindFirst.mockResolvedValue(makeLastImport());
    mockExecute.mockResolvedValue({ rows: [makeMvRow({ dead_pct: 20 })] });

    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/summary",
      headers: { cookie },
    });
    const body = res.json<{ slow_dead_stock: { color: string } }>();
    expect(body.slow_dead_stock.color).toBe("red");
    await server.close();
  });

  it("returns last_import metadata", async () => {
    mockFindFirst.mockResolvedValue(makeLastImport());
    mockExecute.mockResolvedValue({ rows: [makeMvRow()] });

    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/summary",
      headers: { cookie },
    });
    const body = res.json<{
      last_import: { filename: string; row_count: number; source: string } | null;
    }>();
    expect(body.last_import).not.toBeNull();
    expect(body.last_import?.filename).toBe("LagBes-20260408.csv");
    expect(body.last_import?.row_count).toBe(1234);
    expect(body.last_import?.source).toBe("cli");
    await server.close();
  });
});

// ── GET /articles — validation ───────────────────────────────────────────────

describe("GET /api/v1/kpi/articles — query validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return empty result set (validation tests return 400, so mock is rarely reached)
    mockSelect.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      const promise = Promise.resolve([{ count: 0 }]);
      chain.then = promise.then.bind(promise);
      chain.catch = promise.catch.bind(promise);
      chain.finally = promise.finally.bind(promise);
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      chain.offset = vi.fn().mockResolvedValue([]);
      return chain;
    });
  });

  it("returns 400 for invalid filter enum value", async () => {
    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/articles?filter=invalid_value",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it("returns 400 for non-numeric limit", async () => {
    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/articles?limit=abc",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it("returns 400 for limit over 1000", async () => {
    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/articles?limit=1001",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });
});

describe("GET /api/v1/kpi/articles — data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with total and items array", async () => {
    // Mock count query: select().from().where() → [{ count: 1 }]
    // Mock items query: select().from().where().orderBy().limit().offset() → [row]
    const mockItems = [
      {
        id: 1,
        artikelnr: "ART001",
        bezeichnung_1: "Test Article",
        typ: "ART",
        lagername: "LAGER-01",
        bestand_basiseinheit: 100,
        einh: "ST",
        wert_mit_abw: 5000,
        letzt_zugang: "2026-01-01",
        lagerabgang_dat: "2026-03-01",
        abc_kennz_vk: "A",
      },
    ];

    let selectCallCount = 0;
    mockSelect.mockImplementation(() => {
      selectCallCount++;
      const isCountQuery = selectCallCount === 1;
      const result = isCountQuery ? [{ count: 1 }] : mockItems;
      // Build a Promise-like chain. All methods return `this` (same chain object).
      // The chain itself is awaitable (thenable) with the expected result.
      // This supports both:
      //   COUNT query:  await select().from().where()
      //   ITEMS query:  await select().from().where().orderBy().limit().offset()
      const chain: Record<string, unknown> = {};
      const promise = Promise.resolve(result);
      chain.then = promise.then.bind(promise);
      chain.catch = promise.catch.bind(promise);
      chain.finally = promise.finally.bind(promise);
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);   // return same chain (no recursion)
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      chain.offset = vi.fn().mockResolvedValue(result); // items query ends here
      return chain;
    });

    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/articles?limit=10&offset=0",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ total: number; items: unknown[] }>();
    expect(typeof body.total).toBe("number");
    expect(Array.isArray(body.items)).toBe(true);
    await server.close();
  });

  it("filter=stockout executes successfully and returns items array", async () => {
    let selectCallCount = 0;
    mockSelect.mockImplementation(() => {
      selectCallCount++;
      const isCountQuery = selectCallCount === 1;
      const result = isCountQuery ? [{ count: 0 }] : [];
      const chain: Record<string, unknown> = {};
      const promise = Promise.resolve(result);
      chain.then = promise.then.bind(promise);
      chain.catch = promise.catch.bind(promise);
      chain.finally = promise.finally.bind(promise);
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      chain.offset = vi.fn().mockResolvedValue(result);
      return chain;
    });

    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/articles?filter=stockout",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ total: number; items: unknown[] }>();
    expect(body.total).toBe(0);
    expect(body.items).toHaveLength(0);
    await server.close();
  });
});

// ── GET /meta ────────────────────────────────────────────────────────────────

describe("GET /api/v1/kpi/meta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with 4 arrays", async () => {
    // selectDistinct chain: .from().where().orderBy() → array
    let distinctCallCount = 0;
    mockSelectDistinct.mockImplementation(() => {
      distinctCallCount++;
      const warehouseCall = distinctCallCount === 1;
      const chainable = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(
          warehouseCall
            ? [{ lagername: "LAGER-01" }, { lagername: "LAGER-02" }]
            : [{ wgr: "10" }, { wgr: "20" }],
        ),
      };
      return chainable;
    });

    const server = await createServer(testConfig);
    const cookie = await loginAndGetCookie(server);
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/kpi/meta",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      warehouses: string[];
      product_groups: string[];
      abc_classes: string[];
      article_types: string[];
    }>();
    expect(Array.isArray(body.warehouses)).toBe(true);
    expect(Array.isArray(body.product_groups)).toBe(true);
    expect(Array.isArray(body.abc_classes)).toBe(true);
    expect(Array.isArray(body.article_types)).toBe(true);
    expect(body.warehouses).toEqual(["LAGER-01", "LAGER-02"]);
    expect(body.abc_classes).toEqual(["A", "B", "C"]);
    expect(body.article_types).toEqual(["ART", "MAT", "HLB", "WKZ"]);
    await server.close();
  });
});
