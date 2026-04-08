import { BookOpen, LogOut, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";

interface HeaderProps {
  /** ISO 8601 timestamp of last successful import. Plan 03-07 renders this. */
  lastUpdatedAt?: string | null;
  /** Callback for the force-refresh button. Plan 03-07 adds the button to the header. */
  onForceRefresh?: () => void;
  /** True while a background refetch is in progress. Plan 03-07 shows a spinner. */
  isRefreshing?: boolean;
}

/**
 * App header: ACM logo (BRAND-01) + upload + docs icon buttons (UP-01, DOCS-01 scaffolds)
 * + logout button.
 *
 * Optional props (lastUpdatedAt, onForceRefresh, isRefreshing) are accepted here
 * but not yet rendered — Plan 03-07 adds the LastUpdatedBadge and Refresh button.
 */
export function Header(_props: HeaderProps = {}) {
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
        <div className="flex items-center gap-1">
          {/* Upload icon button — routes to upload stub (UP-01) */}
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
