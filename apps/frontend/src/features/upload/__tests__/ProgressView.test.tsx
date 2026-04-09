import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressView } from "../components/ProgressView.js";

describe("ProgressView (UP-04)", () => {
  it("determinate: renders progress bar with role=progressbar and aria-valuenow=42 when uploading", () => {
    render(
      <ProgressView state="uploading" percent={42} filename="LagBes.csv" />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("42");
    expect(screen.getByText(/Uploading LagBes\.csv.*42%/)).toBeDefined();
  });

  it("indeterminate: renders spinner with aria-busy=true when parsing", () => {
    render(
      <ProgressView state="parsing" percent={100} filename="LagBes.csv" />,
    );
    const spinnerRegion = screen.getByLabelText("Parsing and validating file");
    expect(spinnerRegion.getAttribute("aria-busy")).toBe("true");
    expect(
      screen.getByText(/Parsing & validating… this usually takes a second/),
    ).toBeDefined();
  });

  it("a11y: progress bar is absent in parsing state", () => {
    render(
      <ProgressView state="parsing" percent={100} filename="LagBes.csv" />,
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("a11y: aria-live=polite on wrapper", () => {
    const { container } = render(
      <ProgressView state="uploading" percent={0} filename="f.csv" />,
    );
    expect(
      (container.firstChild as HTMLElement).getAttribute("aria-live"),
    ).toBe("polite");
  });
});
