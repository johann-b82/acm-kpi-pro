import { index, integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * users — one row per authenticated LDAP user who has ever logged in.
 * Role is synced from AD group membership on each login (not stored long-term;
 * this table is audit/display only in Phase 1).
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  ldapDn: text("ldap_dn").unique().notNull(),
  username: text("username").notNull(),
  email: text("email"),
  role: text("role").notNull().default("Viewer"), // 'Viewer' | 'Admin'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * sessions — placeholder for server-side session tracking (Phase 2+).
 * Phase 1 uses iron-session (sealed cookies); this table is not written to.
 */
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * imports — append-only audit log for every import attempt.
 * Written by Phase 2 ingestion. Phase 1 scaffolds the table.
 */
export const imports = pgTable(
  "imports",
  {
    id: serial("id").primaryKey(),
    filename: text("filename").notNull(),
    rowCount: integer("row_count"),
    status: text("status").notNull().default("pending"), // 'pending'|'success'|'failed'
    errorMessage: text("error_message"),
    operator: text("operator"), // username; NULL = automated watcher
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("idx_imports_status").on(t.status),
    createdAtIdx: index("idx_imports_created_at").on(t.createdAt),
  }),
);

/**
 * stock_rows — placeholder (full schema implemented in Phase 2).
 * Exists here so Phase 1 healthz can verify the table is present.
 */
export const stockRows = pgTable(
  "stock_rows",
  {
    id: serial("id").primaryKey(),
    importId: integer("import_id").references(() => imports.id),
    articleNumber: text("article_number"),
    warehouse: text("warehouse"),
    quantity: numeric("quantity", { precision: 18, scale: 4 }),
    value: numeric("value", { precision: 18, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    importIdx: index("idx_stock_rows_import").on(t.importId),
    articleIdx: index("idx_stock_rows_article").on(t.articleNumber),
  }),
);
