import type { UploadErrorResponse } from "@acm-kpi/core";
import { AlertCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ErrorSummaryProps {
  result: UploadErrorResponse;
  onReset: () => void;
}

interface FieldGroup {
  field: string;
  count: number;
}

/**
 * ErrorSummary — red card shown after a failed upload (UP-06).
 *
 * Groups validation errors by field (sorted by count desc) above a scrollable
 * detail table with real <th scope="col"> headers for WCAG AA compliance.
 * The "Copy all errors" button copies the full error set as tab-separated
 * values for pasting into spreadsheets / IT tickets.
 */
export function ErrorSummary({ result, onReset }: ErrorSummaryProps) {
  const [copied, setCopied] = useState(false);

  const fieldGroups = useMemo<FieldGroup[]>(() => {
    const counts = result.errors.reduce<Record<string, number>>(
      (acc, err) => {
        acc[err.field] = (acc[err.field] ?? 0) + 1;
        return acc;
      },
      {},
    );
    return Object.entries(counts)
      .map(([field, count]) => ({ field, count }))
      .sort((a, b) => b.count - a.count);
  }, [result.errors]);

  const errorCount = result.errors.length;
  const fieldCount = fieldGroups.length;

  const handleCopyErrors = async () => {
    const header = "Row\tField\tValue\tReason";
    const rows = result.errors.map(
      (e) =>
        `${e.row}\t${e.field}\t${String(e.value ?? "")}\t${e.reason}`,
    );
    try {
      await navigator.clipboard.writeText([header, ...rows].join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable (insecure context, test env) — swallow.
    }
  };

  return (
    <Card className="border-2 border-red-200" aria-live="assertive">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
          <CardTitle className="text-lg">Import failed</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          {errorCount} errors across {fieldCount} fields:
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-1 text-sm">
          {fieldGroups.map((group) => (
            <li key={group.field} className="flex items-center gap-1">
              <span aria-hidden="true">•</span>
              <span className="font-medium">{group.field}</span>
              <span className="text-muted-foreground">
                — {group.count} rows
              </span>
            </li>
          ))}
        </ul>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Error Details</h3>
          <div className="max-h-96 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Row</TableHead>
                  <TableHead scope="col">Field</TableHead>
                  <TableHead scope="col">Value</TableHead>
                  <TableHead scope="col">Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.errors.map((err, idx) => (
                  <TableRow key={`${err.row}-${err.field}-${idx}`}>
                    <TableCell>{err.row}</TableCell>
                    <TableCell>{err.field}</TableCell>
                    <TableCell className="max-w-[160px] truncate">
                      {String(err.value ?? "")}
                    </TableCell>
                    <TableCell>{err.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => void handleCopyErrors()}>
            {copied ? "Copied!" : "Copy all errors"}
          </Button>
          <Button variant="outline" onClick={onReset}>
            Try another file
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
