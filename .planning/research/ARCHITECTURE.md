# Architecture Research: ACM KPI Pro

**Domain:** CSV ingestion + analytics dashboard (on-prem, React + PostgreSQL + Docker Compose)
**Researched:** 2026-04-08
**Confidence:** HIGH (patterns verified against 2026 best practices; LDAP/auth patterns confirm current standards)

---

## System Overview

### Container Topology (Docker Compose)

**Recommended: 4-service architecture**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Docker Compose Network                         │
│                                                                         │
│  ┌────────────────┐     ┌──────────────┐     ┌──────────────────┐    │
│  │  Caddy Reverse │     │  React App   │     │  Node.js API     │    │
│  │  Proxy (TLS)   │────▶│  (SSR/Static)│     │  + Auth          │    │
│  │  :80, :443     │     │  :3000       │     │  :3001           │    │
│  └────────────────┘     └──────────────┘     └──────────────────┘    │
│         ▲                       ▲                       ▲              │
│         │                       │                       │              │
│         └───────────────────────┴───────────────────────┘              │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │              PostgreSQL + Named Volume (pgdata)                  │ │
│  │              :5432 (internal only, no external port)             │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │    CSV Ingestion Worker (Bull + Node.js)                        │ │
│  │    - Monitors job queue from Redis (internal)                   │ │
│  │    - Watches SMB mount (/mnt/smb-share)                         │ │
│  │    - Processes CSV → PostgreSQL                                 │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │    Redis Cache (in-memory job queue, session store optional)    │ │
│  │    :6379 (internal only)                                        │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Volumes:
  - pgdata          → PostgreSQL database files (persistent)
  - smb-share       → Mounted SMB share from IT (for watcher)
  - app logs        → /var/log/acm-kpi/ (host-mounted for admin access)
```

**Why this topology:**
- **Caddy** as reverse proxy: Handles TLS termination, routes `/api` to Node backend, `/` to React frontend, `/docs` to static docs site. Single entry point simplifies LDAP + CORS configuration.
- **React + Node separated**: Different containers allow independent scaling and deployment. React can be static or SSR depending on phase 2 requirements.
- **Worker separate from API**: File ingestion can be slow (parsing large CSVs); decoupling from the request path prevents blocking user requests. Bull queue handles async processing.
- **Redis for Bull queue**: Lightweight, in-memory job tracking. On small deployments (single host), Redis adds negligible overhead. Doubles as session store if needed later.
- **PostgreSQL isolated**: No external port. API and worker communicate via internal network. On-prem backup/recovery is simpler with single data volume.

**Security notes:**
- PostgreSQL port 5432 is **not** exposed to the host. Only accessible from containers on the internal network.
- Redis port 6379 is **not** exposed. Used only for job queue coordination.
- Caddy + TLS: All external traffic is encrypted. LDAP bind happens on TLS connection from API → AD server (external to Docker).
- SMB share mounted read-only where possible (watcher only reads).

---

## Component Responsibilities

| Component | Responsibility | Interface |
|-----------|----------------|-----------|
| **Caddy Proxy** | TLS termination, route `/api/*` → API backend, `/` → React frontend, `/docs/*` → static docs, `/health` → health checks | HTTP/HTTPS (public), internal Docker DNS |
| **React Frontend** | User-facing dashboard, upload page, docs site. Polls API every 30s for new data. Dark/light mode, i18n (DE/EN). | HTTP from Caddy, calls `/api/v1/*` endpoints |
| **Node.js API** | REST endpoints for KPI data, upload status, user profile. LDAP auth middleware. Role-based access control (Viewer/Admin). Session management. | HTTP from Caddy, connects to PostgreSQL + Redis |
| **CSV Ingestion Worker** | Process jobs from Bull queue: parse CSV (handle German decimals), validate schema, insert/replace data atomically, trigger materialized view refresh, notify API of completion. Watches SMB folder for new files. | Listens to Redis queue, mounts SMB share, writes to PostgreSQL |
| **PostgreSQL** | Persistent data: articles, stock rows, import metadata, sessions, import history. Supports materialized views for dashboard KPIs. Backups via volume snapshots. | Internal network only, mounted volume (pgdata) |
| **Redis** | Bull job queue (async ingestion), optional session store, cache layer for frequently-hit KPI views. | Internal network, no persistence required (can rebuild from DB) |

---

## Recommended Project Structure

### Monorepo with npm workspaces

```
acm-kpi/
├── package.json                          # Root workspace config
├── tsconfig.json                         # Base TypeScript config
├── docker-compose.yml                    # Service definitions
├── .dockerignore                         # Exclude node_modules, .git, .env
├── Caddyfile                             # Reverse proxy config (TLS, routing)
│
├── apps/
│   ├── api/                              # Node.js Express backend
│   │   ├── src/
│   │   │   ├── index.ts                  # Express app entry
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts               # LDAP auth + session middleware
│   │   │   │   ├── rbac.ts               # Role-based access control
│   │   │   │   └── errorHandler.ts       # Error logging + formatting
│   │   │   ├── routes/
│   │   │   │   ├── kpi.ts                # GET /api/v1/kpi/* (dashboard data)
│   │   │   │   ├── imports.ts            # POST /api/v1/imports (upload) + GET (history)
│   │   │   │   ├── auth.ts               # POST /api/v1/auth/login, /logout, /me
│   │   │   │   └── health.ts             # GET /health (Caddy health checks)
│   │   │   ├── services/
│   │   │   │   ├── ldap.service.ts       # LDAP bind, user lookup (pluggable for Entra/SAML)
│   │   │   │   ├── kpi.service.ts        # Query materialized views, format responses
│   │   │   │   └── import.service.ts     # Enqueue CSV to Bull, get status
│   │   │   ├── types/
│   │   │   │   └── auth.ts               # User, AuthProvider interfaces (for extensibility)
│   │   │   └── db.ts                     # PostgreSQL connection pool
│   │   ├── package.json                  # api-specific deps (express, pg, ldapts, bull)
│   │   ├── tsconfig.json                 # Extends root, references packages/core
│   │   └── Dockerfile                    # Node.js + build
│   │
│   ├── frontend/                         # React + TypeScript
│   │   ├── src/
│   │   │   ├── index.tsx                 # React entry, providers setup
│   │   │   ├── pages/
│   │   │   │   ├── Dashboard.tsx         # Main KPI dashboard (polling)
│   │   │   │   ├── Upload.tsx            # CSV upload + progress
│   │   │   │   ├── Docs.tsx              # Static docs site
│   │   │   │   └── Login.tsx             # LDAP login form
│   │   │   ├── components/
│   │   │   │   ├── KPICard.tsx           # Reusable KPI display
│   │   │   │   ├── UploadZone.tsx        # Drag-and-drop upload
│   │   │   │   ├── DarkModeToggle.tsx    # Theme switcher
│   │   │   │   └── LanguageToggle.tsx    # i18n toggle (DE/EN)
│   │   │   ├── hooks/
│   │   │   │   ├── useKPI.ts             # Polling hook for KPI data + auto-refresh
│   │   │   │   ├── useImport.ts          # Upload + progress tracking
│   │   │   │   └── useAuth.ts            # Session, logout
│   │   │   ├── i18n/
│   │   │   │   ├── de.json               # German translations
│   │   │   │   └── en.json               # English translations
│   │   │   ├── styles/
│   │   │   │   ├── global.css            # Dark/light mode CSS vars
│   │   │   │   └── components.css        # Component styles
│   │   │   └── api.ts                    # Fetch wrapper for /api/v1/* endpoints
│   │   ├── package.json                  # frontend-specific deps (react, vite or next.js)
│   │   ├── tsconfig.json                 # Extends root
│   │   ├── vite.config.ts                # Build config (if Vite)
│   │   └── Dockerfile                    # Node build stage + static serve from Caddy
│   │
│   └── worker/                           # CSV ingestion worker
│       ├── src/
│       │   ├── index.ts                  # Worker entry, Bull listener setup
│       │   ├── jobs/
│       │   │   ├── ingestCSV.ts          # Job handler: parse + insert
│       │   │   └── validateCSV.ts        # Schema validation
│       │   ├── parsers/
│       │   │   ├── csv-parser.ts         # CSV + German decimal handling
│       │   │   ├── schema.ts             # Known column schema
│       │   │   └── transformers.ts       # CSV row → DB row transformation
│       │   ├── watcher.ts                # Chokidar for SMB folder monitoring
│       │   ├── db.ts                     # PostgreSQL connection for worker
│       │   └── queue.ts                  # Bull queue setup (same Redis as API)
│       ├── package.json                  # worker-specific deps (bull, chokidar, pg)
│       ├── tsconfig.json                 # Extends root
│       └── Dockerfile                    # Node.js worker image
│
├── packages/
│   ├── core/                             # Shared TypeScript code
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── kpi.ts                # KPI, StockRow, ImportMetadata types
│   │   │   │   ├── job.ts                # Bull job payload types
│   │   │   │   ├── feed.ts               # Feed registry interface (for future feeds)
│   │   │   │   └── auth.ts               # AuthProvider abstract interface
│   │   │   ├── utils/
│   │   │   │   ├── logger.ts             # Structured logging (JSON to stdout)
│   │   │   │   ├── decimals.ts           # German decimal → numeric conversion
│   │   │   │   └── dates.ts              # DD.MM.YY → Date parsing
│   │   │   └── constants/
│   │   │       ├── sql.ts                # Reusable SQL fragments
│   │   │       └── config.ts             # Env var defaults
│   │   ├── package.json                  # No external deps (only TypeScript)
│   │   └── tsconfig.json                 # Extends root
│   │
│   └── docs/                             # Generated docs (Markdown files)
│       ├── user-guide.md                 # How to read dashboard
│       ├── upload-guide.md               # CSV upload instructions
│       ├── admin-guide.md                # Deployment, SMB config, backup
│       └── changelog.md                  # Release notes
│
├── db/
│   ├── migrations/                       # Flyway or Knex migrations
│   │   ├── V001__init_schema.sql         # Initial tables + views
│   │   ├── V002__sessions.sql            # Session table (if needed)
│   │   └── V003__materialized_views.sql  # KPI views
│   ├── seeds/                            # Optional test data
│   │   └── sample.sql                    # Sample stock rows for development
│   └── README.md                         # Migration strategy
│
├── .env.example                          # Environment template (no secrets)
├── README.md                             # Project overview + quick start
└── CONTRIBUTING.md                       # Development guide
```

### Structure Rationale

- **Monorepo with npm workspaces**: Single repo, shared TypeScript types, single CI/CD pipeline. `npm install` in root links all workspaces.
- **apps/**: Three independent deployable services (api, frontend, worker). Each has its own `package.json`, `tsconfig.json`, `Dockerfile`.
- **packages/core**: Shared types (KPI types, job payloads, auth interfaces). Prevents duplication, enforces contracts. API and worker both reference it.
- **packages/docs**: Static Markdown files. Caddy serves them as static content at `/docs`. Included in frontend build or served separately.
- **db/**: Schema migrations and seeds. Versioned (Flyway-style) so deployments are reproducible. Separate from app code so DBA can review.
- **.env.example**: Committed to repo (no secrets). Lists all required env vars with descriptions.

---

## Container Data Flow

### CSV Ingestion Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DATA FLOW: CSV → KPI CARD                           │
└─────────────────────────────────────────────────────────────────────────┘

1. UPLOAD ENTRY POINT (Two paths converge here)
   ├─ PATH A: Browser Upload
   │  └─ User: Dashboard → Click upload icon → Upload page (React)
   │     → POST /api/v1/imports/upload (multipart/form-data)
   │     → API validates file type + size → Creates Bull job → Returns jobId
   │
   └─ PATH B: SMB Folder Watcher
      └─ Worker: Chokidar watches /mnt/smb-share for new *.csv/*.txt
         → Detects file → Creates Bull job → Job queued

2. QUEUED JOB (Both paths converge in Redis)
   └─ Bull Queue stores job in Redis: { jobId, filename, size, sourceType, queuedAt }

3. WORKER PROCESSING
   └─ CSV Ingestion Worker
      a) VALIDATE & PARSE
         ├─ Read file with Windows-1252 encoding
         ├─ Detect semicolon delimiter
         ├─ Apply German decimal fix: `112,532` → remerge to `112.532`
         ├─ Parse header row against known schema
         └─ Fail early if schema mismatch → Job marked failed, error logged

      b) TRANSFORM & STAGE
         ├─ For each row:
         │  ├─ Normalize: dates DD.MM.YY → YYYY-MM-DD, decimals → float
         │  ├─ Type-cast: quantities to numeric, preserve negatives
         │  └─ Stage row as JSON
         │
         └─ Write staging table (import_rows_staging) in transaction
            (One tx per file, all-or-nothing)

      c) ATOMIC REPLACE (Snapshot strategy)
         ├─ BEGIN TRANSACTION
         ├─ DELETE FROM stock_rows  (or TRUNCATE if no foreign keys)
         ├─ INSERT INTO stock_rows (SELECT * FROM import_rows_staging)
         ├─ REFRESH MATERIALIZED VIEW kpi_dashboard_data  (expensive, one-time per import)
         ├─ COMMIT TRANSACTION
         └─ Job marked "succeeded" in Redis

      d) NOTIFY UI
         ├─ API polls Redis for job status (or worker POSTs to API)
         └─ Frontend receives `importCompleted` event → Triggers useKPI() refetch

4. DASHBOARD RENDER
   └─ React component:
      useKPI() hook → GET /api/v1/kpi/summary
      → API queries materialized view kpi_dashboard_data (fast, read-only)
      → Returns { totalValue, coverage, slowMovers, lowStockAlerts }
      → Component renders KPI cards

5. POLLING FOR UPDATES (v1 — no websockets)
   └─ React Dashboard:
      useEffect(
        () => {
          const interval = setInterval(
            () => refetchKPI(),  // GET /api/v1/kpi/summary again
            30000  // 30-second poll
          )
          return () => clearInterval(interval)
        },
        []
      )
```

### Session & Auth Flow

```
LDAP LOGIN
┌─────────────┐
│  React App  │ POST /api/v1/auth/login { username, password }
└──────┬──────┘
       │
       v
┌──────────────────┐
│  Express API     │ (no-auth route)
│  POST /login     │ 1. Extract { username, password }
└──────┬───────────┘ 2. Call ldapService.bind(username, password)
       │
       v
┌──────────────────┐
│  LDAP Service    │ 3. ldapts.bind(dn, password) → AD server (external)
│  (Pluggable)     │ 4. If success: fetch user from AD (email, name, groups)
└──────┬───────────┘
       │
       v (if bind succeeds)
┌──────────────────┐
│  Session Store   │ 5. INSERT session { sid, userId, email, role, expiry }
│  (PostgreSQL or  │    into sessions table (or sign JWT if stateless)
│   signed cookies)│ 6. Send Set-Cookie: sid=abc123; HttpOnly; Secure; SameSite=Strict
└──────┬───────────┘
       │
       v
┌──────────────────┐
│  React App       │ 7. Cookie persists on client
│  (browser)       │ 8. All subsequent requests include cookie
└──────────────────┘ 9. Middleware verifies session → extracts role → enforces RBAC

PROTECTED ROUTE (e.g., GET /api/v1/imports)
┌─────────────┐
│  React App  │ GET /api/v1/imports (cookie included automatically)
└──────┬──────┘
       │
       v
┌──────────────────┐
│  Express API     │ Middleware: authMiddleware(req, res, next)
│  All routes      │ 1. Read cookie (sid)
│  protected       │ 2. SELECT * FROM sessions WHERE sid = ?
└──────┬───────────┘ 3. If not found or expired: return 401 Unauthorized
       │ 4. Attach user to req.user
       v 5. next()
┌──────────────────┐
│  Route Handler   │ 6. Check RBAC: if (req.user.role !== 'Admin') return 403
│  (RoleGuard)     │ 7. Process request
└──────┬───────────┘
       │
       v
┌──────────────────┐
│  Response        │ 8. Return 200 + data (or 401/403)
└──────────────────┘
```

---

## Ingestion Pipeline Architecture

### Design Rationale

**Job Queue (Bull + Redis) over Synchronous:**
- File parsing can be slow (1000+ rows × complex transformations). If synchronous, upload endpoint blocks.
- Bull separates concerns: API accepts upload → queues job → returns immediately. Worker processes asynchronously.
- On small deployments, Redis overhead is minimal. On larger ones, workers can scale independently (`docker-compose up --scale worker=3`).
- Retries, dead-letter queues, and idempotency are built-in to Bull.

**Convergent design (browser + SMB → same code path):**
- Both upload and watcher create Bull jobs with identical schema.
- Single `ingestCSV` worker handler processes both.
- Reduces code duplication and test surface. Future "scrap feed" follows the same pattern.

**Atomic replace strategy (TRUNCATE in transaction):**
- v1 requirement: "replace latest snapshot."
- Option A (TRUNCATE + INSERT): Fast, minimal locks. Within one transaction, all-or-nothing. Concurrent transactions see old data until COMMIT.
- Option B (Table swap): Rename tables atomically. Risky with dependent views; requires careful OID handling.
- Option C (Materialized view refresh): No, because we're replacing data, not updating KPI calculations.
- **Recommended: TRUNCATE + INSERT in single transaction.** PostgreSQL's MVCC ensures consistency.

**Materialized view for KPI dashboard:**
- Query 1000+ stock rows every 30s (polling) would be slow without index.
- Pre-computed materialized view (`kpi_dashboard_data`) stores: totalValue, slowMovers, lowStockAlerts, etc.
- Refresh happens once per import (expensive, but infrequent).
- Subsequent 30-second polls are instant (index scan only).

---

## Architectural Patterns

### Pattern 1: Pluggable Auth Provider

**What:** Abstract authentication layer so LDAP can be swapped for Entra ID / SAML later.

**When to use:** Always when future auth methods are likely.

**Trade-offs:**
- Requires interface definition upfront (minimal overhead).
- Prevents lock-in to LDAP libraries.
- Testing: mock provider for unit tests.

**Example:**
```typescript
// packages/core/src/types/auth.ts
export interface AuthProvider {
  bind(username: string, password: string): Promise<User>;
  getUser(userId: string): Promise<User>;
  logout(sessionId: string): Promise<void>;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'Viewer' | 'Admin';
  groups?: string[]; // For future SAML/Entra group mapping
}

// apps/api/src/services/ldap.service.ts
export class LDAPAuthProvider implements AuthProvider {
  private client: ldapts.Client;

  async bind(username: string, password: string): Promise<User> {
    const dn = `cn=${username},ou=Users,dc=acm,dc=local`;
    await this.client.bind(dn, password); // Throws if auth fails
    const userEntry = await this.client.search(...);
    return {
      id: username,
      email: userEntry.mail,
      name: userEntry.cn,
      role: userEntry.groups.includes('KPI-Admins') ? 'Admin' : 'Viewer',
    };
  }
  // ...
}

// Future: apps/api/src/services/entra.service.ts
export class EntraAuthProvider implements AuthProvider {
  // OAuth2 flow, OpenID Connect, etc.
}

// apps/api/src/middleware/auth.ts
const authProvider: AuthProvider = process.env.AUTH_PROVIDER === 'entra'
  ? new EntraAuthProvider(...)
  : new LDAPAuthProvider(...);
```

### Pattern 2: Bull Job for Async Ingestion

**What:** Enqueue CSV ingestion to a persistent job queue. Worker processes asynchronously. API immediately returns job status.

**When to use:** When file processing time > acceptable API response time, or need retries/error handling.

**Trade-offs:**
- Adds Redis dependency (but minimal for on-prem).
- Worker must be idempotent (retries on failure should not create duplicates).
- Debugging: need to trace job lifecycle (queued → processing → completed/failed).

**Example:**
```typescript
// apps/api/src/routes/imports.ts
router.post('/uploads', async (req, res) => {
  const file = req.file; // From multer
  
  const job = await importQueue.add('ingestCSV', {
    filename: file.originalname,
    path: file.path,
    size: file.size,
    sourceType: 'browser',
    userId: req.user.id,
  });

  res.json({ jobId: job.id, status: 'queued' });
});

// apps/worker/src/index.ts
importQueue.process('ingestCSV', async (job) => {
  const { filename, path } = job.data;
  
  try {
    const rows = await parseCSV(path);
    await db.ingestRowsAtomic(rows);
    job.progress(100);
    return { status: 'success', rowsInserted: rows.length };
  } catch (err) {
    job.log(`Failed: ${err.message}`);
    throw err; // Bull will retry (default: 5 times)
  }
});

// apps/api/src/routes/imports.ts (polling)
router.get('/:jobId', async (req, res) => {
  const job = await importQueue.getJob(req.params.jobId);
  res.json({
    jobId: job.id,
    status: job._progress, // 0-100
    state: job._state, // 'waiting' | 'active' | 'completed' | 'failed'
    progress: job.progress(),
  });
});
```

### Pattern 3: Materialized View for Dashboard Performance

**What:** Pre-computed, indexed SQL view of KPI data. Refreshed after each import, not on every dashboard query.

**When to use:** When dashboard query would touch many rows (thousands) and users poll frequently (30s intervals).

**Trade-offs:**
- REFRESH MATERIALIZED VIEW is expensive (scans all stock_rows, recomputes aggregates). Happens once per import, not per query.
- Data is not real-time (only fresh after import completes).
- For v1 (replace latest, no history), acceptable trade-off.

**Example (SQL):**
```sql
-- db/migrations/V003__materialized_views.sql

CREATE MATERIALIZED VIEW kpi_dashboard_data AS
SELECT
  SUM(wert_mit_abw)::numeric(12,2) as total_value_eur,
  COUNT(*) as total_articles,
  COUNT(CASE WHEN bestand <= 0 THEN 1 END) as stockout_count,
  ROUND(AVG(reichw_mon), 1)::numeric(3,1) as avg_coverage_months,
  -- Slow movers: last activity > 6 months ago
  COUNT(CASE 
    WHEN lagerabgang_dat < CURRENT_DATE - INTERVAL '6 months' 
      OR lagerabgang_dat IS NULL
    THEN 1 
  END) as slow_mover_count
FROM stock_rows
WHERE geloescht = 'N';

CREATE INDEX idx_kpi_dashboard ON stock_rows(wert_mit_abw, bestand, lagerabgang_dat);

-- After atomic ingest in worker:
REFRESH MATERIALIZED VIEW CONCURRENTLY kpi_dashboard_data;
```

**Why CONCURRENTLY:** Allows concurrent queries during refresh (no table lock). Build a unique index first.

### Pattern 4: Server-Sent Events (v2) over Polling (v1)

**What:** v1 uses 30-second polling (simple, works everywhere). v2 can upgrade to SSE for lower latency and server load.

**When to use:**
- Polling: v1 (works fine, 30-second refresh is acceptable for stock data).
- SSE: v2 (if admins need sub-minute updates and polling becomes bottleneck).

**Trade-offs:**
- Polling: Simple (HTTP GET in a loop), works with any firewall, long-lived connections not required. Wastes bandwidth on empty responses.
- SSE: One persistent connection per client, ~80% reduction in server load, efficient for one-way server→client updates. Requires keep-alive infrastructure.

**Example (v2 placeholder):**
```typescript
// apps/api/src/routes/kpi.ts (future)
router.get('/summary/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendUpdate = async () => {
    const kpi = await getKPI();
    res.write(`data: ${JSON.stringify(kpi)}\n\n`);
  };

  // Send initial data
  sendUpdate();

  // Send updates when import completes (via event emitter or Bull job progress)
  importQueue.on('completed', () => {
    sendUpdate();
  });

  req.on('close', () => {
    // Clean up
  });
});

// apps/frontend/src/hooks/useKPI.ts (future)
async function* streamKPI() {
  const response = await fetch('/api/v1/kpi/summary/stream');
  const reader = response.body?.getReader();
  
  while (true) {
    const { value, done } = await reader!.read();
    if (done) break;
    yield JSON.parse(new TextDecoder().decode(value));
  }
}
```

---

## Database Schema (Atomic Replace Strategy)

### Key Tables

```sql
-- Core stock data (replaced atomically on each import)
CREATE TABLE stock_rows (
  id BIGSERIAL PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES imports(id),
  artikelnr VARCHAR(50) NOT NULL,
  typ VARCHAR(10), -- ART, MAT, HLB, WKZ
  bezeichnung TEXT,
  wgr VARCHAR(20),
  lagername VARCHAR(100),
  bestand NUMERIC(15,3) NOT NULL, -- Can be negative
  lag_einh VARCHAR(10),
  preis NUMERIC(12,4),
  wert NUMERIC(12,2),
  wert_mit_abw NUMERIC(12,2),
  reichw_mon NUMERIC(5,2),
  lagerabgang_dat DATE,
  letzt_zugang DATE,
  geloescht CHAR(1),
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  raw_json JSONB -- Preserve original row for debugging
);
CREATE INDEX idx_stock_lagername ON stock_rows(lagername);
CREATE INDEX idx_stock_artikel ON stock_rows(artikelnr);

-- Import metadata (append-only, tracks history of imports)
CREATE TABLE imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255) NOT NULL,
  source_type VARCHAR(20), -- 'browser' | 'smb_watcher'
  status VARCHAR(20), -- 'success' | 'failed' | 'pending'
  row_count INTEGER,
  error_message TEXT,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  user_id VARCHAR(100) -- LDAP username
);

-- Session storage (for Postgres-backed sessions)
CREATE TABLE sessions (
  sid VARCHAR(255) PRIMARY KEY,
  sess JSONB NOT NULL, -- { userId, email, role, ... }
  expire TIMESTAMP NOT NULL
);
CREATE INDEX idx_sessions_expire ON sessions(expire);

-- Atomic replace: truncate + insert in transaction
-- Pseudocode:
BEGIN TRANSACTION;
  TRUNCATE TABLE stock_rows;
  INSERT INTO stock_rows (...)
    SELECT ... FROM import_rows_staging;
  REFRESH MATERIALIZED VIEW CONCURRENTLY kpi_dashboard_data;
  INSERT INTO imports VALUES (..., 'success', now());
COMMIT;
```

---

## Feed Registry Pattern (for future scrap/quality feeds)

**How to extend to new feeds without rewriting ingestion:**

```typescript
// packages/core/src/types/feed.ts
export interface FeedParser {
  name: string; // 'warehouse_stock' | 'scrap_rate' | 'quality_metrics'
  schema: ColumnSchema[];
  parse(file: Buffer): Promise<Row[]>;
  transform(row: Row): Promise<TransformedRow>;
}

// packages/core/src/constants/feeds.ts
export const FEEDS: Record<string, FeedParser> = {
  warehouse_stock: {
    name: 'warehouse_stock',
    schema: [...], // Expected columns
    parse: parseWarehouseCSV,
    transform: transformStockRow,
  },
  // v2 addition:
  scrap_rate: {
    name: 'scrap_rate',
    schema: [...],
    parse: parseScrapCSV,
    transform: transformScrapRow,
  },
};

// apps/worker/src/jobs/ingestCSV.ts
async function ingestCSV(job: Job) {
  const { filename, feedType } = job.data;
  const parser = FEEDS[feedType];
  
  if (!parser) throw new Error(`Unknown feed: ${feedType}`);
  
  const rows = await parser.parse(file);
  const transformed = await Promise.all(rows.map(r => parser.transform(r)));
  
  // Generic insert (calls appropriate table based on feedType)
  await db.ingestAtomic(feedType, transformed);
}
```

---

## Build Order & Runnable Phases

### Phase 1: Login + Static Dashboard Card
**Deliverable:** Bare minimum to prove the architecture works.

1. Setup Docker Compose: Caddy + PostgreSQL only
2. Create Express API with `/auth/login` (LDAP bind) + `/auth/logout`
3. Create React app with login page + one hardcoded KPI card
4. Result: User logs in → sees dashboard with hardcoded data behind LDAP auth

**Why this order:** Tests auth layer, reverse proxy routing, frontend-backend integration without CSV complexity.

---

### Phase 2: CSV Upload + Ingestion
**Deliverable:** Upload a CSV, see data in database.

1. Add Bull + Redis service to docker-compose
2. Create worker service with CSV parser
3. Add `/api/v1/imports/upload` endpoint + job status polling
4. Create upload page (React) with drag-and-drop
5. Create PostgreSQL schema (stock_rows, imports)
6. Result: User uploads CSV → Worker parses → Data appears in DB + dashboard

**Why this order:** Adds async job processing, database integration, file handling. Still no KPI calculations.

---

### Phase 3: KPI Calculations + Dashboard
**Deliverable:** Real KPI cards, filtered by warehouse.

1. Create materialized view for KPI aggregations
2. Add `/api/v1/kpi/summary` endpoint (queries MV)
3. Implement React polling hook (30s interval)
4. Build KPI card components (total value, coverage, slow movers, low stock)
5. Add filtering UI (warehouse dropdown)
6. Result: Dashboard shows real data, updates every 30 seconds

**Why this order:** KPI logic is separate from ingestion. Allows frontend team to work on UI while backend builds calculations.

---

### Phase 4: SMB Folder Watcher
**Deliverable:** Automatic imports from SMB share.

1. Add chokidar monitoring to worker
2. Create `/mnt/smb-share` mount in docker-compose
3. Configure watcher to detect *.csv and *.txt files
4. Enqueue same Bull job as browser upload
5. Result: Files placed in SMB share are automatically imported

**Why last:** SMB is optional; folder watcher only needs the job queue infrastructure already in place.

---

### Phase 5: i18n + Dark Mode
**Deliverable:** UI translated (DE/EN), dark/light modes.

1. Add i18n library (e.g., i18next) to React
2. Create translation files (de.json, en.json)
3. Add language toggle in header
4. Add dark mode CSS variables + toggle
5. Persist preferences in localStorage or sessions table
6. Result: Full UI in German/English, all themes

---

### Phase 6: Docs Site
**Deliverable:** In-app user documentation.

1. Create Markdown docs (user-guide, upload-guide, admin-guide, changelog)
2. Add `/docs` route to React (or static site)
3. Add docs icon in header
4. Caddy routes `/docs/*` to static files
5. Result: Users access `/docs` for help without leaving the app

---

### Phase 7: Role-Based Access Control
**Deliverable:** Admin-only features (settings, user management).

1. LDAP bind returns group membership
2. Map LDAP groups → Viewer/Admin roles
3. Add RBAC middleware: `requireRole('Admin')`
4. Restrict `/api/v1/imports/upload` to Admin
5. Create settings page (Admin only) for SMB path, schedule, etc.
6. Result: Only admins can upload; viewers see read-only dashboard

---

### Phase 8: Backup & Recovery
**Deliverable:** Tested backup/restore procedure.

1. Document PostgreSQL volume backup strategy (Docker volume snapshot)
2. Create backup script (scheduled daily)
3. Test restore procedure (spin up new instance, restore backup)
4. Document schema migration strategy (Flyway for version-safe DDL)
5. Result: IT team has runbook for disaster recovery

---

## Backup & Recovery Strategy

### PostgreSQL Volume Backup (On-Prem)

**Strategy:** Host-level volume snapshots (LVM / Ceph / etc.)

```bash
# On the Linux host (not in Docker):

# 1. Snapshot the pgdata volume (LVM example)
lvcreate -L 5G -s -n pgdata-backup /dev/vg0/pgdata

# 2. Mount and backup to external storage
mount /dev/vg0/pgdata-backup /mnt/backup-mount
tar czf /mnt/external-storage/pgdata-$(date +%Y%m%d).tar.gz /mnt/backup-mount
umount /mnt/backup-mount
lvremove -f /dev/vg0/pgdata-backup

# 3. Automate with cron
# 0 2 * * * /opt/acm-kpi/backup.sh >> /var/log/acm-kpi-backup.log 2>&1
```

**Why snapshots over `pg_dump`:**
- Snapshots are faster (block-level copy, not SQL export).
- On-prem, external snapshots avoid overhead of running inside container.
- Restore is simple: replace pgdata volume, restart container.

### Schema Migrations (Zero-Downtime)

**Tool:** Flyway (SQL-based) or Knex.js (Node.js-based)

```bash
# db/migrations/
V001__init_schema.sql   # Initial tables
V002__sessions.sql      # Add sessions table
V003__materialized_views.sql # Add KPI views

# Deployment:
# 1. New code boots, Flyway runs pending migrations
# 2. Old code continues working (no breaking changes in phase 1)
# 3. No downtime for read-only dashboards
```

**Rule:** Never rename/drop columns without a phased approach:
1. Add new column with default
2. Migrate data in background
3. Switch app code to use new column
4. Drop old column in subsequent release

### Restore Procedure

```bash
# 1. Stop running containers
docker-compose down

# 2. Restore pgdata volume from backup
rm -rf /path/to/pgdata
tar xzf /mnt/external-storage/pgdata-20260401.tar.gz -C /

# 3. Restart stack
docker-compose up -d

# 4. Verify health
curl http://localhost/health
```

---

## Observability (Logging for On-Prem)

### Logging Strategy

**No external services.** Logs stay on-prem.

```typescript
// packages/core/src/utils/logger.ts
export const logger = {
  info: (msg: string, meta?: object) => {
    console.log(JSON.stringify({ level: 'INFO', time: new Date().toISOString(), msg, ...meta }));
  },
  error: (msg: string, err?: Error, meta?: object) => {
    console.error(JSON.stringify({
      level: 'ERROR',
      time: new Date().toISOString(),
      msg,
      error: err?.stack,
      ...meta,
    }));
  },
  debug: (msg: string, meta?: object) => {
    if (process.env.DEBUG) {
      console.log(JSON.stringify({ level: 'DEBUG', time: new Date().toISOString(), msg, ...meta }));
    }
  },
};
```

**Log destinations:**
- **API + Worker**: stdout (JSON format) → Docker logs → Host file via docker logging driver
- **Host aggregation**: 
  ```bash
  # docker-compose.yml
  logging:
    driver: "json-file"
    options:
      max-size: "100m"
      max-file: "10"
      labels: "acm-kpi=true"
  
  # Host: /var/lib/docker/containers/[container-id]/[container-id]-json.log
  ```

**Admin access to logs:**
```bash
# Real-time tail
docker-compose logs -f api worker

# Search for errors (on host)
grep "ERROR" /var/lib/docker/containers/*/\*-json.log | tail -20

# Or, persist to syslog
# docker-compose.yml: logging: driver: syslog
```

**Error surface to admins:**
- Dashboard: GET `/health` endpoint checks database + Redis connectivity. Red indicator if unhealthy.
- Logs: Errors automatically logged with context. Admin reads logs via `docker-compose logs`.
- Import failures: Stored in `imports.error_message`, visible in admin panel.

---

## Extensibility Points

### For New Data Feeds (Scrap, Quality, etc.)

**Entry:** `packages/core/src/types/feed.ts` defines `FeedParser` interface.
**Customization:** Implement new parser, register in `FEEDS` registry.
**Schema:** New tables created via Flyway migration, registered in feed config.

```typescript
// Future: apps/worker/src/parsers/scrap-rate.ts
export const scrapRateParser: FeedParser = {
  name: 'scrap_rate',
  schema: [
    { name: 'datum', type: 'date' },
    { name: 'artikel', type: 'string' },
    { name: 'menge_ausschuss', type: 'numeric' },
    // ...
  ],
  parse: async (file) => { /* Parse scrap CSV */ },
  transform: async (row) => { /* Map to DB row */ },
};
```

### For New Auth Methods (Entra, SAML)

**Entry:** `packages/core/src/types/auth.ts` defines `AuthProvider` interface.
**Customization:** Implement new provider, set `AUTH_PROVIDER` env var.

```typescript
// Future: apps/api/src/services/entra.service.ts
export class EntraAuthProvider implements AuthProvider {
  async bind(username: string, password: string): Promise<User> {
    // OAuth2 flow with Microsoft Graph
  }
}

// In .env: AUTH_PROVIDER=entra
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Synchronous CSV Import
**What people do:** `POST /api/v1/imports/upload` blocks waiting for CSV parse + database insert.
**Why it's wrong:** Large files (1000+ rows) can take 30+ seconds. User gets timeout. No progress feedback.
**Do this instead:** Queue to Bull, return immediately with jobId, let worker process asynchronously. Frontend polls job status.

### Anti-Pattern 2: Querying stock_rows Directly in Dashboard
**What people do:** `SELECT COUNT(*), SUM(wert) FROM stock_rows WHERE lagername = ?` on every dashboard refresh.
**Why it's wrong:** With 10k+ rows, aggregation scans entire table. 30-second polling = 10k scans per minute. High CPU.
**Do this instead:** Pre-compute KPIs in materialized view. Dashboard queries the MV (indexed, instant). Refresh MV once per import.

### Anti-Pattern 3: Mixing Auth Logic with Route Handlers
**What people do:** `if (req.user.role !== 'Admin') { return res.status(403); }` scattered across 20 routes.
**Why it's wrong:** Duplicated code, hard to enforce, easy to miss a check.
**Do this instead:** Middleware/decorator: `@requireRole('Admin')` on routes. Single point of enforcement.

### Anti-Pattern 4: Hard-coded LDAP Config
**What people do:** `const dn = 'cn=${user},ou=Users,dc=acm,dc=local'` in code.
**Why it's wrong:** Can't deploy to different AD instances (dev/prod). Breaks if org restructures OU.
**Do this instead:** Store config in `.env`: `LDAP_BASE_DN=ou=Users,dc=acm,dc=local`. Read at startup.

### Anti-Pattern 5: No Error Logging in CSV Parser
**What people do:** Try-catch swallows error. User sees "Import failed" with no details.
**Why it's wrong:** Admin can't debug. Is it encoding? Schema? File corruption?
**Do this instead:** Log detailed context: filename, row number, value, expected type. Store in `imports.error_message`.

### Anti-Pattern 6: Table Swap for Atomic Replace
**What people do:** Rename tables to avoid downtime. `ALTER TABLE stock_rows RENAME TO stock_rows_old; ALTER TABLE stock_rows_new RENAME TO stock_rows;`
**Why it's wrong:** Concurrent queries see "table not found" errors. Foreign keys break. Dependent views reference old OID.
**Do this instead:** TRUNCATE + INSERT in one transaction. Simpler, safer, MVCC-protected.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **0-100 users** (v1 target) | Single host docker-compose sufficient. Redis in-memory, PostgreSQL with local SSD. Daily backups. No replication needed. |
| **100-1k users** | Consider: PostgreSQL read replicas for off-peak reporting. Cache layer (Redis) for dashboard queries. Worker scaling: `docker-compose up --scale worker=3`. |
| **1k-10k users** | Split services to separate hosts (API on one, DB on another, worker fleet on third). Load balancer in front. PostgreSQL streaming replication (hot standby). Redis Sentinel for HA. |
| **10k+ users** | Kubernetes (but defeating on-prem simplicity goal). Consider cloud migration. |

### First Bottleneck (v1 → v2)
**Symptom:** Dashboard polling (30s interval, 100 users = 200 requests/min) causes noticeable CPU spike on API.
**Fix:** Implement server-sent events for one-way push. ~80% reduction in requests.

### Second Bottleneck (v2 → large)
**Symptom:** Materialized view refresh takes 5+ seconds with 100k+ stock rows.
**Fix:** Partition stock_rows by warehouse, refresh partitions independently. Use CONCURRENTLY refresh to avoid table lock.

---

## Sources

- [Docker Compose Best Practices 2026](https://dev.to/snigdho611/docker-compose-for-a-full-stack-application-with-react-nodejs-and-postgresql-3kdl)
- [Express Session Middleware & PostgreSQL Storage](https://expressjs.com/en/resources/middleware/session.html)
- [BullMQ Job Queues for Node.js (2026 Guide)](https://1xapi.com/blog/bullmq-5-background-job-queues-nodejs-2026-guide)
- [Chokidar File Watcher](https://github.com/paulmillr/chokidar)
- [LDAP Auth with ldapts (TypeScript)](https://github.com/ldapts/ldapts)
- [Passport.js LDAP Strategy](https://www.passportjs.org/packages/passport-ldapauth/)
- [PostgreSQL Atomicity & Transactions](https://brandur.org/postgres-atomicity)
- [TRUNCATE vs Table Swap Strategy](https://www.postgresql.org/docs/current/sql-truncate.html)
- [Server-Sent Events vs Polling (2026)](https://dev.to/crit3cal/websockets-vs-server-sent-events-vs-polling-a-full-stack-developers-guide-to-real-time-3312)
- [Monorepo Setup with npm Workspaces & TypeScript](https://medium.com/@cecylia.borek/setting-up-a-monorepo-using-npm-workspaces-and-typescript-project-references-307841e0ba4a)
- [ETL Pipeline Architecture & Patterns (2026)](https://www.integrate.io/blog/etl-frameworks-in-2025-designing-robust-future-proof-data-pipelines/)

---

*Architecture research for: ACM KPI Pro (CSV ingestion + dashboard system)*
*Researched: 2026-04-08*
*Confidence: HIGH*
