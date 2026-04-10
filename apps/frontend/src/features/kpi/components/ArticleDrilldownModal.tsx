import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { formatCurrency, formatNumber } from "../../../lib/format.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { ArticleSummary, ArticleRow } from "@acm-kpi/core";
import { useArticles } from "../hooks/useArticles.js";

interface ArticleDrilldownModalProps {
  isOpen: boolean;
  onClose: () => void;
  article: ArticleSummary | null;
}

/**
 * Article drill-down modal.
 *
 * Shows 8-10 essential columns by default.
 * "Show all columns" toggle reveals all available fields from the full ArticleRow.
 *
 * Closes via X button, Escape key (Radix handles this), or backdrop click.
 *
 * CONTEXT.md decision: modal (not route), 8-10 essentials + toggle for all 52.
 */
export function ArticleDrilldownModal({ isOpen, onClose, article }: ArticleDrilldownModalProps) {
  const [showAll, setShowAll] = useState(false);

  // Fetch full article row when modal is open
  const { data, isLoading } = useArticles({
    q: article?.artikelnr ?? "",
    filter: "search",
    enabled: isOpen && article !== null,
  });

  const fullArticle: ArticleRow | undefined = data?.items[0];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
        onInteractOutside={onClose}
        onEscapeKeyDown={onClose}
      >
        <DialogHeader>
          <DialogTitle>
            Article Details — {article?.artikelnr ?? ""}
          </DialogTitle>
          <DialogDescription>
            View essential stock data for this article. Use &quot;Show all columns&quot; to see all 52 fields.
          </DialogDescription>
          <DialogClose
            className="absolute right-4 top-4"
            onClick={onClose}
          />
        </DialogHeader>

        {isLoading && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading article data...
          </div>
        )}

        {!isLoading && fullArticle && (
          <>
            {/* Essential columns (8 by default) */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Artikelnr</TableCell>
                  <TableCell className="font-mono">{fullArticle.artikelnr}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Bezeichnung 1</TableCell>
                  <TableCell>{fullArticle.bezeichnung_1 ?? "—"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Typ</TableCell>
                  <TableCell>{fullArticle.typ}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Lagername</TableCell>
                  <TableCell>{fullArticle.lagername}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Bestand</TableCell>
                  <TableCell>
                    {formatNumber(fullArticle.bestand_basiseinheit)}
                    {fullArticle.einh ? ` ${fullArticle.einh}` : ""}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Wert mit Abw.</TableCell>
                  <TableCell>{formatCurrency(fullArticle.wert_mit_abw)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Letzt. Zugang</TableCell>
                  <TableCell>{fullArticle.letzt_zugang ?? "—"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Lagerabgang</TableCell>
                  <TableCell>{fullArticle.lagerabgang_dat ?? "—"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">ABC-Kennz. VK</TableCell>
                  <TableCell className="font-semibold">{fullArticle.abc_kennz_vk}</TableCell>
                </TableRow>
              </TableBody>
            </Table>

            {/* Toggle for all columns */}
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAll((prev) => !prev)}
              >
                {showAll ? "Hide extra columns" : "Show all columns"}
              </Button>
            </div>

            {/* All columns — extra fields revealed by toggle */}
            {showAll && (
              <div className="mt-4 overflow-y-auto max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead>Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(fullArticle).map(([key, val]) => (
                      <TableRow key={key}>
                        <TableCell className="font-medium text-xs">{key}</TableCell>
                        <TableCell className="text-xs">
                          {val === null || val === undefined
                            ? "—"
                            : typeof val === "number"
                            ? formatNumber(val)
                            : String(val)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        {!isLoading && !fullArticle && article && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Article details not available.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
