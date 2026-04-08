---
phase: 03-kpi-layer-dashboard
plan: "03-07"
type: execute
wave: 3
depends_on: ["03-05", "03-06"]
can_run_parallel_with: []
files_modified:
  - apps/frontend/src/features/kpi/components/KpiGrid.tsx
  - apps/frontend/src/features/kpi/components/KpiCard.tsx
  - apps/frontend/src/features/kpi/components/SlowMoverChart.tsx
  - apps/frontend/src/features/kpi/components/StockoutList.tsx
  - apps/frontend/src/features/kpi/components/ArticleDrilldownModal.tsx
  - apps/frontend/src/features/kpi/components/FilterBar.tsx
  - apps/frontend/src/features/kpi/components/StaleDataBanner.tsx
  - apps/frontend/src/features/kpi/components/EmptyState.tsx
  - apps/frontend/src/features/kpi/components/LastUpdatedBadge.tsx
  - apps/frontend/src/lib/kpiColors.ts
  - apps/frontend/src/components/Header.tsx
  - apps/frontend/src/pages/DashboardPage.tsx
  - apps/frontend/src/features/kpi/components/KpiCard.test.tsx
  - apps/frontend/src/features/kpi/components/StaleDataBanner.test.tsx
  - apps/frontend/src/features/kpi/components/EmptyState.test.tsx
  - apps/frontend/src/features/kpi/components/ArticleDrilldownModal.test.tsx
autonomous: true
requirements:
  - KPI-02
  - KPI-03
  - KPI-04
  - KPI-05
  - KPI-06
  - KPI-07
  - KPI-08
  - KPI-09
  - DASH-01
  - DASH-02
  - DASH-03
  - DASH-04
  - DASH-05
  - DASH-06
  - DASH-07
  - DASH-08
  - DASH-11
  - TEST-02

must_haves:
  truths:
    - "7 KPI cards render above the fold on desktop (3-col grid, lg:grid-cols-3)"
    - "Each color-coded KPI card shows both a color indicator AND a text label ('Healthy' / 'Watch' / 'Action') — color is not the only signal (accessibility)"
    - "SlowMoverChart renders a stacked horizontal bar with Active / Slow / Dead buckets"
    - "StockoutList shows top-5 items; clicking a row opens ArticleDrilldownModal"
    - "ArticleDrilldownModal shows 8-10 essential columns by default; 'Show all columns' toggle reveals all 52"
    - "ArticleDrilldownModal closes via X button, Escape key, and backdrop click"
    - "StaleDataBanner is yellow when staleness='warning', red when staleness='critical'"
    - "EmptyState card shows 'No Data Yet' heading and role-appropriate CTA"
    - "FilterBar renders 4 dropdowns (warehouse, product group, ABC class, article type) — wired to filter state"
    - "LastUpdatedBadge renders 'Last updated HH:MM' in the header"
    - "Force-refresh button in header calls refetch()"
    - "Frontend builds with 0 TypeScript errors after this plan"
  artifacts:
    - path: apps/frontend/src/features/kpi/components/KpiGrid.tsx
      provides: "7-card KPI grid layout"
      exports: ["KpiGrid"]
    - path: apps/frontend/src/features/kpi/components/KpiCard.tsx
      provides: "Single color-coded KPI card (replaces Phase 1 primitive)"
      exports: ["KpiCard"]
    - path: apps/frontend/src/features/kpi/components/SlowMoverChart.tsx
      provides: "Recharts stacked horizontal bar chart"
      exports: ["SlowMoverChart"]
    - path: apps/frontend/src/features/kpi/components/StockoutList.tsx
      provides: "Top-5 stockout rows with drill-down trigger"
      exports: ["StockoutList"]
    - path: apps/frontend/src/features/kpi/components/ArticleDrilldownModal.tsx
      provides: "Modal with 8-10 essential cols + toggle for all 52"
      exports: ["ArticleDrilldownModal"]
    - path: apps/frontend/src/features/kpi/components/FilterBar.tsx
      provides: "4-dropdown filter controls"
      exports: ["FilterBar"]
    - path: apps/frontend/src/features/kpi/components/StaleDataBanner.tsx
      provides: "Yellow/red warning bar based on staleness level"
      exports: ["StaleDataBanner"]
    - path: apps/frontend/src/features/kpi/components/EmptyState.tsx
      provides: "Onboarding card before first import"
      exports: ["EmptyState"]
    - path: apps/frontend/src/features/kpi/components/LastUpdatedBadge.tsx
      provides: "Timestamp badge for last import"
      exports: ["LastUpdatedBadge"]
    - path: apps/frontend/src/lib/kpiColors.ts
      provides: "Color utility: CSS classes from KpiColor string"
      exports: ["kpiColorToClasses", "kpiColorToLabel"]
  key_links:
    - from: apps/frontend/src/pages/DashboardPage.tsx
      to: apps/frontend/src/features/kpi/components/KpiGrid.tsx
      via: "<KpiGrid summary={summary} />"
    - from: apps/frontend/src/features/kpi/components/KpiGrid.tsx
      to: apps/frontend/src/features/kpi/components/KpiCard.tsx
      via: "<KpiCard title=... value=... color=... />"
    - from: apps/frontend/src/features/kpi/components/StockoutList.tsx
      to: apps/frontend/src/features/kpi/components/ArticleDrilldownModal.tsx
      via: "onRowClick triggers modal open with selected ArticleSummary"
    - from: apps/frontend/src/components/Header.tsx
      to: apps/frontend/src/features/kpi/components/LastUpdatedBadge.tsx
      via: "<LastUpdatedBadge lastUpdatedAt=... />"
---

<objective>
Build all the KPI dashboard UI components. This plan converts the DashboardPage slot stubs from Plan 03-06 into working components. It also installs the required shadcn/ui primitives (Card, Dialog, Table, Select, Badge, Tooltip, Button, Input), creates the color utility, and extends Header.tsx minimally to display the LastUpdatedBadge and force-refresh button.

The DashboardPage.tsx from Plan 03-06 is also updated to replace stub `<div>` slots with real components.

Key visual/UX requirements from CONTEXT.md (all LOCKED):
- 7 cards in a 3-col grid on desktop (Pitfall #8: lean executive view)
- Color + text label (never color alone) for accessibility
- Stacked horizontal bar chart for slow movers (not treemap)
- Drill-down is a modal, not a route
- 8–10 essential columns by default in modal; "Show all 52" toggle
- Modal closes on X / Escape / backdrop
- English strings, default `toLocaleString()` formatting (Phase 6 localizes)
- No `Intl.NumberFormat('de-DE')` in this plan

Output: All 9 components + utility + Header extension + updated DashboardPage + RTL tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-kpi-layer-dashboard/03-CONTEXT.md
@.planning/phases/03-kpi-layer-dashboard/01-RESEARCH.md

<interfaces>
<!-- KpiSummary type — the data flowing into these components -->
```typescript
import type { KpiSummary, ArticleSummary, ArticleRow, KpiMeta } from "@acm-kpi/core";
// summary.has_data: boolean
// summary.days_on_hand: { days: number; color: "green"|"yellow"|"red"|"neutral" }
// summary.slow_dead_stock.buckets: SlowMoverBucket[]
// summary.stockouts.items_preview: ArticleSummary[]
// summary.abc_distribution: { a, b, c }
// summary.inventory_turnover: { ratio: number; color: "neutral" }
// summary.devaluation: { total_eur, pct_of_value, color: "neutral" }
```

<!-- shadcn/ui component paths (after install via CLI) -->
```
@/components/ui/card        → Card, CardContent, CardDescription, CardHeader, CardTitle
@/components/ui/dialog      → Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose
@/components/ui/table       → Table, TableBody, TableCell, TableHead, TableHeader, TableRow
@/components/ui/select      → Select, SelectContent, SelectItem, SelectTrigger, SelectValue
@/components/ui/badge       → Badge
@/components/ui/tooltip     → Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
@/components/ui/button      → Button
@/components/ui/input       → Input
```

<!-- Phase 1 Header.tsx location: apps/frontend/src/components/Header.tsx -->
<!-- Extend minimally: add optional lastUpdatedAt, onForceRefresh, isRefreshing props -->
<!-- Do NOT restructure Header.tsx — just add the badge and button if props provided -->

<!-- Phase 1 KpiCard.tsx (apps/frontend/src/components/KpiCard.tsx) -->
<!-- The new KpiCard lives at apps/frontend/src/features/kpi/components/KpiCard.tsx -->
<!-- The Phase 1 primitive remains at apps/frontend/src/components/KpiCard.tsx unchanged -->
<!-- DashboardPage no longer imports the Phase 1 primitive (it imports the features version) -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install shadcn/ui components and create color utility</name>
  <files>apps/frontend/src/lib/kpiColors.ts</files>
  <action>
**Step 1: Install shadcn/ui components**

Run from `apps/frontend/` directory:
```bash
cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend"
npx shadcn@latest add card
npx shadcn@latest add dialog
npx shadcn@latest add table
npx shadcn@latest add select
npx shadcn@latest add badge
npx shadcn@latest add tooltip
npx shadcn@latest add button
npx shadcn@latest add input
```

If `shadcn@latest` prompts for config (components.json), use defaults: TypeScript, Tailwind CSS, default style, src/components/ui path. If `components.json` already exists from Phase 1, skip the init step.

Note: Use `npx shadcn@latest` (not `npx shadcn-ui@latest` — the package was renamed).

**Step 2: Create `apps/frontend/src/lib/kpiColors.ts`**

Pure utility functions mapping `KpiColor` strings to Tailwind class bundles and human-readable labels. Color is never the only signal (accessibility rule from CONTEXT.md).

```typescript
import type { KpiColor } from "@acm-kpi/core";

/**
 * Returns Tailwind CSS class bundle for a KpiColor value.
 * Used for card border + background + text color (DASH-02).
 * Accessibility: always paired with kpiColorToLabel() for text label.
 */
export function kpiColorToClasses(color: KpiColor): {
  card: string;
  dot: string;
  badge: string;
} {
  const map: Record<KpiColor, { card: string; dot: string; badge: string }> = {
    green: {
      card: "border-green-300 bg-green-50",
      dot: "bg-green-500",
      badge: "bg-green-100 text-green-900 border-green-300",
    },
    yellow: {
      card: "border-yellow-300 bg-yellow-50",
      dot: "bg-yellow-500",
      badge: "bg-yellow-100 text-yellow-900 border-yellow-300",
    },
    red: {
      card: "border-red-300 bg-red-50",
      dot: "bg-red-500",
      badge: "bg-red-100 text-red-900 border-red-300",
    },
    neutral: {
      card: "border-blue-200 bg-blue-50",
      dot: "bg-blue-400",
      badge: "bg-blue-100 text-blue-900 border-blue-200",
    },
  };
  return map[color];
}

/**
 * Returns a human-readable status label for a KpiColor.
 * REQUIRED alongside color for accessibility (WCAG: color not sole indicator).
 */
export function kpiColorToLabel(color: KpiColor): string {
  const labels: Record<KpiColor, string> = {
    green: "Healthy",
    yellow: "Watch",
    red: "Action Required",
    neutral: "Info",
  };
  return labels[color];
}
```
  </action>
  <verify>
    <automated>test -f "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend/src/lib/kpiColors.ts" && test -d "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend/src/components/ui"</automated>
  </verify>
  <done>kpiColors.ts exists; shadcn/ui components directory populated with at least card.tsx, dialog.tsx, table.tsx, select.tsx, badge.tsx, button.tsx</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create all KPI components and their RTL tests</name>
  <files>
    apps/frontend/src/features/kpi/components/KpiCard.tsx,
    apps/frontend/src/features/kpi/components/KpiGrid.tsx,
    apps/frontend/src/features/kpi/components/SlowMoverChart.tsx,
    apps/frontend/src/features/kpi/components/StockoutList.tsx,
    apps/frontend/src/features/kpi/components/ArticleDrilldownModal.tsx,
    apps/frontend/src/features/kpi/components/FilterBar.tsx,
    apps/frontend/src/features/kpi/components/StaleDataBanner.tsx,
    apps/frontend/src/features/kpi/components/EmptyState.tsx,
    apps/frontend/src/features/kpi/components/LastUpdatedBadge.tsx,
    apps/frontend/src/features/kpi/components/KpiCard.test.tsx,
    apps/frontend/src/features/kpi/components/StaleDataBanner.test.tsx,
    apps/frontend/src/features/kpi/components/EmptyState.test.tsx,
    apps/frontend/src/features/kpi/components/ArticleDrilldownModal.test.tsx
  </files>
  <behavior>
    Test — KpiCard:
    - Renders the title and formatted value
    - Shows "Healthy" label when color="green"
    - Shows "Watch" label when color="yellow"
    - Shows "Action Required" label when color="red"
    - Color dot has correct bg class for each color
    - Renders without crashing when color="neutral"

    Test — StaleDataBanner:
    - Returns null (renders nothing) when staleness="none"
    - Renders yellow banner text when staleness="warning"
    - Renders red banner text when staleness="critical"

    Test — EmptyState:
    - Renders "No Data Yet" heading
    - Admin user sees "Upload" button (mock useAuth returning role=Admin)
    - Viewer user sees contact message (mock useAuth returning role=Viewer)

    Test — ArticleDrilldownModal:
    - Closed when isOpen=false
    - Open renders essential columns: Artikelnr, Bezeichnung 1, Typ, Lagername, Bestand, Wert mit Abw., ABC
    - "Show all columns" button toggles visibility of additional fields
    - onClose called when X button clicked
    - onClose called when Escape key pressed (Dialog handles this via Radix)
    - onClose called when backdrop clicked (DialogOverlay click)
  </behavior>
  <action>
Install RTL if not already present:
```bash
npm install -w apps/frontend --save-dev @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

**Write tests first (RED), then implement components (GREEN).**

---

**`KpiCard.tsx`** — new feature-level card (NOT the Phase 1 primitive at `src/components/KpiCard.tsx`):

Uses shadcn `Card`, `Badge`, `Tooltip` from the research spec (RESEARCH.md lines ~958–1027).
Props: `{ title: string; value: string | number; unit?: string; color: KpiColor; tooltip?: string; }`
Shows: colored border (`kpiColorToClasses(color).card`), color dot, value in bold, `kpiColorToLabel(color)` as a small text label below the value.
Keyboard navigable (add `tabIndex={0}` to the Card element).
Use the implementation from RESEARCH.md as the starting point.

---

**`KpiGrid.tsx`** — takes `summary: KpiSummary`, renders 7 KpiCards:

```
1. "Total Inventory Value"  value=€X,XXX,XXX     color="neutral"  unit="EUR"
2. "Days on Hand"           value=XX days         color=summary.days_on_hand.color
3. "Dead Stock"             value=X.X%            color=summary.slow_dead_stock.color
4. "Stockouts"              value=XX items        color=summary.stockouts.color
5. "ABC Distribution"       value="A:XX% B:XX%"  color="neutral"
6. "Inventory Turnover"     value=X.X×            color="neutral"
7. "Devaluation"            value=€XXX,XXX (X.X%) color="neutral"
```

Value formatting: use `toLocaleString()` for numbers (Phase 6 will replace with locale-specific formatting per CONTEXT.md — do NOT use `Intl.NumberFormat('de-DE')` here).

---

**`SlowMoverChart.tsx`** — from RESEARCH.md (lines ~1030–1110):

Uses `recharts` BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer.
Horizontal layout (`layout="vertical"` in Recharts terminology for horizontal bars).
3 bars: Active (green #22c55e), Slow (yellow #eab308), Dead (red #ef4444), stackId="a".
Shows clutter_excluded_count and samples_excluded_count as text below the chart.
No RTL test for the chart itself (Recharts SVG rendering is hard to test in jsdom) — but ensure it renders without crashing with empty buckets.

---

**`StockoutList.tsx`**:

Props: `{ items: ArticleSummary[]; onRowClick: (item: ArticleSummary) => void }`
Renders a shadcn `Table` with columns: Artikelnr, Bezeichnung 1, Bestand, Wert mit Abw., ABC.
Each row is clickable (cursor-pointer, onClick triggers `onRowClick(item)`).
Shows "No stockouts" empty state when items is empty.
Max 5 rows (the API already limits items_preview to 5; component just renders what it receives).

---

**`ArticleDrilldownModal.tsx`** (CONTEXT.md: modal, not route; 8-10 essentials + toggle):

Props:
```typescript
interface ArticleDrilldownModalProps {
  isOpen: boolean;
  onClose: () => void;
  article: ArticleSummary | null;
}
```

Uses shadcn `Dialog`. `DialogContent` has `onInteractOutside={() => onClose()}` for backdrop close.

Essential columns always shown (8 per CONTEXT.md):
- Artikelnr
- Bezeichnung 1
- Typ (from useArticles hook, fetched when modal opens)
- Lagername
- Bestand (bestand_basiseinheit + einh)
- Wert mit Abw. (wert_mit_abw)
- letzt_zugang (last inbound)
- lagerabgang_dat (last outbound)
- abc_kennz_vk

Since the modal receives only `ArticleSummary` (5 fields from preview), it needs to fetch full article data when opened. Use `useArticles` hook with `q=artikelnr` and `enabled=isOpen && article !== null` to get the full row including typ, lagername, einh, letzt_zugang, lagerabgang_dat.

"Show all columns" state: `const [showAll, setShowAll] = useState(false)`. When true, renders a second shadcn `Table` below with all available fields from the full ArticleRow. Scrollable (`overflow-y-auto max-h-96`).

X button calls `onClose()`. Escape key is handled by Radix Dialog automatically. Backdrop click triggers `onInteractOutside`.

---

**`FilterBar.tsx`**:

Props:
```typescript
interface FilterBarProps {
  meta: KpiMeta | undefined;
  warehouse: string | undefined;
  wgr: string | undefined;
  abc: "A" | "B" | "C" | undefined;
  typ: "ART" | "MAT" | "HLB" | "WKZ" | undefined;
  onChange: (updates: Partial<ArticleFilterQuery>) => void;
}
```

4 shadcn `Select` dropdowns. Each has an "All" option (value = undefined). Connected to `onChange`.
Note: DASH-05 says "filter scaffolding present; filtering logic deferred to v1.x" — this plan wires the FilterBar to local state in DashboardPage but the API call with the filter params is deferred. The dropdowns must render and update state (not crash), even if the filtered data isn't yet used downstream. This satisfies DASH-05.

---

**`StaleDataBanner.tsx`** — from RESEARCH.md (lines ~1112–1177):

Props: `{ level: StalenessLevel }` (imports `StalenessLevel` type from hooks/useStalenessAlert).
Returns null when `level === "none"`.
Yellow variant: `bg-yellow-100 border-yellow-300 text-yellow-900` with `AlertTriangle` icon.
Red variant: `bg-red-100 border-red-300 text-red-900` with `AlertCircle` icon.

---

**`EmptyState.tsx`** — from RESEARCH.md (lines ~1179+) and CONTEXT.md decisions:

Uses session user role to decide CTA:
- Admin: primary Button navigating to `/upload` (Phase 4 stub already exists)
- Viewer: "Contact your admin to load data."

Imports `useAuth` from Phase 1 hook at `../../auth/hooks/useAuth.js` (or wherever it is in the Phase 1 implementation). If the hook doesn't exist yet or has a different path, use `window.location.pathname` or a props-based approach as fallback.

Center card with ACM logo from `../../assets/acm-logo.svg` or `../../assets/acm-logo.png` (whichever exists from Phase 1). If neither exists, use a placeholder div.

---

**`LastUpdatedBadge.tsx`**:

Props: `{ lastUpdatedAt: string | null }`
If null: renders nothing.
Otherwise: renders "Last updated: HH:MM" using `new Date(lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })`.
Phase 6 will replace `toLocaleTimeString()` with locale-specific formatting.

---

**Update `Header.tsx`** (minimal extension, Phase 1 file):

Add optional props: `lastUpdatedAt?: string | null; onForceRefresh?: () => void; isRefreshing?: boolean`

Inside Header.tsx, render `<LastUpdatedBadge lastUpdatedAt={lastUpdatedAt} />` and a refresh button when `onForceRefresh` is provided:

```tsx
{onForceRefresh && (
  <Button
    variant="outline"
    size="sm"
    onClick={onForceRefresh}
    disabled={isRefreshing}
    aria-label="Refresh KPI data"
  >
    <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
  </Button>
)}
<LastUpdatedBadge lastUpdatedAt={lastUpdatedAt ?? null} />
```

---

**Update `DashboardPage.tsx`** (from Plan 03-06):

Replace the slot stubs with real components. Import and use:
- `<EmptyState />` in the empty-state path
- `<StaleDataBanner level={stalenessLevel} />` at the top of main
- `<KpiGrid summary={summary} />` in the KPI section
- `<SlowMoverChart buckets={summary.slow_dead_stock.buckets} clutterCount={...} samplesCount={...} />`
- `<StockoutList items={summary.stockouts.items_preview} onRowClick={setSelectedArticle} />`
- `<FilterBar meta={meta} warehouse={...} wgr={...} abc={...} typ={...} onChange={...} />`
- `<ArticleDrilldownModal isOpen={modalOpen} onClose={() => setModalOpen(false)} article={selectedArticle} />`

Add local state: `const [selectedArticle, setSelectedArticle] = useState<ArticleSummary | null>(null)` and `const [modalOpen, setModalOpen] = useState(false)`.
Add `const { data: meta } = useKpiMeta()`.
Add `const [filters, setFilters] = useState<Partial<ArticleFilterQuery>>({})`.
  </action>
  <verify>
    <automated>cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend" && npm test 2>&1 | tail -30</automated>
  </verify>
  <done>All RTL tests pass; `npm test` exits 0; `tsc --noEmit` exits 0; 7 KPI cards in grid; drill-down modal opens/closes; stale banner renders in yellow/red; empty state renders; force-refresh button in header; no Phase 1 tests broken</done>
</task>

</tasks>

<verification>
```bash
# All frontend tests pass
cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend" && npm test

# TypeScript compiles
cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend" && npx tsc --noEmit

# Frontend builds cleanly (Vite)
cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend" && npm run build 2>&1 | tail -10

# Components exist
ls "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend/src/features/kpi/components/"
# Expected: KpiCard.tsx KpiGrid.tsx SlowMoverChart.tsx StockoutList.tsx
#           ArticleDrilldownModal.tsx FilterBar.tsx StaleDataBanner.tsx
#           EmptyState.tsx LastUpdatedBadge.tsx + .test.tsx files

# Color is NOT the sole indicator (accessibility check)
grep "kpiColorToLabel\|Healthy\|Watch\|Action" \
  "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend/src/features/kpi/components/KpiCard.tsx"
# Expected: label present

# No de-DE formatting in Phase 3 (deferred to Phase 6)
grep "de-DE" "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend/src/" -r
# Expected: no matches

# API test suite still passes (regression)
cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/api" && npm test 2>&1 | tail -5
```
</verification>

<success_criteria>
- 9 components created in `apps/frontend/src/features/kpi/components/`
- `kpiColors.ts` utility created at `apps/frontend/src/lib/kpiColors.ts`
- RTL tests for KpiCard, StaleDataBanner, EmptyState, ArticleDrilldownModal all pass
- `cd apps/frontend && npm test` exits 0
- `cd apps/frontend && npm run build` exits 0 (Vite build)
- `tsc --noEmit` in apps/frontend exits 0
- Color is never the sole indicator — every color-coded card shows text label
- No `Intl.NumberFormat('de-DE')` anywhere in Phase 3 frontend code
- DashboardPage.tsx uses real components (no slot stub divs remaining)
- Modal closes on X, Escape, and backdrop click
- Force-refresh button present in header; calls `refetch()`
</success_criteria>

<output>
After completion, create `.planning/phases/03-kpi-layer-dashboard/03-07-SUMMARY-kpi-components.md` with:
- All 9 component files created (with line counts)
- RTL test count and pass/fail
- shadcn/ui components installed
- Any deviations from research spec (with reason)
- Confirmation that accessibility requirement (color + label) is implemented
- Confirmation that German formatting is NOT present
</output>
