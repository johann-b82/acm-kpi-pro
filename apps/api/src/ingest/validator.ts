/**
 * apps/api/src/ingest/validator.ts
 *
 * Validates all parsed LagBes rows through StockRowSchema (Zod v3).
 * Collects ALL errors before returning — never throws on first failure (IN-11).
 */
import { StockRowSchema, type StockRow } from "./schema.js";
import type { IngestError, ValidationResult } from "./types.js";

/**
 * Validates an array of raw string records (output of parseAndRemergeLagBes)
 * through StockRowSchema.safeParse().
 *
 * Returns:
 *   { valid: true, rows: StockRow[] }      — all rows valid, ready for DB insert
 *   { valid: false, errors: IngestError[] } — at least one invalid row; all errors collected
 *
 * Row numbering is 1-based with the header at row 1, so the first data row is
 * row 2 (matching LagBes file conventions for operator-visible error messages).
 */
export async function validateAllRows(
  parsedRows: Record<string, string>[],
): Promise<ValidationResult & { rows?: StockRow[] }> {
  const errors: IngestError[] = [];
  const validRows: StockRow[] = [];

  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    const result = StockRowSchema.safeParse(row);

    if (!result.success) {
      for (const issue of result.error.issues) {
        // issue.path[0] is the German column name (input shape before transform)
        const field = issue.path.length > 0 ? String(issue.path[0]) : "unknown";
        errors.push({
          row: i + 2, // header=1, data starts at 2
          field,
          // noUncheckedIndexedAccess: row[field] could be undefined if field
          // is not a key in row — that's fine for an error report (undefined is unknown)
          value: (row as Record<string, unknown>)[field],
          reason: issue.message,
        });
      }
    } else {
      validRows.push(result.data);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, rows: validRows };
}
