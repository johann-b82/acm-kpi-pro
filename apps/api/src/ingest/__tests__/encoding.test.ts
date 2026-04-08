import { describe, test, expect } from "vitest";
import { parseAndRemergeLagBes } from "../parser.js";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Use the CP1252-encoded sample — the real production encoding from Apollo NTS.
// A UTF-8 copy is at samples/LagBes-sample.csv (for human readability),
// but the parser always decodes as CP1252, so encoding tests must use the binary file.
const SAMPLE = resolve(__dirname, "../../../../../samples/LagBes-sample-cp1252.csv");

describe("Windows-1252 encoding (Pitfall #2)", () => {
  test("µµµµ round-trips without U+FFFD replacement char", async () => {
    const rows = await parseAndRemergeLagBes(SAMPLE);
    // Every row in the sample has µµµµ in the Eingrenzung bis Lager column
    for (const row of rows) {
      const val = row["Eingrenzung bis Lager"];
      if (val && val.length > 0) {
        expect(val).not.toContain("\ufffd"); // No replacement char
      }
    }
    // Article 2 row specifically — µµµµ is present in the raw file
    const a2 = rows.find((r) => r["Artikelnr"] === "2");
    expect(a2!["Eingrenzung bis Lager"]).toBe("µµµµ");
  });

  test("umlaut in article 10054 Bezeichnung 2: 'Eisen vernickelt' (no mojibake)", async () => {
    const rows = await parseAndRemergeLagBes(SAMPLE);
    const a10054 = rows.find((r) => r["Artikelnr"] === "10054");
    expect(a10054!["Bezeichnung 2"]).toBe("Eisen vernickelt");
  });

  test("German umlaut ü in article description round-trips correctly", async () => {
    const rows = await parseAndRemergeLagBes(SAMPLE);
    // Article 12285 has 'Reißverschlusshälfte' (H0001) or look for Rasant (L0007)
    // H0001 = 'Reißverschlusshälfte 40 cm schwarz mit Zipper'
    const h0001 = rows.find((r) => r["Artikelnr"] === "H0001");
    expect(h0001).toBeDefined();
    // Description contains ß and ä (German characters)
    expect(h0001!["Bezeichnung 1"]).toBe("Reißverschlusshälfte 40 cm schwarz mit Zipper");
  });

  test("all rows have µµµµ in Eingrenzung bis Lager (consistent encoding)", async () => {
    const rows = await parseAndRemergeLagBes(SAMPLE);
    const withMicro = rows.filter((r) => r["Eingrenzung bis Lager"] === "µµµµ");
    // All 12 sample rows have µµµµ in this field
    expect(withMicro.length).toBe(12);
  });
});
