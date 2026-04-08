/**
 * apps/api/src/ingest/writer.ts
 *
 * Database writer for the LagBes ingest pipeline.
 *
 * Implements the atomic TRUNCATE+INSERT swap (Pitfall #10 mitigation):
 *  1. TRUNCATE stock_rows_staging  (clean slate inside transaction)
 *  2. Batch INSERT into stock_rows_staging (500 rows per batch)
 *  3. TRUNCATE stock_rows RESTART IDENTITY CASCADE  (wipe live table)
 *  4. INSERT INTO stock_rows SELECT * FROM stock_rows_staging  (atomic promote)
 *
 * All four steps run inside a single Drizzle transaction. If any step throws,
 * Drizzle issues an automatic ROLLBACK — stock_rows is left untouched.
 *
 * Exports:
 *  - createImportRecord()   — insert a 'running' imports row, return its id
 *  - updateImportStatus()   — finalize imports row with status/rowCount/error
 *  - insertStockRowsAtomic() — batch insert + atomic swap in one transaction
 */

import { eq, sql } from "drizzle-orm";
import { stockRowsStaging, imports } from "../db/schema.js";
import type { StockRowStagingInsert } from "../db/schema.js";
import type { StockRow } from "./schema.js";
import { db } from "../db/index.js";

// ─── DB type ──────────────────────────────────────────────────────────────────

/** Minimal type alias for the Drizzle db instance. Tests can pass `any`. */
type DB = typeof db;

// ─── Batch size ───────────────────────────────────────────────────────────────

/** Number of rows per INSERT call. Matches IN-12 performance target. */
const BATCH_SIZE = 500;

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Converts a Date to a 'YYYY-MM-DD' string for Drizzle's `date` column type.
 * Drizzle's pg-core `date` column expects strings, not Date objects.
 */
function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0] as string;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

/**
 * Maps a validated StockRow (camelCase, JS types) to a StockRowStagingInsert
 * (Drizzle insert shape for stock_rows_staging).
 *
 * Numeric fields: Drizzle's `numeric` type accepts number | string | null.
 * We pass numbers directly — Drizzle serialises them to numeric strings for pg.
 *
 * Date fields: Drizzle's `date` type accepts Date | string | null.
 * We pass Dates directly — Drizzle converts to ISO date strings for pg.
 */
function toStagingInsert(
  row: StockRow,
  importId: number,
): StockRowStagingInsert {
  return {
    importId,

    // Identification
    artikelnr: row.artikelnr,
    typ: row.typ,
    bezeichnung1: row.bezeichnung1 ?? null,
    bezeichnung2: row.bezeichnung2 ?? null,
    bezeichnung3: row.bezeichnung3 ?? null,
    bezeichnung4: row.bezeichnung4 ?? null,
    bezeichnung5: row.bezeichnung5 ?? null,
    bezeichnung6: row.bezeichnung6 ?? null,
    wgr: row.wgr ?? null,
    prodgrp: row.prodgrp ?? null,
    wareneingangskonto: row.wareneingangskonto ?? null,
    bestandskonto: row.bestandskonto ?? null,
    lagername: row.lagername,

    // Stock quantities (can be negative — IN-13)
    bestandLagereinheit:
      row.bestandLagereinheit != null
        ? String(row.bestandLagereinheit)
        : null,
    lagEinh: row.lagEinh ?? null,
    bestandBasiseinheit:
      row.bestandBasiseinheit != null
        ? String(row.bestandBasiseinheit)
        : null,
    einh: row.einh ?? null,

    // Pricing and value
    preis: row.preis != null ? String(row.preis) : null,
    proMenge: row.proMenge != null ? Math.round(row.proMenge) : null,
    wert: row.wert != null ? String(row.wert) : null,
    abwertProzent: row.abwertProzent != null ? String(row.abwertProzent) : null,
    wertMitAbw: row.wertMitAbw != null ? String(row.wertMitAbw) : null,

    // Coverage and consumption
    durchVerbr: row.durchVerbr != null ? String(row.durchVerbr) : null,
    reichwMon: row.reichwMon != null ? String(row.reichwMon) : null,

    // Dates — Drizzle's `date` column expects 'YYYY-MM-DD' strings for pg.
    letztZugang: row.letztZugang ? toDateStr(row.letztZugang) : null,
    letztZugangFa: row.letztZugangFa ? toDateStr(row.letztZugangFa) : null,
    stammlager: row.stammlager ?? null,
    stammstellplatz: row.stammstellplatz ?? null,

    // Turnover / movements
    umsatzMeJ: row.umsatzMeJ != null ? String(row.umsatzMeJ) : null,
    umsatzMeVj: row.umsatzMeVj != null ? String(row.umsatzMeVj) : null,
    lieferant: row.lieferant ?? null,
    lagerbD: row.lagerbD != null ? String(row.lagerbD) : null,
    auftragM: row.auftragM != null ? String(row.auftragM) : null,
    reservM: row.reservM != null ? String(row.reservM) : null,
    bestellM: row.bestellM != null ? String(row.bestellM) : null,
    faMenge: row.faMenge != null ? String(row.faMenge) : null,
    bedarfM: row.bedarfM != null ? String(row.bedarfM) : null,
    oVerbrauchM: row.oVerbrauchM != null ? String(row.oVerbrauchM) : null,

    // Additional fields
    lEkAm: row.lEkAm ? toDateStr(row.lEkAm) : null,
    produktgruppe: row.produktgruppe ?? null,
    stmUniA01: row.stmUniA01 ?? null,

    // Date audit fields
    lagerzugangDat: row.lagerzugangDat ? toDateStr(row.lagerzugangDat) : null,
    lagerabgangDat: row.lagerabgangDat ? toDateStr(row.lagerabgangDat) : null,
    lagerabgangLetztesJahr:
      row.lagerabgangLetztesJahr != null
        ? String(row.lagerabgangLetztesJahr)
        : null,
    lagerabgangLetztes12Jahr:
      row.lagerabgangLetztes12Jahr != null
        ? String(row.lagerabgangLetztes12Jahr)
        : null,
    lagerzugangLetztes12Jahr:
      row.lagerzugangLetztes12Jahr != null
        ? String(row.lagerzugangLetztes12Jahr)
        : null,

    // Status flags
    geloescht: row.geloescht,
    erfDatum: row.erfDatum ? toDateStr(row.erfDatum) : null,
    eingrenzungVon: row.eingrenzungVon ?? null,
    eingrenzungBis: row.eingrenzungBis ?? null,
    inventurgruppe: row.inventurgruppe ?? null,
    abcKennzVk: row.abcKennzVk ?? null,

    // Raw row: StockRow from schema.ts does not carry rawRow — set null here.
    // The orchestrator (Plan 02-06) may supply a rawRow-enriched type later.
    rawRow: null,
  };
}

// ─── createImportRecord ───────────────────────────────────────────────────────

export interface CreateImportOptions {
  filename: string;
  source: string;
  operator?: string | null;
}

/**
 * Inserts a new row into `imports` with status='running' and returns its id.
 * Called by the orchestrator before beginning the ingest pipeline.
 */
export async function createImportRecord(
  dbClient: DB,
  opts: CreateImportOptions,
): Promise<number> {
  const rows = await dbClient
    .insert(imports)
    .values({
      filename: opts.filename,
      source: opts.source,
      operator: opts.operator ?? null,
      status: "running",
      startedAt: new Date(),
    })
    .returning({ id: imports.id });

  if (!rows[0]) {
    throw new Error("createImportRecord: INSERT returned no rows");
  }
  return rows[0].id;
}

// ─── updateImportStatus ───────────────────────────────────────────────────────

export interface UpdateImportStatusOptions {
  status: "success" | "failed";
  rowCount: number;
  finishedAt: Date;
  errorMessage?: string | null;
}

/**
 * Updates the `imports` row with final status, rowCount, finishedAt,
 * and optional errorMessage. Called by the orchestrator after the pipeline
 * completes (success or failure).
 */
export async function updateImportStatus(
  dbClient: DB,
  importId: number,
  opts: UpdateImportStatusOptions,
): Promise<void> {
  await dbClient
    .update(imports)
    .set({
      status: opts.status,
      rowCount: opts.rowCount,
      finishedAt: opts.finishedAt,
      errorMessage: opts.errorMessage ?? null,
      updatedAt: new Date(),
    })
    .where(eq(imports.id, importId));
}

// ─── insertStockRowsAtomic ────────────────────────────────────────────────────

export interface AtomicInsertResult {
  /** Number of rows written (equals input rows.length on success). */
  inserted: number;
}

/**
 * Performs the atomic TRUNCATE+INSERT swap for LagBes stock rows.
 *
 * Atomic swap sequence (single Drizzle transaction):
 *   1. TRUNCATE TABLE stock_rows_staging RESTART IDENTITY
 *   2. Batch INSERT into stock_rows_staging (BATCH_SIZE rows per call)
 *   3. TRUNCATE TABLE stock_rows RESTART IDENTITY CASCADE
 *   4. INSERT INTO stock_rows (...cols...) SELECT ...cols... FROM stock_rows_staging
 *
 * If any step throws, Drizzle's transaction wrapper issues an automatic
 * ROLLBACK. The previous contents of stock_rows remain untouched.
 *
 * Pitfall #10 mitigation: no partial state is ever committed to the live table.
 *
 * @param dbClient  Drizzle database client (injectable for testing)
 * @param importId  The imports.id for this ingest run
 * @param rows      Validated StockRow objects to persist
 */
export async function insertStockRowsAtomic(
  dbClient: DB,
  importId: number,
  rows: StockRow[],
): Promise<AtomicInsertResult> {
  await dbClient.transaction(async (tx) => {
    // Step 1: Truncate staging table (clean slate)
    await tx.execute(
      sql`TRUNCATE TABLE stock_rows_staging RESTART IDENTITY`,
    );

    // Step 2: Batch insert into staging
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows
        .slice(i, i + BATCH_SIZE)
        .map((r) => toStagingInsert(r, importId));
      // Only insert if batch is non-empty (handles zero-row case gracefully)
      if (batch.length > 0) {
        await tx.insert(stockRowsStaging).values(batch);
      }
    }

    // Step 3: Truncate live table (inside the transaction — still safe)
    await tx.execute(
      sql`TRUNCATE TABLE stock_rows RESTART IDENTITY CASCADE`,
    );

    // Step 4: Promote staging → live (atomic swap)
    await tx.execute(sql`
      INSERT INTO stock_rows (
        import_id, artikelnr, typ,
        bezeichnung_1, bezeichnung_2, bezeichnung_3,
        bezeichnung_4, bezeichnung_5, bezeichnung_6,
        wgr, prodgrp, wareneingangskonto, bestandskonto, lagername,
        bestand_lagereinheit, lag_einh, bestand_basiseinheit, einh,
        preis, pro_menge, wert, abwert_prozent, wert_mit_abw,
        durch_verbr, reichw_mon,
        letzt_zugang, letzt_zugang_fa,
        stammlager, stammstellplatz,
        umsatz_me_j, umsatz_me_vj, lieferant,
        lagerb_d, auftrag_m, reserv_m, bestell_m, fa_menge, bedarf_m, o_verbrauch_m,
        l_ek_am, produktgruppe, stm_uni_a01,
        lagerzugang_dat, lagerabgang_dat,
        lagerabgang_letztes_jahr, lagerabgang_letztes_12_jahr, lagerzugang_letztes_12_jahr,
        geloescht, erf_datum,
        eingrenzung_von, eingrenzung_bis, inventurgruppe, abc_kennz_vk,
        raw_row
      )
      SELECT
        import_id, artikelnr, typ,
        bezeichnung_1, bezeichnung_2, bezeichnung_3,
        bezeichnung_4, bezeichnung_5, bezeichnung_6,
        wgr, prodgrp, wareneingangskonto, bestandskonto, lagername,
        bestand_lagereinheit, lag_einh, bestand_basiseinheit, einh,
        preis, pro_menge, wert, abwert_prozent, wert_mit_abw,
        durch_verbr, reichw_mon,
        letzt_zugang, letzt_zugang_fa,
        stammlager, stammstellplatz,
        umsatz_me_j, umsatz_me_vj, lieferant,
        lagerb_d, auftrag_m, reserv_m, bestell_m, fa_menge, bedarf_m, o_verbrauch_m,
        l_ek_am, produktgruppe, stm_uni_a01,
        lagerzugang_dat, lagerabgang_dat,
        lagerabgang_letztes_jahr, lagerabgang_letztes_12_jahr, lagerzugang_letztes_12_jahr,
        geloescht, erf_datum,
        eingrenzung_von, eingrenzung_bis, inventurgruppe, abc_kennz_vk,
        raw_row
      FROM stock_rows_staging
    `);
  });

  return { inserted: rows.length };
}
