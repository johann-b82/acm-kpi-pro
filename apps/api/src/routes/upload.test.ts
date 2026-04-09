/**
 * Route-level tests for POST /api/v1/upload (Phase 4 Plan 01).
 *
 * Wave 0: test file exists with pending (vi.todo) stubs for every contract
 * case so the validation tooling can see the test IDs in advance. Task 2 in
 * this plan converts the first three stubs (admin_required, concurrent_rejected,
 * ingest_source) to real tests; the remaining ones are fleshed out in plan 05.
 */

import { describe, it } from "vitest";

describe("POST /api/v1/upload", () => {
  it.todo("admin_required: returns 403 for Viewer role");
  it.todo(
    "ingest_source: calls ingestLagBesFile with source=upload and correct tmpPath",
  );
  it.todo("concurrent_rejected: returns 409 when imports.status=running");
  it.todo("file_too_large: returns 413 when body exceeds 10MB limit");
  it.todo(
    "success_response: returns UploadSuccessResponse with kpiDelta on valid file",
  );
  it.todo(
    "failure_response: returns UploadErrorResponse with errors[] on invalid file",
  );
});
