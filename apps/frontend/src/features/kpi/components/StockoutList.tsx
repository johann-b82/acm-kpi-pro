import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ArticleSummary } from "@acm-kpi/core";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatNumber } from "../../../lib/format.js";

interface StockoutListProps {
  items: ArticleSummary[];
  onRowClick: (item: ArticleSummary) => void;
}

/**
 * Top-5 stockout items preview table.
 * Clicking any row opens the ArticleDrilldownModal.
 *
 * Columns: Artikelnr, Bezeichnung 1, Bestand, Wert mit Abw., ABC
 * DASH-07: stockout drill-down.
 */
export function StockoutList({ items, onRowClick }: StockoutListProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.kpiLabels.stockouts")}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("dashboard.emptyState.body")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artikelnr</TableHead>
                <TableHead>Bezeichnung 1</TableHead>
                <TableHead className="text-right">Bestand</TableHead>
                <TableHead className="text-right">Wert mit Abw.</TableHead>
                <TableHead className="text-center">ABC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={item.artikelnr}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onRowClick(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onRowClick(item);
                    }
                  }}
                  aria-label={`View details for ${item.artikelnr}`}
                >
                  <TableCell className="font-mono text-sm">{item.artikelnr}</TableCell>
                  <TableCell>{item.bezeichnung_1 ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {formatNumber(item.bestand_basiseinheit)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(item.wert_mit_abw)}
                  </TableCell>
                  <TableCell className="text-center font-semibold">
                    {item.abc_kennz_vk}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
