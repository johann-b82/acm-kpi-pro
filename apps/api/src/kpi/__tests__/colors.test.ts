/**
 * Unit tests for pure color-computation functions (Plan 03-05).
 *
 * No mocks needed — all functions are pure with no side effects.
 * Tests cover all boundary values for each of the three color-coded KPIs.
 */

import { describe, expect, it } from "vitest";
import {
  computeKpiColors,
  daysOnHandColor,
  deadStockShareColor,
  stockoutCountColor,
} from "../colors.js";

// ── daysOnHandColor ─────────────────────────────────────────────────────────

describe("daysOnHandColor", () => {
  it("returns neutral for null (no data)", () => {
    expect(daysOnHandColor(null)).toBe("neutral");
  });

  // Red boundary: < 30
  it("returns red for 29 days", () => {
    expect(daysOnHandColor(29)).toBe("red");
  });
  it("returns red for 0 days", () => {
    expect(daysOnHandColor(0)).toBe("red");
  });
  it("returns red for negative days (edge case)", () => {
    expect(daysOnHandColor(-1)).toBe("red");
  });

  // Yellow boundary: 30-89
  it("returns yellow for exactly 30 days", () => {
    expect(daysOnHandColor(30)).toBe("yellow");
  });
  it("returns yellow for 45 days", () => {
    expect(daysOnHandColor(45)).toBe("yellow");
  });
  it("returns yellow for 89 days", () => {
    expect(daysOnHandColor(89)).toBe("yellow");
  });

  // Green boundary: >= 90
  it("returns green for exactly 90 days", () => {
    expect(daysOnHandColor(90)).toBe("green");
  });
  it("returns green for 95 days", () => {
    expect(daysOnHandColor(95)).toBe("green");
  });
  it("returns green for 180 days", () => {
    expect(daysOnHandColor(180)).toBe("green");
  });
});

// ── stockoutCountColor ──────────────────────────────────────────────────────

describe("stockoutCountColor", () => {
  // Green: 0
  it("returns green for 0 stockouts", () => {
    expect(stockoutCountColor(0)).toBe("green");
  });

  // Yellow: 1–10
  it("returns yellow for 1 stockout", () => {
    expect(stockoutCountColor(1)).toBe("yellow");
  });
  it("returns yellow for 5 stockouts", () => {
    expect(stockoutCountColor(5)).toBe("yellow");
  });
  it("returns yellow for exactly 10 stockouts", () => {
    expect(stockoutCountColor(10)).toBe("yellow");
  });

  // Red: > 10
  it("returns red for 11 stockouts", () => {
    expect(stockoutCountColor(11)).toBe("red");
  });
  it("returns red for 15 stockouts", () => {
    expect(stockoutCountColor(15)).toBe("red");
  });
  it("returns red for 100 stockouts", () => {
    expect(stockoutCountColor(100)).toBe("red");
  });
});

// ── deadStockShareColor ─────────────────────────────────────────────────────

describe("deadStockShareColor", () => {
  // Green: < 5%
  it("returns green for 0%", () => {
    expect(deadStockShareColor(0)).toBe("green");
  });
  it("returns green for 3% dead stock", () => {
    expect(deadStockShareColor(3)).toBe("green");
  });
  it("returns green for 4.9%", () => {
    expect(deadStockShareColor(4.9)).toBe("green");
  });

  // Yellow: 5%–15%
  it("returns yellow for exactly 5%", () => {
    expect(deadStockShareColor(5)).toBe("yellow");
  });
  it("returns yellow for 10%", () => {
    expect(deadStockShareColor(10)).toBe("yellow");
  });
  it("returns yellow for exactly 15%", () => {
    expect(deadStockShareColor(15)).toBe("yellow");
  });

  // Red: > 15%
  it("returns red for 15.1%", () => {
    expect(deadStockShareColor(15.1)).toBe("red");
  });
  it("returns red for 20%", () => {
    expect(deadStockShareColor(20)).toBe("red");
  });
  it("returns red for 100%", () => {
    expect(deadStockShareColor(100)).toBe("red");
  });
});

// ── computeKpiColors — empty state ──────────────────────────────────────────

describe("computeKpiColors — empty state (null inputs)", () => {
  it("returns has_data: false when both args are null", () => {
    const result = computeKpiColors(null, null);
    expect(result.has_data).toBe(false);
  });

  it("returns has_data: false when only mvRow is null", () => {
    const result = computeKpiColors(null, null);
    expect(result.has_data).toBe(false);
  });

  it("returns neutral colors in empty state", () => {
    const result = computeKpiColors(null, null);
    expect(result.total_inventory_value.color).toBe("neutral");
    expect(result.days_on_hand.color).toBe("neutral");
    expect(result.slow_dead_stock.color).toBe("neutral");
    expect(result.stockouts.color).toBe("neutral");
    expect(result.inventory_turnover.color).toBe("neutral");
    expect(result.devaluation.color).toBe("neutral");
  });

  it("returns zero values in empty state", () => {
    const result = computeKpiColors(null, null);
    expect(result.total_inventory_value.value_eur).toBe(0);
    expect(result.days_on_hand.days).toBe(0);
    expect(result.stockouts.count).toBe(0);
    expect(result.stockouts.items_preview).toHaveLength(0);
  });

  it("returns null for last_import in empty state", () => {
    const result = computeKpiColors(null, null);
    expect(result.last_import).toBeNull();
    expect(result.last_updated_at).toBeNull();
  });

  it("returns 3 empty buckets in empty state", () => {
    const result = computeKpiColors(null, null);
    expect(result.slow_dead_stock.buckets).toHaveLength(3);
    for (const bucket of result.slow_dead_stock.buckets) {
      expect(bucket.count).toBe(0);
      expect(bucket.value_eur).toBe(0);
      expect(bucket.pct).toBe(0);
    }
  });
});

// ── computeKpiColors — with data ────────────────────────────────────────────

const makeMvRow = (overrides: {
  days_on_hand?: number;
  stockout_count?: number;
  dead_pct?: number;
} = {}) => ({
  total_value_eur: 1_000_000,
  days_on_hand: overrides.days_on_hand ?? 60,
  slow_dead_stock: {
    dead: { pct: overrides.dead_pct ?? 3, count: 10, value_eur: 30_000 },
    active: { count: 200, value_eur: 800_000, pct: 80 },
    slow: { count: 50, value_eur: 170_000, pct: 17 },
    clutter_count: 15,
    samples_count: 5,
  },
  stockouts: {
    count: overrides.stockout_count ?? 0,
    items_preview: [],
  },
  abc_distribution: {
    a: { count: 50, value_eur: 700_000 },
    b: { count: 100, value_eur: 200_000 },
    c: { count: 200, value_eur: 100_000 },
  },
  inventory_turnover: 4.2,
  devaluation: { total_eur: 15_000, pct_of_value: 1.5 },
});

const makeLastImport = () => ({
  filename: "LagBes-20260408.csv",
  row_count: 1234,
  source: "cli",
  finished_at: new Date("2026-04-08T12:34:56Z"),
});

describe("computeKpiColors — days_on_hand color thresholds", () => {
  it("returns green for 95 days on hand", () => {
    const result = computeKpiColors(makeMvRow({ days_on_hand: 95 }), makeLastImport());
    expect(result.has_data).toBe(true);
    expect(result.days_on_hand.color).toBe("green");
    expect(result.days_on_hand.days).toBe(95);
  });

  it("returns yellow for 45 days on hand", () => {
    const result = computeKpiColors(makeMvRow({ days_on_hand: 45 }), makeLastImport());
    expect(result.days_on_hand.color).toBe("yellow");
  });

  it("returns red for 20 days on hand", () => {
    const result = computeKpiColors(makeMvRow({ days_on_hand: 20 }), makeLastImport());
    expect(result.days_on_hand.color).toBe("red");
  });
});

describe("computeKpiColors — stockouts color thresholds", () => {
  it("returns green for 0 stockouts", () => {
    const result = computeKpiColors(makeMvRow({ stockout_count: 0 }), makeLastImport());
    expect(result.stockouts.color).toBe("green");
  });

  it("returns yellow for 5 stockouts", () => {
    const result = computeKpiColors(makeMvRow({ stockout_count: 5 }), makeLastImport());
    expect(result.stockouts.color).toBe("yellow");
  });

  it("returns red for 15 stockouts", () => {
    const result = computeKpiColors(makeMvRow({ stockout_count: 15 }), makeLastImport());
    expect(result.stockouts.color).toBe("red");
  });
});

describe("computeKpiColors — dead stock share color thresholds", () => {
  it("returns green for 3% dead stock share", () => {
    const result = computeKpiColors(makeMvRow({ dead_pct: 3 }), makeLastImport());
    expect(result.slow_dead_stock.color).toBe("green");
  });

  it("returns yellow for 10% dead stock share", () => {
    const result = computeKpiColors(makeMvRow({ dead_pct: 10 }), makeLastImport());
    expect(result.slow_dead_stock.color).toBe("yellow");
  });

  it("returns red for 20% dead stock share", () => {
    const result = computeKpiColors(makeMvRow({ dead_pct: 20 }), makeLastImport());
    expect(result.slow_dead_stock.color).toBe("red");
  });
});

describe("computeKpiColors — neutral colors always neutral", () => {
  it("total_inventory_value is always neutral", () => {
    const result = computeKpiColors(makeMvRow(), makeLastImport());
    expect(result.total_inventory_value.color).toBe("neutral");
  });

  it("inventory_turnover is always neutral", () => {
    const result = computeKpiColors(makeMvRow(), makeLastImport());
    expect(result.inventory_turnover.color).toBe("neutral");
  });

  it("devaluation is always neutral", () => {
    const result = computeKpiColors(makeMvRow(), makeLastImport());
    expect(result.devaluation.color).toBe("neutral");
  });
});

describe("computeKpiColors — last_import metadata", () => {
  it("populates last_import fields from lastImport", () => {
    const result = computeKpiColors(makeMvRow(), makeLastImport());
    expect(result.last_import).not.toBeNull();
    expect(result.last_import?.filename).toBe("LagBes-20260408.csv");
    expect(result.last_import?.row_count).toBe(1234);
    expect(result.last_import?.source).toBe("cli");
  });

  it("populates last_updated_at from finished_at Date", () => {
    const result = computeKpiColors(makeMvRow(), makeLastImport());
    expect(result.last_updated_at).toBe("2026-04-08T12:34:56.000Z");
  });

  it("accepts finished_at as string", () => {
    const imp = { ...makeLastImport(), finished_at: "2026-04-08T12:34:56Z" };
    const result = computeKpiColors(makeMvRow(), imp);
    expect(result.last_updated_at).toBe("2026-04-08T12:34:56Z");
  });
});
