/**
 * apps/api/src/ingest/schema.ts
 *
 * Zod v3 schema for a single LagBes CSV row plus column metadata used
 * by the decimal-comma re-merge algorithm in parser.ts.
 *
 * Zod version: ^3.22.0 — uses v3 API (z.preprocess, not z.transform at top level).
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Column metadata: which columns can have German decimal fractions.
// The re-merge algorithm in parser.ts uses this to decide when adjacent
// integer-looking fields must be merged back into a single decimal value.
// ---------------------------------------------------------------------------

export interface NumericColumnMeta {
  /** Column index in the 52-column header (0-based). Informational only. */
  index: number;
  /** Type label for documentation / future extension */
  type: "quantity" | "currency" | "percentage" | "consumption" | "months" | "count";
  /** If true, the column may have a German decimal comma (e.g. "112,532") */
  canHaveDecimals: boolean;
  /** Numeric scale stored in Postgres */
  scale?: number;
  /**
   * Maximum number of digits in the fractional part for re-merge detection.
   * Defaults to 4 if not specified. Use 2 for monetary/percentage columns
   * (Euro cent precision), 4 for price/quantity columns (per-unit pricing).
   * The re-merge algorithm uses this to avoid merging adjacent full-integer
   * values (e.g., Abwert%=0 followed by Wert mit Abw.=560 should NOT merge).
   */
  maxFractionalDigits?: number;
}

/**
 * LAGBES_NUMERIC_COLUMNS — columns that are numeric in the LagBes export.
 * Key = exact German header name as it appears in the CSV header row.
 *
 * Columns where canHaveDecimals=true are candidates for the re-merge
 * algorithm: if the raw field array shows an integer followed by a 1-4
 * digit integer in the NEXT position, and both the current column expects
 * decimals, the two fragments are joined back as "left,right".
 */
export const LAGBES_NUMERIC_COLUMNS: Record<string, NumericColumnMeta> = {
  // Stock quantities — can have 4-digit fractions (e.g. -18414,25)
  "Bestand (Lagereinheit)": { index: 13, type: "quantity", canHaveDecimals: true, scale: 4, maxFractionalDigits: 4 },
  "Bestand (Basiseinheit)": { index: 15, type: "quantity", canHaveDecimals: true, scale: 4, maxFractionalDigits: 4 },

  // Price — up to 4 decimal places (e.g. 112,532 or 199,6879 for per-unit pricing)
  "Preis": { index: 17, type: "currency", canHaveDecimals: true, scale: 4, maxFractionalDigits: 4 },

  // Integer count — no decimals ever
  "pro Menge": { index: 18, type: "count", canHaveDecimals: false },

  // Monetary values — at most 2 decimal places (Euro cents)
  "Wert": { index: 19, type: "currency", canHaveDecimals: true, scale: 2, maxFractionalDigits: 2 },
  "Abwert%": { index: 20, type: "percentage", canHaveDecimals: true, scale: 2, maxFractionalDigits: 2 },
  "Wert mit Abw.": { index: 21, type: "currency", canHaveDecimals: true, scale: 2, maxFractionalDigits: 2 },

  // Consumption and coverage — treat as up to 4dp
  "Durch.Verbr": { index: 22, type: "consumption", canHaveDecimals: true, scale: 4, maxFractionalDigits: 4 },
  "Reichw.Mon.": { index: 23, type: "months", canHaveDecimals: true, scale: 2, maxFractionalDigits: 2 },

  // Turnover quantities — up to 4dp
  "Umsatz Me J": { index: 28, type: "quantity", canHaveDecimals: true, scale: 4, maxFractionalDigits: 4 },
  "Umsatz Me VJ": { index: 29, type: "quantity", canHaveDecimals: true, scale: 4, maxFractionalDigits: 4 },

  // Movement/order quantities — up to 4dp
  "Lagerb (D)": { index: 31, type: "quantity", canHaveDecimals: true, scale: 4, maxFractionalDigits: 4 },
  "Auftrag M": { index: 32, type: "quantity", canHaveDecimals: true, scale: 4, maxFractionalDigits: 4 },
  "Reserv. M": { index: 33, type: "quantity", canHaveDecimals: true, scale: 4, maxFractionalDigits: 4 },
  "Bestell M": { index: 34, type: "quantity", canHaveDecimals: true, scale: 4, maxFractionalDigits: 4 },
  "FA Menge": { index: 35, type: "quantity", canHaveDecimals: true, scale: 4, maxFractionalDigits: 4 },
  "Bedarf M": { index: 36, type: "quantity", canHaveDecimals: true, scale: 4, maxFractionalDigits: 4 },
  "ø Verbrauch / M": { index: 37, type: "consumption", canHaveDecimals: true, scale: 4, maxFractionalDigits: 4 },

  // Year/half-year movement aggregates — up to 4dp
  "Lagerabgang letzes Jahr": { index: 43, type: "quantity", canHaveDecimals: true, scale: 4, maxFractionalDigits: 4 },
  "Lagerabgang letzes 1/2 Jahr": { index: 44, type: "quantity", canHaveDecimals: true, scale: 4, maxFractionalDigits: 4 },
  "Lagerzugang letzes 1/2 Jahr": { index: 45, type: "quantity", canHaveDecimals: true, scale: 4, maxFractionalDigits: 4 },
};

// ---------------------------------------------------------------------------
// German locale parsers used in z.preprocess()
// ---------------------------------------------------------------------------

/**
 * Parses a German-locale decimal string (comma as decimal separator) to a JS number.
 * Handles: "112,532" → 112.532, "560,27" → 560.27, "-18414,25" → -18414.25
 * Also accepts dot-decimal ("2.037") and bare integers ("0", "1").
 * Returns 0 for empty/blank strings (not NaN).
 */
export function parseGermanDecimal(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val !== "string" || !val.trim()) return 0;
  // Replace only the first comma (German decimal sep) with dot
  // but don't replace dots that are already there (e.g. "2.037" is already dot-decimal)
  const normalized = val.includes(",") ? val.replace(",", ".") : val;
  const parsed = parseFloat(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Parses a German date string "DD.MM.YY" to a Date object.
 * Century inference: YY >= 80 → 1900+YY (e.g. 80 → 1980, 99 → 1999)
 *                    YY <  80 → 2000+YY (e.g. 12 → 2012, 79 → 2079)
 * Returns null for empty/blank/unparseable strings.
 */
export function parseGermanDate(val: unknown): Date | null {
  if (typeof val !== "string" || !val.trim()) return null;
  const m = val.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const yr = Number(m[3]);
  const fullYear = yr >= 80 ? 1900 + yr : 2000 + yr;
  return new Date(fullYear, month - 1, day);
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

/**
 * StockRowSchema validates one re-merged row from a LagBes CSV.
 * Input keys are the exact German column headers from the CSV.
 * After .transform(), output keys are camelCase matching the Drizzle schema.
 */
export const StockRowSchema = z
  .object({
    // ── Identification ──────────────────────────────────────────────────────
    "Artikelnr": z.string().min(1, "Article number required").max(50),
    "Typ": z.enum(["ART", "MAT", "HLB", "WKZ"]),
    "Bezeichnung 1": z.string().max(255).optional().nullable(),
    "Bezeichnung 2": z.string().max(255).optional().nullable(),
    "Bezeichnung 3": z.string().max(255).optional().nullable(),
    "Bezeichnung 4": z.string().max(255).optional().nullable(),
    "Bezeichnung 5": z.string().max(255).optional().nullable(),
    "Bezeichnung 6": z.string().max(255).optional().nullable(),
    "WGR": z.string().max(50).optional().nullable(),
    "ProdGrp": z.string().max(50).optional().nullable(),
    "Wareneingangsko": z.string().max(50).optional().nullable(),
    "Bestandskonto": z.string().max(50).optional().nullable(),
    "Lagername": z.string().max(100),

    // ── Stock quantities ────────────────────────────────────────────────────
    "Bestand (Lagereinheit)": z.preprocess(parseGermanDecimal, z.number()),
    "Lag Einh": z.string().max(20).optional().nullable(),
    "Bestand (Basiseinheit)": z.preprocess(parseGermanDecimal, z.number()),
    "Einh": z.string().max(20).optional().nullable(),

    // ── Pricing and value ───────────────────────────────────────────────────
    "Preis": z.preprocess(parseGermanDecimal, z.number()),
    "pro Menge": z.preprocess(
      (v) => {
        if (typeof v === "string" && !v.trim()) return 1;
        return parseGermanDecimal(v);
      },
      z.number(),
    ),
    "Wert": z.preprocess(parseGermanDecimal, z.number()),
    "Abwert%": z.preprocess(parseGermanDecimal, z.number()),
    "Wert mit Abw.": z.preprocess(parseGermanDecimal, z.number()),

    // ── Coverage and consumption ────────────────────────────────────────────
    "Durch.Verbr": z.preprocess(parseGermanDecimal, z.number()),
    "Reichw.Mon.": z.preprocess(parseGermanDecimal, z.number()),

    // ── Dates ───────────────────────────────────────────────────────────────
    "letzt.Zugang": z.preprocess(parseGermanDate, z.date().nullable()),
    "letzt.Zugang FA": z.preprocess(parseGermanDate, z.date().nullable()),
    "Stammlager": z.string().max(100).optional().nullable(),
    "Stammstellplatz": z.string().max(100).optional().nullable(),

    // ── Turnover / movements ────────────────────────────────────────────────
    "Umsatz Me J": z.preprocess(parseGermanDecimal, z.number()),
    "Umsatz Me VJ": z.preprocess(parseGermanDecimal, z.number()),
    "Lieferant": z.string().max(100).optional().nullable(),
    "Lagerb (D)": z.preprocess(parseGermanDecimal, z.number()),
    "Auftrag M": z.preprocess(parseGermanDecimal, z.number()),
    "Reserv. M": z.preprocess(parseGermanDecimal, z.number()),
    "Bestell M": z.preprocess(parseGermanDecimal, z.number()),
    "FA Menge": z.preprocess(parseGermanDecimal, z.number()),
    "Bedarf M": z.preprocess(parseGermanDecimal, z.number()),
    "ø Verbrauch / M": z.preprocess(parseGermanDecimal, z.number()),

    // ── Additional ──────────────────────────────────────────────────────────
    "l. EK am": z.preprocess(parseGermanDate, z.date().nullable()),
    "Produktgruppe": z.string().max(100).optional().nullable(),
    "stm.uni_a01": z.string().max(100).optional().nullable(),

    // ── Date audit fields ────────────────────────────────────────────────────
    "Lagerzugang Dat": z.preprocess(parseGermanDate, z.date().nullable()),
    "Lagerabgang Dat": z.preprocess(parseGermanDate, z.date().nullable()),
    "Lagerabgang letzes Jahr": z.preprocess(parseGermanDecimal, z.number()),
    "Lagerabgang letzes 1/2 Jahr": z.preprocess(parseGermanDecimal, z.number()),
    "Lagerzugang letzes 1/2 Jahr": z.preprocess(parseGermanDecimal, z.number()),

    // ── Status flags ─────────────────────────────────────────────────────────
    "Gelöscht": z.enum(["J", "N"]),
    "Erf.-Datum": z.preprocess(parseGermanDate, z.date().nullable()),
    "Eingrenzung von Lager": z.string().optional().nullable(),
    "Eingrenzung bis Lager": z.string().optional().nullable(),
    "Inventurgruppe": z.string().max(50).optional().nullable(),
    "ABC-Kennz. VK": z
      .string()
      .optional()
      .nullable()
      .transform((v) => {
        if (v === null || v === undefined || v.trim() === "") return null;
        return v.trim();
      }),
  })
  .transform((raw) => ({
    // Map German column names to camelCase Drizzle field names
    artikelnr: raw["Artikelnr"],
    typ: raw["Typ"],
    bezeichnung1: raw["Bezeichnung 1"] ?? null,
    bezeichnung2: raw["Bezeichnung 2"] ?? null,
    bezeichnung3: raw["Bezeichnung 3"] ?? null,
    bezeichnung4: raw["Bezeichnung 4"] ?? null,
    bezeichnung5: raw["Bezeichnung 5"] ?? null,
    bezeichnung6: raw["Bezeichnung 6"] ?? null,
    wgr: raw["WGR"] ?? null,
    prodgrp: raw["ProdGrp"] ?? null,
    wareneingangskonto: raw["Wareneingangsko"] ?? null,
    bestandskonto: raw["Bestandskonto"] ?? null,
    lagername: raw["Lagername"],
    bestandLagereinheit: raw["Bestand (Lagereinheit)"],
    lagEinh: raw["Lag Einh"] ?? null,
    bestandBasiseinheit: raw["Bestand (Basiseinheit)"],
    einh: raw["Einh"] ?? null,
    preis: raw["Preis"],
    proMenge: raw["pro Menge"],
    wert: raw["Wert"],
    abwertProzent: raw["Abwert%"],
    wertMitAbw: raw["Wert mit Abw."],
    durchVerbr: raw["Durch.Verbr"],
    reichwMon: raw["Reichw.Mon."],
    letztZugang: raw["letzt.Zugang"] ?? null,
    letztZugangFa: raw["letzt.Zugang FA"] ?? null,
    stammlager: raw["Stammlager"] ?? null,
    stammstellplatz: raw["Stammstellplatz"] ?? null,
    umsatzMeJ: raw["Umsatz Me J"],
    umsatzMeVj: raw["Umsatz Me VJ"],
    lieferant: raw["Lieferant"] ?? null,
    lagerbD: raw["Lagerb (D)"],
    auftragM: raw["Auftrag M"],
    reservM: raw["Reserv. M"],
    bestellM: raw["Bestell M"],
    faMenge: raw["FA Menge"],
    bedarfM: raw["Bedarf M"],
    oVerbrauchM: raw["ø Verbrauch / M"],
    lEkAm: raw["l. EK am"] ?? null,
    produktgruppe: raw["Produktgruppe"] ?? null,
    stmUniA01: raw["stm.uni_a01"] ?? null,
    lagerzugangDat: raw["Lagerzugang Dat"] ?? null,
    lagerabgangDat: raw["Lagerabgang Dat"] ?? null,
    lagerabgangLetztesJahr: raw["Lagerabgang letzes Jahr"],
    lagerabgangLetztes12Jahr: raw["Lagerabgang letzes 1/2 Jahr"],
    lagerzugangLetztes12Jahr: raw["Lagerzugang letzes 1/2 Jahr"],
    geloescht: raw["Gelöscht"],
    erfDatum: raw["Erf.-Datum"] ?? null,
    eingrenzungVon: raw["Eingrenzung von Lager"] ?? null,
    eingrenzungBis: raw["Eingrenzung bis Lager"] ?? null,
    inventurgruppe: raw["Inventurgruppe"] ?? null,
    abcKennzVk: raw["ABC-Kennz. VK"] ?? null,
  }));

export type StockRow = z.output<typeof StockRowSchema>;
export type StockRowInput = z.input<typeof StockRowSchema>;

// ---------------------------------------------------------------------------
// Test helper — buildBaseRow()
// EXPORTED FOR TEST USE ONLY. Returns a valid raw Record<string, string>
// matching the 52-column LagBes header, with all fields defaulted to
// sensible valid values. Pass overrides to focus a test on one field.
// ---------------------------------------------------------------------------

/**
 * Returns a valid minimal LagBes row as Record<string, string>.
 * All numeric fields default to "0", all dates to "01.01.01" (2001-01-01),
 * all enums to valid values, all strings to "".
 *
 * Usage in tests:
 *   StockRowSchema.parse(buildBaseRow({ "Preis": "112,532" }))
 */
export function buildBaseRow(overrides: Record<string, string> = {}): Record<string, string> {
  const base: Record<string, string> = {
    "Artikelnr": "TEST001",
    "Typ": "ART",
    "Bezeichnung 1": "Test Article",
    "Bezeichnung 2": "",
    "Bezeichnung 3": "",
    "Bezeichnung 4": "",
    "Bezeichnung 5": "",
    "Bezeichnung 6": "",
    "WGR": "",
    "ProdGrp": "",
    "Wareneingangsko": "5400",
    "Bestandskonto": "0",
    "Lagername": "Summe",
    "Bestand (Lagereinheit)": "0",
    "Lag Einh": "STK",
    "Bestand (Basiseinheit)": "0",
    "Einh": "STK",
    "Preis": "0",
    "pro Menge": "1",
    "Wert": "0",
    "Abwert%": "0",
    "Wert mit Abw.": "0",
    "Durch.Verbr": "0",
    "Reichw.Mon.": "0",
    "letzt.Zugang": "",
    "letzt.Zugang FA": "",
    "Stammlager": "",
    "Stammstellplatz": "",
    "Umsatz Me J": "0",
    "Umsatz Me VJ": "0",
    "Lieferant": "",
    "Lagerb (D)": "0",
    "Auftrag M": "0",
    "Reserv. M": "0",
    "Bestell M": "0",
    "FA Menge": "0",
    "Bedarf M": "0",
    "ø Verbrauch / M": "0",
    "l. EK am": "",
    "Produktgruppe": "",
    "stm.uni_a01": "",
    "Lagerzugang Dat": "",
    "Lagerabgang Dat": "",
    "Lagerabgang letzes Jahr": "0",
    "Lagerabgang letzes 1/2 Jahr": "0",
    "Lagerzugang letzes 1/2 Jahr": "0",
    "Gelöscht": "N",
    "Erf.-Datum": "01.01.01",
    "Eingrenzung von Lager": "",
    "Eingrenzung bis Lager": "",
    "Inventurgruppe": "",
    "ABC-Kennz. VK": "C",
  };
  return { ...base, ...overrides };
}
