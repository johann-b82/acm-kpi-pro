import { Upload } from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { DropZoneProps } from "../types.js";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Drop zone for CSV/TXT upload (D-02, UI-SPEC §"Drop Zone Interaction").
 *
 * - Native drag-drop + click-to-browse via hidden `<input type="file">`
 * - Client-side extension + size validation (rejects before onFileSelected)
 * - Multi-drop: takes first file and renders an inline warning
 * - Keyboard: Enter / Space on the inner button opens the file picker
 * - Inline error rendered below the button (never hides it)
 */
export function DropZone({
  onFileSelected,
  disabled = false,
  error = null,
}: DropZoneProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [multiWarning, setMultiWarning] = useState<string | null>(null);

  const validateFile = (file: File): boolean => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv" && ext !== "txt") {
      setLocalError(t("upload.errors.unsupportedFormat"));
      return false;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setLocalError(t("upload.errors.fileTooLarge"));
      return false;
    }
    setLocalError(null);
    return true;
  };

  const handleFiles = (files: File[]) => {
    if (files.length === 0) return;

    if (files.length > 1) {
      const first = files[0] as File;
      setMultiWarning(`${first.name}`);
      if (validateFile(first)) {
        onFileSelected(first);
      }
      return;
    }

    setMultiWarning(null);
    const only = files[0] as File;
    if (validateFile(only)) {
      onFileSelected(only);
    }
  };

  const handleClick = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    handleFiles(files);
    // Reset value so re-selecting the same file fires onChange again.
    e.target.value = "";
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (_e: DragEvent<HTMLDivElement>) => {
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer?.files ?? []);
    handleFiles(files);
  };

  const displayedError = error ?? localError;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "rounded-lg border-2 border-dashed p-8 text-center transition-colors",
        isDragOver
          ? "border-brand-400 bg-brand-50 border-solid"
          : "border-slate-300 hover:bg-brand-50",
        disabled && "opacity-50",
      )}
    >
      <button
        type="button"
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label={t("upload.dragDrop")}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <Upload className="h-8 w-8 text-slate-400" aria-hidden="true" />
        <p className="text-sm font-medium text-slate-700">
          {t("upload.dragDrop")}
        </p>
        <p className="text-xs text-muted-foreground">{t("upload.fileHint")}</p>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt"
        onChange={handleInputChange}
        hidden
        aria-hidden="true"
      />

      {multiWarning && (
        <p role="status" className="mt-2 text-sm text-amber-600">
          {multiWarning}
        </p>
      )}
      {displayedError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {displayedError}
        </p>
      )}
    </div>
  );
}
