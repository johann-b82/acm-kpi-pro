import type { AuthProvider, AuthUser, Role } from "@acm-kpi/core";
import { Client, EqualityFilter, InvalidCredentialsError } from "ldapts";
import type { AppConfig } from "../config.js";

/**
 * ASSUMPTION: sAMAccountName is the user identifier attribute.
 * Change this constant if IT confirms a different attribute (uid, userPrincipalName).
 */
const USER_ID_ATTRIBUTE = "sAMAccountName";

export class LDAPService implements AuthProvider {
  constructor(private readonly config: AppConfig) {}

  private createClient(): Client {
    return new Client({
      url: this.config.LDAP_URL,
      // Note: ldapts v8 ClientOptions does not expose a top-level `referral` flag.
      // Referral following (PITFALL #5) must be handled at the application level
      // if encountered. The underlying ldapts library handles basic LDAP referrals
      // transparently for most AD deployments.
      tlsOptions: this.config.LDAP_TLS
        ? { rejectUnauthorized: !this.config.LDAP_SKIP_CERT_CHECK }
        : undefined,
      connectTimeout: 10_000,
      timeout: 10_000,
    });
  }

  /**
   * Authenticate a user against AD.
   * Flow: service-account bind → search for user DN → bind as user → resolve role.
   * (AUTH-01, AUTH-07, AUTH-08)
   */
  async authenticate(username: string, password: string): Promise<AuthUser> {
    // Guard: never accept blank passwords (some LDAP servers allow anonymous bind with blank pwd)
    if (!password || password.trim() === "") {
      throw new Error("Password is required");
    }

    const serviceClient = this.createClient();

    try {
      // Step 1: Bind as service account
      await serviceClient.bind(this.config.LDAP_BIND_DN, this.config.LDAP_BIND_PASSWORD);

      // Step 2: Find user DN using parameterized filter (AUTH-08: prevents LDAP injection)
      const searchFilter = new EqualityFilter({
        attribute: USER_ID_ATTRIBUTE,
        value: username, // ldapts EqualityFilter escapes special chars automatically
      });

      const { searchEntries } = await serviceClient.search(this.config.LDAP_USER_SEARCH_BASE, {
        filter: searchFilter.toString(),
        scope: "sub",
        attributes: ["dn", "cn", "mail", "memberOf"],
      });

      if (searchEntries.length === 0) {
        throw new Error("User not found in directory");
      }

      const userEntry = searchEntries[0];
      if (!userEntry.dn) throw new Error("User entry has no DN");

      // Step 3: Bind as the user to verify credentials
      const userClient = this.createClient();
      try {
        await userClient.bind(userEntry.dn, password);
        await userClient.unbind();
      } catch (err) {
        if (err instanceof InvalidCredentialsError) {
          throw new Error("Invalid credentials");
        }
        throw err;
      }

      // Step 4: Resolve role from group membership
      const memberOf = userEntry.memberOf ?? [];
      const groups = Array.isArray(memberOf) ? (memberOf as string[]) : [memberOf as string];
      const role = this.resolveRole(groups);

      return {
        userId: userEntry.dn,
        username: String(userEntry.cn ?? username),
        role,
        loginAt: new Date().toISOString(),
      };
    } finally {
      // Always unbind service account
      try {
        await serviceClient.unbind();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Resolve user role from AD group membership.
   * Admin group takes precedence over Viewer.
   * Throws if user is not in either authorized group.
   * (AUTH-04, AUTH-05)
   */
  private resolveRole(groups: string[]): Role {
    const normalizedGroups = groups.map((g) => g.toLowerCase());
    const adminDN = this.config.LDAP_ADMIN_GROUP_DN.toLowerCase();
    const viewerDN = this.config.LDAP_VIEWER_GROUP_DN.toLowerCase();

    if (normalizedGroups.some((g) => g === adminDN)) return "Admin";
    if (normalizedGroups.some((g) => g === viewerDN)) return "Viewer";

    throw new Error(
      "User is not a member of any authorized group. " +
        "Contact your administrator to be added to a KPI access group.",
    );
  }

  /**
   * Check LDAP server reachability — used by /healthz.
   * (OBS-02)
   */
  async ping(): Promise<boolean> {
    const client = this.createClient();
    try {
      await client.bind(this.config.LDAP_BIND_DN, this.config.LDAP_BIND_PASSWORD);
      await client.unbind();
      return true;
    } catch {
      return false;
    }
  }
}
