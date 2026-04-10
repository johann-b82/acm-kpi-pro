import { BookOpen, LogOut, Moon, RefreshCw, Sun, Upload } from "lucide-react";
import { useTheme } from "next-themes";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n.js";
import { useAuth } from "../hooks/useAuth.js";
import { LastUpdatedBadge } from "../features/kpi/components/LastUpdatedBadge.js";
import { cn } from "../lib/utils.js";

interface HeaderProps {
  /** ISO 8601 timestamp of last successful import. Renders LastUpdatedBadge. */
  lastUpdatedAt?: string | null;
  /** Callback for the force-refresh button. Shows a spinner while refreshing. */
  onForceRefresh?: () => void;
  /** True while a background refetch is in progress (shows spinning icon). */
  isRefreshing?: boolean;
}

/**
 * App header: ACM logo (BRAND-01) + theme toggle + language pills + upload + docs
 * + optional last-updated badge + force-refresh button + logout.
 *
 * Plan 06-03: adds theme toggle (D-06), language pills DE|EN (D-07, D-08),
 * write-through persistence to PATCH /api/me/preferences (D-05).
 */
export function Header({ lastUpdatedAt, onForceRefresh, isRefreshing }: HeaderProps = {}) {
  const { user, logout } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useTranslation();

  function toggleTheme() {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
    // Write-through persistence (D-05) — fire and forget
    void fetch("/api/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ theme: next }),
    }).catch(() => {
      // On failure: next-themes will re-read from localStorage on reload
    });
  }

  function setLocale(lang: "de" | "en") {
    void i18n.changeLanguage(lang);
    // Persist acm_lang cookie (D-04)
    document.cookie = `acm_lang=${lang}; max-age=31536000; path=/; samesite=lax`;
    // Write-through to DB (D-05)
    void fetch("/api/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ locale: lang }),
    }).catch(() => {});
  }

  const isDark = resolvedTheme === "dark";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
        {/* BRAND-01: ACM logo */}
        <Link to="/" className="flex items-center gap-2">
          <img src="/acm-logo.svg" alt="ACM logo" width={32} height={32} className="h-8 w-8" />
          <span className="text-sm font-semibold tracking-tight text-foreground">{t("common.appName")}</span>
        </Link>

        {/* Top-right controls */}
        <div className="flex items-center gap-2">
          {/* Last updated timestamp badge */}
          {lastUpdatedAt !== undefined && (
            <LastUpdatedBadge lastUpdatedAt={lastUpdatedAt ?? null} />
          )}

          {/* Force-refresh button */}
          {onForceRefresh && (
            <button
              type="button"
              onClick={onForceRefresh}
              disabled={isRefreshing}
              aria-label={t("dashboard.refresh")}
              title={t("dashboard.refresh")}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-md",
                "text-muted-foreground hover:bg-muted hover:text-foreground",
                "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <RefreshCw
                className={cn("h-4 w-4", isRefreshing && "animate-spin")}
              />
              <span className="sr-only">{t("dashboard.refresh")}</span>
            </button>
          )}

          {/* Theme toggle — Sun/Moon per D-06 */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
            title={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span className="sr-only">{isDark ? t("theme.switchToLight") : t("theme.switchToDark")}</span>
          </button>

          {/* Language pills DE|EN per D-07 */}
          <div className="flex items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => setLocale("de")}
              aria-label={t("theme.switchToGerman")}
              className={cn(
                "rounded px-1 py-0.5 text-xs font-medium transition-colors",
                i18n.language === "de" ? "text-foreground font-bold" : "text-muted-foreground hover:text-foreground",
              )}
            >
              DE
            </button>
            <span className="text-muted-foreground text-xs">|</span>
            <button
              type="button"
              onClick={() => setLocale("en")}
              aria-label={t("theme.switchToEnglish")}
              className={cn(
                "rounded px-1 py-0.5 text-xs font-medium transition-colors",
                i18n.language === "en" ? "text-foreground font-bold" : "text-muted-foreground hover:text-foreground",
              )}
            >
              EN
            </button>
          </div>

          {/* Upload icon button — Admins only (UP-01, D-05) */}
          {user?.role === "Admin" && (
            <Link
              to="/upload"
              title={t("upload.button")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md
                         text-muted-foreground hover:bg-muted hover:text-foreground
                         transition-colors"
            >
              <Upload className="h-4 w-4" />
              <span className="sr-only">{t("upload.button")}</span>
            </Link>
          )}

          {/* Docs icon button (DOCS-01) */}
          <Link
            to="/docs"
            title={t("common.appName")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md
                       text-muted-foreground hover:bg-muted hover:text-foreground
                       transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            <span className="sr-only">Docs</span>
          </Link>

          {/* Logout */}
          {user && (
            <button
              type="button"
              onClick={() => void logout()}
              title={`${t("auth.logout")} (${user.username})`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md
                         text-muted-foreground hover:bg-muted hover:text-foreground
                         transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="sr-only">{t("auth.logout")}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
