# Plan 6: React Frontend Shell

**Phase:** 1 — Foundation & Auth
**Depends on:** Plan 2 (monorepo scaffold) — needs `apps/frontend/package.json` + tsconfig; imports `@acm-kpi/core` types
**Can run in parallel with:** Plan 4 (api-skeleton) and Plan 5 (auth) — no shared files; the frontend calls `/api/v1/auth/me` which starts returning real data after Plan 5 completes
**Requirements covered:** AUTH-06 (redirect to /login), BRAND-01 (logo in header), BRAND-02 (favicon), BRAND-03 (complementary color palette scaffold), DASH-01 partial (dashboard stub with one KPI card)

## Goal

After this plan commits, `npm -w apps/frontend run build` succeeds and `npm -w apps/frontend run dev` opens a browser to a working React SPA with the following:

- **Login page** at `/login` — username + password form that POST to `/api/v1/auth/login`
- **Protected layout** — wraps all non-login routes; fetches `/api/v1/auth/me` on mount and redirects to `/login` on 401
- **Dashboard stub** at `/` — shows the ACM logo in the header (from `assets/acm-logo.svg`), upload icon button (top-right), docs icon button (top-right), and one KPI card: "Total inventory value — loading…"
- **Upload stub** at `/upload` — "Coming soon" page
- **Docs stub** at `/docs` — "Coming soon" page
- Tailwind CSS + shadcn/ui wired, dark-mode CSS variables scaffolded (toggle deferred to Phase 6)
- Favicon references the logo asset

No polling, no real KPI data, no LDAP tests — just the shell.

## Assumptions (flag for IT)

- **ASSUMPTION:** The frontend Vite dev server proxies `/api` to `http://localhost:3000` (where the Fastify API runs in dev). In production, Caddy handles routing so no proxy config needed.
- **ASSUMPTION:** Logo placeholder (`assets/acm-logo.svg`) from Plan 2 is used. Frontend copies it to `apps/frontend/public/` so Vite serves it as a static asset. When IT provides the real logo, replace `assets/acm-logo.svg` and re-run the copy (or automate via a postinstall script).
- **ASSUMPTION:** Color palette uses ACM blue (#1D4ED8, from logo placeholder) as primary. A proper palette complementing the real logo is designed in Phase 6 (BRAND-03). The scaffold establishes CSS variable names so Phase 6 only changes values, not structure.

## Tasks

### Task 1: Vite config, Tailwind, shadcn/ui bootstrap, global styles

**Files to create:**
- `apps/frontend/vite.config.ts` — Vite config with React plugin + API proxy
- `apps/frontend/tailwind.config.ts` — Tailwind config with content paths, dark mode via class
- `apps/frontend/postcss.config.ts` — PostCSS config for Tailwind
- `apps/frontend/src/styles/global.css` — Tailwind directives + CSS custom properties for dark/light mode
- `apps/frontend/index.html` — HTML entry point with favicon + title
- `apps/frontend/components.json` — shadcn/ui config for component generation
- `apps/frontend/public/acm-logo.svg` — copy of logo placeholder (served as static asset)
- `apps/frontend/public/favicon.svg` — favicon (same as logo)

**Action:**

Create `apps/frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Dev proxy: forward /api/* to Fastify API (avoids CORS in development)
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Keep chunks reasonable for on-prem (PITFALL #8: <2s FCP)
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
```

Create `apps/frontend/tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class', // Toggle dark mode via <html class="dark">
  theme: {
    extend: {
      colors: {
        // ACM brand colors — placeholder palette complementing the blue logo
        // Full palette designed in Phase 6 (BRAND-03)
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',   // Primary ACM blue (matches logo placeholder)
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
```

Create `apps/frontend/postcss.config.ts`:
```typescript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

Create `apps/frontend/src/styles/global.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/*
 * CSS Custom Properties for theming.
 * Phase 1 scaffold: only light mode colors defined.
 * Dark mode CSS variables added in Phase 6 (THEME-01).
 */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --primary: 221.2 83.2% 53.3%;   /* ACM blue */
  --primary-foreground: 210 40% 98%;
  --muted: 210 40% 96%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --ring: 221.2 83.2% 53.3%;
  --radius: 0.5rem;
}

/* Dark mode variables — placeholder, full design in Phase 6 */
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --card: 222.2 84% 4.9%;
  --card-foreground: 210 40% 98%;
  --border: 217.2 32.6% 17.5%;
  --input: 217.2 32.6% 17.5%;
  --primary: 217.2 91.2% 59.8%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --muted: 217.2 32.6% 17.5%;
  --muted-foreground: 215 20.2% 65.1%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 210 40% 98%;
  --ring: 224.3 76.3% 48%;
}

* {
  box-sizing: border-box;
}

body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: var(--font-sans, system-ui, sans-serif);
  margin: 0;
}
```

Create `apps/frontend/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ACM KPI Pro</title>
    <!-- BRAND-02: favicon from logo asset -->
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="alternate icon" href="/favicon.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `apps/frontend/components.json` (shadcn/ui CLI config):
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/styles/global.css",
    "baseColor": "blue",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

Copy logo assets into `public/`:
```bash
cp assets/acm-logo.svg apps/frontend/public/acm-logo.svg
cp assets/acm-logo.svg apps/frontend/public/favicon.svg
```

Create `apps/frontend/src/lib/utils.ts` (shadcn/ui utility):
```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

### Task 2: React app structure — pages, components, routing

**Files to create:**
- `apps/frontend/src/main.tsx` — React entry point
- `apps/frontend/src/hooks/useAuth.ts` — auth state hook (calls /api/v1/auth/me)
- `apps/frontend/src/components/ProtectedRoute.tsx` — redirects to /login on 401
- `apps/frontend/src/components/Header.tsx` — logo + upload/docs icon buttons
- `apps/frontend/src/components/KpiCard.tsx` — reusable KPI display card
- `apps/frontend/src/pages/LoginPage.tsx` — login form
- `apps/frontend/src/pages/DashboardPage.tsx` — dashboard stub with one KPI card
- `apps/frontend/src/pages/UploadStubPage.tsx` — "coming soon" stub
- `apps/frontend/src/pages/DocsStubPage.tsx` — "coming soon" stub
- `apps/frontend/src/pages/NotFoundPage.tsx` — 404

**Action:**

Create `apps/frontend/src/main.tsx`:
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { UploadStubPage } from './pages/UploadStubPage.js';
import { DocsStubPage } from './pages/DocsStubPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

ReactDOM.createRoot(root).render(
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
);
```

Create `apps/frontend/src/hooks/useAuth.ts`:
```typescript
import { useState, useEffect, useCallback } from 'react';
import type { AuthUser } from '@acm-kpi/core';

interface AuthState {
  user: Omit<AuthUser, 'userId'> | null;
  loading: boolean;
  error: string | null;
}

/**
 * Auth hook: fetches current user from /api/v1/auth/me.
 * Used by ProtectedRoute and Header components.
 * (AUTH-06: any 401 response redirects to /login)
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null });

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/auth/me', { credentials: 'include' });
      if (res.status === 401) {
        setState({ user: null, loading: false, error: null });
        return;
      }
      if (!res.ok) {
        setState({ user: null, loading: false, error: 'Server error' });
        return;
      }
      const user = await res.json();
      setState({ user, loading: false, error: null });
    } catch {
      setState({ user: null, loading: false, error: 'Network error' });
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const logout = useCallback(async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    setState({ user: null, loading: false, error: null });
    window.location.href = '/login';
  }, []);

  return { ...state, logout, refetch: checkAuth };
}
```

Create `apps/frontend/src/components/ProtectedRoute.tsx`:
```typescript
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Wraps any route that requires authentication.
 * Redirects to /login if /api/v1/auth/me returns 401. (AUTH-06)
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { replace: true });
    }
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
```

Create `apps/frontend/src/components/Header.tsx`:
```typescript
import { Link, useNavigate } from 'react-router-dom';
import { Upload, BookOpen, LogOut } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';

/**
 * App header: ACM logo (BRAND-01) + upload + docs icon buttons (UP-01, DOCS-01 scaffolds)
 * + logout button.
 */
export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
        {/* BRAND-01: ACM logo */}
        <Link to="/" className="flex items-center gap-2">
          <img
            src="/acm-logo.svg"
            alt="ACM logo"
            width={32}
            height={32}
            className="h-8 w-8"
          />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            ACM KPI Pro
          </span>
        </Link>

        {/* Top-right controls */}
        <div className="flex items-center gap-1">
          {/* Upload icon button — routes to upload stub (UP-01) */}
          <Link
            to="/upload"
            title="Upload data"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md
                       text-muted-foreground hover:bg-muted hover:text-foreground
                       transition-colors"
          >
            <Upload className="h-4 w-4" />
            <span className="sr-only">Upload data</span>
          </Link>

          {/* Docs icon button (DOCS-01) */}
          <Link
            to="/docs"
            title="Documentation"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md
                       text-muted-foreground hover:bg-muted hover:text-foreground
                       transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            <span className="sr-only">Documentation</span>
          </Link>

          {/* Logout */}
          {user && (
            <button
              type="button"
              onClick={() => void logout()}
              title={`Logout (${user.username})`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md
                         text-muted-foreground hover:bg-muted hover:text-foreground
                         transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Logout</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
```

Create `apps/frontend/src/components/KpiCard.tsx`:
```typescript
import { cn } from '../lib/utils.js';

interface KpiCardProps {
  label: string;
  value: string | null;
  unit?: string;
  status?: 'ok' | 'warning' | 'critical' | 'loading';
  className?: string;
}

const statusColors = {
  ok: 'text-green-600 dark:text-green-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
  critical: 'text-red-600 dark:text-red-400',
  loading: 'text-muted-foreground animate-pulse',
};

/**
 * Reusable KPI display card.
 * Phase 1: renders with hardcoded loading state.
 * Phase 3: populated with real values from /api/v1/kpi/summary.
 * (DASH-02 scaffold)
 */
export function KpiCard({ label, value, unit, status = 'loading', className }: KpiCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-6 shadow-sm',
        className
      )}
    >
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-2 text-3xl font-bold', statusColors[status])}>
        {value ?? '—'}
        {unit && value && (
          <span className="ml-1 text-lg font-normal text-muted-foreground">{unit}</span>
        )}
      </p>
    </div>
  );
}
```

Create `apps/frontend/src/pages/LoginPage.tsx`:
```typescript
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Login page — LDAP credentials form.
 * Submits to POST /api/v1/auth/login.
 * On success, navigates to dashboard.
 * (AUTH-06)
 */
export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const username = String(form.get('username') ?? '');
    const password = String(form.get('password') ?? '');

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        navigate('/', { replace: true });
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? 'Login failed. Check your credentials.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <img src="/acm-logo.svg" alt="ACM logo" width={56} height={56} className="h-14 w-14" />
          <h1 className="text-2xl font-bold text-foreground">ACM KPI Pro</h1>
          <p className="text-sm text-muted-foreground">Sign in with your ACM account</p>
        </div>

        {/* Form */}
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-foreground mb-1">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
                         text-foreground placeholder:text-muted-foreground
                         focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="firstname.lastname"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
                         text-foreground placeholder:text-muted-foreground
                         focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold
                       text-primary-foreground hover:bg-primary/90 disabled:opacity-50
                       transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

Create `apps/frontend/src/pages/DashboardPage.tsx`:
```typescript
import { Header } from '../components/Header.js';
import { KpiCard } from '../components/KpiCard.js';

/**
 * Dashboard — Phase 1 stub.
 * Shows one hardcoded KPI card in "loading" state.
 * Real KPI data wired in Phase 3.
 * (PITFALL #8: lean first paint enforced from day 1)
 */
export function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-screen-xl px-4 py-8">
        <h2 className="mb-6 text-xl font-semibold text-foreground">Dashboard</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Phase 1: single placeholder KPI card */}
          <KpiCard
            label="Total inventory value"
            value="loading…"
            status="loading"
          />
        </div>
      </main>
    </div>
  );
}
```

Create `apps/frontend/src/pages/UploadStubPage.tsx`:
```typescript
import { Header } from '../components/Header.js';

export function UploadStubPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-screen-xl px-4 py-8">
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-lg font-medium text-muted-foreground">
            Upload — coming in Phase 4
          </p>
        </div>
      </main>
    </div>
  );
}
```

Create `apps/frontend/src/pages/DocsStubPage.tsx`:
```typescript
import { Header } from '../components/Header.js';

export function DocsStubPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-screen-xl px-4 py-8">
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-lg font-medium text-muted-foreground">
            Documentation — coming in Phase 7
          </p>
        </div>
      </main>
    </div>
  );
}
```

Create `apps/frontend/src/pages/NotFoundPage.tsx`:
```typescript
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold text-foreground">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <Link to="/" className="text-sm text-primary underline underline-offset-4">
        Return to dashboard
      </Link>
    </div>
  );
}
```

## Files Touched

- `apps/frontend/vite.config.ts` — created
- `apps/frontend/tailwind.config.ts` — created
- `apps/frontend/postcss.config.ts` — created
- `apps/frontend/index.html` — created
- `apps/frontend/components.json` — created (shadcn/ui config)
- `apps/frontend/public/acm-logo.svg` — created (copy of placeholder)
- `apps/frontend/public/favicon.svg` — created (copy of placeholder)
- `apps/frontend/src/styles/global.css` — created (Tailwind + CSS vars)
- `apps/frontend/src/lib/utils.ts` — created (cn helper)
- `apps/frontend/src/main.tsx` — created (React entry + router)
- `apps/frontend/src/hooks/useAuth.ts` — created
- `apps/frontend/src/components/ProtectedRoute.tsx` — created
- `apps/frontend/src/components/Header.tsx` — created
- `apps/frontend/src/components/KpiCard.tsx` — created
- `apps/frontend/src/pages/LoginPage.tsx` — created
- `apps/frontend/src/pages/DashboardPage.tsx` — created
- `apps/frontend/src/pages/UploadStubPage.tsx` — created
- `apps/frontend/src/pages/DocsStubPage.tsx` — created
- `apps/frontend/src/pages/NotFoundPage.tsx` — created

## Exit Criteria

- [ ] `npm -w apps/frontend run build` exits 0 (TypeScript + Vite build succeeds)
- [ ] `npm -w apps/frontend run dev` serves the app on `http://localhost:5173`
- [ ] Visiting `http://localhost:5173/` (without auth) redirects to `/login`
- [ ] `/login` page renders: ACM logo (blue circle placeholder), username + password fields, submit button
- [ ] Entering valid credentials (with API running) and submitting redirects to `/`
- [ ] Dashboard page shows header with ACM logo, Upload icon, Docs icon, Logout button
- [ ] Dashboard shows one KPI card labeled "Total inventory value" with "loading…" text
- [ ] `/upload` shows "Upload — coming in Phase 4" stub
- [ ] `/docs` shows "Documentation — coming in Phase 7" stub
- [ ] `<link rel="icon">` in `index.html` resolves to the logo SVG (favicon visible in browser tab)
- [ ] No TypeScript errors (`tsc --noEmit` passes)

## Verification

```bash
cd "/Users/johannbechtold/Documents/Claude Code/acm-kpi pro"

# Install frontend deps
npm install

# TypeScript check
npm -w apps/frontend exec -- tsc --noEmit
# Expected: exit 0, no errors

# Build
npm -w apps/frontend run build
# Expected: exit 0, dist/ folder created in apps/frontend/

# Dev server (requires API running for full flow)
npm -w apps/frontend run dev &
sleep 3

# Check login page loads
curl -s http://localhost:5173/login | grep -c "ACM"
# Expected: >= 1 (title or alt text contains "ACM")

# Kill dev server
kill %1

# Inspect build output
ls apps/frontend/dist/
# Expected: index.html, assets/ folder with JS + CSS chunks

# Check favicon is in public/
ls apps/frontend/public/
# Expected: acm-logo.svg favicon.svg
```

## Commit

```
feat(01): add React frontend shell (login, protected layout, dashboard stub, upload/docs stubs)
```
