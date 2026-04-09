import { useCallback, useRef, useState } from "react";
import type { UploadResponse, UploadState } from "../types.js";

interface UseUploadReturn {
  state: UploadState;
  uploadPercent: number;
  result: UploadResponse | null;
  error: string | null;
  uploadFile: (file: File) => void;
  reset: () => void;
}

/**
 * XHR-based upload state machine (D-01: XHR, not fetch — required for
 * upload-progress events).
 *
 * State transitions:
 *   idle → uploading (bytes in flight, progress 0–100%)
 *        → parsing  (body fully uploaded, server parsing)
 *        → success | error
 */
export function useUpload(): UseUploadReturn {
  const [state, setState] = useState<UploadState>("idle");
  const [uploadPercent, setUploadPercent] = useState(0);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const reset = useCallback(() => {
    if (xhrRef.current) {
      try {
        xhrRef.current.abort();
      } catch {
        // ignore
      }
      xhrRef.current = null;
    }
    setState("idle");
    setUploadPercent(0);
    setResult(null);
    setError(null);
  }, []);

  const uploadFile = useCallback((file: File) => {
    setState("uploading");
    setUploadPercent(0);
    setResult(null);
    setError(null);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        setUploadPercent(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.upload.addEventListener("load", () => {
      // Body fully uploaded; server is now parsing + validating.
      setState("parsing");
    });

    xhr.open("POST", "/api/v1/upload", true);
    xhr.withCredentials = true;

    xhr.onload = () => {
      // Handle known non-2xx status codes before attempting JSON parse.
      if (xhr.status === 409) {
        setError(
          "An ingest is already running — please wait a moment and try again.",
        );
        setState("error");
        return;
      }
      if (xhr.status === 403) {
        setError("Admin role required.");
        setState("error");
        return;
      }

      // 200 = success, 400 = validation failure — both return the
      // UploadResponse DTO shape.
      try {
        const parsed = JSON.parse(xhr.responseText) as UploadResponse;
        setResult(parsed);
        setState(parsed.status === "success" ? "success" : "error");
      } catch {
        setError("Upload failed — could not parse server response.");
        setState("error");
      }
    };

    xhr.onerror = () => {
      setError("Upload failed — network error");
      setState("error");
    };

    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  }, []);

  return { state, uploadPercent, result, error, uploadFile, reset };
}
