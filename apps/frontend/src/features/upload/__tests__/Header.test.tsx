import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "../../../components/Header.js";

vi.mock("../../../hooks/useAuth.js", () => ({
  useAuth: vi.fn(),
}));

// Stub the LastUpdatedBadge child so it doesn't drag in KPI types during tests.
vi.mock("../../../features/kpi/components/LastUpdatedBadge.js", () => ({
  LastUpdatedBadge: () => null,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAuth } = await import("../../../hooks/useAuth.js");
const useAuthMock = useAuth as unknown as ReturnType<typeof vi.fn>;

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  );
}

describe("Header upload icon", () => {
  beforeEach(() => {
    useAuthMock.mockReset();
  });

  it("upload-icon: renders upload Link for Admin user", () => {
    useAuthMock.mockReturnValue({
      user: { username: "alice", role: "Admin", loginAt: "" },
      loading: false,
      error: null,
      logout: vi.fn(),
      refetch: vi.fn(),
    });

    renderHeader();
    const uploadLink = screen.getByTitle("Upload data");
    expect(uploadLink).toBeDefined();
    expect(uploadLink.getAttribute("href")).toBe("/upload");
  });

  it("upload-icon: hides upload Link for Viewer user", () => {
    useAuthMock.mockReturnValue({
      user: { username: "bob", role: "Viewer", loginAt: "" },
      loading: false,
      error: null,
      logout: vi.fn(),
      refetch: vi.fn(),
    });

    renderHeader();
    expect(screen.queryByTitle("Upload data")).toBeNull();
  });
});
