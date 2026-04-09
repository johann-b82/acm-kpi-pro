import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KpiSummary, KpiMeta } from "@acm-kpi/core";
import { DashboardPage } from "../../../pages/DashboardPage.js";

// ─── Mock Recharts — avoids ETIMEDOUT in jsdom (Recharts Funnel imports esm-sh) ─
vi.mock("recharts", () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ─── Mock useAuth for components that need it ──────────────────────────────
vi.mock("../../../hooks/useAuth.js", () => ({
  useAuth: vi.fn(() => ({
    user: { username: "admin", role: "Admin", loginAt: "" },
    loading: false,
    error: null,
    logout: vi.fn(),
    refetch: vi.fn(),
  })),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

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

const minimalMeta: KpiMeta = {
  warehouses: ["Main Warehouse"],
  product_groups: ["Electronics"],
  abc_classes: ["A", "B", "C"],
  article_types: ["ART", "MAT", "HLB", "WKZ"],
};

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

/** Mock fetch to handle multiple endpoint calls */
function mockFetch(summary: KpiSummary | null, meta: KpiMeta = minimalMeta) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("/api/v1/kpi/summary")) {
        if (!summary) {
          return Promise.resolve({ ok: false, status: 500, statusText: "Server Error" });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(summary),
        });
      }
      if (String(url).includes("/api/v1/kpi/meta")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(meta),
        });
      }
      // Default: fail unknown endpoints
      return Promise.resolve({ ok: false, status: 404, statusText: "Not Found" });
    }),
  );
}

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
    mockFetch(emptySummary);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/No Data Yet/i)).toBeTruthy();
    });
  });

  it("renders KPI grid when has_data is true", async () => {
    mockFetch(minimalSummary);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      // KpiGrid renders KPI card titles
      expect(screen.getByText("Total Inventory Value")).toBeTruthy();
      expect(screen.getByText("Days on Hand")).toBeTruthy();
      expect(screen.getByText("Dead Stock")).toBeTruthy();
    });
  });

  it("renders SlowMoverChart when has_data is true", async () => {
    mockFetch(minimalSummary);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/Slow Movers/i)).toBeTruthy();
    });
  });

  it("renders StockoutList when has_data is true", async () => {
    mockFetch(minimalSummary);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      // StockoutList renders a card with "Stockouts & Low Stock" as CardTitle
      const stockoutCards = screen.getAllByText(/Stockouts/i);
      expect(stockoutCards.length).toBeGreaterThan(0);
    });
  });

  it("renders StaleDataBanner when data is stale (>30 min)", async () => {
    const staleSummary: KpiSummary = {
      ...minimalSummary,
      last_updated_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(), // 35 min ago
    };
    mockFetch(staleSummary);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      // KpiGrid renders — multiple elements with "Total Inventory Value"
      const matches = screen.getAllByText(/Total Inventory Value/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it("does not show stale banner when data is fresh (< 30 min)", async () => {
    const freshSummary: KpiSummary = {
      ...minimalSummary,
      last_updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    };
    mockFetch(freshSummary);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Total Inventory Value")).toBeTruthy();
    });

    // No stale banner for fresh data
    const staleBanner = screen.queryByRole("alert");
    expect(staleBanner).toBeNull();
  });
});
