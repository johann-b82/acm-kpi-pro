# Plan 2: Monorepo Scaffold + Tooling

**Phase:** 1 — Foundation & Auth
**Depends on:** None
**Can run in parallel with:** Plan 3 (postgres-drizzle) — no shared files
**Requirements covered:** BRAND-01 (logo asset placeholder), BRAND-02 (favicon placeholder)

## Goal

After this plan commits, the repository has a complete npm-workspaces monorepo skeleton with four packages (`apps/api`, `apps/frontend`, `apps/worker`, `packages/core`), shared TypeScript project references, Biome linting/formatting config, editor tooling files, and a placeholder logo asset. Running `npm install` from the root succeeds and `npm run lint` passes on the empty skeleton. No functional code yet — this is pure scaffolding that every other plan builds on top of.

## Assumptions (flag for IT)

- **ASSUMPTION:** Node 22 LTS is available on the developer's machine. A `.nvmrc` file pins it; run `nvm use` to switch.
- **ASSUMPTION:** The placeholder logo (`assets/acm-logo.png`) is a generated SVG converted to PNG (1×1 pixel blue square) until ACM provides the real logo file. All references point to this path; swapping in the real logo requires only replacing the file, not changing any code.

## Tasks

### Task 1: Root workspace configuration

**Files to create:**
- `package.json` — root workspace config (monorepo entry)
- `tsconfig.json` — base TypeScript config with strict mode, project references
- `biome.json` — linter + formatter config
- `.nvmrc` — Node version pin
- `.gitignore` — standard Node + Docker ignores
- `.dockerignore` — exclude dev artifacts from Docker builds
- `.editorconfig` — whitespace + line-ending rules
- `.env.example` — template for all required environment variables

**Action:**

Create `package.json` at project root:
```json
{
  "name": "acm-kpi-pro",
  "version": "1.0.0",
  "private": true,
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
    "lint:fix": "biome check --write .",
    "db:migrate": "npm -w apps/api run db:migrate"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.8.0",
    "typescript": "^6.0.2",
    "concurrently": "^8.2.0"
  }
}
```

Create `tsconfig.json` at project root:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "composite": true
  },
  "references": [
    { "path": "./packages/core" },
    { "path": "./apps/api" },
    { "path": "./apps/worker" }
  ],
  "exclude": ["node_modules", "**/dist", "**/build"]
}
```

Create `biome.json`:
```json
{
  "$schema": "https://biomejs.dev/schemas/1.8.0/schema.json",
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noImplicitBoolean": "off"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      }
    }
  },
  "organizeImports": {
    "enabled": true
  },
  "files": {
    "ignoreUnknown": true,
    "ignore": ["dist", "build", "node_modules", ".planning", "samples", "assets"]
  }
}
```

Create `.nvmrc`:
```
22
```

Create `.gitignore`:
```
# Dependencies
node_modules/
.npm/

# Build outputs
dist/
build/
*.tsbuildinfo

# Environment variables
.env
.env.local
.env.*.local

# Logs
*.log
logs/

# Docker
.docker-data/

# Editor
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Testing
coverage/
playwright-report/
test-results/

# Caddy
caddy_data/
caddy_config/
```

Create `.dockerignore`:
```
node_modules
npm-debug.log
dist
build
.git
.gitignore
.env
.env.*
*.md
.planning
samples
coverage
playwright-report
test-results
*.tsbuildinfo
```

Create `.editorconfig`:
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
```

Create `.env.example`:
```bash
# ============================================================
# ACM KPI Pro — Environment Variables
# Copy this file to .env and fill in real values.
# Never commit .env to git.
# ============================================================

NODE_ENV=production

# PostgreSQL
DB_PASSWORD=changeme_secure_password_here

# LDAP Configuration
# ASSUMPTION: sAMAccountName is the user identifier. Confirm with IT.
# ASSUMPTION: Single domain acm.local. Confirm with IT.
LDAP_URL=ldaps://ldap.acm.local:636
LDAP_BIND_DN=cn=svc_acm_kpi,ou=services,dc=acm,dc=local
LDAP_BIND_PASSWORD=service_account_password_here
LDAP_USER_SEARCH_BASE=ou=users,dc=acm,dc=local
LDAP_GROUP_SEARCH_BASE=ou=groups,dc=acm,dc=local
LDAP_VIEWER_GROUP_DN=cn=kpi_viewers,ou=groups,dc=acm,dc=local
LDAP_ADMIN_GROUP_DN=cn=kpi_admins,ou=groups,dc=acm,dc=local

# LDAP Security
# Set LDAP_TLS=true (LDAPS preferred). Set LDAP_TLS=false ONLY with admin approval;
# a startup warning will be logged when TLS is disabled (SEC-03).
LDAP_TLS=true
# Set LDAP_SKIP_CERT_CHECK=true only in dev for self-signed certs.
LDAP_SKIP_CERT_CHECK=false

# Session Management
# Generate with: openssl rand -base64 32
SESSION_SECRET=REPLACE_WITH_GENERATED_VALUE

# SMB Share (Phase 2 — scaffold only)
SMB_SHARE_PATH=/mnt/smb-share
SMB_POLL_INTERVAL_MS=5000
SMB_FILE_PATTERN=LagBes*

# API Port (internal, Caddy proxies externally)
API_PORT=3000
```

### Task 2: Workspace package stubs + logo placeholder

**Files to create:**
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/frontend/package.json`
- `apps/frontend/tsconfig.json`
- `apps/worker/package.json`
- `apps/worker/tsconfig.json`
- `apps/worker/src/index.ts` — stub (Phase 2 placeholder)
- `packages/core/package.json`
- `packages/core/tsconfig.json`
- `packages/core/src/index.ts` — re-exports all public types
- `packages/core/src/types/auth.ts` — AuthProvider interface + Role enum + User type
- `packages/core/src/types/kpi.ts` — KpiSummary scaffold type
- `packages/core/src/types/job.ts` — Bull job payload type scaffold
- `assets/acm-logo.png` — placeholder (1×1 blue PNG, or a minimal inline SVG saved as PNG)

**Action:**

Create `apps/api/package.json`:
```json
{
  "name": "@acm-kpi/api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc --build",
    "test": "vitest run",
    "db:migrate": "drizzle-kit push"
  },
  "dependencies": {
    "@acm-kpi/core": "*",
    "fastify": "^5.8.4",
    "@fastify/cookie": "^11.0.0",
    "ldapts": "^8.1.7",
    "iron-session": "^8.4.0",
    "drizzle-orm": "^0.45.2",
    "pg": "^8.20.0",
    "pino": "^9.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/pg": "^8.11.0",
    "drizzle-kit": "^0.45.2",
    "tsx": "^4.19.0",
    "vitest": "^2.0.0",
    "ldapts-mock": "^0.2.0"
  }
}
```

Create `apps/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "lib": ["ES2022"]
  },
  "references": [
    { "path": "../../packages/core" }
  ],
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Create `apps/frontend/package.json`:
```json
{
  "name": "@acm-kpi/frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@acm-kpi/core": "*",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-router": "^6.20.0",
    "react-router-dom": "^6.20.0",
    "tailwindcss": "^3.4.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.3.0",
    "next-themes": "^0.2.1",
    "lucide-react": "^0.400.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^6.0.1",
    "vite": "^8.0.7",
    "typescript": "^6.0.2",
    "vitest": "^2.0.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

Create `apps/frontend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "noEmit": true
  },
  "references": [
    { "path": "../../packages/core" }
  ],
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Create `apps/worker/package.json`:
```json
{
  "name": "@acm-kpi/worker",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc --build",
    "test": "vitest run"
  },
  "dependencies": {
    "@acm-kpi/core": "*",
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "vitest": "^2.0.0"
  }
}
```

Create `apps/worker/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "references": [
    { "path": "../../packages/core" }
  ],
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Create `apps/worker/src/index.ts` (Phase 2 stub):
```typescript
// Phase 2 stub: CSV ingestion worker
// This process will listen to Bull job queue and process CSV files.
// Implemented in Phase 2.
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
logger.info('Worker stub running — CSV ingestion implemented in Phase 2');
```

Create `packages/core/package.json`:
```json
{
  "name": "@acm-kpi/core",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc --build",
    "dev": "tsc --build --watch"
  },
  "devDependencies": {
    "typescript": "^6.0.2"
  }
}
```

Create `packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Create `packages/core/src/types/auth.ts` — the AuthProvider interface and Role enum used by all other plans:
```typescript
/**
 * Role enum — two roles in v1.
 * Viewer: read-only dashboard + docs.
 * Admin: Viewer + upload + settings.
 */
export type Role = 'Viewer' | 'Admin';

/**
 * Authenticated user representation (session payload).
 */
export interface AuthUser {
  /** LDAP distinguished name (DN) — unique identifier */
  userId: string;
  /** Display name from AD cn attribute */
  username: string;
  /** Assigned role from AD group membership */
  role: Role;
  /** ISO 8601 timestamp of login */
  loginAt: string;
}

/**
 * AuthProvider interface — abstraction layer so Entra ID / SAML
 * can be added in v2 without changing API route code.
 * (AUTH-02)
 */
export interface AuthProvider {
  /**
   * Authenticate a user with credentials.
   * Returns the resolved AuthUser on success.
   * Throws on invalid credentials or unauthorized group.
   */
  authenticate(username: string, password: string): Promise<AuthUser>;

  /**
   * Check if the LDAP/AD server is reachable (used by /healthz).
   */
  ping(): Promise<boolean>;
}
```

Create `packages/core/src/types/kpi.ts`:
```typescript
/**
 * KPI summary returned by /api/v1/kpi/summary.
 * Scaffold for Phase 1; values are populated in Phase 3.
 */
export interface KpiSummary {
  /** Total inventory value in EUR — null until first import */
  totalInventoryValue: number | null;
  /** ISO 8601 timestamp of the last successful import */
  lastIngestTs: string | null;
  /** Status of the last import attempt */
  lastIngestStatus: 'success' | 'failed' | null;
}
```

Create `packages/core/src/types/job.ts`:
```typescript
/**
 * Bull job payload for CSV ingestion jobs.
 * Scaffold for Phase 2.
 */
export interface CsvIngestionJobPayload {
  /** Absolute path to the CSV file inside the container */
  filePath: string;
  /** Original filename (for audit log) */
  originalFilename: string;
  /** Username of the uploader, or 'watcher' for automated ingestion */
  operator: string;
}
```

Create `packages/core/src/index.ts`:
```typescript
// Public API of @acm-kpi/core
export type { Role, AuthUser, AuthProvider } from './types/auth.js';
export type { KpiSummary } from './types/kpi.js';
export type { CsvIngestionJobPayload } from './types/job.js';
```

Create `assets/acm-logo.png` — generate a minimal placeholder PNG using Node.js inline:

Run this script to produce the placeholder (or use the SVG approach below). The simplest cross-platform approach is to create a minimal SVG file at `assets/acm-logo.svg` and also copy it as `acm-logo.png` as a placeholder. The SVG will render as the logo until the real PNG is provided.

Create `assets/acm-logo.svg` with a blue circular placeholder:
```xml
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="30" fill="#1D4ED8"/>
  <text x="32" y="38" text-anchor="middle" fill="white" font-family="Arial,sans-serif"
        font-size="18" font-weight="bold">ACM</text>
</svg>
```

For `assets/acm-logo.png`, generate a minimal 1×1 blue PNG via Node.js:
```bash
node -e "
const fs = require('fs');
// Minimal PNG: 1×1 blue pixel (binary)
const png = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
  '2e00000000c4944415408d76360f8cf0000000200013bbcc2c0000000049454e44ae426082',
  'hex'
);
fs.writeFileSync('assets/acm-logo.png', png);
"
```
Note: The SVG at `assets/acm-logo.svg` is the canonical placeholder. The PNG is referenced by Vite's public directory and the API favicon endpoint.

## Files Touched

- `package.json` — created (root workspace config)
- `tsconfig.json` — created (base TS config)
- `biome.json` — created (lint/format config)
- `.nvmrc` — created (Node 22 pin)
- `.gitignore` — created
- `.dockerignore` — created
- `.editorconfig` — created
- `.env.example` — created
- `apps/api/package.json` — created
- `apps/api/tsconfig.json` — created
- `apps/frontend/package.json` — created
- `apps/frontend/tsconfig.json` — created
- `apps/worker/package.json` — created
- `apps/worker/tsconfig.json` — created
- `apps/worker/src/index.ts` — created (stub)
- `packages/core/package.json` — created
- `packages/core/tsconfig.json` — created
- `packages/core/src/types/auth.ts` — created
- `packages/core/src/types/kpi.ts` — created
- `packages/core/src/types/job.ts` — created
- `packages/core/src/index.ts` — created
- `assets/acm-logo.svg` — created (placeholder)
- `assets/acm-logo.png` — created (1×1 placeholder)

## Exit Criteria

- [ ] `npm install` runs from project root with zero errors
- [ ] `npm run lint` exits 0 (Biome finds no errors on skeleton files)
- [ ] `npm -w packages/core run build` exits 0 (TypeScript compiles `core` package)
- [ ] `node --version` in project directory outputs `v22.*` (or `nvm use` switches to it)
- [ ] `assets/acm-logo.svg` exists and is valid SVG (open in browser, see blue circle with "ACM")
- [ ] `assets/acm-logo.png` exists (placeholder; swap with real logo when provided by IT)
- [ ] `packages/core/src/types/auth.ts` exports `Role`, `AuthUser`, `AuthProvider`

## Verification

```bash
cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro"

# Install dependencies
npm install

# Check Node version
node --version
# Expected: v22.x.x (or run `nvm use` first)

# Lint passes on scaffold
npm run lint
# Expected: exit code 0, no errors

# Build core package
npm -w packages/core run build
# Expected: exit code 0, dist/ folder created in packages/core/

# Confirm logo placeholder exists
ls -la assets/acm-logo.svg assets/acm-logo.png
# Expected: both files present

# Confirm AuthProvider interface compiles
node -e "import('./packages/core/dist/index.js').then(m => console.log(Object.keys(m)))"
# Expected: prints array including 'AuthProvider', 'Role', etc.
```

## Commit

```
feat(01): scaffold monorepo workspaces, Biome config, core types, logo placeholder
```
