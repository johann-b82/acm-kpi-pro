import i18n from "../i18n.js";

/** Read current locale from i18next (D-17: single source of truth). */
function locale(): string {
  return i18n.language === "de" ? "de-DE" : "en-US";
}

/**
 * Format a number with locale-aware thousands separator and decimal point.
 * de: 1.234.567,89 | en: 1,234,567.89
 */
export function formatNumber(value: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale(), opts).format(value);
}

/**
 * Format a currency value in EUR with locale-aware separators.
 * Currency is always EUR — ACM is German, amounts are always in euros (D-20).
 * de: 1.234.567,89 € | en: €1,234,567.89
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat(locale(), {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a date as locale-appropriate short form.
 * de: 31.12.2025 (DD.MM.YYYY) | en: 2025-12-31 (ISO)
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (locale() === "de-DE") {
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  }
  // English: ISO YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dy}`;
}

/**
 * Format a datetime.
 * de: 31.12.2025, 14:30 | en: 2025-12-31, 2:30 PM
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (locale() === "de-DE") {
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(d);
  }
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "numeric", minute: "2-digit",
  }).format(d);
}

/**
 * Format a percentage (value is 0-100, not 0-1).
 * de: 42,5% | en: 42.5%
 */
export function formatPercent(value: number, fractionDigits = 1): string {
  return new Intl.NumberFormat(locale(), {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value / 100);
}
