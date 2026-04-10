import { AlertTriangle, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { StalenessLevel } from "../hooks/useStalenessAlert.js";

interface StaleDataBannerProps {
  /** Staleness level computed by useStalenessAlert() */
  level: StalenessLevel;
}

/**
 * Banner shown when KPI data is stale.
 *
 * - "none": renders nothing
 * - "warning" (>30 min): yellow banner
 * - "critical" (>2 hours): red banner
 *
 * Addresses Pitfall #6 (freshness ambiguity) from PITFALLS.md.
 * DASH-03: stale data indicator.
 * Phase 6: localized via i18n (D-18).
 */
export function StaleDataBanner({ level }: StaleDataBannerProps) {
  const { t } = useTranslation();

  if (level === "none") return null;

  const isCritical = level === "critical";

  return (
    <div
      role="alert"
      className={`flex items-center gap-2 rounded-md border px-4 py-3 ${
        isCritical
          ? "border-red-300 bg-red-100 text-red-900"
          : "border-yellow-300 bg-yellow-100 text-yellow-900"
      }`}
    >
      {isCritical ? (
        <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
      ) : (
        <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
      )}
      <span className="text-sm font-medium">
        {isCritical ? t("dashboard.stale2h") : t("dashboard.stale30min")}
      </span>
    </div>
  );
}
