import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ArticleSummary } from "@acm-kpi/core";
import { ArticleDrilldownModal } from "./ArticleDrilldownModal.js";

// Mock useArticles hook to avoid network requests in tests
vi.mock("../hooks/useArticles.js", () => ({
  useArticles: vi.fn(() => ({
    data: {
      total: 1,
      items: [
        {
          id: 1,
          artikelnr: "A001",
          bezeichnung_1: "Test Article",
          typ: "ART",
          lagername: "Main Warehouse",
          bestand_basiseinheit: 100,
          einh: "ST",
          wert_mit_abw: 5000.0,
          letzt_zugang: "2026-01-15",
          lagerabgang_dat: "2026-03-01",
          abc_kennz_vk: "A",
        },
      ],
    },
    isLoading: false,
  })),
}));

const sampleArticle: ArticleSummary = {
  artikelnr: "A001",
  bezeichnung_1: "Test Article",
  bestand_basiseinheit: 100,
  wert_mit_abw: 5000.0,
  abc_kennz_vk: "A",
};

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderModal(props: { isOpen: boolean; onClose: () => void; article: ArticleSummary | null }) {
  const queryClient = makeQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ArticleDrilldownModal {...props} />
    </QueryClientProvider>,
  );
}

describe("ArticleDrilldownModal", () => {
  it("renders nothing when isOpen=false", () => {
    const { container } = renderModal({
      isOpen: false,
      onClose: vi.fn(),
      article: sampleArticle,
    });
    // Dialog content should not be visible
    const dialogContent = container.querySelector("[role='dialog']");
    expect(dialogContent).toBeNull();
  });

  it("renders essential columns when isOpen=true", async () => {
    renderModal({
      isOpen: true,
      onClose: vi.fn(),
      article: sampleArticle,
    });

    await waitFor(() => {
      expect(screen.getByText("A001")).toBeTruthy();
      expect(screen.getByText("Test Article")).toBeTruthy();
    });
  });

  it("renders 'Show all columns' button when open", async () => {
    renderModal({
      isOpen: true,
      onClose: vi.fn(),
      article: sampleArticle,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /show all columns/i })).toBeTruthy();
    });
  });

  it("'Show all columns' toggle reveals more fields", async () => {
    renderModal({
      isOpen: true,
      onClose: vi.fn(),
      article: sampleArticle,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /show all columns/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /show all columns/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /hide extra columns/i })).toBeTruthy();
    });
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    renderModal({ isOpen: true, onClose, article: sampleArticle });

    await waitFor(() => {
      // shadcn Dialog close button has sr-only text "Close"
      const closeBtn = screen.getByRole("button", { name: /close/i });
      expect(closeBtn).toBeTruthy();
      fireEvent.click(closeBtn);
    });

    expect(onClose).toHaveBeenCalled();
  });
});
