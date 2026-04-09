import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StaleDataBanner } from "./StaleDataBanner.js";
import type { StalenessLevel } from "../hooks/useStalenessAlert.js";

describe("StaleDataBanner", () => {
  it("renders nothing when level is 'none'", () => {
    const { container } = render(<StaleDataBanner level={"none" as StalenessLevel} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a yellow banner when level is 'warning'", () => {
    const { container } = render(<StaleDataBanner level={"warning" as StalenessLevel} />);
    const banner = container.firstChild as HTMLElement;
    expect(banner).toBeTruthy();
    expect(banner.className).toContain("yellow");
  });

  it("renders 'over 30 minutes' text when warning", () => {
    render(<StaleDataBanner level={"warning" as StalenessLevel} />);
    expect(screen.getByText(/30 minutes/i)).toBeTruthy();
  });

  it("renders a red banner when level is 'critical'", () => {
    const { container } = render(<StaleDataBanner level={"critical" as StalenessLevel} />);
    const banner = container.firstChild as HTMLElement;
    expect(banner).toBeTruthy();
    expect(banner.className).toContain("red");
  });

  it("renders '2 hours' text when critical", () => {
    render(<StaleDataBanner level={"critical" as StalenessLevel} />);
    expect(screen.getByText(/2 hours/i)).toBeTruthy();
  });
});
