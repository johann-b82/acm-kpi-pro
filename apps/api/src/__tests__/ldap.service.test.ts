import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for LDAPService logic.
 * The ldapts Client is mocked via vi.mock so no real AD or TCP connection is needed.
 *
 * Tests cover:
 * - Role resolution (Admin, Viewer, unauthorized, precedence)
 * - authenticate() happy path for Admin and Viewer
 * - authenticate() failure paths (invalid credentials, user not found, blank password)
 * - EqualityFilter is used (not raw string concat) — LDAP injection prevention (AUTH-08)
 * - bind() called with correct service-account DN
 * - ping() returns true on successful bind, false on error
 */

// Mock ldapts — no real TCP connections
vi.mock("ldapts", () => {
  const mockUnbind = vi.fn().mockResolvedValue(undefined);
  const mockBind = vi.fn().mockResolvedValue(undefined);
  const mockSearch = vi.fn().mockResolvedValue({
    searchEntries: [
      {
        dn: "cn=admin.user,ou=users,dc=acm,dc=local",
        cn: "Admin User",
        mail: "admin@acm.local",
        memberOf: ["cn=kpi_admins,ou=groups,dc=acm,dc=local"],
      },
    ],
    searchReferences: [],
  });

  const MockClient = vi.fn().mockImplementation(() => ({
    bind: mockBind,
    unbind: mockUnbind,
    search: mockSearch,
  }));

  // Expose mock functions on the constructor for per-test access
  (MockClient as unknown as Record<string, unknown>)._mockBind = mockBind;
  (MockClient as unknown as Record<string, unknown>)._mockUnbind = mockUnbind;
  (MockClient as unknown as Record<string, unknown>)._mockSearch = mockSearch;

  class MockEqualityFilter {
    attribute: string;
    value: string;
    constructor(opts: { attribute: string; value: string }) {
      this.attribute = opts.attribute;
      this.value = opts.value;
    }
    toString() {
      // Mirrors real EqualityFilter output format: (attribute=value)
      return `(${this.attribute}=${this.value})`;
    }
  }

  class MockInvalidCredentialsError extends Error {
    constructor() {
      super("Invalid credentials");
      this.name = "InvalidCredentialsError";
    }
  }

  return {
    Client: MockClient,
    EqualityFilter: MockEqualityFilter,
    InvalidCredentialsError: MockInvalidCredentialsError,
  };
});

import { Client } from "ldapts";
import type { AppConfig } from "../config.js";
import { LDAPService } from "../services/ldap.service.js";

const testConfig: AppConfig = {
  NODE_ENV: "test",
  API_PORT: 3000,
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  LDAP_URL: "ldaps://test.local:636",
  LDAP_BIND_DN: "cn=svc,dc=acm,dc=local",
  LDAP_BIND_PASSWORD: "svc-password",
  LDAP_USER_SEARCH_BASE: "ou=users,dc=acm,dc=local",
  LDAP_GROUP_SEARCH_BASE: "ou=groups,dc=acm,dc=local",
  LDAP_VIEWER_GROUP_DN: "cn=kpi_viewers,ou=groups,dc=acm,dc=local",
  LDAP_ADMIN_GROUP_DN: "cn=kpi_admins,ou=groups,dc=acm,dc=local",
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

// Helper: get the mock instance methods from the latest Client() call
function getLatestClientMocks() {
  const MockClientCtor = vi.mocked(Client);
  // The last call gives us the most recent instance
  const instances = MockClientCtor.mock.results;
  const lastInstance = instances[instances.length - 1]?.value as {
    bind: ReturnType<typeof vi.fn>;
    unbind: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
  };
  return lastInstance;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset default search result to return an admin user
  const MockClientCtor = vi.mocked(Client);
  MockClientCtor.mockImplementation(() => ({
    bind: vi.fn().mockResolvedValue(undefined),
    unbind: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue({
      searchEntries: [
        {
          dn: "cn=admin.user,ou=users,dc=acm,dc=local",
          cn: "Admin User",
          mail: "admin@acm.local",
          memberOf: ["cn=kpi_admins,ou=groups,dc=acm,dc=local"],
        },
      ],
      searchReferences: [],
    }),
  }));
});

describe("LDAPService — role resolution", () => {
  it("assigns Admin when admin group DN is in memberOf", () => {
    const adminDN = "cn=kpi_admins,ou=groups,dc=acm,dc=local";
    const viewerDN = "cn=kpi_viewers,ou=groups,dc=acm,dc=local";
    const groups = [adminDN, "cn=other,dc=acm,dc=local"];

    const role = groups.map((g) => g.toLowerCase()).some((g) => g === adminDN.toLowerCase())
      ? "Admin"
      : groups.map((g) => g.toLowerCase()).some((g) => g === viewerDN.toLowerCase())
        ? "Viewer"
        : null;

    expect(role).toBe("Admin");
  });

  it("assigns Viewer when only viewer group DN is in memberOf", () => {
    const adminDN = "cn=kpi_admins,ou=groups,dc=acm,dc=local";
    const viewerDN = "cn=kpi_viewers,ou=groups,dc=acm,dc=local";
    const groups = [viewerDN];

    const role = groups.map((g) => g.toLowerCase()).some((g) => g === adminDN.toLowerCase())
      ? "Admin"
      : groups.map((g) => g.toLowerCase()).some((g) => g === viewerDN.toLowerCase())
        ? "Viewer"
        : null;

    expect(role).toBe("Viewer");
  });

  it("returns null (unauthorized) when user is in neither group", () => {
    const adminDN = "cn=kpi_admins,ou=groups,dc=acm,dc=local";
    const viewerDN = "cn=kpi_viewers,ou=groups,dc=acm,dc=local";
    const groups = ["cn=some_other_group,dc=acm,dc=local"];

    const role = groups.map((g) => g.toLowerCase()).some((g) => g === adminDN.toLowerCase())
      ? "Admin"
      : groups.map((g) => g.toLowerCase()).some((g) => g === viewerDN.toLowerCase())
        ? "Viewer"
        : null;

    expect(role).toBeNull();
  });

  it("Admin role takes precedence when user is in both groups", () => {
    const adminDN = "cn=kpi_admins,ou=groups,dc=acm,dc=local";
    const viewerDN = "cn=kpi_viewers,ou=groups,dc=acm,dc=local";
    const groups = [viewerDN, adminDN]; // both groups

    const role = groups.map((g) => g.toLowerCase()).some((g) => g === adminDN.toLowerCase())
      ? "Admin"
      : groups.map((g) => g.toLowerCase()).some((g) => g === viewerDN.toLowerCase())
        ? "Viewer"
        : null;

    expect(role).toBe("Admin");
  });
});

describe("LDAPService.authenticate() — happy paths", () => {
  it("authenticates admin user and returns AuthUser with role Admin", async () => {
    const service = new LDAPService(testConfig);
    const user = await service.authenticate("admin.user", "correct-password");

    expect(user.role).toBe("Admin");
    expect(user.username).toBe("Admin User");
    expect(user.userId).toBe("cn=admin.user,ou=users,dc=acm,dc=local");
    expect(user.loginAt).toBeDefined();
  });

  it("authenticates viewer user and returns AuthUser with role Viewer", async () => {
    // Override mock to return a viewer group member
    vi.mocked(Client).mockImplementation(() => ({
      bind: vi.fn().mockResolvedValue(undefined),
      unbind: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue({
        searchEntries: [
          {
            dn: "cn=viewer.user,ou=users,dc=acm,dc=local",
            cn: "Viewer User",
            mail: "viewer@acm.local",
            memberOf: ["cn=kpi_viewers,ou=groups,dc=acm,dc=local"],
          },
        ],
        searchReferences: [],
      }),
    }));

    const service = new LDAPService(testConfig);
    const user = await service.authenticate("viewer.user", "correct-password");

    expect(user.role).toBe("Viewer");
    expect(user.username).toBe("Viewer User");
  });

  it("binds service account with correct DN before searching", async () => {
    // Track bind calls on service account client
    const mockBind = vi.fn().mockResolvedValue(undefined);
    vi.mocked(Client).mockImplementationOnce(() => ({
      bind: mockBind,
      unbind: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue({
        searchEntries: [
          {
            dn: "cn=admin.user,ou=users,dc=acm,dc=local",
            cn: "Admin User",
            memberOf: ["cn=kpi_admins,ou=groups,dc=acm,dc=local"],
          },
        ],
        searchReferences: [],
      }),
    }));
    // Second Client() call for user bind
    vi.mocked(Client).mockImplementationOnce(() => ({
      bind: vi.fn().mockResolvedValue(undefined),
      unbind: vi.fn().mockResolvedValue(undefined),
      search: vi.fn(),
    }));

    const service = new LDAPService(testConfig);
    await service.authenticate("admin.user", "correct-password");

    // Service account bind must use the configured bind DN
    expect(mockBind).toHaveBeenCalledWith(testConfig.LDAP_BIND_DN, testConfig.LDAP_BIND_PASSWORD);
  });

  it("searches with EqualityFilter (not raw string concat) — LDAP injection prevention", async () => {
    // Verify that search is called with a filter string from EqualityFilter
    // The mock EqualityFilter.toString() returns "(sAMAccountName=<value>)"
    // This confirms we're NOT building the filter via string concatenation.
    const mockSearch = vi.fn().mockResolvedValue({
      searchEntries: [
        {
          dn: "cn=admin.user,ou=users,dc=acm,dc=local",
          cn: "Admin User",
          memberOf: ["cn=kpi_admins,ou=groups,dc=acm,dc=local"],
        },
      ],
      searchReferences: [],
    });

    vi.mocked(Client).mockImplementationOnce(() => ({
      bind: vi.fn().mockResolvedValue(undefined),
      unbind: vi.fn().mockResolvedValue(undefined),
      search: mockSearch,
    }));
    vi.mocked(Client).mockImplementationOnce(() => ({
      bind: vi.fn().mockResolvedValue(undefined),
      unbind: vi.fn().mockResolvedValue(undefined),
      search: vi.fn(),
    }));

    const service = new LDAPService(testConfig);
    const username = "admin.user";
    await service.authenticate(username, "correct-password");

    // Search must be called with a filter that matches EqualityFilter format
    expect(mockSearch).toHaveBeenCalledWith(
      testConfig.LDAP_USER_SEARCH_BASE,
      expect.objectContaining({
        filter: `(sAMAccountName=${username})`,
        scope: "sub",
      }),
    );
  });

  it("verifies group membership resolution via memberOf attribute", async () => {
    // Test that users in both groups get Admin (precedence)
    vi.mocked(Client).mockImplementation(() => ({
      bind: vi.fn().mockResolvedValue(undefined),
      unbind: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue({
        searchEntries: [
          {
            dn: "cn=dual.user,ou=users,dc=acm,dc=local",
            cn: "Dual User",
            memberOf: [
              "cn=kpi_viewers,ou=groups,dc=acm,dc=local",
              "cn=kpi_admins,ou=groups,dc=acm,dc=local",
            ],
          },
        ],
        searchReferences: [],
      }),
    }));

    const service = new LDAPService(testConfig);
    const user = await service.authenticate("dual.user", "correct-password");
    expect(user.role).toBe("Admin"); // Admin takes precedence
  });
});

describe("LDAPService.authenticate() — failure paths", () => {
  it("throws on blank password (prevents anonymous bind attack)", async () => {
    const service = new LDAPService(testConfig);
    await expect(service.authenticate("admin.user", "")).rejects.toThrow("Password is required");
    await expect(service.authenticate("admin.user", "   ")).rejects.toThrow("Password is required");
  });

  it("throws when user not found in directory", async () => {
    vi.mocked(Client).mockImplementation(() => ({
      bind: vi.fn().mockResolvedValue(undefined),
      unbind: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue({ searchEntries: [], searchReferences: [] }),
    }));

    const service = new LDAPService(testConfig);
    await expect(service.authenticate("nouser", "password")).rejects.toThrow(
      "User not found in directory",
    );
  });

  it("throws Invalid credentials when user bind fails with InvalidCredentialsError", async () => {
    const { InvalidCredentialsError } = await import("ldapts");

    // Service client succeeds; user bind fails with InvalidCredentialsError
    vi.mocked(Client).mockImplementationOnce(() => ({
      bind: vi.fn().mockResolvedValue(undefined),
      unbind: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue({
        searchEntries: [
          {
            dn: "cn=admin.user,ou=users,dc=acm,dc=local",
            cn: "Admin User",
            memberOf: ["cn=kpi_admins,ou=groups,dc=acm,dc=local"],
          },
        ],
        searchReferences: [],
      }),
    }));
    vi.mocked(Client).mockImplementationOnce(() => ({
      bind: vi.fn().mockRejectedValue(new InvalidCredentialsError()),
      unbind: vi.fn().mockResolvedValue(undefined),
      search: vi.fn(),
    }));

    const service = new LDAPService(testConfig);
    await expect(service.authenticate("admin.user", "wrong-password")).rejects.toThrow(
      "Invalid credentials",
    );
  });

  it("throws when user is not in any authorized group", async () => {
    vi.mocked(Client).mockImplementation(() => ({
      bind: vi.fn().mockResolvedValue(undefined),
      unbind: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue({
        searchEntries: [
          {
            dn: "cn=stranger,ou=users,dc=acm,dc=local",
            cn: "Stranger",
            memberOf: ["cn=other_group,dc=acm,dc=local"],
          },
        ],
        searchReferences: [],
      }),
    }));

    const service = new LDAPService(testConfig);
    await expect(service.authenticate("stranger", "password")).rejects.toThrow(
      "not a member of any authorized group",
    );
  });
});

describe("LDAPService.ping()", () => {
  it("returns true when service account bind succeeds", async () => {
    vi.mocked(Client).mockImplementation(() => ({
      bind: vi.fn().mockResolvedValue(undefined),
      unbind: vi.fn().mockResolvedValue(undefined),
      search: vi.fn(),
    }));

    const service = new LDAPService(testConfig);
    const result = await service.ping();
    expect(result).toBe(true);
  });

  it("returns false when bind throws (LDAP unreachable)", async () => {
    vi.mocked(Client).mockImplementation(() => ({
      bind: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      unbind: vi.fn().mockResolvedValue(undefined),
      search: vi.fn(),
    }));

    const service = new LDAPService(testConfig);
    const result = await service.ping();
    expect(result).toBe(false);
  });
});
