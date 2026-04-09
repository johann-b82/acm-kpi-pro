import type { KpiColor } from "@acm-kpi/core";

/**
 * Returns Tailwind CSS class bundles for a KpiColor value.
 * Used for card border + background + dot color (DASH-02).
 * Accessibility: always paired with kpiColorToLabel() for a text label (WCAG AA).
 */
export function kpiColorToClasses(color: KpiColor): {
  card: string;
  dot: string;
  badge: string;
} {
  const map: Record<KpiColor, { card: string; dot: string; badge: string }> = {
    green: {
      card: "border-green-300 bg-green-50",
      dot: "bg-green-500",
      badge: "bg-green-100 text-green-900 border-green-300",
    },
    yellow: {
      card: "border-yellow-300 bg-yellow-50",
      dot: "bg-yellow-500",
      badge: "bg-yellow-100 text-yellow-900 border-yellow-300",
    },
    red: {
      card: "border-red-300 bg-red-50",
      dot: "bg-red-500",
      badge: "bg-red-100 text-red-900 border-red-300",
    },
    neutral: {
      card: "border-blue-200 bg-blue-50",
      dot: "bg-blue-400",
      badge: "bg-blue-100 text-blue-900 border-blue-200",
    },
  };
  return map[color];
}

/**
 * Returns a human-readable status label for a KpiColor.
 * REQUIRED alongside color for accessibility (WCAG: color not sole indicator).
 */
export function kpiColorToLabel(color: KpiColor): string {
  const labels: Record<KpiColor, string> = {
    green: "Healthy",
    yellow: "Watch",
    red: "Action Required",
    neutral: "Info",
  };
  return labels[color];
}
