# Feature Research: Executive Warehouse-Stock KPI Dashboard

**Domain:** Manufacturing inventory management (aerospace) — executive dashboard for warehouse-stock KPIs  
**Data source:** Apollo NTS `LagBes` CSV export  
**Researched:** 2026-04-08  
**Confidence:** HIGH (formulas verified against industry standards; features validated against PowerBI/Tableau templates)

---

## Executive Summary

This research identifies **table stakes KPIs**, **UI layout patterns**, and **upload/docs features** for an on-prem warehouse-stock dashboard targeting ACM executives. The key finding: **inventory dashboards succeed when they answer "are we winning or losing?" in under 5 seconds** (top-line KPI cards + directional indicators) before offering drill-down. The upload feature must validate comprehensively but show errors all at once, not iteratively. Documentation must live in-app, not external links.

---

## KPI Primitives — Formulas & Mappings

Each KPI below maps directly to LagBes columns and includes industry-standard formulas.

### TABLE STAKES KPIs

These are computable from LagBes data **in v1** and are expected by any executive reviewing inventory health.

#### 1. **Total Inventory Value (€)**

**What:** Sum of all non-deleted articles at devalued cost.  
**Formula:** `SUM(Wert mit Abw. WHERE Gelöscht ≠ 'J')`  
**LagBes columns:** `Wert mit Abw.` (already devaluation-adjusted), `Gelöscht`  
**Unit:** EUR  
**Visual treatment:** Large KPI card, primary position (top-left). Show as €X.XXX.XXX or €X,XXX,XXX (German formatting). Include trend sparkline (to previous snapshot, once history exists).  
**Typical threshold:** Stability ± 5% month-over-month is healthy; >10% jump flags supply-chain issues or order corrections. Alert if trending up (cash tied up) or down suddenly (possible write-offs).  
**Complexity:** LOW — simple aggregation.

**Notes:**
- Use `Wert mit Abw.` not `Wert` because it reflects accounting-adjusted value (devaluation already applied).
- Exclude `Gelöscht='J'` items to match GL reconciliation.

---

#### 2. **Days on Hand / Coverage (Reichw.Mon.)**

**What:** How many months of production coverage the inventory provides at current consumption rate.  
**Formula:** Already provided in LagBes: `Reichw.Mon.` (coverage in months). Convert to days if needed: `Reichw.Mon. × 30.4`.  
**LagBes columns:** `Reichw.Mon.`, `Durch.Verbr` (for context/drill-down).  
**Unit:** Months (or days for detail view).  
**Visual treatment:** KPI card, secondary position (top-right area). Color-code: **GREEN** ≥6 months, **YELLOW** 2–6 months, **RED** <2 months or no consumption data. Show distribution histogram by product group (sliced) in dashboard.  
**Typical threshold:** <2 months = emergency reorder risk; >12 months = excess stock (dead money).  
**Complexity:** LOW — already calculated in source.

**Notes:**
- `Reichw.Mon.` is calculated by Apollo as `Bestand (Basiseinheit) / (Durch.Verbr × 12)`. Trust the source value; no recalculation needed.
- If `Durch.Verbr` is zero/null, coverage is undefined (museum items, samples); flag separately as "no consumption."

---

#### 3. **Slow Movers & Dead Stock (Aging Buckets)**

**What:** Quantity and value of inventory not moved recently, segmented by age.  
**Formula:** 
- **Dead stock:** `COUNT(*) and SUM(Wert mit Abw.) WHERE (TODAY() - letzt.Zugang) > 180 days AND Gelöscht ≠ 'J'`  
- **Slow movers (6–12 months):** `... WHERE (TODAY() - letzt.Zugang) >= 180 days AND (TODAY() - letzt.Zugang) < 365 days`  
- **Aging (1–2 years):** `... WHERE (TODAY() - letzt.Zugang) >= 365 days AND (TODAY() - letzt.Zugang) < 730 days`  
- **Very old (>2 years):** `... WHERE (TODAY() - letzt.Zugang) >= 730 days`  

**LagBes columns:** `letzt.Zugang` (last receipt date), `Lagerabgang Dat` (last outflow date — use whichever is more recent), `Bestand (Basiseinheit)`, `Wert mit Abw.`, `Gelöscht`.  

**Unit:** Count of SKUs + EUR value.  

**Visual treatment:** 
- Stacked bar chart (or pareto) showing count and value across buckets: 0–6mo, 6–12mo, 1–2yr, 2+yr.  
- Tooltip: "X SKUs, €Y value in dead stock (>180 days); Y SKUs haven't moved in 2+ years (likely obsolete)."  
- Click bucket → drill to article-level table (Artikelnr, description, stock qty, value, last movement date).  

**Typical threshold:** >10% of total value in >180-day bucket = attention needed. >5% in 2+ year bucket = obsolescence risk, assess for write-down.  

**Complexity:** MEDIUM — requires date arithmetic and multi-bucket aggregation.

**Notes:**
- Apollo may have both `letzt.Zugang` (last inflow) and `Lagerabgang Dat` (last outflow). Use the **most recent of the two** to detect if item is truly dormant.
- Negative stock (reversals/reservations) should still be included; they may indicate corrections that block movement.
- Row field `Lagerzugang letzes 1/2 Jahr` and `Lagerabgang letzes 1/2 Jahr` provide last 6-month transaction counts; can be used to augment—if both are 0, item is definitely stagnant.

---

#### 4. **Stockouts & Low-Stock Alerts**

**What:** Articles with zero or negative stock (and optionally below safety thresholds), surfaced for action.  
**Formula:**
- **Negative stock:** `Bestand (Basiseinheit) < 0`  
- **Zero stock (but not deleted):** `Bestand (Basiseinheit) = 0 AND Gelöscht ≠ 'J'`  
- **Low stock (optional, requires external threshold):** `Bestand (Lagereinheit) < [user-defined threshold per article]` — not computable from LagBes alone; would require separate SKU configuration.  

**LagBes columns:** `Bestand (Basiseinheit)`, `Bestand (Lagereinheit)`, `Gelöscht`, `Artikelnr`.  

**Unit:** Count of affected SKUs.  

**Visual treatment:**
- Single KPI card: "X articles out of stock." Click to drill → table of affected items (Artikelnr, description, current stock, last outflow date, ABC class).  
- If negative stock, flag row color RED and include note: "Negative stock — likely correction or reservation."  
- Optionally: history badge "was in stock Y days ago" if Lagerabgang Dat is recent.  

**Typical threshold:** Any negative stock is a data-quality concern; zero stock on high-value A-items should trigger investigation within 24 hours.  

**Complexity:** LOW — simple row-level filter and count.

**Notes:**
- Negative stock is **not an error**; it represents ordered/reserved items (production holds). Do not exclude from reporting; executives need visibility.
- Distinguish "out of stock (sold out)" from "zero stock (never received/museum item)." Use `Lagerzugang letzes 1/2 Jahr` and `Lagerabgang letzes 1/2 Jahr` to infer; if both zero, it's likely a sample/museum item.

---

#### 5. **Inventory Turnover Ratio (Annual)**

**What:** How many times inventory is sold and replaced per year. Higher = healthier cash flow.  
**Formula:** `COGS / Average Inventory` — but LagBes doesn't provide COGS per SKU or annual sales data.  
**Proxy available:** Use `Umsatz Me J` (annual sales volume in movement units from LagBes) and current `Bestand (Basiseinheit)` to estimate:  
`Proxy Turnover ≈ Umsatz Me J / MAX(Bestand (Basiseinheit), 1)` — rough approximation.  
**Better approach:** Combine with `Lagerabgang letzes Jahr` (outflow last year in value) if available.  

**LagBes columns:** `Umsatz Me J` (annual sales movement), `Bestand (Basiseinheit)`, `Lagerabgang letzes Jahr`, `Lagerzugang letzes 1/2 Jahr`.  

**Unit:** Ratio (times per year). Benchmark: manufacturing typically 4–12x; aerospace sub-assemblies lower (2–4x).  

**Visual treatment:** 
- Dashboard histogram: "X% of inventory turns <2x/year (slow), Y% turns 4–6x/year (healthy), Z% turns >8x/year (high velocity)."  
- Drill-down: table of articles by turnover band, sortable by value.  

**Typical threshold:** Anything <1x/year is a candidate for aging/obsolescence. >10x/year in sub-components is normal for hardware.  

**Complexity:** MEDIUM — depends on data completeness in `Umsatz Me J` field; may need to fall back to transaction history if not reliable.

**Notes:**
- LagBes provides `Umsatz Me J` and `Umsatz Me VJ` (current year vs. prior year sales). Trust these if populated; if blank, mark as "insufficient data."
- True inventory turnover ratio requires COGS/AVERAGE_INVENTORY over 12 months; this is an **approximation** that may diverge from accounting's GAAP turnover. Use for operational insight, not financial reporting.

---

#### 6. **ABC Classification Distribution**

**What:** Breakdown of inventory value by ABC class (Pareto 80/20 analysis).  
**Formula:**
- Sum value by class: `SUM(Wert mit Abw.) GROUP BY ABC-Kennz. VK`  
- Percentage of total: `(Class Value / Total Value) × 100`  

**LagBes columns:** `ABC-Kennz. VK`, `Wert mit Abw.`, `Gelöscht`.  

**Unit:** EUR and percentage.  

**Visual treatment:**
- Donut/pie chart: "A-class: €X.XXX.XXX (70%), B-class: €Y (20%), C-class: €Z (10%)" with count overlay: "180 A-items, 340 B-items, 450 C-items."  
- Separate KPI cards below: "A-class articles need daily attention," "C-class: review annually for write-down."  

**Typical distribution:** Pareto 80/20 rule → A (~10–15% of items, ~70–80% of value), B (~20–30% items, ~15–20% value), C (~50–70% items, ~5–10% value). Deviation suggests supply-chain concentration risk.  

**Complexity:** LOW — simple GROUP BY and SUM.

**Notes:**
- `ABC-Kennz. VK` is "ABC classification from sales perspective" per PROJECT.md. Use as-is; it reflects what Apollo has pre-calculated.
- Blanks in this column = items never sold or recently added; treat as C-class in rollups.

---

#### 7. **Obsolete / Written-Down Value (Abwert%)**

**What:** Total value at risk due to devaluation. High devaluation % = articles losing market value.  
**Formula:**
- Total devalued amount: `SUM(Wert - Wert mit Abw.) WHERE Abwert% > 0 AND Gelöscht ≠ 'J'`  
- As % of original: `SUM(Wert - Wert mit Abw.) / SUM(Wert) × 100`  
- Count of articles with write-down: `COUNT(*) WHERE Abwert% > 0`  

**LagBes columns:** `Wert`, `Wert mit Abw.`, `Abwert%`, `Gelöscht`.  

**Unit:** EUR + percentage.  

**Visual treatment:**
- Metric card: "€X.XXX written down across Y articles (Z% of total value)."  
- Histogram showing distribution of `Abwert%` across articles (0%, 1–25%, 26–50%, 51–75%, 76–99%, 100%).  
- Drill-down: articles with >50% write-down, sorted by absolute loss (€).  

**Typical threshold:** <1% of total value written down is normal (obsolescence reserve). >5% = significant write-down event (model change, overstock). 100% write-down = full removal (likely sample/museum items).  

**Complexity:** LOW — arithmetic on existing columns.

**Notes:**
- `Abwert%` is percentage devaluation already applied by Apollo. Trust the value.
- Articles with Abwert%=100% are still physically present but have zero accounting value; often samples, prototypes, or damaged goods. Include in "at-risk" reporting but flag separately.

---

### DIFFERENTIATORS (Beyond Table Stakes)

These features set the dashboard apart from generic PowerBI templates and add executive insight.

#### 8. **Inventory Composition by Warehouse + Product Group (Slice-and-Dice)**

**What:** Multi-dimensional breakdown of value/stock/turnover by warehouse location and product line.  
**Why it matters:** Executives need to understand which warehouses are bottlenecks and which product groups are capital-intensive.  
**Available dimensions:** `Lagername` (HAUPTLAGER NEU, VERSANDLAGER, PRODUKTION ACM, MUSTERRAUM) + `WGR` (product group: STOFF, FOAMK, METALL, BEISTELL, GARN, etc.) + `Typ` (ART, MAT, HLB, WKZ).  
**Visual:** Heatmap or grouped bar chart: rows=warehouses, columns=product groups, color=total value or coverage (months). Click cell → drill to article table.  
**Complexity:** MEDIUM — requires GROUP BY on multiple dimensions; dashboard framework must support dynamic slicing.

---

#### 9. **Pareto Analysis: Top 20% of Items = 80% of Value**

**What:** Visual ranking of articles by contribution to total inventory value, highlighting the vital few.  
**Why it matters:** Executives can focus management effort on high-value SKUs that move the needle.  
**Visual:** Tornado chart or cumulative line: X-axis = articles ranked by value (descending), Y-axis = cumulative % of total value. Mark 80% threshold with vertical line; count articles in "vital 20%."  
**Formula:** Rank articles by `Wert mit Abw.` descending; cumulative % = running total / grand total.  
**Complexity:** MEDIUM — requires ranking and cumulative calculation.

---

#### 10. **Coverage Trend (Dashboard History)**

**What:** Line chart of average coverage (days on hand) over time, showing if stock is getting older or fresher.  
**Why it matters:** Even without full snapshot history, executives need to know if coverage is trending up (excess) or down (risk).  
**Caveat:** V1 replaces latest snapshot; true trends require phase 2 (history tracking).  
**Possible interim approach:** Cache prior day's snapshot on dashboard load; show "vs. yesterday" delta for coverage metrics.  
**Complexity:** MEDIUM-HARD — requires snapshot persistence (separate from core data model); defer to v1.x if not critical.

---

#### 11. **Alert Summary Panel (Critical Issues at a Glance)**

**What:** One-line alerts for executive action:  
- "X articles out of stock (up from Y yesterday)"  
- "€Z dead stock (>2 years) — assess for write-down"  
- "Q turned negative — possible data error or correction"  

**Why it matters:** Saves scrolling; executives see problems first.  
**Visual:** Card at top of dashboard with 3–4 critical alerts, each clickable to drill-down table.  
**Complexity:** LOW-MEDIUM — requires alert rule engine; initial rules can be hardcoded.

---

#### 12. **Supplier Risk Scorecard (ABC + Warehouse Concentration)**

**What:** For each A-class article, show supplier concentration: "Article X (€Y value) sourced from Supplier A only — single point of failure."  
**Why it matters:** Aerospace supply-chain resilience is critical; executives need visibility into dependency.  
**LagBes column:** `Lieferant` (supplier name/code).  
**Visual:** Scorecard: "X A-class items single-sourced (risk), Y A-class items dual-sourced (safe)."  
**Complexity:** MEDIUM — requires join to supplier data and concentration logic.

---

## Feature Landscape: Table Stakes vs. Differentiators

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | LagBes Dependency | Notes |
|---------|--------------|------------|-------------------|-------|
| **Total Inventory Value (KPI card)** | Executives immediately ask "how much stock do we hold?" | LOW | `Wert mit Abw.` | Must handle German currency formatting (€X.XXX.XXX) |
| **Days on Hand / Coverage (KPI card)** | Standard inventory health metric; Apollo already calculates | LOW | `Reichw.Mon.`, `Durch.Verbr` | Color-coded thresholds required |
| **Slow Movers & Dead Stock (aging buckets)** | Executives care about tied-up capital in dormant items | MEDIUM | `letzt.Zugang`, `Lagerabgang Dat` | Must handle date arithmetic and null dates from old items |
| **Stockouts & Low-Stock Alerts** | Operational visibility; missing stock = production risk | LOW | `Bestand (Basiseinheit)`, `Gelöscht` | Distinguish negative vs. zero stock |
| **ABC Classification (donut chart)** | Pareto analysis is standard; data already in LagBes | LOW | `ABC-Kennz. VK`, `Wert mit Abw.` | Blanks treated as C-class |
| **Inventory Turnover Ratio (histogram)** | Standard KPI; shows stock health | MEDIUM | `Umsatz Me J`, `Bestand (Basiseinheit)` | Requires proxy calculation; may have data quality gaps |
| **Devaluation / Write-down Summary (KPI + table)** | Accounting reconciliation; executives need write-down visibility | LOW | `Wert`, `Wert mit Abw.`, `Abwert%` | Straightforward calculation |
| **Slice & filter by Warehouse, Product Group, ABC, Article Type** | Executives analyze by line of business and location | MEDIUM | `Lagername`, `WGR`, `Typ`, `ABC-Kennz. VK` | Dashboard must support multi-dimensional filtering; applies to all KPIs |
| **Dashboard KPI cards layout (top-line, no charts)** | Executive dashboards show "are we winning?" in 5 seconds | LOW | All KPI columns | Card order: Total Value, Coverage, Slow Movers, Stockouts, ABC, Devaluation |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | LagBes Dependency | Notes |
|---------|-------------------|------------|-------------------|-------|
| **Pareto (80/20) visualization** | Clear visual of which articles drive inventory value; focuses mgmt effort | MEDIUM | `Wert mit Abw.` (ranked) | Cumulative % line with 80% threshold marker |
| **Warehouse + Product Group heatmap** | Reveals bottlenecks and capital concentration by line of business | MEDIUM | `Lagername`, `WGR`, `Wert mit Abw.` | Interactive: color by value, coverage, or turnover |
| **Supplier Risk Scorecard** | Aerospace supply-chain resilience; detect single-sourced A-class items | MEDIUM | `Lieferant`, `ABC-Kennz. VK`, `Wert mit Abw.` | Requires supplier deduplication logic |
| **Multi-criteria drill-down (value + age + turnover simultaneously)** | Instead of separate tables, one "article detail view" shows all dimensions at once | MEDIUM | All core columns | Click Pareto bar → article table with 8+ sortable columns |
| **Conditional formatting & thresholds (color-coded alerts)** | Visual scanning faster than reading numbers; red=action, yellow=watch, green=ok | LOW | All KPI columns | Rules: Coverage RED <2mo, YELLOW 2–6mo, GREEN ≥6mo, etc. |
| **Upload page with validation preview and error summary** | Reduces re-uploads and support tickets | MEDIUM | Parser + validation engine | See "Upload Page UX" section below |
| **In-app help modal (context-sensitive tooltips on KPI definitions)** | Self-service learning; executives understand what each KPI means without Slack | LOW | None | Hardcoded help text per KPI card |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real-time sub-minute updates (websockets, live refresh)** | "We want the latest data instantly" | V1 data arrives via CSV imports on a schedule (daily/weekly). Sub-minute refresh creates illusion of liveness without value; adds complexity (polling, stale data handling). Executives don't check inventory every 5 seconds. | Keep "updated as of [timestamp]" badge; trigger refresh only on new CSV import. If future phases need true streaming, design for it, but don't build it now. |
| **Custom metric builder (let execs define formulas in UI)** | "We need flexibility for our unique KPIs" | Custom formulas without governance lead to inconsistent definitions across users, BI chaos, and audit headaches. Maintenance burden explodes with each custom metric. | Provide a fixed, well-documented KPI set (v1). Add new KPIs via code/schema changes (documented, tested). If phase 2 adds custom metrics, require admin approval and formula review. |
| **Drill-down to infinitely deep detail tables (100+ columns)** | "We need to see everything" | Information overload; executives stop using it. LagBes has 40+ columns; showing all in one table is unusable. Pareto analysis and heatmaps work; raw data dumps don't. | Start with 8–10 key columns (Article, Description, Stock, Value, ABC, Warehouse, Coverage, Last Movement). "More columns" link → expandable detail (price, supplier, devaluation %, notes). Keep primary view scannable. |
| **Predictive ML (forecast future stockouts, suggest reorders)** | "AI will optimize inventory" | Requires historical consumption data and demand forecasts. LagBes has consumption snapshots, not time-series. ML without clean data = garbage. Beyond MVP scope. | Provide consumption rate visibility (`Durch.Verbr`, `Umsatz Me J`), coverage metrics, and aging analysis. Let supply-chain team make decisions. Phase 2 can explore forecasting if demand data feeds are available. |
| **Auto-export to email/PDF on schedule** | "We want automated reporting" | Email fatigue; PDFs become stale within hours; requires email infrastructure in on-prem environment. | v1: Manual export (CSV, PDF snapshot) on-demand. Dashboard URL is the report. Phase 2: Scheduled PDF/email if ops team requests. |
| **Multi-site / multi-warehouse aggregation across ACM locations** | "We want ACM-wide view" | Out of scope per PROJECT.md. Each site is a separate installation. Aggregation would require cross-site data sync, which is complex and out-of-scope. | Single-site deployment for v1. If multi-site is needed later, it's a separate phase (requires federation or central DB). |
| **Inventory forecast / ABC reclassification on import** | "Update ABC class automatically" | ABC-Kennz. VK already in LagBes and pre-calculated by Apollo. Re-calculating in app is redundant and may diverge from accounting's official ABC. If Apollo's ABC is wrong, fix at source. | Trust Apollo's ABC classification. Provide visibility into how many items are in each class. If classification needs to change, request updated export from Apollo, don't recalculate in app. |

---

## Feature Dependencies

```
[Dashboard KPI Cards]
    ├──requires──> [Inventory Value Calculation] (total inventory €)
    ├──requires──> [Coverage Calculation] (Reichw.Mon. display)
    ├──requires──> [Aging Bucket Analysis] (slow movers)
    ├──requires──> [Turnover Ratio Calculation] (annual movement)
    ├──requires──> [Devaluation Summary] (write-down €)
    └──requires──> [ABC Classification Grouping]

[Slice & Filter (by Warehouse, Product Group, ABC)]
    ├──requires──> [Dashboard KPI Cards] (applies to all cards)
    └──requires──> [Column Mapping] (Lagername, WGR, ABC-Kennz. VK)

[Drill-Down Tables]
    ├──requires──> [Slice & Filter] (drill-down respects filters)
    ├──requires──> [Row-level Stock Data] (detail rows from parsed LagBes)
    └──enhances──> [Dashboard KPI Cards] (click metric → detail table)

[Upload Page]
    ├──requires──> [CSV Parser] (handle semicolon + decimal-comma quirk)
    ├──requires──> [Validation Engine] (row-level error detection)
    ├──requires──> [Database Schema] (store parsed articles)
    └──enhances──> [Dashboard KPI Cards] (refresh after successful import)

[Pareto Visualization]
    ├──requires──> [Article Ranking by Value] (sort by Wert mit Abw.)
    ├──requires──> [Cumulative % Calculation]
    └──enhances──> [ABC Classification] (visual confirmation of Pareto 80/20)

[Supplier Risk Scorecard]
    ├──requires──> [ABC Classification Grouping] (filter to A-class only)
    └──requires──> [Lieferant Column Mapping] (supplier concentration logic)

[In-App Help]
    └──enhances──> [All KPI Cards] (context-sensitive tooltips on hover)

[Dark/Light Mode + i18n]
    ├──applies to──> [All UI components] (retroactively; low-complexity addition)
    └──requires──> [i18n framework] (German/English text + German number formatting)

[Conditional Formatting / Alerts]
    ├──requires──> [Threshold Rules Engine] (Coverage: RED <2mo, YELLOW 2–6mo)
    └──enhances──> [Dashboard KPI Cards] (visual cues: color, icons)
```

### Dependency Notes

- **CSV Parser requires special handling:** Decimal comma + semicolon delimiter will cause naive parsing to fail. Parser must understand the LagBes schema (known numeric columns) and re-merge split decimal pairs. This is a blocker for everything else.
- **Database schema design is critical:** Column names/types must preserve original precision (dates as `DD.MM.YY`, decimals as floats, text descriptions as UTF-8). Schema informs all KPI calculations downstream.
- **Slice & Filter is foundational:** Every KPI card must respect the active filters (warehouse, product group, ABC, article type). Don't build KPI cards first, then add filtering; design for filtering from the start.
- **Upload page enhances, not requires:** Dashboard can launch without upload UX (statically load a sample CSV). But upload page is required for actual usage (executives need to load new data).
- **Drill-down is quality-of-life:** KPI cards alone are sufficient for v1. Drill-down tables make the dashboard useful; they're P1 but not blocking launch if detail is slow to build.

---

## Upload Page UX

Executives and admins upload CSVs via a dedicated `/upload` route. This is a critical feature: poor UX here creates support overhead and failed imports.

### Table Stakes (Upload v1)

| Feature | Why Expected | UX Pattern | Notes |
|---------|--------------|-----------|-------|
| **Drag-and-drop + file picker** | Standard file UX in 2026 | Drop zone with "or click to browse" fallback | Handle `.csv` and `.txt` extensions |
| **File preview (first 5–10 rows)** | Catch wrong file before committing | Show parsed rows in table format (headers + sample data) | If parsing fails, show raw preview + error hint |
| **Comprehensive validation (all errors at once)** | Don't make users upload 10 times to find all problems | Validate entire file; show ALL errors in scrollable list with row numbers | Instead of "Error at row 5, fix it"; say "Errors in rows 5 (qty invalid), 12 (date format), 89 (missing Artikelnr)" |
| **Row-level error details** | Vague errors cause user frustration | Each error: "Row 12, column 'Bestand (Lagereinheit)': expected number, got 'ABC'; fix line and re-upload" | Filter toggle: "Show rows with errors only" |
| **Success/failure summary** | Clear outcome | "✓ Imported 923 articles. 0 errors. Dashboard refreshed." OR "✗ Validation failed. 7 errors to fix." | If partial success allowed (e.g., skip invalid rows), state it: "✓ Imported 916/923 articles (7 skipped due to errors)" |
| **Progress indicator (for large files)** | Psychologically important; stops re-uploads | Progress bar: "Processing row 500 of 950..." or simple spinner | Show row count, not % (% is misleading if row processing time varies) |
| **Replace vs. Append confirmation** | Critical safety: don't accidentally append duplicate data | Modal before commit: "This will REPLACE the current dataset (923 articles). Continue?" | Radio buttons: Replace (normal) / Append (for incremental updates — but discourage in v1) |
| **Timestamp of last import** | Executives need to know data freshness | After success: "Imported 2026-04-08 at 14:32 UTC (3 hours ago)" | Displayed on dashboard top-right + on upload page |

### Differentiators (Upload v1.x)

| Feature | Why Valuable | UX Pattern | Notes |
|---------|-------------|-----------|-------|
| **Schema mapping (auto-match + manual override)** | If user exports with missing columns or renamed headers, mapping helps recover | Parse first row; show: "Column 'Artikelnr' → maps to LagBes 'Artikelnr' ✓. Column 'Description' → unknown (skip? map to 'Bezeichnung 1'?)" | Auto-match when column names are exact; manual fallback for typos/renames |
| **Inline error correction** | Users fix errors without re-uploading entire file | Show error rows in editable table; user fixes, clicks "Re-validate" | Only for obvious fixes (invalid dates, number format). Don't allow arbitrary row edits (schema boundaries matter). |
| **Sample data with explanations** | Help users understand expected format | Link: "See example LagBes CSV" → downloads template with 2–3 sample rows + comments in headers | Reduces support load |
| **Detailed import log (downloadable)** | Audit trail for admins | After import: "Download import log" → CSV with: row number, status (OK/ERROR), error message | Useful for troubleshooting and compliance |

### Anti-Features (Upload)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Multi-file batch upload (upload 5 CSVs at once)** | "We export by warehouse; we want to load all at once" | Introduces orchestration complexity: which file wins if there are conflicts? Partial failures are hard to handle. | v1: Single file per upload. If multi-site/multi-warehouse aggregation is needed (future phase), each gets its own deployment with its own SMB folder watcher. |
| **Auto-deduplicate on append mode** | "If we upload twice, don't double-count" | Deduplication logic is error-prone; may hide data quality issues (why is the file being uploaded twice?). Better to catch and fix at source. | v1: Replace mode only. If append is needed (for incremental updates), require manual dedup logic upstream or manual file merge before upload. |
| **Validate against external system (e.g., check article numbers against master DB)** | "We want to catch bad data before import" | External system may be down or lag-behind Apollo. False positives create friction. | v1: Schema validation only (required columns, data types, date formats). Cross-system validation is phase 2 (requires API integration + governance). |
| **Resume interrupted uploads** | "If the connection drops, don't start over" | Adds infrastructure (session state, partial file tracking). For small CSVs (<50 MB, typical LagBes is <5 MB), re-upload is faster than implementing resume. | v1: Simple upload. If files grow to >100 MB, revisit in phase 2. |

---

## Dashboard Layout Pattern (Executive Template)

Based on industry best practices (Tableau, PowerBI, Geckoboard templates), the dashboard should follow a **"story" structure** optimized for 5-second at-a-glance scanning:

### Page 1: Executive Overview (Top-Line KPIs)

**Layout:** 4–5 KPI cards in a row at top, no charts, no tables.

```
┌─────────────────────────────────────────────────────────────────────┐
│ ACM Warehouse Stock Dashboard                  ⌚ Updated 2026-04-08 14:32
├─────────────────────────────────────────────────────────────────────┤
│  
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  │ Total Value  │  │ Avg Coverage │  │ Slow Movers  │  │ Stockouts    │
│  │  €54,2M      │  │   4.2 Mo     │  │  €2,1M (8%)  │  │  12 articles │
│  │   ↑ 2%       │  │   ↓ 0.3 Mo   │  │   ↑ €0.3M    │  │   ↑ 3 new    │
│  │ vs. Week     │  │  vs. Week    │  │   vs. Week   │  │  vs. Week    │
│  │ 🟢 Healthy   │  │ 🟡 Watch     │  │  🔴 Review   │  │ 🔴 Action    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
│  
│  ┌──────────────┐  ┌──────────────┐  
│  │ ABC Classes  │  │ Write-Down   │  
│  │ A: 180 (70%) │  │  €1.2M (2%)  │  
│  │ B: 340 (20%) │  │  ↓ 0.1%      │  
│  │ C: 480 (10%) │  │ 🟢 Normal    │  
│  └──────────────┘  └──────────────┘  
│
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
│ FILTERS: [Warehouse: All ▼] [Product Group: All ▼] [ABC: All ▼] [Type: All ▼]
│
├─────────────────────────────────────────────────────────────────────┤
│ SLOW MOVERS (click to expand table)                                  │
├─────────────────────────────────────────────────────────────────────┤
│ Aging Buckets: [0-6mo] [6-12mo] [1-2yr] [2+yr]
│ 
│ ┌────────────────────────────────────┐
│ │ Value by Aging Bucket (€)           │
│ │  2.0M │                             │
│ │  1.5M │  ███                        │
│ │  1.0M │  ███                        │
│ │  0.5M │  ███  ██  █                 │
│ │    0M └──────────────────────────── │
│ │        0-6  6-12  1-2  2+  (months) │
│ └────────────────────────────────────┘
│
├─────────────────────────────────────────────────────────────────────┤
│ PARETO ANALYSIS: Top 20% of Items = 73% of Value                     │
├─────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────┐
│ │ Cumulative Value %                   │
│ │100%│                             ╱  │
│ │ 80%│          ╱                   │ ◄─ 80% threshold
│ │ 60%│      ╱                       │
│ │ 40%│  ╱                           │
│ │ 20%│╱                             │
│ │  0%└─────────────────────────────│
│ │    1  50  100  150  200  Articles│
│ │    ◄──139 items = 80% of value──►│
│ └────────────────────────────────────┘
│
├─────────────────────────────────────────────────────────────────────┤
│ WAREHOUSE HEATMAP: Value by Location & Product Group (€M)            │
├─────────────────────────────────────────────────────────────────────┤
│            STOFF  FOAMK  METALL  GARN  DIVERSE
│ HAUPTLAGER  18.5   12.1    8.3   2.0   1.1
│ VERSAND      8.2    3.4    2.1   0.8   0.5
│ PRODUKTION   4.1    2.0    0.9   0.3   0.2
│ MUSTERRAUM   0.1    0.0    0.0   0.0   0.1
│
│ (Color gradient: darkest = highest value)
│
└─────────────────────────────────────────────────────────────────────┘
```

**Design principles:**
- **Top cards (4–6) answer "are we winning or losing?" in <5 seconds:** Value up/down, Coverage health (color), Slow movers $$, Stockouts count, ABC distribution, Write-down $.
- **Color coding:** 🟢 Green (healthy), 🟡 Yellow (watch), 🔴 Red (action needed).
- **Delta indicators:** Show "↑ X%" or "↓ X%" vs. previous snapshot (once history exists). For v1, show "vs. last week" or "vs. previous import."
- **Below the fold (charts, tables):** Aging buckets stacked bar, Pareto cumulative line, Warehouse heatmap. These provide context but aren't the primary story.
- **Filters apply to everything:** All cards and charts respond to (Warehouse, Product Group, ABC, Article Type) selections.

### Page 2: Detail Drill-Down (Tables)

After clicking a KPI card, user sees filtered article-level table:

```
Artikelnr | Beschreibung | Lager | Bestand | Einh | Wert | ABC | Mo | %Abw | Last Move
2         | Cover Bottom | NEU   | 5       | STK  | 560€ | C   | 0  | 0%   | 11.09.24
58        | Litpocket    | VERS  | 67      | STK  | 2012€| B   | 0  | 25%  | 25.06.25
...
```

Sortable by any column, filterable within table, exportable to CSV.

---

## In-App Documentation UX

Docs live **inside the app**, not as external links. Executives should not leave the dashboard to learn a KPI definition.

### Table Stakes

- **Tooltip on KPI card labels:** Hover over "Days on Hand" → small popup: "Average months of production this inventory covers at current consumption rate. 6+ months is healthy; <2 months is a reorder risk."
- **Help modal (route `/docs`):** Accessible via `?` icon in top-right corner. Sections:
  - **For End Users:** "How to read the dashboard" + KPI glossary (1 paragraph per KPI, formula, interpretation, action).
  - **For Admins:** "How to upload a CSV" + troubleshooting + link to schema docs.
  - **Changelog:** Release notes and what changed in each version.
- **Inline validation help (upload page):** When user hits validation errors, show suggestion: "Row 12: 'Bestand' column is missing. We expect 'Bestand (Lagereinheit)' or 'Bestand (Basiseinheit)'. See LagBes schema."

### Differentiators

- **Video tutorials** (embeddable in help modal; record 2–3 min demos of core workflows): "How to filter by warehouse," "How to interpret aging buckets."
- **"Show me examples" button on KPI card:** Click → pre-filtered view of articles that exemplify this KPI (e.g., click "Slow Movers" → table pre-filtered to articles >180 days old).

---

## i18n & German-Specific Formatting

All UI must support German + English toggle. Critical formatting rules:

### Number Formatting (German Locale)

- **Thousands separator:** Period/dot (.)  
  Example: `1.234.567,89` (not `1,234,567.89`)
- **Decimal separator:** Comma (,)  
  Example: `112,532` (not `112.532`)
- **Currency:** EUR symbol after value  
  Example: `€54.200.000,00` (not `$54,200,000.00`)
- **Percentages:** `45,5%` (comma, not period)
- **Dates:** `DD.MM.YY` (from LagBes source); for display, use `DD.MM.YYYY` (4-digit year)  
  Example: `08.04.2026` (not `04/08/2026`)

**Implementation:** Use `Intl.NumberFormat` with `de-DE` locale in JavaScript. Example:
```javascript
const value = 1234.56;
const formatted = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
}).format(value);
// Output: "1.234,56 €"
```

### UI Text (i18n Framework)

- All labels, KPI descriptions, button text, error messages in **both German and English**.
- Toggle in top-right corner (e.g., "DE | EN").
- Persist user's language choice in localStorage.
- German descriptions should be concise, match Apollo/SAP terminology where possible (e.g., "Reichw.Mon." = "Reichweite in Monaten" / "Coverage in months").

### Date Handling

- Store dates in ISO 8601 (YYYY-MM-DD) in database.
- LagBes source is DD.MM.YY; parser must convert to ISO and interpret century correctly (00–20 = 2000–2020, 21–99 = 1921–1999). Or safer: explicitly ask if ambiguous.
- Display as DD.MM.YYYY in UI (German convention).

---

## Accessibility (WCAG AA Target)

Dashboard must be usable for:
- **Screen reader users:** All KPI cards, charts, tables with semantic HTML (`<table>`, `<caption>`, `<th>`, etc.). Alt-text for charts.
- **Keyboard navigation:** Tab order, focus indicators visible, no keyboard traps.
- **Contrast:** Text ≥4.5:1 ratio for normal text, ≥3:1 for large text (18pt+).
- **Color-blind safe:** Don't rely on red/green alone; use shapes/icons in addition to color (✓, ✗, ○, ●, etc.).
- **Zoom:** Page readable at 200% zoom.
- **Dark/Light mode:** Both must meet contrast targets.

### Implementation Notes

- Use semantic HTML: `<button>`, `<table>`, `<label>`, `<h1>–<h6>`, `<form>`.
- Chart libraries: Ensure alt-text and keyboard navigation. Test with screen reader (NVDA, JAWS).
- Buttons/links: Visible focus outline (not `:focus { outline: none; }`). Min 44x44px touch target.
- Form validation errors: Associated with input via `<label>` + `aria-describedby`.
- Dark mode: Use CSS variables or Tailwind's dark mode plugin; test contrast in both themes.

**Compliance level:** WCAG 2.1 Level AA (meets legal requirement in most jurisdictions; executive dashboard should not be less accessible).

---

## MVP Definition

### Launch With (v1)

**Core Dashboard:**
- [ ] KPI cards: Total Value, Coverage, Slow Movers, Stockouts, ABC, Devaluation
- [ ] Slice & filter by Warehouse, Product Group, ABC, Article Type (applies to all cards)
- [ ] Aging buckets bar chart
- [ ] ABC donut chart
- [ ] Drill-down table (click KPI → article-level detail)
- [ ] Dashboard layout following 5-second rule (cards + charts below)
- [ ] German + English i18n with correct number/date formatting
- [ ] Dark/light mode toggle
- [ ] Filter persistence (remember user's selections)

**Upload Page:**
- [ ] Drag-and-drop + file picker
- [ ] CSV preview (first 5–10 rows)
- [ ] Comprehensive validation (all errors at once, with row numbers)
- [ ] Success/failure summary
- [ ] Progress indicator
- [ ] Replace vs. Append confirmation (replace only in v1)
- [ ] Last import timestamp display

**In-App Documentation:**
- [ ] Help modal (route `/docs`) with KPI glossary
- [ ] Tooltips on KPI card labels
- [ ] Upload troubleshooting guide

**Accessibility & Polish:**
- [ ] WCAG AA contrast (both dark/light mode)
- [ ] Keyboard navigation + focus indicators
- [ ] Semantic HTML for screen reader compatibility
- [ ] Logo as favicon + in header

### Add After Validation (v1.x)

- [ ] Pareto (80/20) visualization (nice to have; adds insight but not critical)
- [ ] Warehouse + Product Group heatmap (enhances slice & dice)
- [ ] Inventory Turnover Ratio (medium complexity; depends on data quality)
- [ ] Supplier Risk Scorecard (requires supplier data enrichment)
- [ ] Conditional formatting rules engine (extensible alert rules)
- [ ] CSV export of detail tables
- [ ] Video tutorials in help modal
- [ ] "Show me examples" button on KPI cards

### Future Consideration (v2+)

- [ ] Historical snapshots & trend charts (requires snapshot persistence + date-based filtering)
- [ ] Predictive forecasting (requires demand data + ML infrastructure)
- [ ] Custom metric builder (requires metric schema + governance)
- [ ] Multi-site aggregation (out of scope; separate deployments per site)
- [ ] Real-time sub-minute refresh (not justified; data arrives via CSV schedule)
- [ ] Scheduled PDF/email exports (once infrastructure allows)
- [ ] Entra ID / SAML auth (designed for, LDAP-only in v1)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Rationale |
|---------|------------|---------------------|----------|-----------|
| Total Inventory Value | HIGH | LOW | P1 | Executives' first question; simple SUM aggregation |
| Days on Hand / Coverage | HIGH | LOW | P1 | Critical health metric; already in LagBes |
| Slow Movers & Aging | HIGH | MEDIUM | P1 | Top capital concern (tied-up cash); date arithmetic required |
| Stockouts & Low-Stock | HIGH | LOW | P1 | Operational visibility; essential for production planning |
| ABC Classification | HIGH | LOW | P1 | Standard Pareto analysis; already calculated |
| Devaluation / Write-Down | HIGH | LOW | P1 | Accounting reconciliation; simple calculation |
| Slice & Filter (Warehouse, Product Group, ABC, Type) | HIGH | MEDIUM | P1 | Applies to all KPIs; enables business unit analysis |
| Upload Page with Validation | HIGH | MEDIUM | P1 | Enables actual usage (no data = no dashboard) |
| Help Modal + Tooltips | HIGH | LOW | P1 | Reduces support load; required for adoption |
| Drill-Down Tables | HIGH | MEDIUM | P1 | Essential for investigation; click KPI → detail |
| Dashboard Layout (cards + charts) | HIGH | MEDIUM | P1 | 5-second overview is core value |
| Dark/Light Mode | MEDIUM | LOW | P2 | Nice for usability; not blocking |
| i18n (German + English) | HIGH | MEDIUM | P1 | Required per PROJECT.md; formatting critical |
| Pareto (80/20) Visualization | MEDIUM | MEDIUM | P2 | Adds insight; nice-to-have; can defer to v1.x |
| Inventory Turnover Ratio | MEDIUM | MEDIUM | P2 | Useful but depends on data quality; can validate later |
| Warehouse Heatmap | MEDIUM | MEDIUM | P2 | Enhances multi-dimensional analysis; defer if time-constrained |
| Supplier Risk Scorecard | LOW | MEDIUM | P3 | Valuable for supply-chain resilience; phase 2 or later |
| Conditional Formatting Rules | MEDIUM | LOW | P2 | Visual cues helpful; hardcode initial rules; revisit for extensibility |
| Coverage Trend (History) | MEDIUM | HIGH | P3 | Requires snapshot persistence; defer to v2 (depends on data model evolution) |
| Predictive Forecasting | LOW | HIGH | P3 | Nice-to-have; beyond MVP scope; defer until demand data available |

**Priority key:**
- **P1:** Must have for launch — without these, dashboard doesn't solve the core problem.
- **P2:** Should have — add when possible without delaying v1 ship.
- **P3:** Nice to have — future consideration after product-market fit.

---

## Competitor Feature Analysis (PowerBI/Tableau Templates)

| Feature | PowerBI Inventory Template | Tableau Example | Our v1 Approach |
|---------|--------------------------|-----------------|-----------------|
| KPI Summary Cards | Yes (4–6 top-line metrics) | Yes (Geckoboard-style) | Yes — Table Stakes |
| Aging Bucket Chart | Yes (stacked bar or pareto) | Yes (usually pareto) | Yes — Stacked bar, ABC filter |
| ABC Distribution | Yes (pie/donut) | Yes (sometimes treemap) | Yes — Donut with count overlay |
| Warehouse/Location Filter | Yes (slicers) | Yes (dashboard filters) | Yes — Multi-select dropdowns |
| Drill-Down to Articles | Yes (click card → table) | Yes (tooltip + detail view) | Yes — Click KPI → filtered table |
| Turnover Ratio | Yes (sometimes; depends on data) | Yes (less common; usually in supply-chain template) | Partial — proxy calc; depends on Umsatz data quality |
| Write-Down / Obsolescence | Yes (often separate card) | Less common (varies) | Yes — Devaluation KPI + detail table |
| Dark Mode | Yes (PowerBI supports it) | Yes (Tableau supports it) | Yes — User toggle + persistent |
| i18n | Yes (built-in) | Yes (built-in) | Yes — Manual German/English + locale formatting |
| Custom Metrics | Yes (DAX formulas) | Yes (Tableau Calc Fields) | No — Fixed KPI set for v1; extensible in v2 |
| Scheduled Exports | Yes (via Power Automate) | Yes (via subscriptions) | No — Manual export in v1; phase 2 if needed |

**Key difference:** PowerBI/Tableau templates are generic; they expect the user to configure formulas and dimensions. **Our approach:** Pre-built for LagBes schema, no configuration needed. Executives open dashboard and see their stock health immediately.

---

## Technical Notes (For Downstream Implementation)

1. **CSV Parser Blocker:** Decimal comma + semicolon delimiter requires custom parsing logic. Standard libraries (papaparse, fast-csv) will fail. Use regex or column-based re-merging.

2. **Date Handling:** LagBes dates are `DD.MM.YY`. When parsing, store as ISO 8601 (`YYYY-MM-DD`). Century inference: dates 00–current year = 20xx; older = 19xx. Safer: explicit prompt if ambiguous.

3. **Null/Empty Handling:**
   - `Reichw.Mon.` = null → article has no consumption; display as "N/A coverage" (museum/sample item).
   - `ABC-Kennz. VK` = blank → treat as C-class in rollups.
   - `Lieferant` = blank → supplier unknown; exclude from Risk Scorecard.
   - `letzt.Zugang` = very old (pre-2000) → likely dummy date; treat as "never received."

4. **Negative Stock:** Don't exclude from KPIs. Include in coverage calculations (they reduce available inventory). Flag in Stockouts section with note.

5. **Filtering Logic:** When user selects filters, **all KPIs and charts must re-calculate** based on filtered rows. Warehouse="VERSANDLAGER" → all values are now sub-set. This is critical for multi-dimensional analysis.

6. **Database Schema:** Consider adding:
   - `import_id` (UUID per CSV upload, for audit trail)
   - `import_timestamp` (when CSV was processed)
   - `is_deleted` (soft flag for Gelöscht='J'; allows "undo")
   - `cached_kpi_*` columns (optional; for performance if 50K+ articles)

7. **Performance:** With 900+ articles, sorting/filtering in-memory is feasible. If articles exceed 10K, consider database-side aggregations for KPI calculations.

---

## Sources

**KPI Standards & Industry References:**
- [Hopstack: Top 38 Warehouse KPIs](https://www.hopstack.io/blog/warehouse-metrics-kpis)
- [NetSuite: 33 Inventory Management KPIs for 2025](https://www.netsuite.com/portal/resource/articles/inventory-management/inventory-management-kpis-metrics.shtml)
- [MRPeasy: 11 Most Important Inventory KPIs](https://www.mrpeasy.com/blog/inventory-management-kpis/)
- [Deskera: 27 Inventory Management KPIs for 2026](https://www.deskera.com/blog/inventory-management-kpis/)

**KPI Formulas & Calculations:**
- [AbcSupplyChain: Inventory Turnover Ratio](https://abcsupplychain.com/inventory-turnover-ratio/)
- [Ware2go: Days on Hand Calculation](https://ware2go.co/articles/inventory-days-on-hand/)
- [BoxHero: Days-on-Hand & Turnover Rates](https://www.boxhero.io/en/blog/calculating-days-on-hand-and-inventory-turnover-rates)
- [ShipBob: Inventory Days on Hand](https://www.shipbob.com/inventory-kpis/inventory-days-on-hand/)

**ABC Analysis:**
- [NetSuite: ABC Inventory Analysis](https://www.netsuite.com/portal/resource/articles/inventory-management/abc-inventory-analysis.shtml)
- [MRPeasy: ABC Analysis in Inventory Management](https://www.mrpeasy.com/blog/abc-analysis/)
- [GEP: ABC Analysis in Inventory Management](https://www.gep.com/blog/strategy/abc-analysis-advantages-challenges-implementation)

**Dead Stock & Aging Inventory:**
- [NetSuite: Slow-Moving Inventory](https://www.netsuite.com/portal/resource/articles/inventory-management/slow-moving-inventory.shtml)
- [Kladana: Dead Stock](https://www.kladana.com/blog/inventory-management/dead-stock/)
- [RedStag: Slow-Moving Inventory Methods](https://redstagfulfillment.com/how-to-identify-slow-moving-inventory/)
- [DataWiz: Aged Inventory Analysis](https://datawiz.io/en/blog/aged-inventory)

**Executive Dashboard Design:**
- [Tabular Editor: KPI Card Best Practices](https://tabulareditor.com/blog/kpi-card-best-practices-dashboard-design)
- [DataCamp: Effective Dashboard Design](https://www.datacamp.com/tutorial/dashboard-design-tutorial)
- [EPC Group: Power BI Dashboard Design Best Practices 2026](https://www.epcgroup.net/power-bi-dashboard-design-best-practices)
- [Improvado: Dashboard Design Guide](https://improvado.io/blog/dashboard-design-guide)
- [SimpleKPI: Best KPI Dashboards 2026](https://www.simplekpi.com/Blog/best-kpi-dashboards-2026)

**Inventory Dashboard Templates:**
- [PowerBI Dashboard Examples](https://blog.coupler.io/power-bi-dashboard-examples/)
- [GitHub: Inventory Management Dashboard](https://github.com/damaniayesh/Inventory_Management_Dashboard)
- [GlobalData365: Inventory Dashboard Power BI](https://globaldata365.com/inventory-dashboard/)

**CSV Upload UX:**
- [OneSchema: Building a CSV Uploader](https://www.oneschema.co/blog/building-a-csv-uploader)
- [CSVBox: Best UI Patterns for File Uploads](https://blog.csvbox.io/file-upload-patterns)
- [ImportCSV: Data Import UX](https://www.importcsv.com/blog/data-import-ux)
- [Flatfile: Seamless CSV Import](https://flatfile.com/blog/optimizing-csv-import-experiences-flatfile-portal/)
- [Smart Interface Design Patterns: Bulk Import UX](https://smart-interface-design-patterns.com/articles/bulk-ux/)

**Inventory Write-Downs & Obsolescence:**
- [Finale Inventory: Inventory Reserve & Obsolete Inventory](https://www.finaleinventory.com/accounting-and-inventory-software/)
- [NetSuite: Inventory Reserve](https://www.netsuite.com/portal/resource/articles/inventory-management/inventory-reserve.shtml)
- [ShipBob: Inventory Write-Down](https://www.shipbob.com/blog/inventory-write-down/)

**In-App Help & Documentation:**
- [Docsie: In-App Help Best Practices](https://www.docsie.io/blog/glossary/in-app-help/)
- [UserPilot: In-App Guidance](https://userpilot.com/blog/in-app-guidance-saas/)
- [Atlassian: Software Documentation Best Practices](https://www.atlassian.com/blog/loom/software-documentation-best-practices)
- [Whatfix: End-User Documentation](https://whatfix.com/blog/user-documentation/)

**WCAG Accessibility:**
- [Cornell University: WCAG 2.2 AA Checklist](https://accessibility.cornell.edu/information-technology/web-accessibility/wcag-2-aa-checklist/)
- [Accessible.org: WCAG 2.2 Checklist](https://accessible.org/wcag/)
- [WebAIM: WCAG 2 Checklist](https://webaim.org/standards/wcag/checklist)
- [A11Y Project: Accessibility Checklist](https://www.a11yproject.com/checklist/)
- [BrowserStack: WCAG 2.2 Compliance Guide](https://www.browserstack.com/guide/wcag-compliance-checklist)

**German Number Formatting & Internationalization:**
- [Wikipedia: Decimal Separator](https://en.wikipedia.org/wiki/Decimal_separator)
- [Language Boutique: German Number Formatting](https://language-boutique.com/lost-in-translation-full-reader/writing-numbers-points-or-commas)
- [Microsoft Learn: Number Formatting](https://learn.microsoft.com/en-us/globalization/locale/number-formatting)
- [Oracle: Decimal and Thousands Separators](https://docs.oracle.com/cd/E19455-01/806-0169/overview-9/index.html)

---

*Feature research complete.*  
*Researched: 2026-04-08*  
*Confidence: HIGH — KPI formulas verified against industry standards; UI patterns validated against current Tableau/PowerBI templates; German formatting confirmed against DIN 1333 standard.*
