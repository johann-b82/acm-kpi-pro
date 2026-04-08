import { describe, test, expect } from "vitest";
import { parseAndRemergeLagBes } from "../parser.js";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const SAMPLE = resolve(__dirname, "../../../../samples/LagBes-sample.csv");

describe("parseAndRemergeLagBes — decimal-comma re-merge (Pitfall #1)", () => {
  test("parses sample file with exactly 12 rows", async () => {
    const rows = await parseAndRemergeLagBes(SAMPLE);
    expect(rows).toHaveLength(12);
  });

  test("article 2: Preis re-merged from '112'+'532' to '112,532'", async () => {
    const rows = await parseAndRemergeLagBes(SAMPLE);
    const a2 = rows.find((r) => r["Artikelnr"] === "2");
    expect(a2).toBeDefined();
    expect(a2!["Preis"]).toBe("112,532");
  });

  test("article 2: Wert re-merged to '560,27'", async () => {
    const rows = await parseAndRemergeLagBes(SAMPLE);
    const a2 = rows.find((r) => r["Artikelnr"] === "2");
    expect(a2!["Wert"]).toBe("560,27");
    expect(a2!["Wert mit Abw."]).toBe("560,27");
  });

  test("article 58: Preis re-merged to '30,336', Wert to '2012,25'", async () => {
    const rows = await parseAndRemergeLagBes(SAMPLE);
    const a58 = rows.find((r) => r["Artikelnr"] === "58");
    expect(a58!["Preis"]).toBe("30,336");
    expect(a58!["Wert"]).toBe("2012,25");
    expect(a58!["Wert mit Abw."]).toBe("2012,25");
  });

  test("article 74: Preis re-merged to '199,6879'", async () => {
    const rows = await parseAndRemergeLagBes(SAMPLE);
    const a74 = rows.find((r) => r["Artikelnr"] === "74");
    expect(a74!["Preis"]).toBe("199,6879");
  });

  test("article 174: negative bestand re-merged to '-18414,25' (IN-13)", async () => {
    const rows = await parseAndRemergeLagBes(SAMPLE);
    const a174 = rows.find((r) => r["Artikelnr"] === "174");
    expect(a174!["Bestand (Lagereinheit)"]).toBe("-18414,25");
    expect(a174!["Bestand (Basiseinheit)"]).toBe("-18414,25");
  });

  test("all rows have exactly 52 keys (matching header column count)", async () => {
    const rows = await parseAndRemergeLagBes(SAMPLE);
    for (const row of rows) {
      expect(Object.keys(row).length).toBe(52);
    }
  });

  test("article 000002_Muster: WKZ type preserved", async () => {
    const rows = await parseAndRemergeLagBes(SAMPLE);
    const wkz = rows.find((r) => r["Artikelnr"] === "000002_Muster");
    expect(wkz!["Typ"]).toBe("WKZ");
  });

  test("article 174: Wert re-merged to '-22342,62' (negative value)", async () => {
    const rows = await parseAndRemergeLagBes(SAMPLE);
    const a174 = rows.find((r) => r["Artikelnr"] === "174");
    expect(a174!["Wert"]).toBe("-22342,62");
    expect(a174!["Wert mit Abw."]).toBe("-22342,62");
  });

  test("article 12285: Preis with decimal point already present '2.037' stays as-is", async () => {
    // Article 12285 raw: "2.037;86;1..." — '2.037' already has a decimal point,
    // should NOT be merged with '86'. The algorithm should leave '2.037' alone
    // because it doesn't match /^-?\d+$/ (it has a dot).
    const rows = await parseAndRemergeLagBes(SAMPLE);
    const a12285 = rows.find((r) => r["Artikelnr"] === "12285");
    expect(a12285).toBeDefined();
    // Preis should be "2.037" (raw) — not merged with 86
    // Note: "2.037" contains a dot, so it's already a decimal — no merge
    expect(a12285!["Preis"]).toBe("2.037");
  });
});
