import type { UploadSuccessResponse } from "@acm-kpi/core";
import { ArrowDown, ArrowUp, CheckCircle2, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface SuccessSummaryProps {
  result: UploadSuccessResponse;
  onReset: () => void;
}

type KpiKey = keyof UploadSuccessResponse["kpiDelta"];

interface KpiDef {
  key: KpiKey;
  unit: string;
  /** Inverted KPIs are "lower is better" — e.g. dead stock %. */
  invertedSign: boolean;
}

const KPI_DEFS: readonly KpiDef[] = [
  { key: "totalInventoryValue", unit: "€", invertedSign: false },
  { key: "daysOnHand", unit: "d", invertedSign: false },
  { key: "stockoutsCount", unit: "", invertedSign: false },
  { key: "deadStockPct", unit: "%", invertedSign: true },
] as const;

interface DeltaSign {
  color: string;
  arrow: ReactNode;
  prefix: string;
  label: string;
}

function formatDeltaSign(delta: number, invertedSign: boolean): DeltaSign {
  if (delta === 0) {
    return {
      color: "text-muted-foreground",
      arrow: <Minus className="h-3 w-3" aria-hidden="true" />,
      prefix: "",
      label: "no change",
    };
  }
  const effectivePositive = invertedSign ? delta < 0 : delta > 0;
  if (effectivePositive) {
    return {
      color: "text-green-600",
      arrow: <ArrowUp className="h-3 w-3" aria-hidden="true" />,
      prefix: delta > 0 ? "+" : "−",
      label: "improved",
    };
  }
  return {
    color: "text-red-600",
    arrow: <ArrowDown className="h-3 w-3" aria-hidden="true" />,
    prefix: delta > 0 ? "+" : "−",
    label: "worsened",
  };
}

function formatValue(value: number, unit: string): string {
  const abs = Math.abs(value);
  const rounded = abs >= 100 ? abs.toFixed(0) : abs.toFixed(1);
  if (unit === "€") return `€${rounded}`;
  if (unit === "%") return `${rounded}%`;
  if (unit === "d") return `${rounded}d`;
  return rounded;
}

function formatSignedValue(value: number, unit: string): string {
  if (value === 0) return formatValue(0, unit);
  const body = formatValue(value, unit);
  return value > 0 ? `+${body}` : `−${body}`;
}

/**
 * SuccessSummary — green card shown after a successful upload (UP-05).
 *
 * Renders the KPI delta grid (Before / After / Change) for the four headline
 * KPIs. The "Before" column is hidden when every KPI reports `before: null`
 * (the first-ever import). "Go to Dashboard" invalidates the React Query cache
 * for `['kpi', 'summary']` then navigates home, so the dashboard immediately
 * reflects the freshly-ingested data.
 */
export function SuccessSummary({ result, onReset }: SuccessSummaryProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  /** Map KPI key to localized label using explicit typed t() calls. */
  function kpiLabel(key: KpiKey): string {
    switch (key) {
      case "totalInventoryValue": return t("dashboard.kpiLabels.inventoryValue");
      case "daysOnHand": return t("dashboard.kpiLabels.coverage");
      case "stockoutsCount": return t("dashboard.kpiLabels.stockouts");
      case "deadStockPct": return t("dashboard.kpiLabels.slowMovers");
    }
  }

  const showBeforeCol = Object.values(result.kpiDelta).some(
    (f) => f.before !== null,
  );

  const handleGoToDashboard = () => {
    void queryClient.invalidateQueries({ queryKey: ["kpi", "summary"] });
    navigate("/");
  };

  const gridCols = showBeforeCol ? "grid-cols-4" : "grid-cols-3";

  return (
    <Card className="border-2 border-green-200" aria-live="polite">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CheckCircle2
            className="h-5 w-5 text-green-600"
            aria-hidden="true"
          />
          <CardTitle className="text-lg">{t("upload.success")}</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          {result.filename} · {t("upload.rowsImported", { count: result.rowsInserted })} · completed
          in {(result.durationMs / 1000).toFixed(1)}s
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div
            className={cn(
              "grid gap-2 text-xs font-semibold text-muted-foreground",
              gridCols,
            )}
          >
            <div>KPI</div>
            {showBeforeCol && <div>Before</div>}
            <div>After</div>
            <div>Change</div>
          </div>
          {KPI_DEFS.map((kpi) => {
            const field = result.kpiDelta[kpi.key];
            const sign = formatDeltaSign(field.delta, kpi.invertedSign);
            return (
              <div
                key={kpi.key}
                className={cn("grid items-center gap-2 text-sm", gridCols)}
              >
                <div className="font-medium">{kpiLabel(kpi.key)}</div>
                {showBeforeCol && (
                  <div className="text-muted-foreground">
                    {field.before === null
                      ? "—"
                      : formatValue(field.before, kpi.unit)}
                  </div>
                )}
                <div className="font-semibold">
                  {formatValue(field.after, kpi.unit)}
                </div>
                <div
                  className={cn("flex items-center gap-1", sign.color)}
                  data-testid={`delta-${kpi.key}`}
                  aria-label={`${kpiLabel(kpi.key)} ${sign.label}`}
                >
                  <span>
                    {field.delta === 0
                      ? formatValue(0, kpi.unit)
                      : `${sign.prefix}${formatValue(field.delta, kpi.unit)}`}
                  </span>
                  {sign.arrow}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3">
          <Button onClick={handleGoToDashboard}>{t("dashboard.title")}</Button>
          <Button variant="outline" onClick={onReset}>
            {t("upload.button")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export { formatDeltaSign, formatSignedValue };
