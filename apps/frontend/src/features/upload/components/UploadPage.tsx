import type {
  UploadErrorResponse,
  UploadSuccessResponse,
} from "@acm-kpi/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
 * - Admins see the DropZone, with ProgressView / SuccessSummary / ErrorSummary
 *   rendered below it based on the current XHR state machine state.
 */
export function UploadPage() {
  const { t } = useTranslation();
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
        <h1 className="text-2xl font-bold">{t("upload.title")}</h1>

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
          <SuccessSummary
            result={result as unknown as UploadSuccessResponse}
            onReset={reset}
          />
        )}

        {state === "error" && result?.status === "failed" && (
          <ErrorSummary
            result={result as unknown as UploadErrorResponse}
            onReset={reset}
          />
        )}

        {state === "error" && !result && (
          <Card className="border-2 border-red-200" aria-live="assertive">
            <CardHeader>
              <CardTitle className="text-lg text-red-600">
                {t("common.error")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-destructive">
                {error ?? t("upload.errors.networkError")}
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
