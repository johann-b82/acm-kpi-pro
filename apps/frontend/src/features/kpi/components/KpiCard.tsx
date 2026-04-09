import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { KpiColor } from "@acm-kpi/core";
import { kpiColorToClasses, kpiColorToLabel } from "../../../lib/kpiColors.js";

interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  color: KpiColor;
  tooltip?: string;
  icon?: React.ReactNode;
}

/**
 * KPI dashboard card with color-coding and accessibility label.
 * Part of the 7-card grid (DASH-02, DASH-08).
 *
 * Accessibility: always shows both a color indicator (dot) AND
 * a text label so color is not the sole signal (WCAG AA).
 */
export function KpiCard({ title, value, unit, color, tooltip, icon }: KpiCardProps) {
  const classes = kpiColorToClasses(color);
  const label = kpiColorToLabel(color);

  const cardContent = (
    <Card
      className={`border-2 ${classes.card} cursor-default`}
      tabIndex={0}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {/* Color dot — visual indicator (not sole signal) */}
        <div
          className={`h-3 w-3 rounded-full ${classes.dot}`}
          aria-hidden="true"
        />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        {unit && (
          <p className="text-xs text-muted-foreground">{unit}</p>
        )}
        {/* Text label — REQUIRED for accessibility (WCAG: color not sole indicator) */}
        <div className="mt-2 flex items-center gap-1">
          <span
            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-semibold ${classes.badge}`}
          >
            {label}
          </span>
          {icon && <span className="text-xs">{icon}</span>}
        </div>
      </CardContent>
    </Card>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{cardContent}</TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return cardContent;
}
