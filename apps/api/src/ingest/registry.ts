/**
 * apps/api/src/ingest/registry.ts
 *
 * Global feed registry — maps feed IDs to FeedParser implementations.
 * Implements KPI-10 extensibility: adding a new feed requires only registering
 * a new entry here, without modifying any existing ingestion or dashboard code.
 *
 * Phase 2: registers "lagbes" (LagBes warehouse stock export from Apollo NTS).
 * Phase 3+: add entries to feedRegistry.set() without touching existing code.
 *
 * @example (Phase 5 scrap rate feed):
 *   import { scrapRateParser } from "../feeds/scrap-rate/parser.js";
 *   feedRegistry.set("scrap_rate", scrapRateParser);
 */

import type { FeedParser, FeedRegistry } from "@acm-kpi/core";
import { parseAndRemergeLagBes } from "./parser.js";

// ---------------------------------------------------------------------------
// LagBes feed parser registration
// ---------------------------------------------------------------------------

const lagbesParser: FeedParser = {
  id: "lagbes",
  name: "LagBes (Warehouse Stock / Apollo NTS)",
  tableName: "stock_rows",
  fileExtensions: [".csv", ".txt"], // IN-07: accept both .csv and .txt

  /**
   * Parse a LagBes file into an async iterable of raw string records.
   * Each yielded record has exactly 52 keys matching the CSV header.
   * Decimal-comma re-merge and Windows-1252 decode are handled internally.
   */
  async *parse(filePath: string) {
    const rows = await parseAndRemergeLagBes(filePath);
    for (const row of rows) {
      yield row;
    }
  },

  // insert() is NOT overridden here — the orchestrator (ingestLagBesFile) uses
  // the atomic TRUNCATE+INSERT swap logic from writer.ts (IN-09).
  // Phase 5+ can override this for feeds that need different persistence patterns.
};

// ---------------------------------------------------------------------------
// Registry singleton
// ---------------------------------------------------------------------------

/**
 * Global registry of all registered feed parsers, keyed by FeedParser.id.
 *
 * Look up a parser: `feedRegistry.get("lagbes")` → FeedParser | undefined
 * Check registration: `feedRegistry.has("lagbes")` → boolean
 * Add a feed (Phase 3+): `feedRegistry.set("scrap_rate", scrapRateParser)`
 */
export const feedRegistry: FeedRegistry = new Map<string, FeedParser>([
  ["lagbes", lagbesParser],
]);

// ---------------------------------------------------------------------------
// getFeedParser — typed lookup helper
// ---------------------------------------------------------------------------

/**
 * Look up a registered feed parser by its ID.
 * Throws a descriptive error if the feed is not registered.
 *
 * @param feedId  The FeedParser.id to look up (e.g. "lagbes", "scrap_rate").
 * @throws Error  If feedId is not registered.
 *
 * @example
 *   const parser = getFeedParser("lagbes");
 *   // parser.fileExtensions === [".csv", ".txt"]
 *   // for await (const row of parser.parse(filePath)) { ... }
 */
export function getFeedParser(feedId: string): FeedParser {
  const parser = feedRegistry.get(feedId);
  if (!parser) {
    throw new Error(
      `Unknown feed: "${feedId}". Registered feeds: ${[...feedRegistry.keys()].join(", ")}`,
    );
  }
  return parser;
}
