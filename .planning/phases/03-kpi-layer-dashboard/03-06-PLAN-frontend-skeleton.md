---
phase: 03-kpi-layer-dashboard
plan: "03-06"
type: execute
wave: 2
depends_on: ["03-02"]
can_run_parallel_with: ["03-04", "03-05"]
files_modified:
  - apps/frontend/package.json
  - apps/frontend/src/lib/queryClient.ts
  - apps/frontend/src/main.tsx
  - apps/frontend/src/features/kpi/queries.ts
  - apps/frontend/src/features/kpi/hooks/useKpiSummary.ts
  - apps/frontend/src/features/kpi/hooks/useArticles.ts
  - apps/frontend/src/features/kpi/hooks/useStalenessAlert.ts
  - apps/frontend/src/features/kpi/hooks/useKpiMeta.ts
  - apps/frontend/src/pages/DashboardPage.tsx
autonomous: true
requirements:
  - DASH-01
  - DASH-03
  - DASH-04
  - DASH-05
  - DASH-07
  - DASH-08
  - DASH-11

must_haves:
  truths:
    - "The frontend compiles without TypeScript errors after installing packages and creating the files"
    - "useKpiSummary() polls /api/v1/kpi/summary every 30 seconds via React Query"
    - "useStalenessAlert() returns 'none' | 'warning' | 'critical' based on last_updated_at age"
    - "DashboardPage.tsx renders without crashing when useKpiSummary returns isLoading=true"
    - "DashboardPage.tsx renders without crashing when useKpiSummary returns has_data=false (empty state slot)"
    - "QueryClientProvider wraps the entire app in main.tsx"
  artifacts:
    - path: apps/frontend/src/lib/queryClient.ts
      provides: "React Query client with 30s polling defaults"
      exports: ["queryClient"]
    - path: apps/frontend/src/features/kpi/queries.ts
      provides: "Query key factories and fetch functions"
      exports: ["kpiKeys", "fetchKpiSummary", "fetchArticles", "fetchKpiMeta"]
    - path: apps/frontend/src/features/kpi/hooks/useKpiSummary.ts
      provides: "React Query hook for KpiSummary, polls every 30s"
      exports: ["useKpiSummary"]
    - path: apps/frontend/src/features/kpi/hooks/useArticles.ts
      provides: "React Query hook for article drill-down"
      exports: ["useArticles"]
    - path: apps/frontend/src/features/kpi/hooks/useStalenessAlert.ts
      provides: "Staleness level based on last_updated_at age"
      exports: ["useStalenessAlert"]
    - path: apps/frontend/src/features/kpi/hooks/useKpiMeta.ts
      provides: "React Query hook for filter dropdown values"
      exports: ["useKpiMeta"]
    - path: apps/frontend/src/pages/DashboardPage.tsx
      provides: "Full dashboard layout (replaces Phase 1 placeholder)"
  key_links:
    - from: apps/frontend/src/main.tsx
      to: apps/frontend/src/lib/queryClient.ts
      via: "QueryClientProvider client={queryClient}"
    - from: apps/frontend/src/pages/DashboardPage.tsx
      to: apps/frontend/src/features/kpi/hooks/useKpiSummary.ts
      via: "const { data, isLoading } = useKpiSummary()"
    - from: apps/frontend/src/features/kpi/hooks/useKpiSummary.ts
      to: apps/frontend/src/features/kpi/queries.ts
      via: "queryFn: fetchKpiSummary"
---

<objective>
Install React Query, Recharts, and date-fns. Set up the React Query client and wrap the app. Create all the data-fetching hooks and query factories. Replace the Phase 1 DashboardPage placeholder with the full layout skeleton — KPI grid area, slow-mover chart area, stockout list area, filter bar area, and the stale-data banner slot. In this plan the component slots use placeholder stubs (`<div>KPI grid coming in Plan 03-07</div>`); Plan 03-07 fills them in.

This plan also implements the layout-level logic: checking `has_data` to route between empty-state and dashboard views, and wiring the force-refresh button to `refetch()`.

Purpose: Establishes the data layer and page skeleton that Plan 03-07's components slot into. Getting the data flow working first means Plan 03-07 can focus purely on visual components.

Output: Installed packages, query infrastructure, all hooks, updated main.tsx, full DashboardPage layout skeleton.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-kpi-layer-dashboard/03-CONTEXT.md
@.planning/phases/03-kpi-layer-dashboard/01-RESEARCH.md

<interfaces>
<!-- KpiSummary type from Plan 03-02 (packages/core/src/kpi/types.ts) -->
```typescript
import type { KpiSummary, ArticleListResponse, ArticleFilterQuery, KpiMeta } from "@acm-kpi/core";
// KpiSummary.has_data: boolean  ← controls empty state vs dashboard view
// KpiSummary.last_updated_at: string | null  ← staleness check input
```

<!-- Current main.tsx — wrap with QueryClientProvider -->
Current content (apps/frontend/src/main.tsx):
```tsx
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>...</Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
```
Add QueryClientProvider as outer wrapper:
```tsx
<QueryClientProvider client={queryClient}>
  <React.StrictMode>
    <BrowserRouter>...</BrowserRouter>
  </React.StrictMode>
</QueryClientProvider>
```

<!-- Phase 1 DashboardPage to REPLACE -->
Current apps/frontend/src/pages/DashboardPage.tsx:
```tsx
import { Header } from "../components/Header.js";
import { KpiCard } from "../components/KpiCard.js";
export function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-screen-xl px-4 py-8">
        <h2 className="mb-6 text-xl font-semibold text-foreground">Dashboard</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard label="Total inventory value" value="loading…" status="loading" />
        </div>
      </main>
    </div>
  );
}
```
Replace this entirely with the full layout (see action below).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install packages and create React Query client + query factories + hooks</name>
  <files>apps/frontend/package.json, apps/frontend/src/lib/queryClient.ts, apps/frontend/src/features/kpi/queries.ts, apps/frontend/src/features/kpi/hooks/useKpiSummary.ts, apps/frontend/src/features/kpi/hooks/useArticles.ts, apps/frontend/src/features/kpi/hooks/useStalenessAlert.ts, apps/frontend/src/features/kpi/hooks/useKpiMeta.ts</files>
  <action>
**Step 1: Install packages**

Run from the monorepo root:
```bash
npm install -w apps/frontend @tanstack/react-query@5.96.2
npm install -w apps/frontend @tanstack/react-query-devtools@5.96.2
npm install -w apps/frontend recharts@2.12.0
npm install -w apps/frontend date-fns@3.6.0
```

Note: Do NOT install `recharts` types separately — Recharts 2.x ships its own types.
Note: Do NOT add `@types/recharts` — it's for old Recharts 1.x and will conflict.

**Step 2: Create `apps/frontend/src/lib/queryClient.ts`**

```typescript
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 25_000,           // Data considered stale after 25s
      gcTime: 5 * 60_000,          // Cache GC after 5 minutes
      refetchInterval: 30_000,     // Poll every 30 seconds (DASH-04)
      refetchOnWindowFocus: false, // On-prem: users don't tab back often
      refetchOnReconnect: "stale",
      retry: 1,
      retryDelay: 1000,
    },
  },
});
```

**Step 3: Create `apps/frontend/src/features/kpi/queries.ts`**

```typescript
import type { KpiSummary, ArticleListResponse, ArticleFilterQuery, KpiMeta } from "@acm-kpi/core";

// ─── Query key factories ────────────────────────────────────────────────────────
export const kpiKeys = {
  all: ["kpi"] as const,
  summary: () => ["kpi", "summary"] as const,
  articles: (params: ArticleFilterQuery) => ["kpi", "articles", params] as const,
  meta: () => ["kpi", "meta"] as const,
};

// ─── Fetch functions ───────────────────────────────────────────────────────────
export async function fetchKpiSummary(): Promise<KpiSummary> {
  const res = await fetch("/api/v1/kpi/summary", { credentials: "include" });
  if (res.status === 401) {
    // Session expired — redirect to login
    window.location.href = "/login";
    throw new Error("Unauthenticated");
  }
  if (!res.ok) throw new Error(`KPI summary fetch failed: ${res.statusText}`);
  return res.json() as Promise<KpiSummary>;
}

export async function fetchArticles(params: ArticleFilterQuery): Promise<ArticleListResponse> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) qs.append(k, String(v));
  });
  const res = await fetch(`/api/v1/kpi/articles?${qs}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Articles fetch failed: ${res.statusText}`);
  return res.json() as Promise<ArticleListResponse>;
}

export async function fetchKpiMeta(): Promise<KpiMeta> {
  const res = await fetch("/api/v1/kpi/meta", { credentials: "include" });
  if (!res.ok) throw new Error(`KPI meta fetch failed: ${res.statusText}`);
  return res.json() as Promise<KpiMeta>;
}
```

**Step 4: Create `apps/frontend/src/features/kpi/hooks/useKpiSummary.ts`**

```typescript
import { useQuery } from "@tanstack/react-query";
import type { KpiSummary } from "@acm-kpi/core";
import { kpiKeys, fetchKpiSummary } from "../queries.js";

export function useKpiSummary() {
  return useQuery<KpiSummary>({
    queryKey: kpiKeys.summary(),
    queryFn: fetchKpiSummary,
    refetchInterval: 30_000, // DASH-04: poll every 30 seconds
    staleTime: 25_000,
  });
}
```

**Step 5: Create `apps/frontend/src/features/kpi/hooks/useArticles.ts`**

```typescript
import { useQuery } from "@tanstack/react-query";
import type { ArticleListResponse, ArticleFilterQuery } from "@acm-kpi/core";
import { kpiKeys, fetchArticles } from "../queries.js";

export function useArticles(params: ArticleFilterQuery & { enabled?: boolean }) {
  const { enabled = true, ...filterParams } = params;

  return useQuery<ArticleListResponse>({
    queryKey: kpiKeys.articles(filterParams),
    queryFn: () => fetchArticles(filterParams),
    enabled,
    staleTime: 60_000,   // Articles less volatile than summary
    refetchInterval: 60_000,
  });
}
```

**Step 6: Create `apps/frontend/src/features/kpi/hooks/useStalenessAlert.ts`**

This hook returns 'none' | 'warning' | 'critical' based on how old `last_updated_at` is.
- Thresholds (LOCKED in CONTEXT.md): warning > 30 min, critical > 2 hours
- Rechecks every 10 seconds via setInterval
- Pitfall #6 mitigation: staleness check lives in this hook, banner reads from it

```typescript
import { useEffect, useState } from "react";

export type StalenessLevel = "none" | "warning" | "critical";

export function useStalenessAlert(lastUpdatedAt: string | null): StalenessLevel {
  const [level, setLevel] = useState<StalenessLevel>("none");

  useEffect(() => {
    if (!lastUpdatedAt) {
      setLevel("none");
      return;
    }

    const check = () => {
      const minutesOld =
        (Date.now() - new Date(lastUpdatedAt).getTime()) / 1000 / 60;
      if (minutesOld > 120) setLevel("critical");      // > 2 hours (CONTEXT.md)
      else if (minutesOld > 30) setLevel("warning");   // > 30 minutes (CONTEXT.md)
      else setLevel("none");
    };

    check();
    const id = setInterval(check, 10_000); // recheck every 10s
    return () => clearInterval(id);
  }, [lastUpdatedAt]);

  return level;
}
```

**Step 7: Create `apps/frontend/src/features/kpi/hooks/useKpiMeta.ts`**

```typescript
import { useQuery } from "@tanstack/react-query";
import type { KpiMeta } from "@acm-kpi/core";
import { kpiKeys, fetchKpiMeta } from "../queries.js";

export function useKpiMeta() {
  return useQuery<KpiMeta>({
    queryKey: kpiKeys.meta(),
    queryFn: fetchKpiMeta,
    staleTime: 5 * 60_000,  // Meta changes rarely; cache for 5 minutes
    refetchInterval: false,  // Don't poll meta — it changes only on new import
  });
}
```
  </action>
  <verify>
    <automated>cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend" && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>All 6 new files exist; `tsc --noEmit` in apps/frontend exits 0; package.json updated with @tanstack/react-query@5.96.2, recharts@2.12.0, date-fns@3.6.0</done>
</task>

<task type="auto">
  <name>Task 2: Wrap main.tsx with QueryClientProvider; replace DashboardPage.tsx with full layout skeleton</name>
  <files>apps/frontend/src/main.tsx, apps/frontend/src/pages/DashboardPage.tsx</files>
  <action>
**Step 1: Update `apps/frontend/src/main.tsx`**

Add QueryClientProvider as the outermost wrapper. Also add ReactQueryDevtools in development only:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "./lib/queryClient.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { DocsStubPage } from "./pages/DocsStubPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { UploadStubPage } from "./pages/UploadStubPage.js";
import "./styles/global.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

ReactDOM.createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <React.StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/upload"
            element={
              <ProtectedRoute>
                <UploadStubPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/docs"
            element={
              <ProtectedRoute>
                <DocsStubPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>
    {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
  </QueryClientProvider>,
);
```

**Step 2: Replace `apps/frontend/src/pages/DashboardPage.tsx`**

Full replacement (this REMOVES the Phase 1 placeholder):

```tsx
import { useCallback } from "react";
import { Header } from "../components/Header.js";
import { useKpiSummary } from "../features/kpi/hooks/useKpiSummary.js";
import { useStalenessAlert } from "../features/kpi/hooks/useStalenessAlert.js";

/**
 * DashboardPage — Phase 3 full implementation.
 * Replaces the Phase 1 placeholder (single hardcoded KPI card).
 *
 * Layout:
 *   - Header (Phase 1, extended in Plan 03-07 with LastUpdatedBadge)
 *   - StaleDataBanner (above main content when data is old)
 *   - EmptyState (when has_data = false, no successful import yet)
 *   - KPI grid (7 cards in 3-col grid, above fold on desktop)
 *   - SlowMoverChart (stacked horizontal bar)
 *   - StockoutList (top-5 preview with drill-down)
 *   - FilterBar (warehouse / wgr / abc / typ dropdowns)
 *
 * Components in the slots below are stubs in this plan.
 * Plan 03-07 fills them with real implementations.
 *
 * DASH-01, DASH-03, DASH-04, DASH-08
 * Pitfall #6: Freshness addressed via StaleDataBanner + force-refresh
 * Pitfall #8: Lean default view — 7 cards above fold, no mandatory filters
 */
export function DashboardPage() {
  const { data: summary, isLoading, isError, refetch, isFetching } = useKpiSummary();
  const stalenessLevel = useStalenessAlert(summary?.last_updated_at ?? null);

  const handleForceRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-screen-xl px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 rounded bg-muted" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-32 rounded-lg bg-muted" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-screen-xl px-4 py-8">
          <div className="rounded-md border border-red-200 bg-red-50 p-6 text-red-900">
            <p className="font-semibold">Failed to load KPI data</p>
            <p className="text-sm mt-1">Check your network connection or contact your administrator.</p>
            <button
              onClick={handleForceRefresh}
              className="mt-3 text-sm underline hover:no-underline"
              type="button"
            >
              Try again
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Empty state — no successful import yet
  if (!summary?.has_data) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-screen-xl px-4 py-8">
          {/* EmptyState component slot — implemented in Plan 03-07 */}
          <div data-testid="empty-state-slot">
            <p className="text-muted-foreground text-center py-16">
              No data yet — EmptyState component coming in Plan 03-07
            </p>
          </div>
        </main>
      </div>
    );
  }

  // Full dashboard
  return (
    <div className="min-h-screen bg-background">
      <Header
        lastUpdatedAt={summary.last_updated_at}
        onForceRefresh={handleForceRefresh}
        isRefreshing={isFetching}
      />
      <main className="mx-auto max-w-screen-xl px-4 py-8 space-y-6">

        {/* Stale-data banner — Pitfall #6, DASH-03 */}
        {/* StaleDataBanner slot — implemented in Plan 03-07 */}
        {stalenessLevel !== "none" && (
          <div
            data-testid="stale-banner-slot"
            data-staleness={stalenessLevel}
            className={
              stalenessLevel === "critical"
                ? "rounded-md border border-red-300 bg-red-100 px-4 py-3 text-red-900 text-sm"
                : "rounded-md border border-yellow-300 bg-yellow-100 px-4 py-3 text-yellow-900 text-sm"
            }
          >
            {stalenessLevel === "critical"
              ? "Data is older than 2 hours. Please refresh."
              : "Data is over 30 minutes old."}
          </div>
        )}

        {/* KPI Grid — 7 cards in 3-col grid (Pitfall #8: lean default) — Plan 03-07 */}
        <section aria-label="KPI Overview">
          <div
            data-testid="kpi-grid-slot"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {/* KpiGrid component — implemented in Plan 03-07 */}
            <p className="text-muted-foreground col-span-full">
              KPI grid coming in Plan 03-07
            </p>
          </div>
        </section>

        {/* Slow-mover stacked bar chart — DASH-06 — Plan 03-07 */}
        <section aria-label="Slow Movers & Dead Stock">
          <div data-testid="slow-mover-chart-slot">
            <p className="text-muted-foreground">SlowMoverChart coming in Plan 03-07</p>
          </div>
        </section>

        {/* Stockout list with drill-down — DASH-07 — Plan 03-07 */}
        <section aria-label="Stockouts & Low Stock">
          <div data-testid="stockout-list-slot">
            <p className="text-muted-foreground">StockoutList coming in Plan 03-07</p>
          </div>
        </section>

        {/* Filter bar — DASH-05 — Plan 03-07 */}
        <section aria-label="Filters">
          <div data-testid="filter-bar-slot">
            <p className="text-muted-foreground">FilterBar coming in Plan 03-07</p>
          </div>
        </section>

      </main>
    </div>
  );
}
```

Note on `Header` props: Plan 03-07 will extend the `Header` component to accept `lastUpdatedAt`, `onForceRefresh`, and `isRefreshing` props. Until Plan 03-07, TypeScript may complain about unknown props on `Header`. Solve with a temporary cast or optional-prop declaration on `Header`. Do NOT change `Header.tsx` significantly in this plan — just add `lastUpdatedAt?: string | null; onForceRefresh?: () => void; isRefreshing?: boolean` as optional props if needed to avoid TS errors (noop if Header doesn't use them yet).
  </action>
  <verify>
    <automated>cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend" && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>main.tsx wraps app with QueryClientProvider; DashboardPage.tsx is a full replacement (no Phase 1 placeholder); `tsc --noEmit` exits 0; `data-testid` attributes present for slot verification</done>
</task>

</tasks>

<verification>
```bash
# TypeScript compiles cleanly
cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend" && npx tsc --noEmit

# QueryClientProvider is present in main.tsx
grep "QueryClientProvider" "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend/src/main.tsx"

# DashboardPage is replaced (no "loading…" placeholder)
grep "loading…" "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend/src/pages/DashboardPage.tsx"
# Expected: no match

# Hooks exist
ls "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend/src/features/kpi/hooks/"
# Expected: useKpiSummary.ts useArticles.ts useStalenessAlert.ts useKpiMeta.ts

# 30-second polling is present
grep "30_000" "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend/src/features/kpi/hooks/useKpiSummary.ts"

# Staleness thresholds match CONTEXT.md
grep -E "120|30" "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend/src/features/kpi/hooks/useStalenessAlert.ts"
# Expected: 120 minutes (critical) and 30 minutes (warning)

# Frontend tests pass
cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/apps/frontend" && npm test
```
</verification>

<success_criteria>
- Packages installed: `@tanstack/react-query@5.96.2`, `recharts@2.12.0`, `date-fns@3.6.0` in apps/frontend/package.json
- `lib/queryClient.ts` exports a `QueryClient` with `refetchInterval: 30_000`
- `features/kpi/queries.ts` exports `kpiKeys`, `fetchKpiSummary`, `fetchArticles`, `fetchKpiMeta`
- 4 hooks created: `useKpiSummary`, `useArticles`, `useStalenessAlert`, `useKpiMeta`
- `main.tsx` wraps the app tree with `<QueryClientProvider client={queryClient}>`
- `DashboardPage.tsx` fully replaced: handles loading / error / empty-state / data paths
- `useStalenessAlert` uses the locked thresholds: warning > 30 min, critical > 120 min
- `tsc --noEmit` in apps/frontend exits 0
</success_criteria>

<output>
After completion, create `.planning/phases/03-kpi-layer-dashboard/03-06-SUMMARY-frontend-skeleton.md` with:
- Files created/modified
- Package versions installed
- Hook export names confirmed
- Any TypeScript workarounds applied (e.g. Header optional props)
</output>
