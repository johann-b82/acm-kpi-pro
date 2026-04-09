import type {
  UploadErrorResponse,
  UploadSuccessResponse,
} from "@acm-kpi/core";
import { useState } from "react";
import { Header } from "@/components/Header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useUpload } from "../hooks/useUpload.js";
import { AdminAccessDenied } from "./AdminAccessDenied.js";
import { DropZone } from "./DropZone.js";
import { ErrorSummary } from "./ErrorSummary.js";
import { ProgressView } from "./ProgressView.js";
import { SuccessSummary } from "./SuccessSummary.js";

/**
 * /upload page (D-05: role gate + D-01: XHR state machine host).
 *
 * - Viewers see <AdminAccessDenied />, never the DropZone.
 * - Admins see the DropZone, and the rest of the state machine slots in
 *   below it via data-testid placeholder divs that plans 03 and 04 will
 *   swap for the real ProgressView / SuccessSummary / ErrorSummary.
 */
export function UploadPage() {
  const { user } = useAuth();
  const { state, uploadPercent, result, error, uploadFile, reset } =
    useUpload();
  const [currentFilename, setCurrentFilename] = useState("");

  const handleFileSelected = (file: File) => {
    setCurrentFilename(file.name);
    uploadFile(file);
  };

  // ProtectedRoute already handled loading + unauthenticated redirect.
  if (!user) return null;

  if (user.role !== "Admin") {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-2xl px-4 py-8">
          <AdminAccessDenied />
        </main>
      </div>
    );
  }

  const showDropZone =
    state === "idle" || state === "uploading" || state === "parsing";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <h1 className="text-2xl font-bold">Upload Data</h1>

        {showDropZone && (
          <DropZone
            onFileSelected={handleFileSelected}
            disabled={state !== "idle"}
            error={state === "idle" ? error : null}
          />
        )}

        {(state === "uploading" || state === "parsing") && (
          <ProgressView
            state={state}
            percent={uploadPercent}
            filename={currentFilename}
          />
        )}

        {state === "success" && result?.status === "success" && (
          <div
            data-testid="success-placeholder"
            className="rounded-lg border border-dashed border-green-300 p-6 text-center text-sm text-muted-foreground"
          >
            SuccessSummary placeholder — wired in plan 04-04
          </div>
        )}

        {state === "error" && (
          <div
            data-testid="error-placeholder"
            className="rounded-lg border border-dashed border-red-300 p-6 text-center text-sm text-muted-foreground"
          >
            ErrorSummary placeholder — wired in plan 04-04
            {error && <p className="mt-2 text-destructive">{error}</p>}
          </div>
        )}
      </main>
    </div>
  );
}
