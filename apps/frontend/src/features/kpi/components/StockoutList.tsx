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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stockouts &amp; Low Stock</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No stockouts — all articles have sufficient coverage.
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
                    {item.bestand_basiseinheit.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    €{item.wert_mit_abw.toLocaleString()}
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
