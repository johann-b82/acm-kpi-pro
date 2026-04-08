import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchArticles, fetchKpiMeta, fetchKpiSummary } from "../queries.js";

// Stub window.location.href setter (jsdom doesn't support it natively)
const originalLocation = window.location;
beforeEach(() => {
  Object.defineProperty(window, "location", {
    writable: true,
    value: { href: "/" },
  });
});
afterEach(() => {
  Object.defineProperty(window, "location", {
    writable: true,
    value: originalLocation,
  });
  vi.restoreAllMocks();
});

describe("fetchKpiSummary", () => {
  it("calls GET /api/v1/kpi/summary", async () => {
    const mockData = { has_data: true, last_updated_at: "2026-04-08T12:00:00Z" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      }),
    );

    const result = await fetchKpiSummary();
    expect(fetch).toHaveBeenCalledWith("/api/v1/kpi/summary", { credentials: "include" });
    expect(result).toEqual(mockData);
  });

  it("redirects to /login on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      }),
    );

    await expect(fetchKpiSummary()).rejects.toThrow("Unauthenticated");
    expect(window.location.href).toBe("/login");
  });

  it("throws on non-401 error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }),
    );

    await expect(fetchKpiSummary()).rejects.toThrow("KPI summary fetch failed: Internal Server Error");
  });
});

describe("fetchArticles", () => {
  it("calls GET /api/v1/kpi/articles with query params", async () => {
    const mockData = { total: 1, items: [] };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      }),
    );

    await fetchArticles({ filter: "stockout", limit: 10 });
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("/api/v1/kpi/articles");
    expect(calledUrl).toContain("filter=stockout");
    expect(calledUrl).toContain("limit=10");
  });

  it("omits undefined params from query string", async () => {
    const mockData = { total: 0, items: [] };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      }),
    );

    await fetchArticles({ filter: "slow" });
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("undefined");
    expect(calledUrl).not.toContain("null");
  });

  it("throws on error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    await expect(fetchArticles({})).rejects.toThrow("Articles fetch failed");
  });
});

describe("fetchKpiMeta", () => {
  it("calls GET /api/v1/kpi/meta", async () => {
    const mockData = { warehouses: ["Lager A"], product_groups: [], abc_classes: [], article_types: [] };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      }),
    );

    const result = await fetchKpiMeta();
    expect(fetch).toHaveBeenCalledWith("/api/v1/kpi/meta", { credentials: "include" });
    expect(result).toEqual(mockData);
  });
});
