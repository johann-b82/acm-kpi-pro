/**
 * apps/api/src/ingest/types.ts
 *
 * Re-exports and aliases for ingest types.
 * Most types live in @acm-kpi/core; this file brings them
 * into the API workspace without duplication.
 */
export type {
  IngestError,
  ValidationResult,
  IngestResult,
  FeedParser,
  ParsedRow,
} from "@acm-kpi/core";
