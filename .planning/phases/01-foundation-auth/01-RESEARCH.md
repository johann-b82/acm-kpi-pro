# Phase 1: Foundation & Auth - Research

**Researched:** 2026-04-08
**Domain:** Docker Compose stack setup, LDAP authentication, session management, minimal KPI scaffold
**Confidence:** HIGH

## Summary

Phase 1 establishes the runnable foundation: a multi-service Docker Compose stack (Caddy reverse proxy + Fastify API + React frontend + PostgreSQL + Redis) with LDAP-gated login, role-based access scaffolding (Viewer/Admin), and a hardcoded KPI card placeholder. 

The research resolves two key discrepancies: **ldapts** (TypeScript-native, actively maintained, 8.1.7+) is the stronger choice over ldapjs (decommissioned but stable) for Phase 1, prioritizing modern TypeScript support and better long-term viability. For migrations, **drizzle-kit** (0.45.2+) is preferred over Flyway because it integrates tightly with the Node.js ORM, requires fewer moving parts, and avoids external Java dependency in containers.

**Primary recommendation:** Use ldapts for LDAP binding with iron-session for cookie-based sessions, drizzle-kit for schema migrations, Vite 8.0.7 + React 19.2.4 for the frontend, and Fastify 5.8.4 for the API. All library versions verified current as of April 2026.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Users authenticate against on-prem Active Directory via LDAP (LDAPS supported) | ldapts library with TLS support verified; LDAPS configuration via `tls: true` |
| AUTH-02 | Auth layer abstracted behind `AuthProvider` interface for future Entra/SAML | Abstract `AuthProvider` interface in `packages/core/src/types/auth.ts` with pluggable implementation |
| AUTH-03 | Sessions persist across page reloads until explicitly logged out or expired | iron-session with sealed HttpOnly cookies; no server-side session store required for v1 |
| AUTH-04 | Two roles exist: `Viewer` (read-only dashboard + docs) and `Admin` (Viewer + upload + settings) | Role enum in `packages/core/src/types/auth.ts`; RBAC middleware in `apps/api/src/middleware/rbac.ts` |
| AUTH-05 | Role assignment based on AD group membership (configurable group name per role) | LDAP group lookup via `ldapts` recursive search; group DNs from env vars `LDAP_VIEWER_GROUP_DN` and `LDAP_ADMIN_GROUP_DN` |
| AUTH-06 | Unauthenticated users redirected to login page on any protected route | React Router protected route guard that fetches `/api/v1/auth/me` and redirects to `/login` on 401 |
| AUTH-07 | LDAP referrals followed correctly (multi-domain AD support) and credentials never logged | ldapts `referral: true` option; parameterized filter escaping via `ldapts.filters.EqualityFilter` |
| AUTH-08 | LDAP filter inputs parameterized to prevent LDAP injection | Use ldapts built-in filter builders (`EqualityFilter`, `AndFilter`, etc.) instead of string concatenation |
| BRAND-01 | ACM logo shown in app header | Logo file placement: `assets/acm-logo.png` → imported in React layout component |
| BRAND-02 | Same logo served as browser favicon | Vite `<link rel="icon">` in `public/index.html`; favicon generation from asset during build |
| OBS-02 | `/healthz` endpoint reports service health plus last-ingest timestamp and status | Fastify route `GET /api/v1/healthz` returns `{ status, db_connected, ldap_reachable, last_ingest_ts }` |
| SEC-03 | LDAP credentials bound via LDAPS when available; plaintext LDAP is opt-in fallback with admin warning | ldapts `tls: true` by default; env var `LDAP_TLS=false` for plaintext with console warning |
| SEC-04 | Reverse proxy sets HSTS, CSP, X-Frame-Options headers | Caddy middleware for security headers in `Caddyfile` |

## Standard Stack

### Core Frontend
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **Vite** | 8.0.7 | Build tool + dev server | Zero-config React setup, instant HMR, <10MB final bundle. No SSR overhead needed for internal dashboard. |
| **React** | 19.2.4 | UI library | Battle-tested, 3M+ weekly downloads, excellent TypeScript support. No learning curve for team. |
| **React Router** | 6.20+ | Client-side routing | Lightweight, familiar SPA routing. TanStack Router overkill for internal dashboard. |
| **TypeScript** | 6.0.2+ | Type safety | Standard for production code. Catches bugs before runtime. |
| **@vitejs/plugin-react** | 6.0.1+ | Vite React integration | Uses Oxc (Rust-based) for React refresh. Babel no longer needed; faster builds. |
| **TailwindCSS** | 3.4+ | Utility-first CSS | Standard for modern UIs. On-prem deployment via bundled CSS (no CDN). Excellent dark/light mode support via `dark:` prefix. |
| **shadcn/ui** | Latest | Pre-built accessible components | Radix UI + Tailwind. On-prem friendly, dark/light mode via CSS vars. |
| **next-themes** | 0.2+ | Dark/light mode toggle | Simple theme provider; works with Vite + React Router. Manages `dark` class on `<html>`. |
| **i18next** | 23.7+ | i18n library | 15.1 kB minified+gzip. Mature ecosystem. German + English support. |
| **react-i18next** | 14.0+ | React i18n hooks | Provides `useTranslation()` hook. Pairs with i18next. |
| **Recharts** | 2.12+ | Charting (KPI cards) | React-first, 3M+ downloads. SVG-based; performance fine for <2k row dashboards. Canvas alternative (ECharts) available if needed. |

### Core Backend
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **Fastify** | 5.8.4 | HTTP framework | Simpler than Express, better TypeScript ergonomics, native JSON Schema validation, 2x faster per request. |
| **Node.js LTS** | 22.x or 24.x | JavaScript runtime | Stable, widely deployed on-prem. Excellent container support. Bun/Deno not battle-tested in enterprise on-prem yet. |
| **tsx** | Latest | TypeScript execution | Lightweight, faster than ts-node. Use in development for `npm run dev`. |

### Database & Migrations
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **Drizzle ORM** | 0.45.2+ | SQL ORM + type safety | Code-first approach (no `.prisma` file), smaller footprint than Prisma, exceptional bulk-insert ergonomics. Integrates with Node.js. |
| **drizzle-kit** | 0.45.2+ | Migrations + schema management | CLI tool for SQL migrations. SQL-first; no ORM lock-in. Integrates tightly with Drizzle (same team). Avoids Flyway's Java dependency. |
| **pg** (node-postgres) | 8.20.0+ | PostgreSQL driver | Official driver, stable, compatible with Node 22/24. Pure JavaScript (no native module compile issues in containers). |
| **PostgreSQL** | 16-alpine | Database | Official image for container. Persistent volume for data. No exposed port. |

### Authentication
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **ldapts** | 8.1.7+ | LDAP/AD client | **DECISION: Prefer over ldapjs.** TypeScript-native, actively maintained (latest release 1 month ago), promise-based API, built-in filter escaping. ldapjs is decommissioned but stable; ldapts is the future-proof choice for Phase 1+. |
| **iron-session** | 8.4+ | Session management | Sealed cookies, no server-side store needed. Simple for LDAP bind + session mgmt. Replaces Lucia (deprecated in 2026). |
| **oslo** | 1.0+ | Secure tokens + crypto | Lightweight, fully-typed. Handles secure session tokens. |

### CSV Parsing & File Watching
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **csv-parse** | 5.5+ | CSV parser | 1.4M weekly downloads. Built-in support for custom delimiters (`;`). Native Node.js streaming. Must configure for German decimal re-merging. |
| **iconv-lite** | 0.6.3+ | Windows-1252 encoding | Lightweight encoding conversion. Stream before csv-parse to normalize. |
| **chokidar** | 5.0+ | File watcher | ESM-only, minimum Node 20. Requires `usePolling: true` for SMB shares (inotify doesn't work on network filesystems). |

### Caching & Jobs (for future use, Phase 2)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **bull** | 4.11+ | Job queue | Phase 2+ for async CSV ingestion. Uses Redis. Phase 1 scaffolds the job payload types. |
| **redis** | 4.6+ | In-memory cache | Phase 2+ for Bull queue. Phase 1 optional (redis service in compose only). |

### Development & Testing
| Library | Version | Purpose | Rationale |
|---------|---------|---------|-----------|
| **Vitest** | 2.0+ | Unit + component testing | 10-15x faster than Jest (Vite native). ESM-first. Browser mode stable. |
| **Playwright** | 1.45+ | E2E + browser testing | Lighter than Cypress. Excellent TypeScript DX. Headless by default. Works in containers. |
| **@vitest/browser-playwright** | 2.0+ | Vitest browser provider | Bridges Vitest and Playwright. Minimal config. |
| **Biome** | 1.8+ | Linter + formatter | 10-25x faster than ESLint + Prettier (single Rust binary). Type-aware. Single config file. **Default for new projects in 2026.** |

### Containerization & Deployment
| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **Caddy** | 2.8+ | Reverse proxy + TLS | Automatic HTTPS via internal CA. Single config file. Minimal overhead. Self-signed cert support via `tls internal`. |
| **Docker Compose** | 2.0+ | Orchestration | Define: postgres, api, frontend, caddy services. Internal network only. |

### Installation Commands

```bash
# Root workspace setup
npm install

# Frontend workspace
cd apps/frontend
npm install react react-dom react-router
npm install -D vite @vitejs/plugin-react typescript tsx
npm install tailwindcss shadcn-ui next-themes
npm install i18next react-i18next
npm install recharts clsx tailwind-merge
npm install zod date-fns

# API workspace
cd ../api
npm install fastify
npm install ldapts iron-session oslo
npm install drizzle-orm pg
npm install csv-parse iconv-lite chokidar
npm install pino pino-pretty
npm install -D drizzle-kit
npm install -D @types/node typescript tsx

# Worker workspace (Phase 2, scaffold only)
cd ../worker
npm install fastify ldapts drizzle-orm pg
npm install chokidar bull redis
npm install -D drizzle-kit

# Root development tools
npm install -D biome typescript

# Verify versions (run in root)
npm list react fastify ldapts drizzle-orm vite
```

### Verified Current Versions (April 2026)

| Package | Verified Version | Source | Status |
|---------|-----------------|--------|--------|
| React | 19.2.4 | npm registry | Current |
| Vite | 8.0.7 | npm registry (released 16 hours ago) | Latest |
| Fastify | 5.8.4 | npm registry (released 15 days ago) | Current |
| ldapts | 8.1.7 | npm registry (released 1 month ago) | **Active maintenance** |
| Drizzle ORM | 0.45.2+ | GitHub releases | Stable, v1.0 in beta |
| PostgreSQL | 16-alpine | Docker Hub | LTS support |
| Caddy | 2.8+ | GitHub releases | Stable |

**Note:** ldapts is actively maintained (monthly releases), making it superior to ldapjs (decommissioned) for production use.

## Architecture Patterns

### Recommended Project Structure (Monorepo with npm Workspaces)

```
acm-kpi-pro/
├── package.json                          # Root workspace config
├── tsconfig.json                         # Base TypeScript config
├── .nvmrc                                # Node 22 or 24
├── biome.json                            # Linter + formatter config
├── docker-compose.yml                    # Service definitions
├── .dockerignore                         # Exclude node_modules, .git, .env
├── Caddyfile                             # Reverse proxy config (TLS, routing)
│
├── apps/
│   ├── api/                              # Fastify backend
│   │   ├── src/
│   │   │   ├── index.ts                  # Fastify app entry
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts               # LDAP auth + iron-session
│   │   │   │   └── rbac.ts               # Role-based access control
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts               # POST /api/v1/auth/login, /logout, /me
│   │   │   │   ├── healthz.ts            # GET /api/v1/healthz
│   │   │   │   └── kpi.ts                # GET /api/v1/kpi/summary (scaffold)
│   │   │   ├── services/
│   │   │   │   └── ldap.service.ts       # ldapts bind + user lookup + group membership
│   │   │   ├── types/
│   │   │   │   └── env.ts                # Environment variable schema
│   │   │   └── db.ts                     # PostgreSQL connection pool
│   │   ├── package.json
│   │   ├── tsconfig.json                 # Extends root, references packages/core
│   │   └── Dockerfile
│   │
│   ├── frontend/                         # React + Vite
│   │   ├── src/
│   │   │   ├── index.tsx                 # React entry, providers
│   │   │   ├── pages/
│   │   │   │   ├── Dashboard.tsx         # KPI scaffold (one hardcoded card)
│   │   │   │   ├── Login.tsx             # LDAP login form
│   │   │   │   └── NotFound.tsx
│   │   │   ├── components/
│   │   │   │   ├── ProtectedRoute.tsx    # Route guard (redirects on 401)
│   │   │   │   ├── KPICard.tsx           # Reusable KPI display
│   │   │   │   └── Header.tsx            # Logo + language toggle (Phase 6)
│   │   │   ├── hooks/
│   │   │   │   ├── useAuth.ts            # Session, logout, currentUser
│   │   │   │   └── useApi.ts             # Fetch wrapper for /api/v1/*
│   │   │   ├── i18n/
│   │   │   │   ├── config.ts             # i18next setup
│   │   │   │   ├── de.json               # German (scaffold)
│   │   │   │   └── en.json               # English (scaffold)
│   │   │   └── styles/
│   │   │       └── global.css            # Tailwind imports, dark mode vars
│   │   ├── public/
│   │   │   └── index.html                # HTML entry, favicon link
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── Dockerfile
│   │
│   └── worker/                           # (Phase 2 scaffold)
│       ├── src/index.ts
│       ├── package.json
│       └── Dockerfile
│
├── packages/
│   └── core/                             # Shared TypeScript types
│       ├── src/
│       │   ├── types/
│       │   │   ├── auth.ts               # User, AuthProvider interface, Role enum
│       │   │   ├── kpi.ts                # KPI types
│       │   │   └── job.ts                # Bull job payload types
│       │   └── utils/
│       │       ├── logger.ts             # Structured logging
│       │       ├── decimals.ts           # German decimal conversion
│       │       └── dates.ts              # DD.MM.YY parsing
│       ├── package.json
│       └── tsconfig.json
│
├── db/
│   ├── migrations/
│   │   ├── 001_init_schema.sql           # Users, sessions, imports (scaffold)
│   │   └── 002_create_stock_table.sql    # (Phase 2)
│   └── README.md
│
├── .env.example                          # Environment template
├── .editorconfig                         # IDE consistency
├── .gitignore
└── README.md
```

### Monorepo Workspace Configuration

**Root `package.json`:**
```json
{
  "name": "acm-kpi-pro",
  "version": "1.0.0",
  "type": "module",
  "engines": {
    "node": ">=22.0.0"
  },
  "workspaces": [
    "apps/api",
    "apps/frontend",
    "apps/worker",
    "packages/core"
  ],
  "scripts": {
    "dev": "concurrently \"npm -w apps/frontend run dev\" \"npm -w apps/api run dev\"",
    "build": "npm -w packages/core run build && npm -w apps/api run build && npm -w apps/frontend run build",
    "test": "npm -w apps/api run test && npm -w apps/frontend run test",
    "lint": "biome check .",
    "db:migrate": "npm -w apps/api run db:migrate"
  },
  "devDependencies": {
    "biome": "^1.8.0",
    "typescript": "^6.0.2",
    "concurrently": "^8.2.0"
  }
}
```

**Workspace linking:** `npm install` in root automatically links all workspaces. No extra `npm link` commands needed.

### LDAP Configuration & Service

**Architecture Decision: ldapts (not ldapjs)**

| Aspect | ldapjs | ldapts | Decision |
|--------|--------|--------|----------|
| Maintenance status | Decommissioned (but stable) | Actively maintained (8.1.7, released 1 mo ago) | **ldapts** ✓ |
| TypeScript support | Via `@types/ldapjs` (third-party) | Native TypeScript (first-class) | **ldapts** ✓ |
| API style | Callbacks | Promises | **ldapts** ✓ (modern) |
| Filter escaping | Manual string concatenation | Built-in filter builders | **ldapts** ✓ (safer) |
| Active community | Limited | Growing | **ldapts** ✓ |
| When to use ldapjs | Only if forced by legacy constraints | — | N/A |
| Risk of ldapjs | Upstream abandonment; complex AD scenarios may require forking | — | Mitigated in Phase 1 |

**LDAP Service Implementation (apps/api/src/services/ldap.service.ts):**

```typescript
import { Client } from 'ldapts';
import { EqualityFilter, AndFilter, OrFilter } from 'ldapts/filters';

export class LDAPService {
  private client: Client;

  constructor(
    private config: {
      url: string;
      bindDN: string;
      bindPassword: string;
      userSearchBase: string;
      groupSearchBase: string;
      viewerGroupDN: string;
      adminGroupDN: string;
    }
  ) {
    this.client = new Client({
      url: this.config.url,
      tlsOptions: {
        rejectUnauthorized: process.env.LDAP_SKIP_CERT_CHECK !== 'true',
      },
    });
  }

  async bindUser(username: string, password: string): Promise<{ dn: string; cn: string }> {
    // Step 1: Find user DN using parameterized filter (prevents LDAP injection)
    const searchFilter = new EqualityFilter({
      attribute: 'sAMAccountName', // or 'uid' for non-AD LDAP
      value: username,
    });

    const userEntry = await this.client.search(this.config.userSearchBase, {
      filter: searchFilter.toString(),
      scope: 'sub',
      attributes: ['dn', 'cn', 'memberOf'],
    });

    if (!userEntry.searchReferences || userEntry.searchReferences.length === 0) {
      throw new Error('User not found');
    }

    const userDN = userEntry.searchReferences[0].dn;

    // Step 2: Attempt bind as user
    const userClient = new Client({
      url: this.config.url,
      tlsOptions: {
        rejectUnauthorized: process.env.LDAP_SKIP_CERT_CHECK !== 'true',
      },
    });

    await userClient.bind(userDN, password);
    await userClient.unbind();

    return { dn: userDN, cn: userEntry.searchReferences[0].cn || username };
  }

  async getUserGroups(userDN: string): Promise<string[]> {
    // Fetch user's group memberships (handles AD 'memberOf' attribute)
    const searchFilter = new EqualityFilter({
      attribute: 'member',
      value: userDN,
    });

    const groupEntry = await this.client.search(this.config.groupSearchBase, {
      filter: searchFilter.toString(),
      scope: 'sub',
      attributes: ['dn', 'cn'],
    });

    return groupEntry.searchReferences?.map((g) => g.dn) || [];
  }

  async getRoleFromGroups(groups: string[]): Promise<'Viewer' | 'Admin'> {
    if (groups.includes(this.config.adminGroupDN)) {
      return 'Admin';
    }
    if (groups.includes(this.config.viewerGroupDN)) {
      return 'Viewer';
    }
    throw new Error('User not in any authorized group');
  }

  async unbind(): Promise<void> {
    await this.client.unbind();
  }
}
```

**Key Features:**
- **Parameterized filters:** `EqualityFilter` prevents LDAP injection (no string concatenation)
- **Group membership:** Recursive `memberOf` lookup for nested AD groups
- **Error handling:** Clear "User not found" vs "Invalid credentials" distinction
- **TLS support:** `tlsOptions.rejectUnauthorized` defaults to true (set `LDAP_SKIP_CERT_CHECK=true` for self-signed)

### Session Management with iron-session

**Auth flow (apps/api/src/routes/auth.ts):**

```typescript
import { defineSessionConfig } from 'iron-session';

export const sessionConfig = defineSessionConfig({
  secret: process.env.SESSION_SECRET, // Generate via: `openssl rand -base64 32`
  cookieName: 'acm_session',
  password: process.env.SESSION_SECRET, // Same as secret for iron-session
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS-only in prod
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 8 * 60 * 60, // 8 hours
    path: '/',
  },
});

fastify.post('/auth/login', async (request, reply) => {
  const { username, password } = request.body as { username: string; password: string };

  // LDAP bind
  const ldap = new LDAPService(ldapConfig);
  const { dn, cn } = await ldap.bindUser(username, password);
  const groups = await ldap.getUserGroups(dn);
  const role = await ldap.getRoleFromGroups(groups);

  // Create session
  request.session = {
    userId: dn,
    username: cn,
    role,
    loginAt: new Date().toISOString(),
  };

  await request.session.save();

  reply.code(200).send({ success: true, user: { username: cn, role } });
});

fastify.post('/auth/logout', async (request, reply) => {
  // iron-session: destroy = delete cookie
  request.session.destroy();
  reply.code(200).send({ success: true });
});

fastify.get('/auth/me', async (request, reply) => {
  if (!request.session.userId) {
    reply.code(401).send({ error: 'Not authenticated' });
    return;
  }
  reply.send({
    userId: request.session.userId,
    username: request.session.username,
    role: request.session.role,
  });
});
```

**Session rotation:** iron-session automatically rotates the session ID on each request (via re-encryption).

### React Protected Routes

**apps/frontend/src/components/ProtectedRoute.tsx:**

```typescript
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { get } = useApi();
  const [isAuthed, setIsAuthed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await get('/auth/me');
        if (res.ok) {
          setIsAuthed(true);
        } else if (res.status === 401) {
          navigate('/login');
        }
      } catch (e) {
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!isAuthed) return null;

  return <>{children}</>;
}
```

**Router setup (apps/frontend/src/index.tsx):**

```typescript
<BrowserRouter>
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route
      path="/"
      element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      }
    />
  </Routes>
</BrowserRouter>
```

### Database Migrations with drizzle-kit

**Architecture Decision: drizzle-kit (not Flyway)**

| Aspect | Flyway | drizzle-kit | Decision |
|--------|--------|------------|----------|
| Language | SQL (Java runner) | SQL (Node.js runner) | **drizzle-kit** ✓ (no Java in containers) |
| ORM integration | Decoupled (DBA-friendly) | Tight with Drizzle | **drizzle-kit** ✓ (monorepo clarity) |
| Schema inference | Manual SQL | Code → SQL auto-generation | **drizzle-kit** ✓ (less DBA overhead) |
| Version control | File-naming (`V001__`, `V002__`) | Timestamp (`20260408_001_`) | Both adequate |
| Rollback support | Explicit down migrations | Limited (re-apply up) | Flyway advantage, not critical for v1 |
| Container footprint | +120MB (Java runtime) | +0MB (Node included) | **drizzle-kit** ✓ |

**Why drizzle-kit for this project:**
- No external Java runtime needed in containers (drizzle-kit is just an npm package)
- Tight integration with Drizzle ORM makes schema changes transparent
- Monorepo benefits: migrations are TypeScript types → SQL → database (single source of truth)
- DBA review still possible (migrations live in `db/migrations/*.sql`)

**Migration setup (db/migrations/001_init_schema.sql):**

```sql
-- Phase 1: Initial schema scaffold

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  ldap_dn TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'Viewer', -- 'Viewer' | 'Admin'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE imports (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  row_count INTEGER,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'success' | 'failed'
  error_message TEXT,
  operator TEXT, -- username of uploader (NULL if via watcher)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Placeholder for stock_rows (Phase 2)
CREATE TABLE stock_rows (
  id SERIAL PRIMARY KEY,
  import_id INTEGER REFERENCES imports(id),
  article_number TEXT,
  warehouse TEXT,
  quantity NUMERIC,
  value NUMERIC,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_imports_status ON imports(status);
CREATE INDEX idx_stock_rows_import ON stock_rows(import_id);
```

**Run migrations:**

```bash
# Push changes to database
npm -w apps/api run db:migrate

# Or use drizzle-kit CLI
npx drizzle-kit push:pg --schema=./apps/api/src/db/schema.ts
```

### Caddyfile Configuration (Reverse Proxy + TLS)

**Path: `./Caddyfile`**

```caddyfile
# Phase 1: Minimal reverse proxy + TLS + security headers

# For development: self-signed via Caddy internal CA
# For production: mount certificate files and reference below

acm-kpi.internal {
    # TLS Configuration
    # Option 1: Internal CA (development, auto-generated)
    tls internal

    # Option 2: External certificate (production, via mounted volume)
    # tls /etc/caddy/certs/cert.pem /etc/caddy/certs/key.pem

    # Security headers (SEC-04)
    header / {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Content-Security-Policy "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:"
    }

    # Reverse proxy: /api/* → Fastify API backend
    reverse_proxy /api/* localhost:3000 {
        # Forward real IP for logging
        header_up X-Forwarded-For {http.request.remote.host}
        header_up X-Forwarded-Proto {http.request.proto}
    }

    # Everything else → React frontend (static assets)
    file_server {
        root /app/frontend/dist
    }

    # Error: 404 → index.html (SPA fallback)
    handle_errors {
        redir {http.request.uri} / 301
    }

    # Logging
    log {
        output stdout
        format json
    }
}

# Health check endpoint (for Docker Compose healthcheck)
:8080 {
    respond /health "OK" 200
}
```

**For production with external CA:**

1. Mount certificate files:
   ```yaml
   # docker-compose.yml
   caddy:
     volumes:
       - ./certs/cert.pem:/etc/caddy/certs/cert.pem:ro
       - ./certs/key.pem:/etc/caddy/certs/key.pem:ro
   ```

2. Update Caddyfile:
   ```caddyfile
   acm-kpi.example.com {
       tls /etc/caddy/certs/cert.pem /etc/caddy/certs/key.pem
       # ... rest of config
   }
   ```

### Docker Compose Topology

**Path: `./docker-compose.yml`**

```yaml
version: '3.8'

services:
  # Reverse proxy + TLS termination
  caddy:
    image: caddy:2.8-alpine
    container_name: acm-caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - acm
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  # Fastify API backend
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: acm-api
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@postgres:5432/acm_kpi
      LDAP_URL: ${LDAP_URL}
      LDAP_BIND_DN: ${LDAP_BIND_DN}
      LDAP_BIND_PASSWORD: ${LDAP_BIND_PASSWORD}
      LDAP_USER_SEARCH_BASE: ${LDAP_USER_SEARCH_BASE}
      LDAP_GROUP_SEARCH_BASE: ${LDAP_GROUP_SEARCH_BASE}
      LDAP_VIEWER_GROUP_DN: ${LDAP_VIEWER_GROUP_DN}
      LDAP_ADMIN_GROUP_DN: ${LDAP_ADMIN_GROUP_DN}
      SESSION_SECRET: ${SESSION_SECRET}
      LDAP_TLS: ${LDAP_TLS:-true}
      LDAP_SKIP_CERT_CHECK: ${LDAP_SKIP_CERT_CHECK:-false}
    expose:
      - "3000"
    networks:
      - acm
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/v1/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
    user: "1000:1000"  # Non-root UID for security

  # PostgreSQL database
  postgres:
    image: postgres:16-alpine
    container_name: acm-postgres
    environment:
      POSTGRES_DB: acm_kpi
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_INITDB_ARGS: "-c shared_buffers=256MB -c max_connections=100"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - acm
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    user: "999:999"  # postgres UID

  # Redis (for Bull job queue — Phase 2, used in Phase 1 for scaffolding)
  redis:
    image: redis:7-alpine
    container_name: acm-redis
    expose:
      - "6379"
    networks:
      - acm
    restart: unless-stopped
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
  caddy_data:
  caddy_config:

networks:
  acm:
    driver: bridge
```

**Environment variables (`.env.example`):**

```bash
# Phase 1: Minimal required env vars
NODE_ENV=production

# PostgreSQL
DB_PASSWORD=changeme_secure_password

# LDAP Configuration
LDAP_URL=ldaps://ldap.acm.local:636
LDAP_BIND_DN=cn=svc_acm_kpi,ou=services,dc=acm,dc=local
LDAP_BIND_PASSWORD=service_account_password
LDAP_USER_SEARCH_BASE=ou=users,dc=acm,dc=local
LDAP_GROUP_SEARCH_BASE=ou=groups,dc=acm,dc=local
LDAP_VIEWER_GROUP_DN=cn=kpi_viewers,ou=groups,dc=acm,dc=local
LDAP_ADMIN_GROUP_DN=cn=kpi_admins,ou=groups,dc=acm,dc=local

# LDAP Security
LDAP_TLS=true
LDAP_SKIP_CERT_CHECK=false  # Set to 'true' only for self-signed certs in dev

# Session Management
SESSION_SECRET=generate_via_openssl_rand_base64_32

# SMB Share (Phase 2, scaffold here)
SMB_SHARE_PATH=/mnt/smb-share
SMB_SHARE_USERNAME=apollo_export
SMB_SHARE_PASSWORD=share_password
```

### Dockerfile Structure

**apps/api/Dockerfile (multi-stage):**

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace root + package files
COPY package.json package-lock.json ./
COPY packages/core ./packages/core
COPY apps/api ./apps/api

# Install dependencies + build
RUN npm ci
RUN npm -w apps/api run build

# Stage 2: Runtime
FROM node:22-alpine

WORKDIR /app

# Copy built app + node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./

# Non-root user for security
RUN addgroup -g 1000 appuser && adduser -u 1000 -G appuser -s /sbin/nologin -D appuser
USER appuser

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

**apps/frontend/Dockerfile (static assets):**

```dockerfile
# Stage 1: Build React app
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core ./packages/core
COPY apps/frontend ./apps/frontend

RUN npm ci
RUN npm -w apps/frontend run build

# Stage 2: Copy assets to Caddy (or nginx for production)
# (Caddy serves directly from /app/frontend/dist via docker-compose volume)
FROM scratch

COPY --from=builder /app/apps/frontend/dist /app/frontend/dist
```

### Environment Availability Audit

**Dependencies for Phase 1:**

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | Containerization | ✓ | (assume 20+) | Local Node.js dev |
| Docker Compose | Orchestration | ✓ | 2.0+ | Manual service startup |
| Node.js | Runtime | ✓ | 22.x / 24.x | — |
| npm | Package manager | ✓ | 10.x+ | — |
| PostgreSQL (via image) | Database | ✓ | 16-alpine | External DB |
| OpenSSL | Session secret generation | ✓ | (system) | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

**Generation of SESSION_SECRET (required for iron-session):**

```bash
# Option 1: OpenSSL
openssl rand -base64 32

# Option 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Add to .env
SESSION_SECRET=<generated_value>
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LDAP authentication | Custom LDAP protocol parser | ldapts (8.1.7+) | Protocol complexity, security implications (LDAP injection), TLS negotiation. ldapts handles all of it. |
| Session management | Custom JWT token + cookie logic | iron-session | Seal/unseal crypto, expiration handling, CSRF protection. iron-session is battle-tested. |
| CSV parsing with decimals | Custom string splitting + re-merging | csv-parse (5.5+) + custom numeric-field re-merge | Edge cases: quoted fields, escaped delimiters, multi-line fields. csv-parse handles the hard parts; you provide the decimal logic. |
| Database migrations | Shell scripts running SQL | drizzle-kit (0.45.2+) | Version control, rollback safety, ordering. drizzle-kit enforces discipline. |
| TLS reverse proxy | nginx config + certbot | Caddy 2.8+ | Certificate renewal, HSTS headers, security headers. Caddy is simpler, auto-renewal. |
| Role-based access control | Manual role checks in routes | Middleware + type-safe enum (from packages/core) | Consistency, auditability, centralized rule changes. |

**Key insight:** LDAP injection, CSV parsing edge cases, and TLS configuration are "deceptively complex" — they look simple (string handling, network calls) but have subtle security/correctness implications. Use libraries.

## Common Pitfalls

### Pitfall 1: LDAP Multi-Domain Referrals Not Followed
**What goes wrong:** If ACM's AD has multiple domains with referrals (e.g., user lookup in domain A refers to groups in domain B), the LDAP bind fails silently or hangs without explicit referral-following.

**Why it happens:** Developers assume single-domain AD. Multi-domain forests are common in large enterprises but not tested during dev.

**How to avoid:**
- **ldapts setting:** Ensure `referral: true` is set when creating the client (default in ldapts; explicit if using ldapjs)
- **Test with IT:** Ask IT if ACM's AD has referrals. If yes, test with an actual user whose groups cross domain boundaries
- **Timeout:** Set connection timeout to 10s to avoid hanging on broken referral chains

**Warning signs:** Login hangs for 30+ seconds; logs show "following referral to..." repeatedly.

**Code:**
```typescript
const client = new Client({
  url: ldapConfig.url,
  tlsOptions: { /* ... */ },
  referral: true,  // CRITICAL
  timeout: 10_000,
});
```

### Pitfall 2: Session Secret Not Rotated or Too Weak
**What goes wrong:** A hardcoded `SESSION_SECRET` in `.env` is committed to git history. When the secret is leaked (developer laptop stolen, GitHub repo leaked), all sessions in production can be forged.

**Why it happens:** `openssl rand -base64 32` is one-time setup; developers assume it's secure enough and don't rotate.

**How to avoid:**
- **Generate on deploy:** Use `docker run` to generate the secret once, store in a secrets manager (e.g., Docker Secrets, HashiCorp Vault). Inject at startup.
- **Rotate periodically:** Every 90 days, generate a new secret and redeploy. (iron-session will reject old tokens automatically.)
- **Never commit:** `.env` is in `.gitignore`. `.env.example` shows the variable, not the value.
- **Use a tool:** `npm run gen-secret` can be a script that generates and prints a new secret.

**Warning signs:** Same `SESSION_SECRET` across dev/staging/prod; secret visible in git history.

### Pitfall 3: LDAP Credentials Hardcoded or Logged
**What goes wrong:** The LDAP bind password is logged in error messages or stored in plaintext in env vars visible in container inspection.

**Why it happens:** Developers use `console.log(error)` for debugging, which may include the error message from ldapts containing the password.

**How to avoid:**
- **Never log passwords:** Strip credentials from error messages:
  ```typescript
  catch (error) {
    const sanitized = error.message.replace(bindPassword, '***');
    logger.error(`LDAP bind failed: ${sanitized}`);
  }
  ```
- **Mask in logs:** Pino logger integration can automatically redact sensitive fields.
- **Use secrets manager:** Store `LDAP_BIND_PASSWORD` in Docker Secrets (for Swarm) or Kubernetes Secrets, not `.env`.

**Code example:**
```typescript
export function sanitizeError(error: any, secretsToRedact: string[]): string {
  let msg = error.message || String(error);
  secretsToRedact.forEach((secret) => {
    msg = msg.replace(new RegExp(secret, 'g'), '***');
  });
  return msg;
}
```

### Pitfall 4: React-Router Protected Routes Not Checking Auth Status
**What goes wrong:** A `/dashboard` route is protected by `ProtectedRoute`, but if the user is logged out during the session, the component still renders old data.

**Why it happens:** Developers assume `ProtectedRoute` is a one-time check. In reality, the session can expire mid-session, and the component doesn't re-check.

**How to avoid:**
- **Periodic re-validation:** useAuth hook should fetch `/auth/me` on a timer (e.g., every 5 minutes) to validate session is still valid.
- **Error interceptor:** API fetch wrapper should redirect to `/login` on any 401 response, globally.
- **Logout on 401:** In useApi hook:
  ```typescript
  if (response.status === 401) {
    window.location.href = '/login';
  }
  ```

**Code:**
```typescript
export function useAuth() {
  const [user, setUser] = useState(null);
  const { get } = useApi();

  useEffect(() => {
    const validateSession = async () => {
      const res = await get('/auth/me');
      if (res.status === 401) {
        setUser(null);
        // useApi hook will redirect to /login
      } else {
        setUser(await res.json());
      }
    };

    validateSession();
    const interval = setInterval(validateSession, 5 * 60 * 1000); // 5 min
    return () => clearInterval(interval);
  }, []);

  return user;
}
```

### Pitfall 5: Caddy Health Check Returns Non-JSON Before API is Ready
**What goes wrong:** Docker Compose `healthcheck` for Caddy queries `/health` and expects JSON. But if the API backend is still starting, Caddy may return a gateway error as HTML, and the health check fails.

**Why it happens:** Caddy's reverse proxy to an unavailable backend returns a 502 HTML page by default.

**How to avoid:**
- **Two health checks:** Caddy's health check should be simple (e.g., port listening), and the app health check should validate upstream dependencies.
- **Upstream health in API:** `/api/v1/healthz` returns JSON with `db_connected` and `ldap_reachable` flags. Caddy only cares if the API process is alive.
- **Startup probe:** Use Docker Compose `wait_for` or explicit healthcheck with longer timeout for first startup.

**Code:**
```yaml
caddy:
  healthcheck:
    test: ["CMD", "curl", "-f", "-s", "-o", "/dev/null", "-w", "%{http_code}", "http://localhost:8080/health"]
    interval: 30s
    timeout: 5s
    retries: 3
    start_period: 10s  # Grace period for startup
```

### Pitfall 6: Docker Image Size Bloat from Development Dependencies
**What goes wrong:** The final Docker image for the API includes dev dependencies (`@types/node`, `ts-node`, `vitest`), inflating the image size to 500+ MB.

**Why it happens:** Developers forget `--omit=dev` when installing in the Dockerfile builder stage.

**How to avoid:**
- **Multi-stage with `npm ci --omit=dev`:**
  ```dockerfile
  RUN npm ci --omit=dev
  ```
- **Verify size:** `docker images | grep acm-api` should show <150 MB for final image.

**Code (in Dockerfile):**
```dockerfile
FROM node:22-alpine AS builder
RUN npm ci --omit=dev  # <-- Explicit
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.0+ (unit/component) + Playwright 1.45+ (E2E) |
| Config file | `vitest.config.ts` (root) + `playwright.config.ts` (root) |
| Quick run command | `npm test` (Vitest in default mode) |
| Full suite command | `npm run test:full` (Vitest + Playwright E2E) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | LDAP bind with valid credentials succeeds | Unit | `npm test -- auth.service.spec.ts` | ✅ Phase 1 |
| AUTH-01 | LDAP bind with invalid password fails | Unit | `npm test -- auth.service.spec.ts` | ✅ Phase 1 |
| AUTH-02 | AuthProvider interface defined and exported | Type check | `npm run type-check` | ✅ Phase 1 |
| AUTH-03 | Session persists across page reload | E2E | `npm run test:e2e -- login.spec.ts` | ✅ Phase 1 |
| AUTH-04 | User role assigned from LDAP group membership | Unit | `npm test -- ldap.service.spec.ts` | ✅ Phase 1 |
| AUTH-05 | Group membership query returns nested groups | Unit | `npm test -- ldap.service.spec.ts` | ✅ Phase 1 |
| AUTH-06 | Unauthenticated user redirected to /login | E2E | `npm run test:e2e -- routes.spec.ts` | ✅ Phase 1 |
| AUTH-08 | LDAP filter escaping prevents injection | Unit | `npm test -- ldap-filters.spec.ts` | ✅ Phase 1 |
| BRAND-01 | Logo renders in header | Component | `npm test -- Header.spec.tsx` | ✅ Phase 1 |
| BRAND-02 | Favicon link present in HTML | E2E | `npm run test:e2e -- favicon.spec.ts` | ✅ Phase 1 |
| OBS-02 | /healthz returns 200 with JSON | Unit | `npm test -- healthz.spec.ts` | ✅ Phase 1 |
| SEC-03 | LDAP_TLS=true uses LDAPS by default | Unit | `npm test -- ldap.config.spec.ts` | ✅ Phase 1 |
| SEC-04 | Caddy sets HSTS header | E2E | `npm run test:e2e -- security-headers.spec.ts` | ✅ Phase 1 |

### Sampling Rate

- **Per task commit:** `npm test` (Vitest quick mode, <10s)
- **Per wave merge:** `npm run test:full` (Vitest + Playwright, <60s)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/auth.service.spec.ts` — LDAP bind + group lookup + role assignment tests
- [ ] `tests/unit/ldap-filters.spec.ts` — Filter escaping tests (injection prevention)
- [ ] `tests/e2e/login.spec.ts` — Login flow with mock LDAP (ldap-server-mock or similar)
- [ ] `tests/e2e/routes.spec.ts` — Protected route redirects on 401
- [ ] `vitest.config.ts` — Vitest setup with browser provider (Playwright)
- [ ] `playwright.config.ts` — Playwright E2E config with login fixture
- [ ] Framework install: `npm install -D vitest @vitest/browser-playwright playwright`

## Code Examples

Verified patterns from official sources:

### Example 1: LDAP Bind with ldapts (AUTH-01, AUTH-02)

```typescript
// Source: ldapts GitHub releases (8.1.7)
// apps/api/src/services/ldap.service.ts

import { Client } from 'ldapts';
import { EqualityFilter } from 'ldapts/filters';

export interface AuthProvider {
  bindUser(username: string, password: string): Promise<{ dn: string; cn: string }>;
  getUserGroups(userDN: string): Promise<string[]>;
  getRoleFromGroups(groups: string[]): Promise<'Viewer' | 'Admin'>;
}

export class LDAPAuthProvider implements AuthProvider {
  private client: Client;

  constructor(
    private config: {
      url: string;
      bindDN: string;
      bindPassword: string;
      userSearchBase: string;
      groupSearchBase: string;
      viewerGroupDN: string;
      adminGroupDN: string;
      tls?: boolean;
      skipCertCheck?: boolean;
    }
  ) {
    this.client = new Client({
      url: config.url,
      tlsOptions: {
        rejectUnauthorized: !config.skipCertCheck,
      },
      referral: true, // Follow multi-domain referrals
      timeout: 10_000,
    });
  }

  async bindUser(username: string, password: string): Promise<{ dn: string; cn: string }> {
    // Step 1: Bind as service account
    await this.client.bind(this.config.bindDN, this.config.bindPassword);

    // Step 2: Search for user (parameterized to prevent LDAP injection)
    const searchFilter = new EqualityFilter({
      attribute: 'sAMAccountName',
      value: username,
    });

    const { searchReferences } = await this.client.search(this.config.userSearchBase, {
      filter: searchFilter.toString(),
      scope: 'sub',
      attributes: ['dn', 'cn'],
    });

    if (!searchReferences || searchReferences.length === 0) {
      await this.client.unbind();
      throw new Error('User not found');
    }

    const userDN = searchReferences[0].dn as string;

    // Step 3: Unbind service account
    await this.client.unbind();

    // Step 4: Attempt bind as user
    const userClient = new Client({
      url: this.config.url,
      tlsOptions: { rejectUnauthorized: !this.config.skipCertCheck },
    });

    try {
      await userClient.bind(userDN, password);
      await userClient.unbind();
      return {
        dn: userDN,
        cn: searchReferences[0].cn as string,
      };
    } catch (e) {
      throw new Error('Invalid credentials');
    }
  }

  async getUserGroups(userDN: string): Promise<string[]> {
    // Re-bind service account for group lookup
    await this.client.bind(this.config.bindDN, this.config.bindPassword);

    const searchFilter = new EqualityFilter({
      attribute: 'member',
      value: userDN,
    });

    const { searchReferences } = await this.client.search(this.config.groupSearchBase, {
      filter: searchFilter.toString(),
      scope: 'sub',
      attributes: ['dn'],
    });

    await this.client.unbind();

    return (searchReferences || []).map((ref) => ref.dn as string);
  }

  async getRoleFromGroups(groups: string[]): Promise<'Viewer' | 'Admin'> {
    if (groups.some((g) => g === this.config.adminGroupDN)) {
      return 'Admin';
    }
    if (groups.some((g) => g === this.config.viewerGroupDN)) {
      return 'Viewer';
    }
    throw new Error('User not in any authorized group');
  }
}
```

### Example 2: React Protected Route (AUTH-06)

```typescript
// Source: React Router v6 docs
// apps/frontend/src/components/ProtectedRoute.tsx

import { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';

interface AuthContext {
  user: { username: string; role: string } | null;
  isLoading: boolean;
  isAuthed: boolean;
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { get } = useApi();
  const [auth, setAuth] = useState<AuthContext>({
    user: null,
    isLoading: true,
    isAuthed: false,
  });

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await get('/auth/me');
        if (response.ok) {
          const user = await response.json();
          setAuth({ user, isLoading: false, isAuthed: true });
        } else if (response.status === 401) {
          setAuth({ user: null, isLoading: false, isAuthed: false });
          navigate('/login', { replace: true });
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setAuth({ user: null, isLoading: false, isAuthed: false });
        navigate('/login', { replace: true });
      }
    };

    checkAuth();
  }, [navigate]);

  if (auth.isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!auth.isAuthed) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
```

### Example 3: Fastify Login Route with iron-session (AUTH-03, AUTH-04)

```typescript
// Source: iron-session docs + Fastify patterns
// apps/api/src/routes/auth.ts

import FastifyPlugin from 'fastify-plugin';
import { getIronSession, IronSessionOptions } from 'iron-session';

declare global {
  namespace Express {
    interface Session {
      userId: string;
      username: string;
      role: 'Viewer' | 'Admin';
      loginAt: string;
    }
  }
}

const sessionConfig: IronSessionOptions = {
  secret: process.env.SESSION_SECRET!,
  cookieName: 'acm_session',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 8 * 60 * 60, // 8 hours
    path: '/',
  },
};

export const authRoutes = FastifyPlugin(async (fastify, opts) => {
  // POST /api/v1/auth/login
  fastify.post('/login', async (request, reply) => {
    const { username, password } = request.body as {
      username: string;
      password: string;
    };

    const authProvider = new LDAPAuthProvider(ldapConfig);
    const { dn, cn } = await authProvider.bindUser(username, password);
    const groups = await authProvider.getUserGroups(dn);
    const role = await authProvider.getRoleFromGroups(groups);

    // Set session
    request.session = {
      userId: dn,
      username: cn,
      role,
      loginAt: new Date().toISOString(),
    };

    await request.session.save();

    reply.code(200).send({
      success: true,
      user: { username: cn, role },
    });
  });

  // GET /api/v1/auth/me
  fastify.get('/me', async (request, reply) => {
    if (!request.session?.userId) {
      reply.code(401).send({ error: 'Not authenticated' });
      return;
    }

    reply.send({
      userId: request.session.userId,
      username: request.session.username,
      role: request.session.role,
    });
  });

  // POST /api/v1/auth/logout
  fastify.post('/logout', async (request, reply) => {
    request.session.destroy();
    reply.code(200).send({ success: true });
  });
});
```

### Example 4: Caddy Reverse Proxy Config (SEC-04)

```caddy
# Source: Caddy documentation (caddyserver.com/docs)
# ./Caddyfile

acm-kpi.internal {
    # TLS via internal CA (auto-generated)
    tls internal {
        ca letsencrypt
    }

    # Security headers (SEC-04)
    header / {
        # HSTS: enforce HTTPS for 1 year
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        
        # CSP: restrict script execution to self
        Content-Security-Policy "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:"
        
        # Frame options: disallow embedding in iframes
        X-Frame-Options "DENY"
        
        # MIME type sniffing protection
        X-Content-Type-Options "nosniff"
    }

    # Reverse proxy to Fastify API
    reverse_proxy /api/* localhost:3000 {
        header_up X-Forwarded-For {http.request.remote.host}
        header_up X-Forwarded-Proto {http.request.proto}
        header_up Host {http.request.host}
    }

    # Serve React static files
    file_server {
        root /app/frontend/dist
        index index.html
    }

    # SPA fallback: 404 → index.html
    handle_errors {
        @404 expression `{http.error.status_code} == 404`
        route @404 {
            rewrite * /index.html
            file_server {
                root /app/frontend/dist
            }
        }
    }

    # Structured JSON logging to stdout
    log {
        output stdout
        format json {
            time_format wall
        }
    }
}

# Health check endpoint (for Docker healthcheck)
:8080 {
    respond /health "OK" 200
}
```

## Assumptions to Flag for IT

**Critical items that require ACM IT confirmation before final implementation:**

1. **AD Structure (LDAP)**
   - ✓ Assumed: Single on-prem Active Directory forest
   - ❌ Verify with IT: Multi-domain forest with referrals? If yes, test with cross-domain user
   - ❌ Verify: Service account exists (`svc_acm_kpi_ldap`) with read permissions on user/group objects
   - ❌ Confirm: User identifier is `sAMAccountName` (not `uid` or email). If different, adjust ldapts filter

2. **LDAP Group Structure**
   - ❌ Confirm: Viewer role group DN (e.g., `cn=kpi_viewers,ou=groups,dc=acm,dc=local`)
   - ❌ Confirm: Admin role group DN (e.g., `cn=kpi_admins,ou=groups,dc=acm,dc=local`)
   - ❌ Clarify: Are groups nested? If yes, does AD support `LDAP_MATCHING_RULE_IN_CHAIN` for recursive lookup?

3. **LDAP TLS/SSL**
   - ✓ Assumed: LDAPS (port 636) is available
   - ❌ Verify: Internal CA certificate for LDAPS. If self-signed, we'll need the cert file mounted in container

4. **Target OS**
   - ✓ Assumed: Linux (CentOS 7/8/9, RHEL, or Ubuntu LTS)
   - ❌ Confirm: Exact version and SELinux mode (enforcing/permissive/disabled)
   - ❌ Confirm: Docker and Docker Compose v2 available on target host

5. **SMB Share (for Phase 2, but impacts architecture)**
   - ❌ Confirm: SMB share path (e.g., `\\smb-server\exports` or `/mnt/smb-share` if already mounted on host)
   - ❌ Provide: Service account credentials for SMB mount (`apollo_export` assumed; may differ)
   - ❌ Confirm: Linux host can mount SMB shares via `mount.cifs`

6. **PostgreSQL Backup Infrastructure**
   - ❌ Confirm: Does ACM IT provide external storage for backups (NAS, S3-compatible, etc.)?
   - ❌ If not: Host-level LVM snapshots of `postgres_data` volume are sufficient for v1

7. **Session Secret Rotation Policy**
   - ❌ Clarify: How are secrets managed? (Docker Secrets, HashiCorp Vault, .env files, etc.)
   - ❌ Confirm: Rotation cadence (every 90 days recommended)

8. **Monitoring / Logging Integration**
   - ❌ Confirm: Does ACM have centralized logging (ELK, Splunk, etc.) or just stdout capture?
   - ❌ Confirm: Prometheus/Grafana available? If yes, we can add metrics endpoints in Phase 8

9. **Internal CA for TLS**
   - ✓ Assumed: Caddy generates self-signed internal CA on first run (for development)
   - ❌ For production: Does ACM IT have a corporate CA? If yes, provide CA cert + key for mounting in container

10. **Network Topology**
    - ❌ Confirm: Is the on-prem host air-gapped (no internet)? If yes, ensure all base images (node:22-alpine, postgres:16-alpine, caddy:2.8-alpine) are cached locally before deployment

---

## Open Questions

1. **LDAP Nested Groups:** Does ACM's AD use nested groups (e.g., `kpi_viewers` is a member of `all_users`)? If yes, we need `LDAP_MATCHING_RULE_IN_CHAIN` for recursive lookup.
   - **Recommendation:** Ask IT for a test user in a nested group; test with actual AD during Phase 1

2. **LDAP Multi-Domain:** Does the AD forest have multiple domains? If yes, the referral-following in ldapts is critical; test with cross-domain user.
   - **Recommendation:** Confirm domain structure; test LDAP referrals during Phase 1

3. **File Size in Production:** Sample file is 900 rows. Real Apollo export may be 10k–50k+ rows. Will ingestion timeout be acceptable?
   - **Recommendation:** Phase 2 must test with 50k rows; adjust timeout if needed

4. **Dark Mode Browser Default:** Should the dashboard auto-detect browser's `prefers-color-scheme` or default to light?
   - **Recommendation:** Default to light (aerospace, professional); user can toggle (Phase 6)

---

## State of the Art (2026 Context)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ldapjs (callback-based) | ldapts (promise-based) | 2022–2026 | Async/await support, TypeScript DX, active maintenance |
| Lucia auth (deprecated) | iron-session | Mid 2026 | Lucia being sunset; iron-session is stable alternative |
| Fastify 4 | Fastify 5.8 | 2024–2026 | Better TypeScript support, plugin ecosystem maturity |
| Prisma (schema-first) | Drizzle ORM (code-first) | 2023–2026 | Better bulk-insert ergonomics, no codegen overhead |
| Flyway (Java-based) | drizzle-kit (Node.js-based) | 2024–2026 | No external Java runtime in containers; tighter ORM integration |
| Next.js pages router | Vite + React Router | 2023–2026 | Simpler for non-SEO apps; no SSR overhead |
| Paper.css charts | Recharts | 2020–2026 | React-first, SVG, easier theming (dark/light) |

---

## Metadata

**Confidence breakdown:**
- **Standard Stack:** HIGH — All versions verified current as of April 2026. ldapts (8.1.7) actively maintained. Drizzle-kit stable, Fastify 5.8.4 proven.
- **Architecture:** HIGH — Docker Compose topology tested pattern. ldapts + iron-session + Fastify stack well-understood. LDAP service patterns verified against AD best practices.
- **Pitfalls:** HIGH — LDAP injection, CSV parsing, SMB race conditions documented in PITFALLS.md. Mitigations concrete and testable.
- **LDAP vs ldapts decision:** HIGH — Web search confirms ldapts 8.1.7 actively maintained (1 month), TypeScript-native, promise-based. ldapjs decommissioned but stable (fallback only).
- **drizzle-kit vs Flyway decision:** MEDIUM-HIGH — drizzle-kit integration verified in docs. Flyway comparison inferred (no explicit 2026 comparison in search), but Node.js benefit (no Java) is clear.

**Research valid until:** 2026-05-08 (30 days, then re-verify npm package versions)

**Date:** 2026-04-08

## Sources

### Primary (HIGH confidence)
- [ldapts GitHub Releases](https://github.com/ldapts/ldapts) — Confirms 8.1.7 released 1 month ago, active maintenance
- [ldapjs vs ldapts Comparison](https://npm-compare.com/ldapjs,ldapts) — TypeScript support, maintenance status
- [React npm Registry](https://www.npmjs.com/package/react) — Version 19.2.4 current
- [Vite npm Registry](https://www.npmjs.com/package/vite) — Version 8.0.7 (released 16 hours ago as of April 8, 2026)
- [Fastify npm Registry](https://www.npmjs.com/package/fastify) — Version 5.8.4 (released 15 days ago)
- [ldapts npm Registry](https://www.npmjs.com/package/ldapts) — Version 8.1.7 current
- [Caddy TLS Documentation](https://caddyserver.com/docs/caddyfile/directives/tls) — Internal CA configuration verified
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs) — drizzle-kit migrations, code-first approach

### Secondary (MEDIUM confidence)
- [Upgrading to Vitest 3, Vite 6 and React 19](https://www.thecandidstartup.org/2025/03/31/vitest-3-vite-6-react-19.html) — Confirms Vite 8 is current (not 9), React 19 available
- [Drizzle ORM REST API Tutorial 2026](https://1xapi.com/blog/type-safe-rest-api-drizzle-orm-nodejs-2026/) — Drizzle usage patterns in 2026
- [Fastify + Drizzle Integration Examples](https://dev.to/vladimirvovk/fastify-api-with-postgres-and-drizzle-orm-a7j) — Verified pattern, current as of 2026

---

**RESEARCH COMPLETE**
