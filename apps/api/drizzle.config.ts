import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:dev@localhost:5432/acm_kpi",
  },
  verbose: true,
  strict: true,
} satisfies Config;
