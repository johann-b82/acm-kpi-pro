/**
 * apps/api/src/ingest/__tests__/performance.test.ts
 *
 * IN-12: Ingestion pipeline must handle 10k rows in under 60 seconds.
 *
 * This test exercises the CPU-bound paths (parse + validate) with a synthetic
 * 10k-row LagBes-format CSV file. The DB insert path is mocked separately in
 * atomicity.test.ts.
 *
 * No Docker required — pure streaming + Zod validation, no live DB.
 */
import { describe, test, expect, afterAll } from "vitest";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { parseAndRemergeLagBes } from "../parser.js";
import { validateAllRows } from "../validator.js";

// Track temp file path for cleanup
let tmpFile: string | null = null;

afterAll(() => {
  if (tmpFile && existsSync(tmpFile)) {
    unlinkSync(tmpFile);
  }
});

describe("Performance — 10k rows (IN-12)", () => {
  test(
    "parse + validate 10000 rows in under 60 seconds",
    async () => {
      // Generate synthetic 10k-row LagBes CSV with correct 52-column header
      const header =
        "Artikelnr;Typ;Bezeichnung 1;Bezeichnung 2;Bezeichnung 3;Bezeichnung 4;Bezeichnung 5;Bezeichnung 6;WGR;ProdGrp;Wareneingangsko;Bestandskonto;Lagername;Bestand (Lagereinheit);Lag Einh;Bestand (Basiseinheit);Einh;Preis;pro Menge;Wert;Abwert%;Wert mit Abw.;Durch.Verbr;Reichw.Mon.;letzt.Zugang;letzt.Zugang FA;Stammlager;Stammstellplatz;Umsatz Me J;Umsatz Me VJ;Lieferant;Lagerb (D);Auftrag M;Reserv. M;Bestell M;FA Menge;Bedarf M;ø Verbrauch / M;l. EK am;Produktgruppe;stm.uni_a01;Lagerzugang Dat;Lagerabgang Dat;Lagerabgang letzes Jahr;Lagerabgang letzes 1/2 Jahr;Lagerzugang letzes 1/2 Jahr;Gelöscht;Erf.-Datum;Eingrenzung von Lager;Eingrenzung bis Lager;Inventurgruppe;ABC-Kennz. VK";

      // Generate a realistic row with some decimal-comma splits exercised
      // Every 5th row has a decimal-comma in Preis to exercise the re-merge path
      const dataRow = (i: number): string => {
        const qty = i % 3 === 0 ? "100" : `${i % 1000}`;
        const preis = i % 5 === 0 ? `${i % 999};${(i % 99).toString().padStart(2, "0")}` : "0";
        const wert = "0";
        // Fixed date strings in DD.MM.YY format
        const date1 = "01.01.25";
        const date2 = "01.06.24";
        // Construct the full 52-column row
        // Note: when preis has a semicolon it adds an extra token (decimal-comma split)
        return [
          `ART${i.toString().padStart(6, "0")}`, // Artikelnr
          "ART",                                   // Typ
          `Article ${i}`,                          // Bezeichnung 1
          "",                                      // Bezeichnung 2
          "",                                      // Bezeichnung 3
          "",                                      // Bezeichnung 4
          "",                                      // Bezeichnung 5
          "",                                      // Bezeichnung 6
          "DIV",                                   // WGR
          "",                                      // ProdGrp
          "",                                      // Wareneingangsko
          "5400",                                  // Bestandskonto
          "0",                                     // Lagername (will be coerced)
          qty,                                     // Bestand (Lagereinheit) — may be 0
          "STK",                                   // Lag Einh
          qty,                                     // Bestand (Basiseinheit)
          "STK",                                   // Einh
          preis,                                   // Preis (may contain semicolon for decimal-comma)
          "1",                                     // pro Menge
          wert,                                    // Wert
          "0",                                     // Abwert%
          wert,                                    // Wert mit Abw.
          "0",                                     // Durch.Verbr
          "0",                                     // Reichw.Mon.
          date1,                                   // letzt.Zugang
          "",                                      // letzt.Zugang FA
          "HAUPTLAGER",                            // Stammlager
          "",                                      // Stammstellplatz
          "0",                                     // Umsatz Me J
          "0",                                     // Umsatz Me VJ
          "",                                      // Lieferant
          "0",                                     // Lagerb (D)
          "0",                                     // Auftrag M
          "0",                                     // Reserv. M
          "0",                                     // Bestell M
          "0",                                     // FA Menge
          "0",                                     // Bedarf M
          "0",                                     // ø Verbrauch / M
          "",                                      // l. EK am
          "PERF",                                  // Produktgruppe
          "",                                      // stm.uni_a01
          date1,                                   // Lagerzugang Dat
          date2,                                   // Lagerabgang Dat
          "0",                                     // Lagerabgang letzes Jahr
          "0",                                     // Lagerabgang letzes 1/2 Jahr
          "0",                                     // Lagerzugang letzes 1/2 Jahr
          "N",                                     // Gelöscht
          "01.01.20",                              // Erf.-Datum
          "",                                      // Eingrenzung von Lager
          "µµµµ",                                  // Eingrenzung bis Lager
          "",                                      // Inventurgruppe
          "C",                                     // ABC-Kennz. VK
        ].join(";");
      };

      const lines = [
        header,
        ...Array.from({ length: 10_000 }, (_, i) => dataRow(i + 1)),
      ].join("\n");

      // Write as UTF-8 — our parser handles cp1252 and UTF-8 gracefully for ASCII-range content.
      // The performance test doesn't require cp1252 encoding — it tests parse throughput.
      tmpFile = join(tmpdir(), `lagbes-perf-test-${Date.now()}.csv`);
      writeFileSync(tmpFile, lines, "utf-8");

      const start = Date.now();

      const parsedRows = await parseAndRemergeLagBes(tmpFile);
      const validationResult = await validateAllRows(parsedRows);
      const elapsed = Date.now() - start;

      // Must parse all 10k rows
      expect(parsedRows.length).toBe(10_000);

      // Must complete within IN-12 budget
      expect(elapsed).toBeLessThan(60_000);

      // Log actual elapsed time for CI visibility
      console.log(`[IN-12] parse+validate 10k rows: ${elapsed}ms`);

      // Accept some validation failures from synthetic data, but the pipeline must COMPLETE
      if (!validationResult.valid) {
        expect(validationResult.errors).toBeDefined();
        // Confirm the validation pass ran to completion (collected errors, not thrown)
        expect(Array.isArray(validationResult.errors)).toBe(true);
      }
    },
    65_000, // Vitest timeout: 65 seconds (5s buffer above IN-12 budget)
  );
});
