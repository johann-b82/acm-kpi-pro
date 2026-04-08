import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run all pending drizzle-kit migrations.
 * Called once at startup. Safe to re-run (idempotent).
 */
export async function runMigrations(): Promise<void> {
  const migrationsFolder = path.resolve(__dirname, "../../drizzle");
  console.log(`Running migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log("Migrations complete");
}

// If invoked directly (npm run db:migrate), run and exit.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => pool.end())
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
