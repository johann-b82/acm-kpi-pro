import { describe, test, expect } from "vitest";
import { StockRowSchema, buildBaseRow } from "../schema.js";

describe("StockRowSchema — date parsing (IN-06)", () => {
  test("'17.09.12' → year 2012 (< 80 → 2000+)", () => {
    const row = StockRowSchema.parse(buildBaseRow({ "Erf.-Datum": "17.09.12" }));
    expect(row.erfDatum?.getFullYear()).toBe(2012);
  });

  test("'01.01.84' → year 1984 (>= 80 → 1900+)", () => {
    const row = StockRowSchema.parse(buildBaseRow({ "Erf.-Datum": "01.01.84" }));
    expect(row.erfDatum?.getFullYear()).toBe(1984);
  });

  test("boundary: '01.01.79' → 2079", () => {
    const row = StockRowSchema.parse(buildBaseRow({ "Erf.-Datum": "01.01.79" }));
    expect(row.erfDatum?.getFullYear()).toBe(2079);
  });

  test("boundary: '01.01.80' → 1980", () => {
    const row = StockRowSchema.parse(buildBaseRow({ "Erf.-Datum": "01.01.80" }));
    expect(row.erfDatum?.getFullYear()).toBe(1980);
  });

  test("empty date field → null (not thrown)", () => {
    const row = StockRowSchema.parse(buildBaseRow({ "letzt.Zugang": "" }));
    expect(row.letztZugang).toBeNull();
  });
});

describe("StockRowSchema — negative stock (IN-13)", () => {
  test("bestandLagereinheit accepts negative values", () => {
    const row = StockRowSchema.parse(
      buildBaseRow({ "Bestand (Lagereinheit)": "-18414,25" }),
    );
    expect(row.bestandLagereinheit).toBe(-18414.25);
    expect(row.bestandLagereinheit).toBeLessThan(0);
  });

  test("wert accepts negative values (inventory corrections)", () => {
    const row = StockRowSchema.parse(buildBaseRow({ "Wert": "-22342,62" }));
    expect(row.wert).toBe(-22342.62);
  });
});

describe("StockRowSchema — German decimal comma", () => {
  test("'112,532' → 112.532", () => {
    const row = StockRowSchema.parse(buildBaseRow({ "Preis": "112,532" }));
    expect(row.preis).toBe(112.532);
  });

  test("'0' → 0 (no decimal)", () => {
    const row = StockRowSchema.parse(buildBaseRow({ "Preis": "0" }));
    expect(row.preis).toBe(0);
  });

  test("'' empty numeric → 0 or null (not NaN)", () => {
    const row = StockRowSchema.parse(buildBaseRow({ "Durch.Verbr": "" }));
    expect(row.durchVerbr).not.toBeNaN();
  });

  test("'2.037' dot-decimal also parses correctly", () => {
    const row = StockRowSchema.parse(buildBaseRow({ "Preis": "2.037" }));
    expect(row.preis).toBe(2.037);
  });

  test("'-18414,25' negative decimal parses to -18414.25", () => {
    const row = StockRowSchema.parse(
      buildBaseRow({ "Bestand (Lagereinheit)": "-18414,25" }),
    );
    expect(row.bestandLagereinheit).toBe(-18414.25);
  });
});

describe("StockRowSchema — Typ enum", () => {
  test.each([["ART"], ["MAT"], ["HLB"], ["WKZ"]])("Typ '%s' is valid", (typ) => {
    expect(() => StockRowSchema.parse(buildBaseRow({ "Typ": typ }))).not.toThrow();
  });

  test("invalid Typ throws ZodError", () => {
    expect(() =>
      StockRowSchema.parse(buildBaseRow({ "Typ": "INVALID" })),
    ).toThrow();
  });
});

describe("StockRowSchema — ABC-Kennz. VK", () => {
  test("empty ABC-Kennz. VK → null", () => {
    const row = StockRowSchema.parse(buildBaseRow({ "ABC-Kennz. VK": "" }));
    expect(row.abcKennzVk).toBeNull();
  });

  test("'A' is valid", () => {
    const row = StockRowSchema.parse(buildBaseRow({ "ABC-Kennz. VK": "A" }));
    expect(row.abcKennzVk).toBe("A");
  });

  test("'B' is valid", () => {
    const row = StockRowSchema.parse(buildBaseRow({ "ABC-Kennz. VK": "B" }));
    expect(row.abcKennzVk).toBe("B");
  });

  test("'C' is valid", () => {
    const row = StockRowSchema.parse(buildBaseRow({ "ABC-Kennz. VK": "C" }));
    expect(row.abcKennzVk).toBe("C");
  });
});

describe("StockRowSchema — Gelöscht flag", () => {
  test("'N' is valid", () => {
    const row = StockRowSchema.parse(buildBaseRow({ "Gelöscht": "N" }));
    expect(row.geloescht).toBe("N");
  });

  test("'J' is valid", () => {
    const row = StockRowSchema.parse(buildBaseRow({ "Gelöscht": "J" }));
    expect(row.geloescht).toBe("J");
  });
});
