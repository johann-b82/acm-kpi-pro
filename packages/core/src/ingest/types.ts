/**
 * Feed parser interface and companion types for the ingest subsystem.
 * Implements KPI-10 extensibility: adding a new feed means registering a
 * new FeedParser without touching existing ingestion or dashboard code.
 *
 * This file is pure TypeScript — no runtime imports.
 */

/**
 * A single parsed data row from a feed file.
 * Concrete feeds (LagBes, scrap rate, ...) define their own row shapes.
 * Index signature allows arbitrary string keys with unknown values so
 * Zod schemas in apps/api can validate and narrow the type.
 */
export interface ParsedRow {
  /** Index signature — each column becomes a string key */
  [key: string]: unknown;
}

/**
 * A validation error for a single field in a single row.
 * Collected during the validation pass and surfaced in IngestResult.
 */
export interface IngestError {
  /** 1-based row number in the source file (header = row 1, data from row 2) */
  row: number;
  /** Column name that failed validation */
  field: string;
  /** Raw value that failed */
  value: unknown;
  /** Human-readable reason (shown to admin in error summary) */
  reason: string;
}

/**
 * Result of validating a batch of parsed rows.
 * The validation pass collects ALL errors before failing (IN-11).
 */
export interface ValidationResult {
  /** true if all rows passed validation */
  valid: boolean;
  /** Populated when valid === true — rows ready for insertion */
  rows?: ParsedRow[];
  /** Populated when valid === false — all errors collected (IN-11) */
  errors?: IngestError[];
}

/**
 * Summary returned by the orchestrator after a full ingest run.
 */
export interface IngestResult {
  /** 'success' if all rows were committed; 'failed' if validation or I/O errors occurred */
  status: "success" | "failed";
  /** Original filename as received by the upload/watcher */
  filename: string;
  /** Number of rows committed to the live table (0 on failure) */
  rowsInserted: number;
  /** All validation errors (empty array on success) */
  errors: IngestError[];
  /** Wall-clock milliseconds for the full pipeline */
  durationMs: number;
  /** UUID correlation ID linking this result to the imports audit row */
  correlationId: string;
}

/**
 * Feed parser interface — the contract every feed must satisfy.
 * Implement this interface to add a new data feed (e.g. scrap rate)
 * without modifying existing ingestion code (KPI-10).
 *
 * @example
 * ```typescript
 * const lagbesParser: FeedParser = {
 *   id: "lagbes",
 *   name: "LagBes (Warehouse Stock)",
 *   tableName: "stock_rows",
 *   fileExtensions: [".csv", ".txt"],
 *   parse(filePath) { ... },
 * };
 * ```
 */
export interface FeedParser {
  /**
   * Unique machine identifier for this feed (e.g. "lagbes", "scrap_rate").
   * Used as the registry key in FeedRegistry.
   */
  id: string;

  /**
   * Human-readable feed name (e.g. "LagBes (Warehouse Stock)").
   */
  name: string;

  /**
   * Target Postgres table name this feed populates (e.g. "stock_rows").
   */
  tableName: string;

  /**
   * Accepted file extensions, lower-cased including the leading dot
   * (e.g. [".csv", ".txt"]) — IN-07.
   */
  fileExtensions: string[];

  /**
   * Parse a feed file into an async iterable of raw parsed rows.
   * Implementations handle encoding, delimiter quirks, and decimal-comma
   * re-merging internally. Each yielded value is a record ready for Zod
   * validation in the apps/api layer.
   *
   * @param filePath Absolute path to the file on disk.
   */
  parse(filePath: string): AsyncIterable<unknown>;

  /**
   * Optional custom insertion logic.
   * If omitted, the orchestrator uses a generic batch INSERT.
   * Implement when the feed needs special staging or atomic swap logic.
   *
   * @param db       Drizzle client (typed as unknown to keep @acm-kpi/core dep-free)
   * @param importId The imports.id for audit linkage
   * @param rows     Validated rows ready to persist
   */
  insert?(db: unknown, importId: number, rows: unknown[]): Promise<void>;
}

/**
 * Registry of all registered feed parsers, keyed by FeedParser.id.
 * Phase 2 registers "lagbes". Phase 3+ adds more without editing existing code.
 *
 * @example
 * ```typescript
 * import { FeedRegistry } from "@acm-kpi/core";
 * const registry: FeedRegistry = new Map();
 * registry.set(lagbesParser.id, lagbesParser);
 * const parser = registry.get("lagbes"); // FeedParser | undefined
 * ```
 */
export type FeedRegistry = Map<string, FeedParser>;
