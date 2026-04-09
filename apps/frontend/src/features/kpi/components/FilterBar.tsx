import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { KpiMeta, ArticleFilterQuery, ArticleType, AbcClass } from "@acm-kpi/core";

interface FilterBarProps {
  meta: KpiMeta | undefined;
  warehouse: string | undefined;
  wgr: string | undefined;
  abc: AbcClass | undefined;
  typ: ArticleType | undefined;
  onChange: (updates: Partial<ArticleFilterQuery>) => void;
}

const ALL_VALUE = "__all__";

/**
 * Filter bar with 4 dropdown controls for slicing the dashboard.
 *
 * Dropdowns: warehouse, product group (wgr), ABC class, article type.
 * Each has an "All" option (resolves to undefined).
 *
 * DASH-05: filter scaffolding present; actual filtered data wired in v1.x.
 * Phase 6 will add i18n; labels are English in Phase 3.
 */
export function FilterBar({ meta, warehouse, wgr, abc, typ, onChange }: FilterBarProps) {
  const handleWarehouse = (val: string) => {
    const updates: Partial<ArticleFilterQuery> = {};
    if (val !== ALL_VALUE) updates.warehouse = val;
    onChange(updates);
  };

  const handleWgr = (val: string) => {
    const updates: Partial<ArticleFilterQuery> = {};
    if (val !== ALL_VALUE) updates.wgr = val;
    onChange(updates);
  };

  const handleAbc = (val: string) => {
    const updates: Partial<ArticleFilterQuery> = {};
    if (val !== ALL_VALUE) updates.abc = val as AbcClass;
    onChange(updates);
  };

  const handleTyp = (val: string) => {
    const updates: Partial<ArticleFilterQuery> = {};
    if (val !== ALL_VALUE) updates.typ = val as ArticleType;
    onChange(updates);
  };

  return (
    <div className="flex flex-wrap gap-3" role="search" aria-label="Dashboard filters">
      {/* Warehouse filter */}
      <Select value={warehouse ?? ALL_VALUE} onValueChange={handleWarehouse}>
        <SelectTrigger className="w-48" aria-label="Filter by warehouse">
          <SelectValue placeholder="All Warehouses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All Warehouses</SelectItem>
          {(meta?.warehouses ?? []).map((w) => (
            <SelectItem key={w} value={w}>
              {w}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Product group filter */}
      <Select value={wgr ?? ALL_VALUE} onValueChange={handleWgr}>
        <SelectTrigger className="w-48" aria-label="Filter by product group">
          <SelectValue placeholder="All Product Groups" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All Product Groups</SelectItem>
          {(meta?.product_groups ?? []).map((g) => (
            <SelectItem key={g} value={g}>
              {g}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* ABC class filter */}
      <Select value={abc ?? ALL_VALUE} onValueChange={handleAbc}>
        <SelectTrigger className="w-36" aria-label="Filter by ABC class">
          <SelectValue placeholder="All ABC" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All ABC</SelectItem>
          <SelectItem value="A">A — High value</SelectItem>
          <SelectItem value="B">B — Medium value</SelectItem>
          <SelectItem value="C">C — Low value</SelectItem>
        </SelectContent>
      </Select>

      {/* Article type filter */}
      <Select value={typ ?? ALL_VALUE} onValueChange={handleTyp}>
        <SelectTrigger className="w-40" aria-label="Filter by article type">
          <SelectValue placeholder="All Types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All Types</SelectItem>
          <SelectItem value="ART">ART — Article</SelectItem>
          <SelectItem value="MAT">MAT — Material</SelectItem>
          <SelectItem value="HLB">HLB — Semi-finished</SelectItem>
          <SelectItem value="WKZ">WKZ — Tool/Sample</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
