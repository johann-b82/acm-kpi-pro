/**
 * apps/api/src/ingest/parser.ts
 *
 * Streaming LagBes CSV parser with Windows-1252 decode and schema-aware
 * decimal-comma re-merge.
 *
 * Pipeline:
 *   createReadStream(file)
 *     → iconv decodeStream("cp1252")       (Windows-1252 → UTF-8, Pitfall #2)
 *     → csv-parse (delimiter=";", raw arrays)
 *     → remergeFields()                    (decimal-comma repair, Pitfall #1)
 *     → Promise<Record<string, string>[]>
 */

import { createReadStream } from "node:fs";
import { parse as csvParse } from "csv-parse";
import { decodeStream } from "iconv-lite";
import pino from "pino";
import { LAGBES_NUMERIC_COLUMNS } from "./schema.js";

const logger = pino({ name: "lagbes-parser" });

// ---------------------------------------------------------------------------
// Re-merge algorithm
// ---------------------------------------------------------------------------

/**
 * Walks the raw field array from csv-parse and merges adjacent integer-pair
 * fields back into a single German decimal value.
 *
 * Algorithm (plain English):
 *   The raw token array may have MORE tokens than the 52-column header when
 *   numeric fields containing German decimal commas are split by the CSV parser.
 *   The surplus (rawArr.length - header.length) equals the number of splits.
 *
 *   For each output column in the 52-column header:
 *     1. Compute the current surplus: (rawArr.length - inputIdx) - (header.length - outputIdx)
 *     2. If surplus is 0 — no more merges are possible; assign left token as-is.
 *     3. If surplus > 0 — check ALL conditions:
 *        a. The current column is in LAGBES_NUMERIC_COLUMNS with canHaveDecimals=true.
 *        b. The left token matches /^-?\d+$/ — integer (including negatives like "-18414").
 *        c. The right token (rawArr[inputIdx+1]) matches /^\d{1,N}$/ where N is the
 *           column's maxFractionalDigits. Using column-specific max digits prevents
 *           "Abwert%=0" from consuming the next column's 3-digit integer as a fraction
 *           (e.g., "0" + "560" would be 56% devaluation — clearly wrong; maxFractionalDigits=2
 *           for percentage columns correctly rejects 3-digit right-side values).
 *     4. If all conditions hold:
 *        → Merge as "${left},${right}" (restoring the German decimal comma)
 *        → Advance inputIdx by 2 (consume both tokens)
 *        → Log a pino warning so operators can see when the quirk fires
 *     5. Otherwise:
 *        → Use the left token as-is
 *        → Advance inputIdx by 1
 *
 * Edge cases handled:
 *   - Negative values: "-18414" + "25" → "-18414,25" (left matches /^-?\d+$/)
 *   - Dot-decimal: "2.037" does NOT match /^-?\d+$/ → not merged
 *   - Zero rows (surplus=0): never merges, all values assigned as-is
 *   - Adjacent zeros ("0"+"0"): only merges if surplus > 0 AND the conditions hold
 *   - Non-numeric columns (text, enum, date): not in LAGBES_NUMERIC_COLUMNS → never merged
 *
 * @param rawArr   Raw token array from csv-parse (may have extra tokens from decimal splits)
 * @param header   The 52 column names from the header row
 * @param rowNum   1-based data row number (for logging)
 * @returns        Object keyed by column name with exactly header.length entries
 */
export function remergeFields(
  rawArr: string[],
  header: string[],
  rowNum?: number,
): Record<string, string> {
  const result: Record<string, string> = {};
  let inputIdx = 0;
  let outputIdx = 0;

  while (outputIdx < header.length) {
    // noUncheckedIndexedAccess: explicitly handle the undefined case
    // (header and rawArr are guaranteed to have these indices by the while guard)
    const colName = header[outputIdx] ?? "";
    const left = rawArr[inputIdx] ?? "";
    const right = rawArr[inputIdx + 1] ?? "";

    // Surplus = extra tokens remaining vs remaining header columns.
    // When surplus == 0, there are exactly enough tokens left — no more merges possible.
    const remainingTokens = rawArr.length - inputIdx;
    const remainingCols = header.length - outputIdx;
    const currentSurplus = remainingTokens - remainingCols;

    const numMeta = LAGBES_NUMERIC_COLUMNS[colName];

    // Condition gate: only attempt merge when there IS a surplus to consume.
    // This prevents "0"+"0" greedy merges when columns are exactly aligned.
    const maxFrac = numMeta?.maxFractionalDigits ?? 4;
    const fracPattern = new RegExp(`^\\d{1,${maxFrac}}$`);
    const canMerge =
      currentSurplus > 0 &&
      numMeta?.canHaveDecimals === true &&
      /^-?\d+$/.test(left) &&
      fracPattern.test(right) &&
      right.length > 0;

    if (canMerge) {
      const merged = `${left},${right}`;
      result[colName] = merged;
      logger.warn(
        {
          row: rowNum,
          column: colName,
          left,
          right,
          merged,
        },
        "decimal-comma re-merge fired",
      );
      inputIdx += 2;
    } else {
      result[colName] = left;
      inputIdx += 1;
    }

    outputIdx += 1;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main export: parseAndRemergeLagBes
// ---------------------------------------------------------------------------

/**
 * Parses a LagBes CSV file and returns all data rows with decimal-comma fields
 * repaired.
 *
 * Each returned record has exactly 52 keys corresponding to the CSV header
 * (same German names). Values are strings — Zod validation in validator.ts
 * converts them to typed JS values.
 *
 * @param filePath  Absolute path to the LagBes .csv file (Windows-1252 encoded)
 * @returns         Promise resolving to an array of raw string records, one per data row
 */
export function parseAndRemergeLagBes(
  filePath: string,
): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    let header: string[] = [];
    let headerCaptured = false;
    let dataRowNum = 1; // 1-based; header = row 1, first data row = 2

    const readStream = createReadStream(filePath);
    const decodeStrm = decodeStream("cp1252");
    const csvParser = csvParse({
      delimiter: ";",
      columns: false, // Receive raw arrays so we can run re-merge before mapping
      relax_column_count: true, // Allow extra tokens from split decimal commas
      from_line: 1, // Include header row (we detect it manually)
      trim: true,
      skip_empty_lines: true,
      cast: false, // Never auto-cast — Zod handles all type conversion
    });

    readStream.on("error", (err) => {
      reject(new Error(`Failed to open file: ${filePath}: ${err.message}`));
    });

    csvParser.on("data", (rawArr: string[]) => {
      if (!headerCaptured) {
        header = rawArr;
        headerCaptured = true;
        return;
      }

      dataRowNum++;
      const merged = remergeFields(rawArr, header, dataRowNum);
      rows.push(merged);
    });

    csvParser.on("end", () => {
      resolve(rows);
    });

    csvParser.on("error", (err) => {
      reject(new Error(`CSV parse error: ${err.message}`));
    });

    readStream.pipe(decodeStrm).pipe(csvParser);
  });
}
