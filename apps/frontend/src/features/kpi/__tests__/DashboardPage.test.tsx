import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KpiSummary } from "@acm-kpi/core";
import { DashboardPage } from "../../../pages/DashboardPage.js";

// ─── Mock fetch globally ────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = makeQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={ui} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const minimalSummary: KpiSummary = {
  has_data: true,
  last_updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
  last_import: { filename: "test.csv", row_count: 100, source: "cli" },
  total_inventory_value: { value_eur: 1_000_000, color: "neutral" },
  days_on_hand: { days: 60, color: "yellow" },
  slow_dead_stock: {
    buckets: [
      { label: "active", count: 100, value_eur: 800_000, pct: 80 },
      { label: "slow", count: 20, value_eur: 150_000, pct: 15 },
      { label: "dead", count: 10, value_eur: 50_000, pct: 5 },
    ],
    clutter_excluded_count: 5,
    samples_excluded_count: 3,
    color: "green",
  },
  stockouts: { count: 2, items_preview: [], color: "yellow" },
  abc_distribution: {
    a: { count: 30, value_eur: 700_000 },
    b: { count: 70, value_eur: 250_000 },
    c: { count: 130, value_eur: 50_000 },
  },
  inventory_turnover: { ratio: 4.2, color: "neutral" },
  devaluation: { total_eur: 10_000, pct_of_value: 1.0, color: "neutral" },
};

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Stub window.location (jsdom limitation)
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "/" },
    });
  });

  it("renders loading skeleton while fetching", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => {})), // never resolves
    );

    renderWithProviders(<DashboardPage />);

    // Loading state has an animate-pulse div
    const loadingDiv = document.querySelector(".animate-pulse");
    expect(loadingDiv).toBeTruthy();
  });

  it("renders error state on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Server Error" }),
    );

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load KPI data/i)).toBeTruthy();
    });
  });

  it("renders empty state when has_data is false", async () => {
    const emptySummary: KpiSummary = { ...minimalSummary, has_data: false };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(emptySummary),
      }),
    );

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("empty-state-slot")).toBeTruthy();
    });
  });

  it("renders dashboard slots when has_data is true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(minimalSummary),
      }),
    );

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("kpi-grid-slot")).toBeTruthy();
      expect(screen.getByTestId("slow-mover-chart-slot")).toBeTruthy();
      expect(screen.getByTestId("stockout-list-slot")).toBeTruthy();
      expect(screen.getByTestId("filter-bar-slot")).toBeTruthy();
    });
  });

  it("does not show stale banner when data is fresh (< 30 min)", async () => {
    const freshSummary: KpiSummary = {
      ...minimalSummary,
      last_updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(freshSummary),
      }),
    );

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("kpi-grid-slot")).toBeTruthy();
    });

    // No stale banner when data is fresh
    const staleBanner = document.querySelector("[data-testid='stale-banner-slot']");
    expect(staleBanner).toBeNull();
  });
});
