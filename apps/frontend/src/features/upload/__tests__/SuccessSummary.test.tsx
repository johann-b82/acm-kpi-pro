import type { UploadSuccessResponse } from "@acm-kpi/core";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { SuccessSummary } from "../components/SuccessSummary.js";

vi.mock("@/lib/queryClient", () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}));

const baseResult: UploadSuccessResponse = {
  status: "success",
  filename: "LagBes-test.csv",
  rowsInserted: 100,
  durationMs: 1500,
  kpiDelta: {
    totalInventoryValue: { before: 0, after: 125000, delta: 125000 },
    daysOnHand: { before: 30, after: 45, delta: 15 },
    stockoutsCount: { before: 5, after: 3, delta: -2 },
    deadStockPct: { before: 10, after: 8, delta: -2 },
  },
};

function renderWith(result: UploadSuccessResponse) {
  return render(
    <MemoryRouter>
      <SuccessSummary result={result} onReset={vi.fn()} />
    </MemoryRouter>,
  );
}

describe("SuccessSummary (UP-05)", () => {
  it("renders the Import successful heading and metadata line", () => {
    renderWith(baseResult);
    expect(screen.getByText("Import successful")).toBeDefined();
    expect(
      screen.getByText(/LagBes-test\.csv/),
    ).toBeDefined();
    expect(screen.getByText(/100 rows imported/)).toBeDefined();
    expect(screen.getByText(/completed in 1\.5s/)).toBeDefined();
  });

  it("hides Before column header when every KPI before=null (first import)", () => {
    const firstImport: UploadSuccessResponse = {
      ...baseResult,
      kpiDelta: {
        totalInventoryValue: { before: null, after: 125000, delta: 125000 },
        daysOnHand: { before: null, after: 45, delta: 45 },
        stockoutsCount: { before: null, after: 3, delta: 3 },
        deadStockPct: { before: null, after: 8, delta: 8 },
      },
    };
    renderWith(firstImport);
    expect(screen.queryByText("Before")).toBeNull();
    expect(screen.getByText("After")).toBeDefined();
    expect(screen.getByText("Change")).toBeDefined();
  });

  it("renders positive totalInventoryValue delta in green", () => {
    renderWith(baseResult);
    const deltaCell = screen.getByTestId("delta-totalInventoryValue");
    expect(deltaCell.className).toContain("text-green-600");
    expect(deltaCell.textContent).toContain("+");
  });

  it("dead-stock % inversion: negative delta renders green (improvement)", () => {
    renderWith(baseResult);
    const deltaCell = screen.getByTestId("delta-deadStockPct");
    // delta is -2: normally red, but inverted → green (improvement)
    expect(deltaCell.className).toContain("text-green-600");
    expect(deltaCell.getAttribute("aria-label")).toContain("improved");
  });

  it("dead-stock % inversion: positive delta renders red (regression)", () => {
    const regression: UploadSuccessResponse = {
      ...baseResult,
      kpiDelta: {
        ...baseResult.kpiDelta,
        deadStockPct: { before: 8, after: 10, delta: 2 },
      },
    };
    renderWith(regression);
    const deltaCell = screen.getByTestId("delta-deadStockPct");
    expect(deltaCell.className).toContain("text-red-600");
  });

  it("renders Go to Dashboard and Upload another file buttons", () => {
    renderWith(baseResult);
    expect(
      screen.getByRole("button", { name: /Go to Dashboard/i }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Upload another file/i }),
    ).toBeDefined();
  });

  it("has aria-live polite for screen readers", () => {
    const { container } = renderWith(baseResult);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
  });
});
