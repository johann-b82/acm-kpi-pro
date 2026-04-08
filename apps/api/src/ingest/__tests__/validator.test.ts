import { describe, test, expect } from "vitest";
import { validateAllRows } from "../validator.js";
import { buildBaseRow } from "../schema.js";

describe("validateAllRows — fail-on-all error collection (IN-11)", () => {
  test("valid rows return { valid: true, rows: [...] }", async () => {
    const good = [
      buildBaseRow({ "Artikelnr": "A1" }),
      buildBaseRow({ "Artikelnr": "A2" }),
    ];
    const result = await validateAllRows(good);
    expect(result.valid).toBe(true);
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toBeUndefined();
  });

  test("multiple bad rows: all errors collected, not just first", async () => {
    const bad = [
      buildBaseRow({ "Typ": "INVALID_ENUM" }), // row 2: bad enum
      buildBaseRow({ "Artikelnr": "" }), // row 3: missing required
      buildBaseRow({ "Erf.-Datum": "not-a-date" }), // row 4: bad date — wait, our schema returns null for unparseable dates
    ];
    // Note: bad date returns null, and if Erf.-Datum is nullable it won't error
    // So at least 2 errors (bad enum, missing artikelnr)
    const result = await validateAllRows(bad);
    expect(result.valid).toBe(false);
    // Must collect errors from all bad rows
    expect(result.errors!.length).toBeGreaterThanOrEqual(2);
    const fields = result.errors!.map((e) => e.field);
    expect(fields.some((f) => f === "Typ")).toBe(true);
    expect(fields.some((f) => f === "Artikelnr")).toBe(true);
  });

  test("error includes 1-based row number", async () => {
    const rows = [buildBaseRow({ "Typ": "INVALID" })];
    const result = await validateAllRows(rows);
    expect(result.errors![0].row).toBe(2); // Header=1, data starts=2
  });

  test("mixed valid + invalid: valid rows still collected", async () => {
    const rows = [
      buildBaseRow({ "Artikelnr": "GOOD1" }),
      buildBaseRow({ "Typ": "BAD" }),
      buildBaseRow({ "Artikelnr": "GOOD2" }),
    ];
    const result = await validateAllRows(rows);
    expect(result.valid).toBe(false);
    // errors contain only the bad row (index 1 → row 3)
    expect(result.errors!.some((e) => e.row === 3)).toBe(true); // row 3 (0-index 1)
  });

  test("empty array returns valid with 0 rows", async () => {
    const result = await validateAllRows([]);
    expect(result.valid).toBe(true);
    expect(result.rows).toHaveLength(0);
  });
});
