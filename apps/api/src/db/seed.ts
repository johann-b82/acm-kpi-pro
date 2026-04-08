/**
 * Dev seed — inserts test users for local development.
 * Run with: DATABASE_URL=... tsx src/db/seed.ts
 * NEVER run in production (guarded by NODE_ENV check).
 */
import { db, pool } from "./index.js";
import { users } from "./schema.js";

if (process.env.NODE_ENV === "production") {
  console.error("seed.ts: refusing to run in production");
  process.exit(1);
}

async function seed(): Promise<void> {
  console.log("Seeding development data...");

  // Upsert test users (safe to re-run)
  await db
    .insert(users)
    .values([
      {
        ldapDn: "cn=test.viewer,ou=users,dc=acm,dc=local",
        username: "test.viewer",
        email: "viewer@acm.local",
        role: "Viewer",
      },
      {
        ldapDn: "cn=test.admin,ou=users,dc=acm,dc=local",
        username: "test.admin",
        email: "admin@acm.local",
        role: "Admin",
      },
    ])
    .onConflictDoUpdate({
      target: users.ldapDn,
      set: { updatedAt: new Date() },
    });

  console.log("Seed complete: test.viewer (Viewer) + test.admin (Admin) upserted");
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
