import { BookOpen, LogOut, RefreshCw, Upload } from "lucide-react";
import { Link } from "react-router-dom";
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
 * App header: ACM logo (BRAND-01) + upload + docs icon buttons (UP-01, DOCS-01 scaffolds)
 * + optional last-updated badge + force-refresh button + logout.
 *
 * Plan 03-07: wires lastUpdatedAt, onForceRefresh, isRefreshing props.
 */
export function Header({ lastUpdatedAt, onForceRefresh, isRefreshing }: HeaderProps = {}) {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
        {/* BRAND-01: ACM logo */}
        <Link to="/" className="flex items-center gap-2">
          <img src="/acm-logo.svg" alt="ACM logo" width={32} height={32} className="h-8 w-8" />
          <span className="text-sm font-semibold tracking-tight text-foreground">ACM KPI Pro</span>
        </Link>

        {/* Top-right controls */}
        <div className="flex items-center gap-2">
          {/* Last updated timestamp badge (Plan 03-07) */}
          {lastUpdatedAt !== undefined && (
            <LastUpdatedBadge lastUpdatedAt={lastUpdatedAt ?? null} />
          )}

          {/* Force-refresh button (Plan 03-07) */}
          {onForceRefresh && (
            <button
              type="button"
              onClick={onForceRefresh}
              disabled={isRefreshing}
              aria-label="Refresh KPI data"
              title="Refresh KPI data"
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-md",
                "text-muted-foreground hover:bg-muted hover:text-foreground",
                "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <RefreshCw
                className={cn("h-4 w-4", isRefreshing && "animate-spin")}
              />
              <span className="sr-only">Refresh KPI data</span>
            </button>
          )}

          {/* Upload icon button — Admins only (UP-01, D-05) */}
          {user?.role === "Admin" && (
            <Link
              to="/upload"
              title="Upload data"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md
                         text-muted-foreground hover:bg-muted hover:text-foreground
                         transition-colors"
            >
              <Upload className="h-4 w-4" />
              <span className="sr-only">Upload data</span>
            </Link>
          )}

          {/* Docs icon button (DOCS-01) */}
          <Link
            to="/docs"
            title="Documentation"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md
                       text-muted-foreground hover:bg-muted hover:text-foreground
                       transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            <span className="sr-only">Documentation</span>
          </Link>

          {/* Logout */}
          {user && (
            <button
              type="button"
              onClick={() => void logout()}
              title={`Logout (${user.username})`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md
                         text-muted-foreground hover:bg-muted hover:text-foreground
                         transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Logout</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
