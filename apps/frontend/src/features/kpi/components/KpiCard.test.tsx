import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiCard } from "./KpiCard.js";

describe("KpiCard", () => {
  it("renders the title and value", () => {
    render(<KpiCard title="Days on Hand" value={67} color="yellow" />);
    expect(screen.getByText("Days on Hand")).toBeTruthy();
    expect(screen.getByText("67")).toBeTruthy();
  });

  it("renders 'Healthy' label when color='green'", () => {
    render(<KpiCard title="Test" value="OK" color="green" />);
    expect(screen.getByText("Healthy")).toBeTruthy();
  });

  it("renders 'Watch' label when color='yellow'", () => {
    render(<KpiCard title="Test" value={42} color="yellow" />);
    expect(screen.getByText("Watch")).toBeTruthy();
  });

  it("renders 'Action Required' label when color='red'", () => {
    render(<KpiCard title="Test" value="Bad" color="red" />);
    expect(screen.getByText("Action Required")).toBeTruthy();
  });

  it("renders 'Info' label when color='neutral'", () => {
    render(<KpiCard title="Test" value={42} color="neutral" />);
    expect(screen.getByText("Info")).toBeTruthy();
  });

  it("renders unit when provided", () => {
    render(<KpiCard title="Value" value={1000000} unit="EUR" color="neutral" />);
    expect(screen.getByText("EUR")).toBeTruthy();
  });

  it("renders color dot for green", () => {
    const { container } = render(<KpiCard title="Test" value="OK" color="green" />);
    const dot = container.querySelector(".bg-green-500");
    expect(dot).toBeTruthy();
  });

  it("renders color dot for red", () => {
    const { container } = render(<KpiCard title="Test" value="Bad" color="red" />);
    const dot = container.querySelector(".bg-red-500");
    expect(dot).toBeTruthy();
  });

  it("renders without crashing when color='neutral'", () => {
    expect(() => render(<KpiCard title="Test" value={0} color="neutral" />)).not.toThrow();
  });
});
