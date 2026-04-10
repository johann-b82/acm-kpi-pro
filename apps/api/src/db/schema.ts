import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

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
  theme: text("theme").notNull().default("system"),   // 'light' | 'dark' | 'system'
  locale: text("locale").notNull().default("de"),      // 'de' | 'en'
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
 * Extended in Phase 2 to include source, startedAt, finishedAt.
 */
export const imports = pgTable(
  "imports",
  {
    id: serial("id").primaryKey(),
    filename: text("filename").notNull(),
    rowCount: integer("row_count"),
    status: text("status").notNull().default("pending"), // 'pending'|'running'|'success'|'failed'
    errorMessage: text("error_message"),
    operator: text("operator"), // username; NULL = automated watcher
    source: text("source").notNull().default("cli"), // 'upload'|'watcher'|'cli'
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("idx_imports_status").on(t.status),
    createdAtIdx: index("idx_imports_created_at").on(t.createdAt),
  }),
);

/**
 * article_type enum — maps to the "Typ" column in Apollo NTS LagBes export.
 * Values: ART (article), MAT (material), HLB (half-finished), WKZ (tool/fixture).
 */
export const articleTypeEnum = pgEnum("article_type", [
  "ART",
  "MAT",
  "HLB",
  "WKZ",
]);

/**
 * stock_rows — full 52-column schema matching Apollo NTS LagBes warehouse CSV.
 * Column names stay source-close to the German header (IN-05, IN-06, IN-13).
 * Numeric precision: 18,4 for quantities; 18,2 for monetary values; 5,2 for %.
 * Dates are stored as Postgres DATE; parsing from DD.MM.YY is the parser's job.
 * Negative stock values are legitimate (corrections, reservations) — no CHECK constraint.
 */
export const stockRows = pgTable(
  "stock_rows",
  {
    id: serial("id").primaryKey(),
    importId: integer("import_id").references(() => imports.id, {
      onDelete: "cascade",
    }),

    // --- Identification ---
    artikelnr: text("artikelnr").notNull(),
    typ: articleTypeEnum("typ").notNull(),
    bezeichnung1: text("bezeichnung_1"),
    bezeichnung2: text("bezeichnung_2"),
    bezeichnung3: text("bezeichnung_3"),
    bezeichnung4: text("bezeichnung_4"),
    bezeichnung5: text("bezeichnung_5"),
    bezeichnung6: text("bezeichnung_6"),
    wgr: text("wgr"),
    prodgrp: text("prodgrp"),
    wareneingangskonto: text("wareneingangskonto"),
    bestandskonto: text("bestandskonto"),
    lagername: text("lagername").notNull(),

    // --- Stock quantities (can be negative — IN-13) ---
    bestandLagereinheit: numeric("bestand_lagereinheit", {
      precision: 18,
      scale: 4,
    }),
    lagEinh: text("lag_einh"),
    bestandBasiseinheit: numeric("bestand_basiseinheit", {
      precision: 18,
      scale: 4,
    }),
    einh: text("einh"),

    // --- Pricing and value ---
    preis: numeric("preis", { precision: 18, scale: 4 }),
    proMenge: integer("pro_menge"),
    wert: numeric("wert", { precision: 18, scale: 2 }),
    abwertProzent: numeric("abwert_prozent", { precision: 5, scale: 2 }),
    wertMitAbw: numeric("wert_mit_abw", { precision: 18, scale: 2 }),

    // --- Coverage and consumption ---
    durchVerbr: numeric("durch_verbr", { precision: 18, scale: 4 }),
    reichwMon: numeric("reichw_mon", { precision: 10, scale: 2 }),

    // --- Dates (stored as date, parsed from DD.MM.YY) ---
    letztZugang: date("letzt_zugang"),
    letztZugangFa: date("letzt_zugang_fa"),
    stammlager: text("stammlager"),
    stammstellplatz: text("stammstellplatz"),

    // --- Turnover / movements (can be negative) ---
    umsatzMeJ: numeric("umsatz_me_j", { precision: 18, scale: 4 }),
    umsatzMeVj: numeric("umsatz_me_vj", { precision: 18, scale: 4 }),
    lieferant: text("lieferant"),
    lagerbD: numeric("lagerb_d", { precision: 18, scale: 4 }),
    auftragM: numeric("auftrag_m", { precision: 18, scale: 4 }),
    reservM: numeric("reserv_m", { precision: 18, scale: 4 }),
    bestellM: numeric("bestell_m", { precision: 18, scale: 4 }),
    faMenge: numeric("fa_menge", { precision: 18, scale: 4 }),
    bedarfM: numeric("bedarf_m", { precision: 18, scale: 4 }),
    oVerbrauchM: numeric("o_verbrauch_m", { precision: 18, scale: 4 }),

    // --- Additional fields ---
    lEkAm: date("l_ek_am"),
    produktgruppe: text("produktgruppe"),
    stmUniA01: text("stm_uni_a01"),

    // --- Date audit fields ---
    lagerzugangDat: date("lagerzugang_dat"),
    lagerabgangDat: date("lagerabgang_dat"),
    lagerabgangLetztesJahr: numeric("lagerabgang_letztes_jahr", {
      precision: 18,
      scale: 4,
    }),
    lagerabgangLetztes12Jahr: numeric("lagerabgang_letztes_12_jahr", {
      precision: 18,
      scale: 4,
    }),
    lagerzugangLetztes12Jahr: numeric("lagerzugang_letztes_12_jahr", {
      precision: 18,
      scale: 4,
    }),

    // --- Status flags ---
    geloescht: text("geloescht").notNull().default("N"), // "J" | "N"
    erfDatum: date("erf_datum"),
    eingrenzungVon: text("eingrenzung_von"),
    eingrenzungBis: text("eingrenzung_bis"),
    inventurgruppe: text("inventurgruppe"),
    abcKennzVk: text("abc_kennz_vk"), // "A" | "B" | "C" | NULL (blank → NULL)

    // --- Raw row for audit / debugging ---
    rawRow: text("raw_row"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    importIdx: index("idx_stock_rows_import").on(t.importId),
    artikelnrIdx: index("idx_stock_rows_artikelnr").on(t.artikelnr),
    lagernameIdx: index("idx_stock_rows_lagername").on(t.lagername),
    typIdx: index("idx_stock_rows_typ").on(t.typ),
    abcIdx: index("idx_stock_rows_abc").on(t.abcKennzVk),
  }),
);

/**
 * stock_rows_staging — identical columns to stock_rows, different table name.
 * Permanent table (not TEMP) so it survives connection pool resets.
 * No FK references and no indexes — bulk insert performance during atomic swap.
 * The ingest writer truncates this table, bulk-inserts, then swaps in a transaction.
 */
export const stockRowsStaging = pgTable("stock_rows_staging", {
  id: serial("id").primaryKey(),
  importId: integer("import_id"), // no FK — staging is truncated per import

  // --- Identification ---
  artikelnr: text("artikelnr").notNull(),
  typ: articleTypeEnum("typ").notNull(),
  bezeichnung1: text("bezeichnung_1"),
  bezeichnung2: text("bezeichnung_2"),
  bezeichnung3: text("bezeichnung_3"),
  bezeichnung4: text("bezeichnung_4"),
  bezeichnung5: text("bezeichnung_5"),
  bezeichnung6: text("bezeichnung_6"),
  wgr: text("wgr"),
  prodgrp: text("prodgrp"),
  wareneingangskonto: text("wareneingangskonto"),
  bestandskonto: text("bestandskonto"),
  lagername: text("lagername").notNull(),

  // --- Stock quantities (can be negative — IN-13) ---
  bestandLagereinheit: numeric("bestand_lagereinheit", {
    precision: 18,
    scale: 4,
  }),
  lagEinh: text("lag_einh"),
  bestandBasiseinheit: numeric("bestand_basiseinheit", {
    precision: 18,
    scale: 4,
  }),
  einh: text("einh"),

  // --- Pricing and value ---
  preis: numeric("preis", { precision: 18, scale: 4 }),
  proMenge: integer("pro_menge"),
  wert: numeric("wert", { precision: 18, scale: 2 }),
  abwertProzent: numeric("abwert_prozent", { precision: 5, scale: 2 }),
  wertMitAbw: numeric("wert_mit_abw", { precision: 18, scale: 2 }),

  // --- Coverage and consumption ---
  durchVerbr: numeric("durch_verbr", { precision: 18, scale: 4 }),
  reichwMon: numeric("reichw_mon", { precision: 10, scale: 2 }),

  // --- Dates (stored as date, parsed from DD.MM.YY) ---
  letztZugang: date("letzt_zugang"),
  letztZugangFa: date("letzt_zugang_fa"),
  stammlager: text("stammlager"),
  stammstellplatz: text("stammstellplatz"),

  // --- Turnover / movements (can be negative) ---
  umsatzMeJ: numeric("umsatz_me_j", { precision: 18, scale: 4 }),
  umsatzMeVj: numeric("umsatz_me_vj", { precision: 18, scale: 4 }),
  lieferant: text("lieferant"),
  lagerbD: numeric("lagerb_d", { precision: 18, scale: 4 }),
  auftragM: numeric("auftrag_m", { precision: 18, scale: 4 }),
  reservM: numeric("reserv_m", { precision: 18, scale: 4 }),
  bestellM: numeric("bestell_m", { precision: 18, scale: 4 }),
  faMenge: numeric("fa_menge", { precision: 18, scale: 4 }),
  bedarfM: numeric("bedarf_m", { precision: 18, scale: 4 }),
  oVerbrauchM: numeric("o_verbrauch_m", { precision: 18, scale: 4 }),

  // --- Additional fields ---
  lEkAm: date("l_ek_am"),
  produktgruppe: text("produktgruppe"),
  stmUniA01: text("stm_uni_a01"),

  // --- Date audit fields ---
  lagerzugangDat: date("lagerzugang_dat"),
  lagerabgangDat: date("lagerabgang_dat"),
  lagerabgangLetztesJahr: numeric("lagerabgang_letztes_jahr", {
    precision: 18,
    scale: 4,
  }),
  lagerabgangLetztes12Jahr: numeric("lagerabgang_letztes_12_jahr", {
    precision: 18,
    scale: 4,
  }),
  lagerzugangLetztes12Jahr: numeric("lagerzugang_letztes_12_jahr", {
    precision: 18,
    scale: 4,
  }),

  // --- Status flags ---
  geloescht: text("geloescht").notNull().default("N"), // "J" | "N"
  erfDatum: date("erf_datum"),
  eingrenzungVon: text("eingrenzung_von"),
  eingrenzungBis: text("eingrenzung_bis"),
  inventurgruppe: text("inventurgruppe"),
  abcKennzVk: text("abc_kennz_vk"), // "A" | "B" | "C" | NULL (blank → NULL)

  // --- Raw row for audit / debugging ---
  rawRow: text("raw_row"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---- Inferred TypeScript types ----

/** Insert type for stock_rows — used by the Phase 2 ingest writer. */
export type StockRowInsert = typeof stockRows.$inferInsert;

/** Select type for stock_rows — used by API query responses. */
export type StockRowSelect = typeof stockRows.$inferSelect;

/** Insert type for stock_rows_staging — used during atomic swap. */
export type StockRowStagingInsert = typeof stockRowsStaging.$inferInsert;

/** Insert type for imports audit log. */
export type ImportInsert = typeof imports.$inferInsert;

/** Select type for imports audit log. */
export type ImportSelect = typeof imports.$inferSelect;
