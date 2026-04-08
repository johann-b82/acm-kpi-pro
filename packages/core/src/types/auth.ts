/**
 * Role enum — two roles in v1.
 * Viewer: read-only dashboard + docs.
 * Admin: Viewer + upload + settings.
 */
export type Role = "Viewer" | "Admin";

/**
 * Authenticated user representation (session payload).
 */
export interface AuthUser {
  /** LDAP distinguished name (DN) — unique identifier */
  userId: string;
  /** Display name from AD cn attribute */
  username: string;
  /** Assigned role from AD group membership */
  role: Role;
  /** ISO 8601 timestamp of login */
  loginAt: string;
}

/**
 * AuthProvider interface — abstraction layer so Entra ID / SAML
 * can be added in v2 without changing API route code.
 * (AUTH-02)
 */
export interface AuthProvider {
  /**
   * Authenticate a user with credentials.
   * Returns the resolved AuthUser on success.
   * Throws on invalid credentials or unauthorized group.
   */
  authenticate(username: string, password: string): Promise<AuthUser>;

  /**
   * Check if the LDAP/AD server is reachable (used by /healthz).
   */
  ping(): Promise<boolean>;
}
