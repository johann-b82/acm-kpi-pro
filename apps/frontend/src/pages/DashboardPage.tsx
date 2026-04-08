import { Header } from "../components/Header.js";
import { KpiCard } from "../components/KpiCard.js";

/**
 * Dashboard — Phase 1 stub.
 * Shows one hardcoded KPI card in "loading" state.
 * Real KPI data wired in Phase 3.
 * (PITFALL #8: lean first paint enforced from day 1)
 */
export function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-screen-xl px-4 py-8">
        <h2 className="mb-6 text-xl font-semibold text-foreground">Dashboard</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Phase 1: single placeholder KPI card */}
          <KpiCard label="Total inventory value" value="loading…" status="loading" />
        </div>
      </main>
    </div>
  );
}
