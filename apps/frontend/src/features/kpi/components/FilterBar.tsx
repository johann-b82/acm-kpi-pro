import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { KpiMeta, ArticleFilterQuery, ArticleType, AbcClass } from "@acm-kpi/core";
import { useTranslation } from "react-i18next";

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
 * Phase 6: all strings localized via i18n (D-18).
 */
export function FilterBar({ meta, warehouse, wgr, abc, typ, onChange }: FilterBarProps) {
  const { t } = useTranslation();

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

  const allLabel = t("dashboard.filters.all");

  return (
    <div className="flex flex-wrap gap-3" role="search" aria-label="Dashboard filters">
      {/* Warehouse filter */}
      <Select value={warehouse ?? ALL_VALUE} onValueChange={handleWarehouse}>
        <SelectTrigger className="w-48" aria-label={t("dashboard.filters.warehouse")}>
          <SelectValue placeholder={`${allLabel} ${t("dashboard.filters.warehouse")}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>{`${allLabel} ${t("dashboard.filters.warehouse")}`}</SelectItem>
          {(meta?.warehouses ?? []).map((w) => (
            <SelectItem key={w} value={w}>
              {w}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Product group filter */}
      <Select value={wgr ?? ALL_VALUE} onValueChange={handleWgr}>
        <SelectTrigger className="w-48" aria-label={t("dashboard.filters.productGroup")}>
          <SelectValue placeholder={`${allLabel} ${t("dashboard.filters.productGroup")}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>{`${allLabel} ${t("dashboard.filters.productGroup")}`}</SelectItem>
          {(meta?.product_groups ?? []).map((g) => (
            <SelectItem key={g} value={g}>
              {g}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* ABC class filter */}
      <Select value={abc ?? ALL_VALUE} onValueChange={handleAbc}>
        <SelectTrigger className="w-36" aria-label={t("dashboard.filters.abcClass")}>
          <SelectValue placeholder={`${allLabel} ABC`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>{`${allLabel} ABC`}</SelectItem>
          <SelectItem value="A">A</SelectItem>
          <SelectItem value="B">B</SelectItem>
          <SelectItem value="C">C</SelectItem>
        </SelectContent>
      </Select>

      {/* Article type filter */}
      <Select value={typ ?? ALL_VALUE} onValueChange={handleTyp}>
        <SelectTrigger className="w-40" aria-label={t("dashboard.filters.articleType")}>
          <SelectValue placeholder={`${allLabel} ${t("dashboard.filters.articleType")}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>{`${allLabel} ${t("dashboard.filters.articleType")}`}</SelectItem>
          <SelectItem value="ART">ART</SelectItem>
          <SelectItem value="MAT">MAT</SelectItem>
          <SelectItem value="HLB">HLB</SelectItem>
          <SelectItem value="WKZ">WKZ</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
