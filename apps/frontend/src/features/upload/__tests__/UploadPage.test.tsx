import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadPage } from "../components/UploadPage.js";

vi.mock("../../../hooks/useAuth.js", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../hooks/useUpload.js", () => ({
  useUpload: vi.fn(() => ({
    state: "idle",
    uploadPercent: 0,
    result: null,
    error: null,
    uploadFile: vi.fn(),
    reset: vi.fn(),
  })),
}));

// LastUpdatedBadge is rendered by Header but not relevant here.
vi.mock("../../../features/kpi/components/LastUpdatedBadge.js", () => ({
  LastUpdatedBadge: () => null,
}));

const { useAuth } = await import("../../../hooks/useAuth.js");
const useAuthMock = useAuth as unknown as ReturnType<typeof vi.fn>;

function renderPage() {
  return render(
    <MemoryRouter>
      <UploadPage />
    </MemoryRouter>,
  );
}

describe("UploadPage", () => {
  beforeEach(() => {
    useAuthMock.mockReset();
  });

  it("viewer-forbidden: renders AdminAccessDenied for Viewer role", () => {
    useAuthMock.mockReturnValue({
      user: { username: "bob", role: "Viewer", loginAt: "" },
      loading: false,
      error: null,
      logout: vi.fn(),
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByText(/Admin access required/i)).toBeDefined();
  });

  it("viewer-forbidden: does not render DropZone for Viewer role", () => {
    useAuthMock.mockReturnValue({
      user: { username: "bob", role: "Viewer", loginAt: "" },
      loading: false,
      error: null,
      logout: vi.fn(),
      refetch: vi.fn(),
    });

    renderPage();
    expect(
      screen.queryByRole("button", { name: /File upload area/i }),
    ).toBeNull();
  });

  it("admin: renders DropZone for Admin role", () => {
    useAuthMock.mockReturnValue({
      user: { username: "alice", role: "Admin", loginAt: "" },
      loading: false,
      error: null,
      logout: vi.fn(),
      refetch: vi.fn(),
    });

    renderPage();
    expect(
      screen.getByRole("button", { name: /File upload area/i }),
    ).toBeDefined();
  });
});
