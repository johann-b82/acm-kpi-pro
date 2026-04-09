import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { EmptyState } from "./EmptyState.js";

// Mock useAuth for different role scenarios
vi.mock("../../../hooks/useAuth.js", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../../../hooks/useAuth.js";

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("EmptyState", () => {
  it("renders 'No Data Yet' heading", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { username: "admin", role: "Admin", loginAt: "" },
      loading: false,
      error: null,
      logout: vi.fn(),
      refetch: vi.fn(),
    });
    renderWithRouter(<EmptyState />);
    expect(screen.getByText(/No Data Yet/i)).toBeTruthy();
  });

  it("admin user sees Upload button", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { username: "admin", role: "Admin", loginAt: "" },
      loading: false,
      error: null,
      logout: vi.fn(),
      refetch: vi.fn(),
    });
    renderWithRouter(<EmptyState />);
    expect(screen.getByRole("button", { name: /upload/i })).toBeTruthy();
  });

  it("viewer user sees contact admin message (no upload button)", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { username: "viewer", role: "Viewer", loginAt: "" },
      loading: false,
      error: null,
      logout: vi.fn(),
      refetch: vi.fn(),
    });
    renderWithRouter(<EmptyState />);
    expect(screen.getByText(/contact your admin/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /upload/i })).toBeNull();
  });

  it("null user sees contact admin message", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
      error: null,
      logout: vi.fn(),
      refetch: vi.fn(),
    });
    renderWithRouter(<EmptyState />);
    expect(screen.getByText(/contact your admin/i)).toBeTruthy();
  });
});
