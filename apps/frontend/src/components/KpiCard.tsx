import { cn } from "../lib/utils.js";

interface KpiCardProps {
  label: string;
  value: string | null;
  unit?: string;
  status?: "ok" | "warning" | "critical" | "loading";
  className?: string;
}

const statusColors = {
  ok: "text-green-600 dark:text-green-400",
  warning: "text-yellow-600 dark:text-yellow-400",
  critical: "text-red-600 dark:text-red-400",
  loading: "text-muted-foreground animate-pulse",
};

/**
 * Reusable KPI display card.
 * Phase 1: renders with hardcoded loading state.
 * Phase 3: populated with real values from /api/v1/kpi/summary.
 * (DASH-02 scaffold)
 */
export function KpiCard({ label, value, unit, status = "loading", className }: KpiCardProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-6 shadow-sm", className)}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-3xl font-bold", statusColors[status])}>
        {value ?? "—"}
        {unit && value && (
          <span className="ml-1 text-lg font-normal text-muted-foreground">{unit}</span>
        )}
      </p>
    </div>
  );
}
