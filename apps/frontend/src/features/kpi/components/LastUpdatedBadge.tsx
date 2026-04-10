import { useTranslation } from "react-i18next";
import { formatDateTime } from "../../../lib/format.js";

interface LastUpdatedBadgeProps {
  /** ISO 8601 timestamp of the last successful import, or null */
  lastUpdatedAt: string | null;
}

/**
 * Small badge showing "Last updated: DD.MM.YYYY, HH:MM" (de) or "Last updated: MM/DD/YYYY, h:MM AM/PM" (en).
 * Renders nothing when lastUpdatedAt is null.
 *
 * Phase 6: replaced toLocaleTimeString with formatDateTime() from lib/format.ts (D-18).
 */
export function LastUpdatedBadge({ lastUpdatedAt }: LastUpdatedBadgeProps) {
  const { t } = useTranslation();

  if (!lastUpdatedAt) return null;

  const formatted = formatDateTime(lastUpdatedAt);

  return (
    <span className="text-xs text-muted-foreground">
      {t("dashboard.lastUpdated")}: {formatted}
    </span>
  );
}
