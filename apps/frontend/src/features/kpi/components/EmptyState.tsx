import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../hooks/useAuth.js";

/**
 * Onboarding card shown when no successful import has run yet (has_data=false).
 *
 * - Admin users see an "Upload First File" CTA pointing to /upload
 * - Viewer users see a "contact your admin" message
 *
 * Uses role from the Phase 1 useAuth() hook.
 * CONTEXT.md: EmptyState decision (locked).
 */
export function EmptyState() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const isAdmin = user?.role === "Admin";

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {/* Logo placeholder — Phase 1 logo at /acm-logo.svg (served from public/) */}
          <img
            src="/acm-logo.svg"
            alt="ACM KPI Pro"
            className="mx-auto mb-4 h-16 w-16"
            onError={(e) => {
              // Graceful fallback if logo missing in development
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <h1 className="text-2xl font-bold">No Data Yet</h1>
          <CardDescription>
            Upload your first Apollo NTS warehouse stock export to see KPIs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {isAdmin ? (
            <>
              <p className="text-sm text-muted-foreground">
                Click the button below to get started, or use the SMB folder watcher for
                automated imports.
              </p>
              <Button onClick={() => void navigate("/upload")} size="lg">
                Upload First File
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Contact your admin to load data.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
