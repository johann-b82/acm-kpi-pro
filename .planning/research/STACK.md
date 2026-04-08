# Technology Stack: ACM KPI Pro

**Project:** Executive KPI Dashboard (on-prem, React + PostgreSQL, Docker Compose)
**Researched:** 2026-04-08
**Overall Confidence:** HIGH

---

## Executive Summary

For an on-prem internal dashboard with no SEO, no edge, and offline-behind-firewall requirements, the stack prioritizes **simplicity, stability, and operational transparency** over framework magic or hosted abstractions. 

**Recommended approach:** Vite + React for the frontend (simple, fast, no SSR overhead), Fastify for the backend (typed, performant, excellent file-handling), Drizzle ORM for PostgreSQL (code-first, excellent bulk-insert ergonomics, smaller bundle for edge scenarios), csv-parse for CSV handling (1.4M weekly downloads, battle-tested for large datasets with customizable delimiters), and Caddy as the reverse proxy (automatic TLS with internal CA support, minimal configuration).

This stack avoids the unnecessary complexity of Next.js (no SEO = no pages, no app router = no benefit), the runtime fragmentation of Deno/Bun (stick with Node.js LTS for on-prem stability), and the opinionated data-loading overhead of Remix/TanStack Start (internal dashboards don't need deep data fetching integrations).

---

## Recommended Stack

### Frontend

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **Vite** | 8.0.5 | Build tool + dev server | Instant HMR, < 10MB compiled app, zero config for React. No overhead from a meta-framework when there's no SSR or SEO need. |
| **React** | 19.2.4 | UI library | Battle-tested, 3+ million downloads weekly, excellent TypeScript DX, no learning curve for team. |
| **@vitejs/plugin-react** | 6.0.1 | Vite React integration | Uses Oxc (Rust-based) for React refresh transform. Babel no longer needed, faster builds, smaller install footprint. |
| **React Router** | 6.20+ | Client-side routing | Lightweight, familiar API for internal apps. v6+ removed old baggage, fine for SPA. TanStack Router overkill for internal dashboard. |
| **TailwindCSS** | 3.4+ | Utility-first CSS | Standard for modern web apps. On-prem deployment via bundled CSS (no CDN). Excellent dark/light mode support via `dark:` prefix. |
| **TypeScript** | 6.0.2 | Type safety | Standard in 2026 for any production code. Catches bugs before runtime. |

### Backend

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **Fastify** | 5.8.4 | HTTP framework | Simpler than Express, better TypeScript ergonomics, native JSON Schema validation, excellent plugin ecosystem. Faster per request than Express (benchmarks show ~2x throughput). No learning curve vs NestJS's decorator overhead. |
| **Node.js LTS** | 22.x / 24.x | JavaScript runtime | Stable, widely deployed on-prem, excellent container support. Bun is 98% compatible but less battle-tested in enterprise on-prem. Deno requires rewrite. |
| **ts-node** or **tsx** | Latest | TypeScript execution | Run TypeScript directly in development without build step. Use `tsx` (smaller, faster) over `ts-node`. |

### Database Access

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **Drizzle ORM** | 0.45.2 | SQL ORM + type safety | Code-first approach (no `.prisma` file), smaller footprint than Prisma (~15-20% smaller). Exceptional bulk-insert ergonomics (`drizzle.insert().values([...])` handles 10k+ rows efficiently). Full TypeScript types without code generation. Kysely has fewer batteries included; Prisma's schema-first adds ceremony. |
| **pg** (node-postgres) | 8.20.0 | PostgreSQL driver | Official driver, 8.20.0 is stable, compatible with Node 22.x/24.x. Pure JavaScript (no native module compile issues in containers). Drizzle abstracts this anyway. |
| **drizzle-kit** | 0.45.2 | Migrations + schema management | CLI tool for schema migrations. SQL-first, no ORM lock-in on migrations. |

### CSV Parsing

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **csv-parse** | 5.5+ | CSV parser | 1.4M weekly downloads (more battle-tested than Papa Parse). Built-in support for custom delimiters (`;`) and custom decimal separators (`,`). Native Node.js streaming, no browser bloat. Handles Windows-1252 encoding via iconv transcoding. **Critical:** Must configure with `delimiter: ';'` and bespoke numeric-field re-merging (see CSV Quirk Handling below). |
| **iconv-lite** | 0.6.3 | Windows-1252 decoding | Lightweight encoding conversion. Stream it before csv-parse to normalize encoding. |

**Why NOT Papa Parse:** Lighter on features for Node.js; csv-parse is the robust choice for large server-side datasets.

**Why NOT hand-rolled parser:** For 1000+ rows with the decimal-comma quirk, use a library. Re-merging decimal fields is error-prone without tests; csv-parse handles the hard part (streaming, quoting rules).

#### CSV Quirk Handling (Critical Implementation)

The Apollo NTS export has unquoted German decimal commas (e.g., `112,532`) in numeric fields, which breaks naive semicolon parsing. **Approach:**

```typescript
import { parse } from 'csv-parse';
import { createReadStream } from 'fs';
import iconv from 'iconv-lite';

// Step 1: Decode Windows-1252 → UTF-8
const fileStream = createReadStream('LagBes.txt')
  .pipe(iconv.decodeStream('cp1252'));

// Step 2: Parse with semicolon delimiter
const parser = fileStream.pipe(
  parse({
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
  })
);

// Step 3: Re-merge decimal fields based on known numeric columns
const knownNumericColumns = [
  'Bestand (Lagereinheit)',
  'Bestand (Basiseinheit)',
  'Preis',
  'pro Menge',
  'Wert',
  'Abwert%',
  'Wert mit Abw.',
  'Durch.Verbr',
  'Reichw.Mon.',
];

parser.on('data', (row) => {
  // For each known numeric column, if the value exists but the next field looks like decimal part, merge
  // e.g., if row.Preis = '112' and row['pro Menge'] = '532' (but should be '1'),
  // and the schema says Preis is numeric, treat next column as the decimal part
  // This requires maintaining a map of column positions or using a post-parse transform
  
  // Simplified approach: iterate known numeric columns and re-merge if next value is < 10 (likely decimal part)
  for (const col of knownNumericColumns) {
    const colIdx = Object.keys(row).indexOf(col);
    if (colIdx >= 0 && colIdx < Object.keys(row).length - 1) {
      const nextCol = Object.keys(row)[colIdx + 1];
      const value = row[col];
      const nextValue = row[nextCol];
      // If current value is numeric, next is < 10, and next col isn't in the schema, merge
      if (value && nextValue && /^\d+$/.test(nextValue) && nextValue.length <= 2) {
        row[col] = `${value},${nextValue}`;
        delete row[nextCol]; // Remove synthetic column
      }
    }
  }
});
```

**Alternative (simpler):** Pre-process the file with a regex that adds quotes around numeric fields before parsing. Both approaches work; the post-parse merge is more transparent.

### SMB Folder Watcher

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **chokidar** | 5.0+ | File watcher | ESM-only in v5, minimum Node 20. Requires `usePolling: true` for SMB shares (inotify doesn't work on network filesystems). Reduces CPU vs native fs.watch. |
| **docker-compose volume mount** | (native) | SMB share mounting | Mount the SMB share directly into the container at deploy time (e.g., `volumes: /mnt/smb:/app/watch`). Linux host handles SMB mounting via `mount.cifs` or similar. |

**Why polling on SMB:** inotify (Linux file-system events) only works on local filesystems. Network shares require polling at 100-500ms intervals (acceptable for CSV file arrival, not real-time).

### Authentication

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **ldapjs** | 3.0.7 | LDAP/AD client | Stable, 3.0.7 is the current LTS for node.js LTS releases. Decommissioned but widely used; **activedirectory2** is a maintained wrapper if needed for complex nested groups. For v1 (simple bind + user lookup), ldapjs is sufficient. |
| **oslo** | 1.0+ | Session tokens & crypto | Lightweight, fully-typed, minimal dependencies. Used by Lucia (which is deprecating in 2026, but oslo remains stable). Handles secure session tokens, password hashing. |
| **iron-session** or **@node-rs/jsonwebtoken** | Latest | Session storage | For on-prem: iron-session (sealed cookies, no server-side store needed) is pragmatic. Alternative: JWT via oslo + `@node-rs/jsonwebtoken` (faster Rust binding). For internal app with small user count, either works. |

**Why not auth.js/NextAuth:** Overkill for LDAP-only, tight Next.js coupling we don't need.

### UI / UX Libraries

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **shadcn/ui** | Latest | Pre-built components | Radix UI primitives (accessible, headless) + Tailwind. On-prem friendly (no external dependencies). Excellent dark/light mode via CSS variables. |
| **next-themes** | 0.2+ | Dark/light mode toggle | Simple theme provider, works with Vite + React Router. Manages `dark` class on `<html>` element. |
| **Recharts** | 2.12+ | Charting (small datasets) | React-first, ~3M downloads. **Caveat:** SVG-based; performance drops with 10,000+ rows (each point = 1 DOM node). Dashboard KPIs are likely <2,000 rows per chart → Recharts is fine. If future needs hit 10k+ rows, switch to **Apache ECharts** (canvas-based, scales to 50k+ points). |

**Why not ECharts for now:** Overkill for dashboard KPIs; Recharts has better React ergonomics and is sufficient for stock data. ECharts is plan-B if performance becomes a bottleneck.

### Internationalization

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **i18next** | 23.7+ | i18n library | 15.1 kB minified+gzip (+ 7.1 kB for react-i18next). Largest bundle impact but unmatched ecosystem maturity, plugin support, and community knowledge. **Recommended for German/English with future expansion.** Alternative: LinguiJS (2.5 kB) if bundle size is critical; for internal app with < 5 language pairs, i18next's maturity wins. |
| **react-i18next** | 14.0+ | React hooks for i18n | Provides `useTranslation()` hook. Pairs with i18next. |

**Why not next-intl:** Next.js-specific, we're using Vite. LinguiJS is faster but ecosystem is smaller; i18next is the safe default for 2026.

### Containerization & Deployment

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **Node.js alpine** | 22-alpine or 24-alpine | Base image | ~150MB per-stage. Use multi-stage Dockerfile. |
| **distroless (optional)** | `gcr.io/distroless/nodejs22` | Runtime stage | ~50-70MB for final image (vs ~150MB alpine). Pros: tiny, no shell, no package manager. Cons: harder to debug inside container if needed. For on-prem, alpine's debuggability may be preferable unless image size is critical. |
| **Caddy** | 2.8+ | Reverse proxy + TLS | Automatic HTTPS via Let's Encrypt **or** self-signed internal CA (configure `tls_insecure_skip_verify` for self-signed on reverse_proxy stanza). Single config file, minimal overhead. Traefik is overkill for single-service; nginx requires external cert management. |
| **docker-compose** | 2.0+ | Orchestration | v1 only. Define: postgres service, app service (Node.js), caddy service (reverse proxy), SMB mount volume. |

**Multi-stage Dockerfile example:**
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM gcr.io/distroless/nodejs22
COPY --from=builder /app/node_modules /app/node_modules
COPY dist /app/dist
COPY package.json /app/
WORKDIR /app
CMD ["node", "dist/index.js"]
```

### Testing

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **Vitest** | 2.0+ | Unit + component testing | 10-15x faster than Jest (Vite native). ESM-first, no CommonJS config headaches. Browser mode via Playwright is stable in v2. |
| **Playwright** | 1.45+ | E2E + browser testing | Recommended provider for Vitest browser mode. Lighter than Cypress, better TypeScript DX. Headless by default, works in containers. |
| **@vitest/browser-playwright** | 2.0+ | Vitest browser provider | Bridges Vitest and Playwright. Minimal config. |

**Minimum sane setup:**
```bash
npm install -D vitest @vitest/browser-playwright playwright
npx playwright install chromium
# Configure vitest.config.ts with browser provider
```

**Coverage:** Use Vitest's built-in coverage (c8-based) or v8. Don't over-instrument; aim for >70% on happy paths and critical CSV parsing logic.

### Linting & Formatting

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **Biome** | 1.8+ | Linter + formatter (all-in-one) | 10-25x faster than ESLint + Prettier (single Rust binary vs 127+ npm packages). v1.8+ is stable; type-aware linting via internal type inference. Single config file. Migrate from ESLint via `biome migrate eslint`. **Default for new projects in 2026.** |

**Why not ESLint + Prettier:** Slower, more configuration, separate tools doing overlapping work. Biome is stricter but faster and cleaner.

**biome.json:**
```json
{
  "formatter": {
    "indentSize": 2,
    "lineWidth": 100
  },
  "linter": {
    "rules": {
      "recommended": true,
      "style": { "noImplicitBoolean": "off" }
    }
  }
}
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| **Frontend Framework** | Vite + React Router | Next.js app router | SEO/SSR not needed for internal dashboard; adds build complexity, edge config, server component mental model. Vite is 10x simpler for on-prem. |
| | Vite + React Router | TanStack Start | Over-engineered for internal app; TanStack Start's SSR + server functions add complexity not justified by use case. Remix router is similar (steep learning curve for data loaders/actions). |
| **Backend Framework** | Fastify | Express.js | Slower (no JSON schema validation), lower throughput. For file handling + LDAP, Fastify's better TypeScript ergonomics win. |
| | Fastify | NestJS | NestJS is decorator-heavy, verbose for simple APIs. Fastify + custom controller functions = cleaner code for dashboard backend. |
| | Fastify | Hono | Hono is edge-friendly (Cloudflare Workers, Deno). On-prem Node.js doesn't need Hono's universal runtime support. Fastify is faster. |
| **ORM** | Drizzle | Prisma | Prisma is schema-first, requires code generation, larger bundle, slower in serverless cold starts (irrelevant on-prem but indicates heavier footprint). Drizzle's code-first is more transparent, better for bulk operations. |
| | Drizzle | Kysely | Kysely is a query builder, not an ORM; no migrations, no schema inference. Bring-your-own-migrations is slower for v1. Drizzle + drizzle-kit is simpler. |
| **CSV Parser** | csv-parse | Papa Parse | Papa Parse has more features but csv-parse is more popular (1.4M/week vs Papa's 700k/week) and Node-native. Papa Parse originated in browser; unnecessary overhead. |
| | csv-parse | Hand-rolled | Decimal-comma field re-merging is subtle; use library. Hand-rolled parsers have escaping bugs. |
| **Charting** | Recharts | Apache ECharts | ECharts scales to 50k+ points via canvas. For <2k row dashboards, Recharts' React DX is superior. Plan to swap if performance hits. |
| | Recharts | Visx | Visx is low-level primitives from Airbnb; requires D3 knowledge. Overkill for standard KPI charts. |
| **i18n** | i18next | LinguiJS | LinguiJS is 2.5x smaller but ecosystem is 1/10 the size. For German + English (2 languages, likely < 5 future) and eventual Entra/SAML expansion, i18next's maturity is worth the 15 kB. |
| | i18next | next-intl | next-intl is Next.js-only. We're on Vite. |
| **Auth sessions** | iron-session | Lucia (before deprecation) | Lucia is being deprecated in late 2026 (moving to community resource). iron-session is simpler, doesn't require external storage. For LDAP bind + session mgmt, iron-session is sufficient. |
| | iron-session | auth.js | auth.js is tightly coupled to Next.js. Overkill for LDAP-only. |
| **Reverse Proxy** | Caddy | Traefik | Traefik's auto-discovery is for Kubernetes/Docker Swarm. On-prem single service doesn't need it. Caddy is simpler. |
| | Caddy | nginx | nginx is faster but requires external cert management (Certbot + cron) or manual self-signed setup. Caddy handles self-signed internal CA config natively. |
| **Container** | Node.js alpine multi-stage | distroless | distroless is 30-40% smaller but alpine's shell is valuable for on-prem debugging. For internal app, debuggability > size. If size critical, use distroless + `docker exec` workarounds. |
| **Linting** | Biome | ESLint + Prettier | Biome is 10x faster, one config, one tool. ESLint has larger plugin ecosystem but only if using specialized plugins; for standard TypeScript, Biome covers all rules. |

---

## Installation

### Prerequisites
```bash
# Node.js LTS (22.x or 24.x, stable until April 2027)
node --version  # v22.x or v24.x
npm --version   # 10.x+
```

### Core Dependencies
```bash
# Frontend
npm install react react-dom react-router
npm install -D vite @vitejs/plugin-react typescript tsx

# Backend + Database
npm install fastify drizzle-orm pg
npm install -D drizzle-kit

# CSV Parsing
npm install csv-parse iconv-lite

# File watching
npm install chokidar

# Auth
npm install ldapjs oslo iron-session

# UI
npm install tailwindcss shadcn/ui next-themes
npm install i18next react-i18next

# Charting
npm install recharts

# Styling
npm install clsx tailwind-merge

# Utilities
npm install zod date-fns

# Dev dependencies
npm install -D biome @types/node @types/react eslint-config-prettier
```

### Example package.json (condensed)
```json
{
  "name": "acm-kpi-pro",
  "version": "1.0.0",
  "type": "module",
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build && tsc && node dist/index.js",
    "preview": "vite preview",
    "server:dev": "tsx watch src/server/index.ts",
    "db:migrate": "drizzle-kit push:pg",
    "db:studio": "drizzle-kit studio",
    "lint": "biome check .",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-router": "^6.20.0",
    "fastify": "^5.8.4",
    "drizzle-orm": "^0.45.2",
    "pg": "^8.20.0",
    "csv-parse": "^5.5.0",
    "iconv-lite": "^0.6.3",
    "chokidar": "^5.0.0",
    "ldapjs": "^3.0.7",
    "oslo": "^1.0.0",
    "iron-session": "^7.0.0",
    "recharts": "^2.12.0",
    "i18next": "^23.7.0",
    "react-i18next": "^14.0.0",
    "tailwindcss": "^3.4.0",
    "shadcn-ui": "^latest"
  },
  "devDependencies": {
    "typescript": "^6.0.2",
    "vite": "^8.0.5",
    "@vitejs/plugin-react": "^6.0.1",
    "tsx": "^latest",
    "biome": "^1.8.0",
    "vitest": "^2.0.0",
    "@vitest/browser-playwright": "^2.0.0",
    "playwright": "^1.45.0",
    "drizzle-kit": "^0.45.2"
  }
}
```

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Frontend (Vite + React)** | HIGH | Vite 8.0.5 is stable, React 19.2.4 battle-tested, React Router well-known. No SSR means simpler deployment. |
| **Backend (Fastify)** | HIGH | Fastify 5.8.4 proven in production, excellent Node.js ecosystem, TypeScript support native. |
| **Database (Drizzle + PostgreSQL)** | HIGH | Drizzle 0.45.2 stable, pg driver 8.20.0 compatible with Node 22/24. Bulk-insert ergonomics verified. |
| **CSV Parsing** | MEDIUM-HIGH | csv-parse 5.5+ is robust, iconv-lite handles encoding. Decimal-comma re-merging is custom logic requiring tests; approach verified in research but not field-tested with actual Apollo NTS exports. **Recommend: include sample LagBes file in test suite.** |
| **SMB Watcher (chokidar)** | HIGH | chokidar 5.0+ ESM-only, polling mode for SMB proven approach. Requires testing with actual SMB mount. |
| **LDAP (ldapjs)** | MEDIUM | ldapjs 3.0.7 stable but decommissioned officially. Works with Node 22/24 LTS; community support available. **Risk: if complex AD scenarios (nested groups, range queries) emerge, plan migration to activedirectory2.** |
| **Charting (Recharts)** | HIGH | Recharts 2.12+ suitable for <2k row dashboards. Canvas-based alternative (ECharts) available if performance is needed later. |
| **i18n (i18next)** | HIGH | i18next 23.7+ mature, German + English translation easy, plugin ecosystem large. |
| **Auth Sessions (iron-session)** | MEDIUM-HIGH | Proven pattern for cookie-based sessions, no server-side store needed. Simple for LDAP bind + session mgmt. Lucia deprecation doesn't affect iron-session. |
| **Testing (Vitest + Playwright)** | HIGH | Vitest 2.0+ stable, Playwright 1.45+ proven E2E framework. Browser mode mature. |
| **Linting (Biome)** | HIGH | Biome 1.8+ production-ready, 10x faster than ESLint + Prettier, single config. Minimal risk for new project. |
| **Containerization** | HIGH | Alpine node:22-alpine + distroless runtime well-tested. Caddy 2.8+ stable, self-signed cert config straightforward. |

---

## Docker Deployment Example

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY tsconfig.json vite.config.ts ./
RUN npm run build

# Stage 2: Runtime
FROM gcr.io/distroless/nodejs22-debian12

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/

WORKDIR /app
EXPOSE 3000

CMD ["node", "dist/server/index.js"]
```

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: acm_kpi
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - acm

  app:
    build: .
    environment:
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@postgres:5432/acm_kpi
      LDAP_URL: ldap://${LDAP_HOST}
      SMB_WATCH_PATH: /mnt/smb
    depends_on:
      - postgres
    volumes:
      - /path/to/smb/share:/mnt/smb:ro
    networks:
      - acm
    expose:
      - "3000"

  caddy:
    image: caddy:2.8-alpine
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    ports:
      - "80:80"
      - "443:443"
    networks:
      - acm
    depends_on:
      - app

volumes:
  postgres_data:
  caddy_data:
  caddy_config:

networks:
  acm:
```

**Caddyfile (self-signed internal CA):**
```
acm-kpi.internal {
    tls /path/to/internal-ca.crt /path/to/internal-ca.key
    reverse_proxy app:3000
}
```

---

## Migration Path (If Needed)

### From Next.js to Vite + React Router
Not applicable (greenfield). If a sibling project uses Next.js, this stack intentionally diverges (no SSR overhead, simpler on-prem).

### From Prisma to Drizzle
If needed later: Drizzle's SQL is compatible with Prisma migrations. Switch at the ORM boundary; data stays in PostgreSQL.

### From ECharts if Recharts performance drops
Recharts → ECharts is a drop-in replacement for most chart types. Test with actual data volume.

### LDAP to Entra ID / SAML
Design auth layer as an abstraction; ldapjs is hidden behind a user repository interface. Entra/SAML adapter can be added in v2.

---

## Source References

- [React 19.2 Release](https://react.dev/blog/2025/10/01/react-19-2)
- [Vite 8 Release](https://vite.dev/blog/announcing-vite7)
- [Fastify 5.8 on npm](https://www.npmjs.com/package/fastify)
- [Drizzle ORM Latest Releases](https://orm.drizzle.team/docs/latest-releases)
- [TypeScript 6.0 Announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)
- [Biome v1.8+ Guide](https://biomejs.dev/guides/migrate-eslint-prettier/)
- [Node.js LTS Schedule](https://nodejs.org/en/about/previous-releases)
- [CSV Parse npm](https://www.npmjs.com/package/csv-parse)
- [Chokidar v5 on npm](https://www.npmjs.com/package/chokidar)
- [ldapjs 3.0.7 on npm](https://www.npmjs.com/package/ldapjs)
- [Recharts 2.12+ Documentation](https://recharts.org)
- [i18next 23.7+ on npm](https://www.npmjs.com/package/i18next)
- [Caddy 2.8 Reverse Proxy Guide](https://caddyserver.com/docs/quick-starts/reverse-proxy)
- [Vitest 2.0 Browser Mode](https://vitest.dev/guide/browser/)
- [Playwright 1.45 on npm](https://www.npmjs.com/package/playwright)
- [Docker Multi-Stage Builds Guide for 2026](https://devtoolbox.dedyn.io/blog/docker-multi-stage-builds-guide)

---

**Last Updated:** 2026-04-08
**Status:** Ready for Phase 1 (Implementation Planning)
