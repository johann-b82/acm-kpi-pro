import type { UploadErrorResponse } from "@acm-kpi/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ErrorSummary } from "../components/ErrorSummary.js";

const baseResult: UploadErrorResponse = {
  status: "failed",
  filename: "LagBes-bad.csv",
  rowsInserted: 0,
  durationMs: 200,
  errors: [
    {
      row: 1,
      field: "Wert mit Abw.",
      value: "abc",
      reason: "not numeric",
    },
    {
      row: 2,
      field: "Wert mit Abw.",
      value: "xyz",
      reason: "not numeric",
    },
    {
      row: 3,
      field: "letzt.Zugang",
      value: "13.13.2025",
      reason: "invalid date",
    },
  ],
};

describe("ErrorSummary (UP-06)", () => {
  it("renders the Import failed heading and summary line", () => {
    render(<ErrorSummary result={baseResult} onReset={vi.fn()} />);
    expect(screen.getByText("Import failed")).toBeDefined();
    expect(
      screen.getByText(/3 errors across 2 fields/i),
    ).toBeDefined();
  });

  it("groups errors by field sorted by count descending", () => {
    render(<ErrorSummary result={baseResult} onReset={vi.fn()} />);
    const listItems = screen.getAllByRole("listitem");
    expect(listItems).toHaveLength(2);
    expect(listItems[0]?.textContent).toContain("Wert mit Abw.");
    expect(listItems[0]?.textContent).toContain("2 rows");
    expect(listItems[1]?.textContent).toContain("letzt.Zugang");
    expect(listItems[1]?.textContent).toContain("1 rows");
  });

  it("renders detail table with one header row and all error rows", () => {
    render(<ErrorSummary result={baseResult} onReset={vi.fn()} />);
    const rows = screen.getAllByRole("row");
    // 1 header row + 3 error rows
    expect(rows).toHaveLength(4);
  });

  it("detail table uses <th scope=col> headers", () => {
    const { container } = render(
      <ErrorSummary result={baseResult} onReset={vi.fn()} />,
    );
    const ths = container.querySelectorAll('th[scope="col"]');
    expect(ths.length).toBe(4);
    const headers = screen.getAllByRole("columnheader");
    expect(headers[0]?.textContent).toBe("Row");
    expect(headers[1]?.textContent).toBe("Field");
    expect(headers[2]?.textContent).toBe("Value");
    expect(headers[3]?.textContent).toBe("Reason");
  });

  it("renders Copy all errors and Try another file buttons", () => {
    render(<ErrorSummary result={baseResult} onReset={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /Copy all errors/i }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Try another file/i }),
    ).toBeDefined();
  });

  it("has aria-live assertive for screen readers", () => {
    const { container } = render(
      <ErrorSummary result={baseResult} onReset={vi.fn()} />,
    );
    const live = container.querySelector('[aria-live="assertive"]');
    expect(live).not.toBeNull();
  });

  it("calls onReset when Try another file is clicked", async () => {
    const onReset = vi.fn();
    const { getByRole } = render(
      <ErrorSummary result={baseResult} onReset={onReset} />,
    );
    getByRole("button", { name: /Try another file/i }).click();
    expect(onReset).toHaveBeenCalledOnce();
  });
});
