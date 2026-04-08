import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),

  // LDAP — required at startup to fail fast before docker compose looks healthy
  LDAP_URL: z.string().min(1),
  LDAP_BIND_DN: z.string().min(1),
  LDAP_BIND_PASSWORD: z.string().min(1),
  LDAP_USER_SEARCH_BASE: z.string().min(1),
  LDAP_GROUP_SEARCH_BASE: z.string().min(1),
  LDAP_VIEWER_GROUP_DN: z.string().min(1),
  LDAP_ADMIN_GROUP_DN: z.string().min(1),

  // LDAP Security (SEC-03)
  // LDAP_TLS=true → use LDAPS (preferred)
  // LDAP_TLS=false → plain LDAP (opt-in fallback; startup warning logged)
  LDAP_TLS: z
    .string()
    .transform((v) => v.toLowerCase() !== "false")
    .default("true"),
  LDAP_SKIP_CERT_CHECK: z
    .string()
    .transform((v) => v.toLowerCase() === "true")
    .default("false"),

  // Session
  SESSION_SECRET: z.string().min(32),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type AppConfig = z.infer<typeof configSchema>;

let _config: AppConfig | null = null;

/**
 * Load and validate config from process.env.
 * Throws a descriptive ZodError if any required variable is missing or invalid.
 * Call once at startup; subsequent calls return the cached result.
 */
export function loadConfig(): AppConfig {
  if (_config) return _config;

  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid or missing environment variables:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  _config = result.data;

  // SEC-03: warn loudly if running without TLS
  if (!_config.LDAP_TLS) {
    console.warn(
      "[SECURITY WARNING] LDAP_TLS=false — connecting to LDAP without TLS. " +
        "Enable LDAPS in production (set LDAP_TLS=true).",
    );
  }

  return _config;
}

/**
 * Reset cached config — only for use in tests.
 */
export function _resetConfig(): void {
  _config = null;
}
