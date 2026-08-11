# Vite Migration + Figma Design Revamp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Docusaurus site with a single Vite + React app that replicates the Figma design (`design/UBS Dev Tools Portal (1)/`) exactly while preserving every working feature, with docs rendered via MDX-in-Vite.

**Architecture:** One Vite 8 SPA at the repo root. New shell/screens in TSX copied-and-adapted from the design export; existing feature components stay JSX and keep working through three compat layers: (1) Vite aliases mapping `@site`, `@theme/Layout`, `@docusaurus/Link` to shims, (2) `window.__*__` legacy globals installed at boot from `import.meta.env`, (3) an Infima-variable compat stylesheet re-tinted to the design palette. Docs compile through `@mdx-js/rollup` and route via `import.meta.glob`.

**Tech Stack:** Vite ^8, React 19, react-router-dom ^7, TypeScript 5.7 (`allowJs`), Tailwind CSS v4 (`@tailwindcss/vite`), three, lucide-react, @reduxjs/toolkit + react-redux, firebase, crypto-js, @mdx-js/rollup + remark-gfm/frontmatter/directive, prism-react-renderer, vitest.

## Global Constraints

- Design source of truth: `design/UBS Dev Tools Portal (1)/src/` — copy its visuals verbatim; only change what wiring requires. Never import from `design/` at runtime; always copy files into `src/`.
- `/tools/github/callback` must keep its exact URL, render OUTSIDE the sign-in gate, and keep `MESSAGE_SOURCE = 'github-connect'` + `ubsmobile://` deep-link behavior byte-for-byte (mobile OAuth depends on it).
- Tenant Admin: System tab (and Assign Tenant inside it) visible ONLY when `activeOrg.is_super_admin`. This is the one deliberate deviation from the mock's tab bar.
- Feature parity: no logic changes to ported `.jsx`/`.js` components except import/styling adjustments. The only net-new feature is the read-only GitHub PRs tab.
- The mock's "States" sidebar group is demo-only — never in real nav; its three screens become the real guard states.
- No docs search, versioning, or i18n. Blog (template leftovers) is deleted.
- `docs/superpowers/**` is excluded from the docs route glob.
- Node >= 20. Build output `dist/` (Vercel default + Dockerfile updated). Commit after every task with `git -c user.email="bsse23047@itu.edu.pk" -c user.name="Nauraiz Haider" commit ...`.
- Old Docusaurus files stay in place until Task 17 removes them — Vite only bundles what's imported, so unported files don't break builds.

---

### Task 1: Vite scaffold and toolchain swap

**Files:**
- Modify: `package.json` (full rewrite)
- Create: `vite.config.ts`, `tsconfig.json`, `index.html`, `vercel.json`, `src/app/main.tsx`, `src/app/App.tsx` (placeholder), `vitest.config.ts`
- Modify: `.gitignore` (add `dist`, keep `build` entry), `Dockerfile`

**Interfaces:**
- Produces: `npm run dev|build|preview|test`; aliases `@site` → repo root, `@` → `src`, `@theme/Layout` → `src/compat/Layout.tsx`, `@docusaurus/Link` → `src/compat/Link.tsx` (shim files created in Task 3); MDX pipeline placeholder (plugins added Task 15).

- [ ] **Step 1: Rewrite package.json**

```json
{
  "name": "ubs-portal",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "vite",
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@mdx-js/react": "^3.0.0",
    "@reduxjs/toolkit": "^2.11.2",
    "clsx": "^2.0.0",
    "crypto-js": "^4.2.0",
    "firebase": "^12.8.0",
    "lucide-react": "^1.28.0",
    "prism-react-renderer": "^2.3.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-redux": "^9.2.0",
    "react-router-dom": "^7.1.0",
    "three": "^0.185.1"
  },
  "devDependencies": {
    "@mdx-js/mdx": "^3.0.0",
    "@mdx-js/rollup": "^3.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/three": "^0.185.3",
    "@vitejs/plugin-react": "^6.0.0",
    "remark-directive": "^3.0.0",
    "remark-frontmatter": "^5.0.0",
    "remark-gfm": "^4.0.0",
    "remark-mdx-frontmatter": "^5.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "unist-util-visit": "^5.0.0",
    "vite": "^8.0.0",
    "vitest": "^3.0.0"
  },
  "engines": { "node": ">=20.0" }
}
```

Delete `package-lock.json`, run `npm install`.

- [ ] **Step 2: Create vite.config.ts**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// MDX plugin is added in the docs task; keep this config minimal until then.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@site': path.resolve(__dirname, '.'),
      '@': path.resolve(__dirname, 'src'),
      '@theme/Layout': path.resolve(__dirname, 'src/compat/Layout.tsx'),
      '@docusaurus/Link': path.resolve(__dirname, 'src/compat/Link.tsx'),
    },
  },
  build: { outDir: 'dist' },
})
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "allowJs": true,
    "checkJs": false,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "paths": {
      "@site/*": ["./*"],
      "@/*": ["./src/*"],
      "@theme/Layout": ["./src/compat/Layout.tsx"],
      "@docusaurus/Link": ["./src/compat/Link.tsx"]
    }
  },
  "include": ["src", "docs"]
}
```

- [ ] **Step 4: Create index.html** (reproduces the Docusaurus `data-theme` bootstrap that `localStorage['theme']` toggling relies on)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/img/favicon.ico" />
    <title>UBS Framework</title>
    <script>
      (function () {
        try {
          var t = localStorage.getItem('theme');
          if (t !== 'light' && t !== 'dark') {
            t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
          }
          document.documentElement.setAttribute('data-theme', t);
        } catch (e) { document.documentElement.setAttribute('data-theme', 'dark'); }
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/app/main.tsx"></script>
  </body>
</html>
```

Static assets: Vite serves `public/` — move `static/img` → `public/img` and `static/sql` → `public/sql` (git mv; delete the other Docusaurus template images `undraw_*`, `docusaurus.png`, `docusaurus-social-card.jpg`).

- [ ] **Step 5: Placeholder app + vitest config**

`src/app/main.tsx`:
```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)
```

`src/app/App.tsx` (temporary, replaced in Task 5):
```tsx
export default function App() {
  return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>UBS Vite scaffold OK</div>
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.{ts,tsx,js}'] } })
```

- [ ] **Step 6: vercel.json + Dockerfile**

`vercel.json`:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Dockerfile: change the copy line `COPY --from=builder /app/build` → `COPY --from=builder /app/dist` and rename build ARGs to the `VITE_*` names defined in Task 2 (keep the nginx `try_files` fallback as-is).

- [ ] **Step 7: Verify + commit**

Run: `npm run build` → expect dist/ produced, no errors. `npm run dev` → page shows "UBS Vite scaffold OK".
Commit: `chore: replace Docusaurus toolchain with Vite scaffold`

---

### Task 2: Env module + legacy `window.__*__` globals

**Files:**
- Create: `src/app/env.ts`, `src/app/env.test.ts`
- Modify: `.env.example` (full rewrite), `.env` (rename keys — coordinate manually)

**Interfaces:**
- Produces: `env` object export; `installLegacyGlobals(env)` — installs every `window.__*__` global that `runtimeKeysClient.js`, `config.js`, `firebase.js`, `GithubWorkflow.jsx`, `AuthRoot.jsx` read, so those files port with ZERO edits. Called in `main.tsx` before React mounts (wired in Task 5).

- [ ] **Step 1: Write failing test** — `src/app/env.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { buildEnv, installLegacyGlobals } from './env'

describe('env', () => {
  const raw = {
    VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_AUTH_DOMAIN: 'd', VITE_FIREBASE_PROJECT_ID: 'p',
    VITE_FIREBASE_STORAGE_BUCKET: 'b', VITE_FIREBASE_MESSAGING_SENDER_ID: 's',
    VITE_FIREBASE_APP_ID: 'a', VITE_FIREBASE_MEASUREMENT_ID: 'm',
    VITE_BASE_URL: 'http://x:3000', VITE_SECRET_KEY: 'sk', VITE_PLATFORM_KEY: 'pk',
    VITE_PLATFORM_NAME: 'pn', VITE_PLATFORM_VERSION: '1', VITE_GIT_USERNAME: 'gu',
    VITE_GIT_PAT: 'tok', VITE_TILE_OUTLINES: 'false',
  }
  it('builds config with defaults', () => {
    const env = buildEnv({})
    expect(env.API_BASE_URL).toBe('http://localhost:3000')
    expect(env.TILE_OUTLINES).toBe(true)
  })
  it('installs every legacy global', () => {
    const env = buildEnv(raw)
    const w: Record<string, unknown> = {}
    installLegacyGlobals(env, w as unknown as Window)
    expect(w.__API_BASE_URL__).toBe('http://x:3000')
    expect(w.__FIREBASE_CONFIG__).toMatchObject({ apiKey: 'k', appId: 'a' })
    expect(w.__VITE_SECRET_KEY__).toBe('sk')
    expect(w.__VITE_PLATFORM_KEY__).toBe('pk')
    expect(w.__VITE_PLATFORM_NAME__).toBe('pn')
    expect(w.__VITE_PLATFORM_VERSION__).toBe('1')
    expect(w.__GIT_USERNAME__).toBe('gu')
    expect(w.__GIT_PAT__).toBe('tok')
    expect(w.__TILE_OUTLINES__).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npm test` → FAIL (module not found).

- [ ] **Step 3: Implement `src/app/env.ts`**

```ts
type RawEnv = Record<string, string | undefined>

export function buildEnv(raw: RawEnv) {
  return {
    FIREBASE_CONFIG: {
      apiKey: raw.VITE_FIREBASE_API_KEY,
      authDomain: raw.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: raw.VITE_FIREBASE_PROJECT_ID,
      storageBucket: raw.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: raw.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: raw.VITE_FIREBASE_APP_ID,
      measurementId: raw.VITE_FIREBASE_MEASUREMENT_ID,
    },
    API_BASE_URL: raw.VITE_BASE_URL || 'http://localhost:3000',
    SECRET_KEY: raw.VITE_SECRET_KEY,
    PLATFORM_KEY: raw.VITE_PLATFORM_KEY,
    PLATFORM_NAME: raw.VITE_PLATFORM_NAME,
    PLATFORM_VERSION: raw.VITE_PLATFORM_VERSION,
    GIT_USERNAME: raw.VITE_GIT_USERNAME,
    GIT_PAT: raw.VITE_GIT_PAT,
    TILE_OUTLINES: raw.VITE_TILE_OUTLINES !== 'false',
  }
}

export type AppEnv = ReturnType<typeof buildEnv>

// Ported JSX files read window.__*__ (set by the old Docusaurus portalPlugin).
// Installing them here means those files need zero edits.
export function installLegacyGlobals(env: AppEnv, w: Window = window) {
  const t = w as unknown as Record<string, unknown>
  t.__FIREBASE_CONFIG__ = env.FIREBASE_CONFIG
  t.__API_BASE_URL__ = env.API_BASE_URL
  t.__VITE_SECRET_KEY__ = env.SECRET_KEY
  t.__VITE_PLATFORM_KEY__ = env.PLATFORM_KEY
  t.__VITE_PLATFORM_NAME__ = env.PLATFORM_NAME
  t.__VITE_PLATFORM_VERSION__ = env.PLATFORM_VERSION
  t.__GIT_USERNAME__ = env.GIT_USERNAME
  t.__GIT_PAT__ = env.GIT_PAT
  t.__TILE_OUTLINES__ = env.TILE_OUTLINES
}

export const env = buildEnv(import.meta.env as RawEnv)
```

- [ ] **Step 4: Run tests** — `npm test` → PASS.

- [ ] **Step 5: Rewrite `.env.example`** with the new names (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID`, `VITE_BASE_URL`, `VITE_SECRET_KEY`, `VITE_PLATFORM_KEY`, `VITE_PLATFORM_NAME`, `VITE_PLATFORM_VERSION`, `VITE_GIT_USERNAME`, `VITE_GIT_PAT`, `VITE_TILE_OUTLINES`), each with a one-line comment carried over from the old file. Rename the same keys in the local `.env`. Note in the commit message that Vercel/Docker env config must be renamed at cutover.

- [ ] **Step 6: Commit** — `feat: env module with legacy window global installer`

---

### Task 3: Design system import + compat shims

**Files:**
- Create (copied from `design/UBS Dev Tools Portal (1)/src/`, then adapted): `src/styles/design.css` (from `index.css`), `src/lib.tsx`, `src/types.ts`, `src/components/ui/animated-shader-background.tsx`
- Create: `src/compat/Layout.tsx`, `src/compat/Link.tsx`

**Interfaces:**
- Produces: everything `lib.tsx` exports (`c`, `card`, `txt`, `muted`, `sub`, `divider`, `inputCls`, `chipIndigo/Mint/Amber/Red/Violet/Gray`, `Breadcrumb`, `SectionHeader`, `Checkbox`, `Toggle`); `AnoAI({className, opacity})`; `Layout({title, description, children})` shim; `Link({to, href, ...})` shim. `Theme = 'light' | 'dark'` from `src/types.ts`.

- [ ] **Step 1: Copy design files verbatim**: `index.css → src/styles/design.css`, `lib.tsx → src/lib.tsx`, `types.ts → src/types.ts`, `components/ui/animated-shader-background.tsx → src/components/ui/animated-shader-background.tsx`. In `src/types.ts` keep `Theme`; the `Screen` union is replaced by routes — delete `Screen` and `NavItem` (nothing copied later may import them; screen copies get their nav props changed in their own tasks).

- [ ] **Step 2: Add reduced-motion guard to the shader.** In `animated-shader-background.tsx`, inside the `useEffect` before starting the RAF loop:

```ts
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
```
and in the animate loop only advance `iTime` when `!prefersReduced` (render once, then skip scheduling further frames if reduced: `if (!prefersReduced) frame = requestAnimationFrame(animate)`).

- [ ] **Step 3: Write the Layout shim** — `src/compat/Layout.tsx` (replaces `@theme/Layout` for all 17 ported pages; the real shell is global, so this only handles the title and a content wrapper):

```tsx
import { useEffect, type ReactNode } from 'react'

export default function Layout({ title, description, children }: {
  title?: string; description?: string; children: ReactNode
}) {
  useEffect(() => {
    if (title) document.title = `${title} | UBS Framework`
    return () => { document.title = 'UBS Framework' }
  }, [title])
  useEffect(() => {
    if (!description) return
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.appendChild(meta)
    }
    meta.content = description
  }, [description])
  return <>{children}</>
}
```

- [ ] **Step 4: Write the Link shim** — `src/compat/Link.tsx`:

```tsx
import { Link as RouterLink } from 'react-router-dom'
import type { ComponentProps, ReactNode } from 'react'

type Props = { to?: string; href?: string; children?: ReactNode } &
  Omit<ComponentProps<'a'>, 'href'>

export default function Link({ to, href, children, ...rest }: Props) {
  const target = href ?? to
  if (!target) return <a {...rest}>{children}</a>
  if (/^(https?:)?\/\//.test(target) || href) {
    return <a href={target} target="_blank" rel="noreferrer" {...rest}>{children}</a>
  }
  return <RouterLink to={target} {...rest}>{children}</RouterLink>
}
```

- [ ] **Step 5: Verify + commit** — `npm run build` green (nothing imports these yet, but they must compile). Commit: `feat: design system, shader, and Docusaurus compat shims`

---

### Task 4: Infima-compat stylesheet (re-tinted custom.css)

**Files:**
- Create: `src/styles/tokens.css` (new — Infima variable set mapped to design palette)
- Create: `src/styles/portal-compat.css` (ported from `src/css/custom.css` lines 66–7311)

**Interfaces:**
- Produces: every `--ifm-*` variable referenced anywhere in ported JS/CSS (`--ifm-color-primary`, `--ifm-color-emphasis-0..1000`, `--ifm-background-color`, `--ifm-background-surface-color`, `--ifm-color-success|warning|danger`, `--ifm-font-family-base`), themed for `:root` (light) and `[data-theme='dark']`; all existing portal class names (`portal-*`, `tenant-*`, `mw-*`, `gw-*`, `erd-*`, etc.) keep working.

- [ ] **Step 1: Write `src/styles/tokens.css`**

```css
/* Infima-compat variables re-tinted to the Figma design palette.
   Ported JSX components and portal-compat.css depend on these names. */
:root {
  --ifm-color-primary: #4F46E5;
  --ifm-color-primary-dark: #3E35D9;
  --ifm-color-primary-darker: #3525CD;
  --ifm-color-primary-darkest: #2A1DA8;
  --ifm-color-primary-light: #6366F1;
  --ifm-color-primary-lighter: #818CF8;
  --ifm-color-primary-lightest: #A5B4FC;
  --ifm-color-success: #10B981;
  --ifm-color-warning: #F59E0B;
  --ifm-color-danger: #EF4444;
  --ifm-background-color: #FAF8FF;
  --ifm-background-surface-color: #FFFFFF;
  --ifm-color-content: #0F172A;
  --ifm-color-emphasis-0: #FFFFFF;
  --ifm-color-emphasis-100: #F1F5F9;
  --ifm-color-emphasis-200: #E2E8F0;
  --ifm-color-emphasis-300: #CBD5E1;
  --ifm-color-emphasis-400: #94A3B8;
  --ifm-color-emphasis-500: #64748B;
  --ifm-color-emphasis-600: #475569;
  --ifm-color-emphasis-700: #334155;
  --ifm-color-emphasis-800: #1E293B;
  --ifm-color-emphasis-900: #0F172A;
  --ifm-color-emphasis-1000: #020617;
  --ifm-font-family-base: 'Plus Jakarta Sans', system-ui, sans-serif;
  --ifm-font-family-monospace: 'JetBrains Mono', monospace;
}
[data-theme='dark'] {
  --ifm-background-color: #04070F;
  --ifm-background-surface-color: rgba(255, 255, 255, 0.04);
  --ifm-color-content: #F1F5F9;
  --ifm-color-emphasis-0: #04070F;
  --ifm-color-emphasis-100: rgba(255, 255, 255, 0.06);
  --ifm-color-emphasis-200: rgba(255, 255, 255, 0.10);
  --ifm-color-emphasis-300: rgba(255, 255, 255, 0.16);
  --ifm-color-emphasis-400: rgba(255, 255, 255, 0.30);
  --ifm-color-emphasis-500: rgba(255, 255, 255, 0.45);
  --ifm-color-emphasis-600: rgba(255, 255, 255, 0.60);
  --ifm-color-emphasis-700: rgba(255, 255, 255, 0.72);
  --ifm-color-emphasis-800: rgba(255, 255, 255, 0.85);
  --ifm-color-emphasis-900: #F1F5F9;
  --ifm-color-emphasis-1000: #FFFFFF;
}
body {
  background: var(--ifm-background-color);
  color: var(--ifm-color-content);
  font-family: var(--ifm-font-family-base);
}
```

- [ ] **Step 2: Port portal-compat.css.** Copy `src/css/custom.css` lines 66–end (everything from the `Portal / Dev Tools pages` banner onward; drop lines 1–65, the old Infima light/dark overrides) into `src/styles/portal-compat.css`. Then apply these mechanical edits:
  1. Delete the `========== UBS Theme + Shell Overrides ==========` section (~line 3801–4296 of the original) — the old shell (`ubs-side-nav`, welcome overlay, route fade) is replaced by the design shell. KEEP the `Tools sub-sidebar nav`, `Outline toggle`, and `No-outlines mode` subsections only if grep shows their classes used by ported components; otherwise delete (verify with `grep -r "ubs-no-outlines\|outline-toggle" src/components src/pages`).
  2. Global replace old brand blues `#093C5D`, `#25c2a0`, `#29784c` → `#4F46E5` (and their hover variants → `#3525CD`).
  3. No other rewrites — the section is intentionally kept working as-is; individual screen tasks replace chrome with design classes.

- [ ] **Step 3: Verify + commit** — `npm run build` green. Commit: `feat: Infima-compat tokens and re-tinted portal stylesheet`

---

### Task 5: Providers, theme, router skeleton, app shell + sidebar

**Files:**
- Create: `src/app/ThemeContext.tsx`, `src/app/AppLayout.tsx`, `src/components/Sidebar.tsx` (adapted from design), `src/app/routes.tsx`
- Modify: `src/app/main.tsx`, `src/app/App.tsx`

**Interfaces:**
- Consumes: `env`, `installLegacyGlobals` (Task 2); `AnoAI`, design css (Tasks 3–4); Redux `store` (existing `src/state/store.js`); `AuthProvider` (existing `src/components/portal/authStore.jsx`).
- Produces: `useTheme(): { theme: Theme; toggleTheme(): void }`; `<AppLayout/>` rendering shader + overlays + `<Sidebar/>` + `<Outlet/>`; route table in `routes.tsx` where every screen mounts (placeholder `<div>` elements for screens built in later tasks — each later task swaps its own placeholder). Sidebar nav config `PRIMARY`/`TOOLS` arrays with real paths.

- [ ] **Step 1: ThemeContext** — `src/app/ThemeContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Theme } from '../types'

const ThemeCtx = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: 'dark', toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    (document.documentElement.getAttribute('data-theme') as Theme) || 'dark')
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('theme', theme) } catch { /* private mode */ }
  }, [theme])
  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  return <ThemeCtx.Provider value={{ theme, toggleTheme }}>{children}</ThemeCtx.Provider>
}

export const useTheme = () => useContext(ThemeCtx)
```

- [ ] **Step 2: main.tsx boot order** — install globals BEFORE anything imports firebase/config, import styles, mount providers:

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Provider as ReduxProvider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { env, installLegacyGlobals } from './env'
import '../styles/design.css'
import '../styles/tokens.css'
import '../styles/portal-compat.css'

installLegacyGlobals(env)

// Imported AFTER globals exist — these modules read window.__*__ at module scope.
const { store } = await import('../state/store')
const { AuthProvider } = await import('../components/portal/authStore')
const { ThemeProvider } = await import('./ThemeContext')
const { default: App } = await import('./App')

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ReduxProvider store={store}>
      <AuthProvider>
        <ThemeProvider>
          <BrowserRouter><App /></BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </ReduxProvider>
  </React.StrictMode>,
)
```

Check `src/state/store.js`'s export form first (`export const store` vs default) and match. Note: `AuthRoot.jsx` and `plugins/portalPlugin.js` are NOT ported — `AuthRoot`'s job (dispatch `loadRuntimeKeys`, re-init Firebase when keys arrive) moves into `App.tsx` in the next step, ending today's double-mounted `AuthProvider`.

- [ ] **Step 3: App.tsx** — runtime keys bootstrap + routes:

```tsx
import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { loadRuntimeKeys } from '../state/runtimeKeysSlice'
import { store } from '../state/store'
import { initFirebase } from '../components/portal/firebase'
import { env } from './env'
import AppRoutes from './routes'

export default function App() {
  const dispatch = useDispatch()
  useEffect(() => {
    dispatch(loadRuntimeKeys() as never)
    initFirebase(env.FIREBASE_CONFIG)
    // Re-init when runtime keys arrive (mirrors old AuthRoot behavior).
    return store.subscribe(() => {
      const s = store.getState() as { runtimeKeys?: { status?: string; keys?: Record<string, string> } }
      if (s.runtimeKeys?.status === 'succeeded' && s.runtimeKeys.keys?.FIREBASE_API_KEY) {
        const k = s.runtimeKeys.keys
        initFirebase({
          apiKey: k.FIREBASE_API_KEY, authDomain: k.FIREBASE_AUTH_DOMAIN,
          projectId: k.FIREBASE_PROJECT_ID, storageBucket: k.FIREBASE_STORAGE_BUCKET,
          messagingSenderId: k.FIREBASE_MESSAGING_SENDER_ID, appId: k.FIREBASE_APP_ID,
          measurementId: k.FIREBASE_MEASUREMENT_ID,
        })
      }
    })
  }, [dispatch])
  return <AppRoutes />
}
```

Before wiring, read `src/components/portal/AuthRoot.jsx` and copy its exact runtime-keys→Firebase field mapping if it differs from the above.

- [ ] **Step 4: routes.tsx** — full route table (placeholders now, swapped per task):

```tsx
import { Routes, Route } from 'react-router-dom'
import AppLayout from './AppLayout'

const P = ({ name }: { name: string }) => <div style={{ padding: 40 }}>{name} — coming in its task</div>

export default function AppRoutes() {
  return (
    <Routes>
      {/* OAuth callback: OUTSIDE gate and shell (Task 6) */}
      <Route path="/tools/github/callback" element={<P name="callback" />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<P name="home" />} />
        <Route path="/about" element={<P name="about" />} />
        <Route path="/tools" element={<P name="tools hub" />} />
        <Route path="/tools/database" element={<P name="database" />} />
        <Route path="/tools/database/mapper" element={<P name="mapper" />} />
        <Route path="/tools/lucid" element={<P name="lucid" />} />
        <Route path="/tools/notify" element={<P name="notify" />} />
        <Route path="/tools/apiObject" element={<P name="api builder" />} />
        <Route path="/tools/github" element={<P name="github" />} />
        <Route path="/tools/github-sandbox" element={<P name="sandbox" />} />
        <Route path="/tools/meetingWorkflow" element={<P name="meetings" />} />
        <Route path="/tools/projects" element={<P name="projects" />} />
        <Route path="/tools/projects/view" element={<P name="project view" />} />
        <Route path="/tools/myProjects" element={<P name="my projects" />} />
        <Route path="/tools/myProjects/view" element={<P name="my project view" />} />
        <Route path="/tools/repos" element={<P name="repos" />} />
        <Route path="/tools/tenantAdmin" element={<P name="tenant admin" />} />
        <Route path="/docs/*" element={<P name="docs" />} />
        <Route path="*" element={<P name="404" />} />
      </Route>
    </Routes>
  )
}
```

Route URLs deliberately match the OLD site (`/tools/meetingWorkflow`, `/tools/apiObject`) so existing bookmarks/deep links survive.

- [ ] **Step 5: AppLayout** — the design's `App.tsx` wrapper, adapted:

```tsx
import { Outlet } from 'react-router-dom'
import AnoAI from '../components/ui/animated-shader-background'
import Sidebar from '../components/Sidebar'
import { useTheme } from './ThemeContext'

export default function AppLayout() {
  const { theme, toggleTheme } = useTheme()
  return (
    <div className="min-h-screen relative" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", background: '#04070F' }}>
      <AnoAI className="fixed inset-0 w-full h-full" opacity={theme === 'dark' ? 0.9 : 0.18} />
      {theme === 'light' && <div className="fixed inset-0 pointer-events-none" style={{ background: 'rgba(250,248,255,0.88)' }} />}
      {theme === 'dark' && <div className="fixed inset-0 pointer-events-none" style={{ background: 'rgba(4,7,15,0.38)' }} />}
      <Sidebar theme={theme} toggleTheme={toggleTheme} />
      <div className="ml-[240px] min-h-screen overflow-y-auto relative z-10">
        <Outlet />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Sidebar adaptation.** Copy `design/.../components/Sidebar.tsx` → `src/components/Sidebar.tsx`, then:
  1. Props become `{ theme, toggleTheme }`; replace `current`/`navigate` with `useLocation()` + `NavLink`-style buttons using `useNavigate()`.
  2. `PRIMARY` = Home `/`, Documentation `/docs/intro/UBS_Framework_Features`, Dev Tools `/tools`, About `/about` (real paths from the old Root.js). Active test: exact `/` match for Home; `pathname.startsWith('/docs')` for Documentation; `/tools` prefix for Dev Tools; `/about` for About.
  3. `TOOLS` items keep design icons/labels but real routes: Database `/tools/database`, ERD Mapper `/tools/database/mapper`, Lucid Sanitize `/tools/lucid`, Notify `/tools/notify`, API Object Builder `/tools/apiObject`, Projects `/tools/projects`, GitHub `/tools/github`, Meetings `/tools/meetingWorkflow`, Repositories `/tools/repos`, My Projects `/tools/myProjects`, Tenant Admin `/tools/tenantAdmin`. Show this group only when `pathname.startsWith('/tools')`; when `pathname.startsWith('/docs')` show instead a "Docs" group with the old DOC_NAV_ITEMS (Framework Intro `/docs/intro/Node-Advantages`, Backend `/docs/backend/UBS-intro`, Frontend `/docs/frontend/UBS-intro`, Database `/docs/database/Lucidchart`, Agents `/docs/agents/agent-issue-format`, Projects `/docs/projects/badar-hms/Opera_Config`), same styling as the Tools group.
  4. DELETE the "States" demo group entirely.
  5. The org-switcher button placeholder stays visual for now; Task 6 replaces it with the real `<OrgSwitcher/>`.

- [ ] **Step 7: Verify + commit** — `npm run dev`: shader background renders, sidebar navigates between placeholder routes, theme pill toggles `data-theme` and persists across reload. `npm run build` green. Commit: `feat: app shell, theme, router skeleton with design sidebar`

---

### Task 6: Auth — SignIn screen, gates, guard states, OAuth callback

**Files:**
- Create: `src/screens/SignIn.tsx` (from design), `src/components/guards/AccessState.tsx` (extracted from design `TenantAdmin.tsx`), `src/components/guards/SiteGate.tsx`, `src/components/guards/ToolGuard.tsx`
- Create: `src/screens/GithubCallback.jsx` (copy of `src/pages/tools/github/callback.jsx`)
- Modify: `src/app/routes.tsx`, `src/components/Sidebar.tsx` (real OrgSwitcher)

**Interfaces:**
- Consumes: `useAuth()` → `{ user, setUser, signOut, loading }`; `usePortalAccess()` → `{ allowed, loading }`; `GoogleSignIn` (default export, no props); `OrgSwitcher` (no props); `fetchUserUrdds`/`clearOrg` from `src/state/orgSlice.js`.
- Produces: `SiteGate({ children })` — auth loading → `AccessState kind="loading"`, signed-out → `SignIn`, else children + org thunk dispatch; `ToolGuard({ children })` — portal-access three-state for `/tools/*` pages; `AccessState({ kind: 'loading'|'restricted'|'pending', email?, onSignOut? })` design screens. Later screen tasks REMOVE the per-page guard blocks from ported pages (guards now live at route level).

- [ ] **Step 1: SignIn screen.** Copy design `SignIn.tsx` → `src/screens/SignIn.tsx`. Replace the fake Google button's `onClick={() => navigate('tools')}` with the real `<GoogleSignIn />` component (`import GoogleSignIn from '../components/portal/GoogleSignIn'`) rendered in the button slot — keep the design card around it; delete the design's inline `GoogleSVG` button if `GoogleSignIn` renders its own labeled button (restyle `GoogleSignIn`'s button via a `.portal-google-btn` override in portal-compat.css to match the design's pill: white bg, slate text, full width, rounded-full). Keep helper box text but update copy: access is `@granjur.com` **or a provisioned organization account** (matches `usePortalAccess` rule).

- [ ] **Step 2: AccessState.** Extract design `TenantAdmin.tsx`'s `AccessStateScreen` (the 380px centered card with spinner/padlock/clock variants) into `src/components/guards/AccessState.tsx` with props `{ kind: 'loading' | 'restricted' | 'pending'; email?: string; onSignOut?: () => void }`, mapping: loading → spinner + "Loading…", restricted → red padlock + "Access Restricted" + email + "Sign out →" button calling `onSignOut`, pending → amber clock + "Access Pending" + email. Theme via `useTheme()`.

- [ ] **Step 3: SiteGate** — `src/components/guards/SiteGate.tsx`:

```tsx
import { useEffect, type ReactNode } from 'react'
import { useDispatch } from 'react-redux'
import { useAuth } from '../portal/authStore'
import { fetchUserUrdds, clearOrg } from '../../state/orgSlice'
import SignIn from '../../screens/SignIn'
import AccessState from './AccessState'

export default function SiteGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const dispatch = useDispatch()
  useEffect(() => {
    if (user?.email) dispatch(fetchUserUrdds(user.email) as never)
    else dispatch(clearOrg())
  }, [user?.email, dispatch])
  if (loading) return <AccessState kind="loading" />
  if (!user) return <SignIn />
  return <>{children}</>
}
```

Check `orgSlice.js` export names before writing (survey says `fetchUserUrdds`, `clearOrg` — confirm).

- [ ] **Step 4: ToolGuard**:

```tsx
import type { ReactNode } from 'react'
import { useAuth } from '../portal/authStore'
import { usePortalAccess } from '../portal/usePortalAccess'
import AccessState from './AccessState'

export default function ToolGuard({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const { allowed, loading } = usePortalAccess()
  if (loading) return <AccessState kind="loading" />
  if (!allowed) return <AccessState kind="restricted" email={user?.email} onSignOut={signOut} />
  return <>{children}</>
}
```

- [ ] **Step 5: Wire routes.** In `routes.tsx`: wrap the `<AppLayout/>` layout route in `<SiteGate>` (`<Route element={<SiteGate><AppLayout /></SiteGate>}>`); wrap every `/tools/*` element except the callback in `<ToolGuard>` (a helper `const T = (el: ReactNode) => <ToolGuard>{el}</ToolGuard>` keeps it readable). Mount the callback: copy `src/pages/tools/github/callback.jsx` → `src/screens/GithubCallback.jsx` **without modification** (its `tenantApi` import path adjusts to `../components/portal/tenantProjects/tenantApi` — the ONLY edit) and set it as the callback route element. It stays outside SiteGate/AppLayout exactly as the old Root.js bypass did; its two `--ifm-color-emphasis-*` inline-style vars now resolve from tokens.css.

- [ ] **Step 6: Real OrgSwitcher in sidebar.** In `src/components/Sidebar.tsx`, replace the static "granjur.com" button with `<OrgSwitcher />` (`import OrgSwitcher from './portal/tenantProjects/OrgSwitcher'`). Restyle its classes in portal-compat.css (`Org Switcher` section, original line ~6918) to the design pill: indigo-tinted bg, rounded-xl, 12px semibold — match the mock's switcher exactly.

- [ ] **Step 7: Verify + commit** — dev server: signed out → design SignIn over shader; sign in with Google → shell appears; visit `/tools/database` placeholder as non-provisioned non-granjur account → Access Restricted screen; `/tools/github/callback?error=x` renders standalone with no sidebar and no sign-in requirement. Build green. Commit: `feat: auth gates with design state screens and OAuth callback route`

---

### Task 7: Tools Hub, Home, About screens

**Files:**
- Create: `src/screens/ToolsHub.tsx`, `src/screens/Home.tsx`, `src/screens/About.tsx` (first two from design; About themed-new)
- Modify: `src/app/routes.tsx` (swap placeholders)

**Interfaces:**
- Consumes: `useAuth()`, `useTheme()`, `useNavigate`, `lib.tsx` helpers, old `src/pages/about.jsx` content (links), old `src/pages/index.js` copy (headline text if desired — design copy wins).

- [ ] **Step 1: ToolsHub.** Copy design `ToolsHub.tsx`. Replace `navigate(screen)` with `useNavigate()` to real routes (same mapping as Sidebar TOOLS). Replace "Welcome, Sarah 👋" with `Welcome, {user.name?.split(' ')[0] || user.email} 👋` from `useAuth()`; wire the Sign out button to `signOut`. Keep all 11 cards (Tenant Admin card stays for all users — access enforced inside, as today).
- [ ] **Step 2: Home.** Copy design `Home.tsx`; wire "Explore Documentation" CTA → `/docs/backend/UBS-intro`, "Open Dev Tools" → `/tools`; the `DOCS` list items link to the six DOC_NAV_ITEMS paths (Task 5 list) plus `/docs/intro/UBS_Framework_Features`. Keep story cards as-is.
- [ ] **Step 3: About.** New file using design tokens: `Breadcrumb` + a single `card(theme)` panel with the three external links from old `about.jsx` (Instagram, LinkedIn, GitHub — copy exact URLs from the old file) styled as `btn-outline-indigo` pills.
- [ ] **Step 4: Swap routes, verify, commit** — all three render in both themes; ToolsHub greets the real user. Commit: `feat: tools hub, home, and about screens in design language`

---

### Task 8: Notify + Lucid Sanitize

**Files:**
- Create: `src/screens/Notify.tsx` (from design, both variants)
- Modify: `src/app/routes.tsx`; reference (unchanged logic): `src/components/portal/BugReport.jsx`, `src/components/portal/LucidSanitize.jsx`

**Interfaces:**
- Consumes: `BugReport` and `LucidSanitize` internals — read both files first; the design card REPLACES their markup but reuses their submit/sanitize handlers.

- [ ] **Step 1:** Copy design `Notify.tsx` → `src/screens/Notify.tsx` keeping the `screen: 'notify' | 'lucid-sanitize'` prop dispatch.
- [ ] **Step 2:** Read `BugReport.jsx`; move its real submit logic (endpoint, payload incl. user email) into `NotifyCard` replacing the mock's fake success `setTimeout`. Preserve its error state rendering (`tenant-error` class or design red text). Same for `LucidSanitize.jsx` → `LucidCard`: real file parsing/sanitize/download replaces the fake 2200ms spinner; keep the design's `idle/processing/done` visuals driven by the real async states.
- [ ] **Step 3:** Routes: `/tools/notify` → `<Notify screen="notify"/>`, `/tools/lucid` → `<Notify screen="lucid-sanitize"/>`. Verify a real bug report POST fires (network tab) and a Lucid file round-trips. Commit: `feat: notify and lucid screens wired to real flows`

---

### Task 9: API Object Builder

**Files:**
- Create: `src/screens/APIBuilder.tsx` (from design)
- Reference: `src/pages/tools/apiObject.jsx` (537 lines — the real generator)
- Modify: `src/app/routes.tsx`

**Interfaces:**
- Consumes: old `apiObject.jsx` — its form state shape, pre/post-process function-name parser, and the emitted `global.<Name>_object` template are the source of truth for OUTPUT correctness; the design supplies layout only.

- [ ] **Step 1:** Read old `apiObject.jsx` fully; list its form fields vs the design's Section cards. The design's config shape (url/method/name/permission/pagination/multistep/parameters/auth/encryption/otp/preProcess/postProcess) largely matches; any real field the design lacks gets a design-style `Section` card following the same pattern.
- [ ] **Step 2:** Copy design `APIBuilder.tsx`; replace its `code` template string with the old page's real generator function(s) (copy them verbatim into the new file or a `src/utils/apiObjectTemplate.js` module) so emitted JS is byte-identical to today's output for identical inputs.
- [ ] **Step 3:** Manual check: fill the form identically on old (git stash / old branch) and new, diff outputs — must match. Keep Copy-to-clipboard. Route swap, build, commit: `feat: API object builder in design Configure/Output layout`

---

### Task 10: Database upload + ERD Mapper

**Files:**
- Create: `src/screens/DatabaseTools.tsx` (from design)
- Modify: `src/app/routes.tsx`; reference: `src/components/portal/FileUpload.jsx`, `src/components/portal/SQLERDVisualizer.jsx` (496), `src/components/portal/ErdDiagram.jsx` (589), `src/utils/sqlParser.js`

**Interfaces:**
- Consumes: `parseSqlDump()` output `{ tables, columns, PKs, FKs }`; existing `SQLERDVisualizer` (mapper merge + migration SQL flows).
- Produces: `/tools/database` = design upload view wired to `FileUpload`'s real upload/generate flow; `/tools/database/mapper` = design ERD blueprint canvas fed by REAL parsed tables + the existing mapper form panel.

- [ ] **Step 1:** Copy design `DatabaseTools.tsx`; split its two views into route-driven components: upload view at `/tools/database`, ERD view at `/tools/database/mapper` (the mock's internal `view` state becomes navigation between the two routes; keep the "ERD Mapper" launch card linking to the mapper route).
- [ ] **Step 2:** Upload view: replace the mock dropzone's fake `uploaded` toggle with `FileUpload.jsx`'s real handlers (read the file: it uploads SQL and triggers resource generation). Real success line shows actual `parseSqlDump` counts: `{tables.length} tables · {totalColumns} columns · {FKs.length} relationships`.
- [ ] **Step 3:** ERD view: keep the design's blueprint canvas (drag nodes, zoom toolbar, SVG bezier relations) but generate `TableNode[]` from `parseSqlDump()` of the uploaded/pasted schema instead of the 5 hardcoded tables: initial layout = grid placement (x = 40 + (i % 4) * 260, y = 40 + Math.floor(i / 4) * 220), `cols` from parsed columns with `pk`/`fk` flags, `RELATIONS` from FKs. Mount the existing `SQLERDVisualizer` mapper form (schema paste, mapping config, merged SQL output, migration SQL) in a design `card()` panel below/beside the canvas — its logic untouched, chrome via portal-compat.
- [ ] **Step 4:** Verify with `public/sql/base_db.sql` pasted: canvas renders real tables; mapper merge still produces URDD-rewritten SQL identical to the old page for the same input. Commit: `feat: database tools with live ERD canvas from real schema parsing`

---

### Task 11: Projects, My Projects (+ views)

**Files:**
- Create: `src/screens/Projects.tsx` (from design — `ProjectsGrid` and `MyProjectsView` variants used; `RepositoriesView` variant NOT used here, see Task 12)
- Modify: `src/app/routes.tsx`; reference: `src/data/projectsConfig.js`, `src/pages/tools/projects/{index,view}.jsx`, `src/pages/tools/myProjects{,.jsx,/view.jsx}`, `src/components/portal/tenantProjects/{MyProjects,ProjectDetail}.jsx`

**Interfaces:**
- Consumes: static `projects[]` + `getProjectComponent(slug)`; `listMyProjects` via `MyProjects.jsx`; `ProjectDetail` (reads `?project=` itself).
- Produces: 4 routes swapped. `getProjectComponent` converted to `React.lazy` imports (the two custom views total 1350+ lines — code-split them).

- [ ] **Step 1:** `/tools/projects`: design `ProjectsGrid` fed from `projectsConfig.projects[]` (name/desc/tags mapped; `Documentation` button → `project.docPath`, `Open ↗` → `/tools/projects/view?project=<slug>` when `hasCustomView`).
- [ ] **Step 2:** `/tools/projects/view`: keep old `projects/view.jsx` logic (it already uses `react-router-dom` `useLocation`) inside a design breadcrumb + panel; change `projectsConfig.js` to `const BadarHMSView = lazy(() => import('../components/projects/BadarHMSView'))` style with `<Suspense fallback={<AccessState kind="loading"/>}>` at the render site.
- [ ] **Step 3:** `/tools/myProjects`: design `MyProjectsView` card layout, but cards fed by the real `MyProjects.jsx` fetch (`listMyProjects`) — read that file, lift its data fetch into the screen or render it directly with compat styling; org label from `useActingUrdd().activeOrg` as the old page's hero did. `/tools/myProjects/view`: `ProjectDetail` in a design panel.
- [ ] **Step 4:** Verify all four against backend, build, commit: `feat: projects and my-projects screens`

---

### Task 12: Repositories page

**Files:**
- Create: `src/screens/Repositories.tsx`
- Modify: `src/app/routes.tsx`; reference: `src/pages/tools/repos.jsx` (797 lines, ~16 internal components)

**Interfaces:**
- Consumes: the entirety of `repos.jsx`'s `ReposManager`/`ReposContent` (tracked-repo CRUD + features tabs against `/api/tracked/repos`).

- [ ] **Step 1:** Copy `repos.jsx` → `src/screens/Repositories.tsx` minus the `Layout`/auth-guard wrapper (guards are route-level now): keep `ReposManager` and everything below it, delete the old guard states and `@theme/Layout` import, export a screen component rendering design breadcrumb + header (title "Repositories", design `RepositoriesView` header style incl. "Pull all repos" placement) + `<ReposContent/>`.
- [ ] **Step 2:** Restyle chrome via portal-compat sections `Repo row` / `Features panel` / `Sliding tabs` (already re-tinted in Task 4); adopt the design's segmented sub-tab pills for the existing two-tab `SlidingTabs` by updating those CSS classes to match the mock's `Repositories | Features` segmented control (rounded-full container, indigo active pill).
- [ ] **Step 3:** Verify add/remove/pull repo + features tab against backend. Commit: `feat: repositories screen in design chrome`

---

### Task 13: GitHub workspace + read-only PRs tab + sandbox

**Files:**
- Create: `src/screens/GitHub.tsx` (from design), `src/components/portal/githubPrs.js` (new fetch helper)
- Modify: `src/app/routes.tsx`; reference: `src/components/portal/GithubWorkflow.jsx` (1171), `GithubWorkflowSandbox.jsx`, old `src/pages/tools/github{,-sandbox}.jsx`

**Interfaces:**
- Consumes: `GithubWorkflow({user})` — repo selector, issue creator, issue status panel + bot lights, file explorer, notification bell/polling.
- Produces: `listPullRequests(owner, repo, state)` in `githubPrs.js`:

```js
// Same auth pattern as GithubWorkflow: PAT from the injected global.
export async function listPullRequests(owner, repo, state = 'open') {
  const token = typeof window !== 'undefined' ? window.__GIT_PAT__ : null;
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}&per_page=50`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.json())?.message || 'request failed'}`);
  return (await res.json()).map((pr) => ({
    number: pr.number, title: pr.title, branch: pr.head?.ref,
    state: pr.state, draft: pr.draft, user: pr.user?.login,
    url: pr.html_url, updatedAt: pr.updated_at,
  }));
}
```

- [ ] **Step 1:** Read `GithubWorkflow.jsx` top-to-bottom; map its panels onto the design's tab shell: Repositories tab = its repo selector grid; Issues tab = issue status panel + accordion threads; New Issue tab = its issue form (incl. Advanced/context chips — design has this); file Explorer sidebar = its tree explorer; bell = its notification system. The component stays ONE unit: mount `<GithubWorkflow user={user}/>` inside the design screen and restructure only its top-level tab chrome — concretely, add a `tab` prop (`'repos'|'issues'|'prs'|'newissue'`) it uses to show/hide its existing panels, defaulting to current behavior if absent. Do not rewrite its internals.
- [ ] **Step 2:** PRs tab: new panel in `src/screens/GitHub.tsx` using the design's PR card layout (title, branch chip, files churn list omitted — API list gives number/title/branch/author/date) with the design's Open|Closed|All segmented filter driving `listPullRequests(owner, repo, state)` for the currently selected repo; loading spinner + error text states. "Ping to merge" modal is NOT built (out of scope) — the mock's button is omitted; each card links to `pr.url`.
- [ ] **Step 3:** Restyle `GithubWorkflow`'s chrome via the two GitHub sections of portal-compat (original lines 1439–3800): update tab bar, workspace header, and explorer classes to the design's glass/indigo look. Deeper widgets (blink lights, comment threads) keep existing classes — already re-tinted.
- [ ] **Step 4:** Sandbox: `/tools/github-sandbox` route mounts old `github-sandbox.jsx` body (`<GithubWorkflowSandbox user={SANDBOX_USER}/>` with its hardcoded `SANDBOX_USER`) behind ToolGuard, no sidebar entry, no hub card — URL-only as agreed.
- [ ] **Step 5:** Verify against backend + real GitHub: repo list loads, issue creation posts (check `[Agent Call]` format preserved), notifications poll, PRs tab lists real PRs, explorer browses the tree. Commit: `feat: github workspace with design shell and read-only PRs tab`

---

### Task 14: Meetings suite

**Files:**
- Create: `src/screens/Meetings.tsx`, `src/screens/MeetingCreate.tsx`, `src/screens/MeetingDetail.tsx` (design chrome around real components)
- Modify: `src/app/routes.tsx` (add `/tools/meetingWorkflow/create` and `/tools/meetingWorkflow/:meetingId`); reference: `src/pages/tools/meetingWorkflow.jsx`, `src/components/meetingWorkflow/*`

**Interfaces:**
- Consumes: `MeetingList({actingUrdd, onSelectMeeting, selectedId, onCreateClick, canCreate})`; `CreateMeeting({actingUrdd, onCreated, onCancel, userEmail, canCreate})`; `WorkflowPanel` (read its props from the file — old page passes the selected meeting + acting URDD); `useActingUrdd()`, `useActingPermissions()`, `PendingAccess({email})`.
- Produces: URL-driven flow replacing the old page's `view` local state: list at `/tools/meetingWorkflow`, create at `/tools/meetingWorkflow/create`, meeting at `/tools/meetingWorkflow/:meetingId` (stage stays WorkflowPanel-internal — stages are data-dependent, not routes). Old single URL still lands on the list — bookmarks survive.

- [ ] **Step 1:** Read old `meetingWorkflow.jsx` + `WorkflowPanel.jsx` header regions to extract exact props and the tenant-gate sequence (`idStatus === 'pending'` → `PendingAccess` etc.). Reproduce that gate at the top of each of the three screens via a tiny shared `useMeetingGate()` hook in `src/screens/meetingGate.ts` returning `{ ready, gateElement, actingUrdd, canCreate, userEmail }` (gateElement = AccessState/PendingAccess when not ready).
- [ ] **Step 2:** `Meetings.tsx`: design list screen (search box, "N meetings" count, New Meeting button honoring `canCreate`) with `MeetingCard`s fed by `MeetingList`'s fetch — lift its `GET /meeting/workflow/list` call (or render `MeetingList` with a card-renderer prop if simpler — prefer lifting: the design card needs `{title, date/time, status, followUp, stage, attendees}` which maps from the real meeting rows' fields; read `MeetingList.jsx`'s `STATUS_LABEL`/`STAGE_LABELS` for exact mappings). Card click → navigate to `/tools/meetingWorkflow/${meeting.id}`.
- [ ] **Step 3:** `MeetingCreate.tsx`: design CreateMeeting layout hosting the REAL `CreateMeeting` component (513 lines — participants picker, repo/feature scope, digital clock already conceptually match the mock). Restyle via portal-compat `Meeting Workflow` section: update card/section classes toward design tokens; `onCreated` → navigate to the new meeting's detail; `onCancel` → back to list.
- [ ] **Step 4:** `MeetingDetail.tsx`: fetch meeting by id (`GET /meeting/workflow/meeting` — confirm exact call in WorkflowPanel) then render `WorkflowPanel` with its stage rail restyled to the design's 5-stage nav (`STAGES` labels identical: Pre-Meeting/Transcribe/Analyze/Tasks/Report). Transcribe stage (`LiveTranscribeStage`) gets the design recorder chrome (pulse dot, mono timer, waveform bars CSS) via the `Live Transcription Stage` compat section; Analyze/Tasks get the design's AI-summary card + editable task table styling. Logic untouched.
- [ ] **Step 5:** End-to-end verify against backend: create meeting → premeeting → live transcribe (mic) → analyze → tasks → report; follow-up + notes still work. Commit: `feat: meetings suite on design staged screens`

---

### Task 15: Tenant Admin console

**Files:**
- Create: `src/screens/TenantAdmin.tsx` (from design `AdminConsole`)
- Modify: `src/app/routes.tsx`; reference: `src/pages/tools/tenantAdmin.jsx` (current version — ORG_TABS + SYSTEM_TAB logic), `src/components/portal/tenantProjects/*`

**Interfaces:**
- Consumes: current `tenantAdmin.jsx` logic AS-IS: `ORG_TABS` (org/provision/grant/grantRepos/roles/permissions), `SYSTEM_TAB` gated on `isSuperAdmin = !!activeOrg?.is_super_admin`, the system-tab reset effect, `orgLabel()`; all tab components with their existing props (`OrganizationManager({email,onOrgChanged})`, `ProvisionUser({adminUrdd,actorEmail,onProvisioned})`, `GrantProjects/GrantRepos({adminUrdd})`, `RoleManager/UserPermissions({adminUrdd,actorEmail})`, `SystemPanel({adminUrdd,actorEmail})`); `listMembers(adminUrdd)` for stat cards.

- [ ] **Step 1:** Copy design `TenantAdmin.tsx`'s `AdminConsole` chrome; replace its `TABS` with the real `ORG_TABS`/`SYSTEM_TAB` structure and rendering from current `tenantAdmin.jsx` (keep the reset `useEffect`, `isSuperAdmin` derivation, and per-tab component mounts verbatim). Header: "Organization Admin" + `orgLabel(activeOrg)` + the permission-gated amber pill from the mock; the mock's "Assign Tenant" top-level tab is NOT added (lives in SystemPanel — Global Constraints).
- [ ] **Step 2:** Stat cards fed real: `listMembers(adminUrdd)` → Total members / Active (`is_active`) / Pending (`urdd_id === null` or matching the RoleManager pending rule — read the members row shape first); 4th card shows Tenants count from `listTenants(adminUrdd)` ONLY for super admins, else the active org name card. Loading → design skeleton (pulse-dot).
- [ ] **Step 3:** Restyle tab components' chrome via portal-compat `Tenant-Based Project Access` + `Members list` + `User Permissions` sections toward design tokens (member rows should match the mock's members table: avatar, name, email, role chip, status chip). No component logic edits.
- [ ] **Step 4:** Verify: org admin sees 6 tabs scoped to active org; super admin sees System with AssignTenant/org picker; switching org swaps Roles list; stat cards match member data. Commit: `feat: tenant admin console in design chrome with real role model`

---

### Task 16: Docs — MDX pipeline, sidebar, layout

**Files:**
- Modify: `vite.config.ts` (add MDX plugin)
- Create: `src/docs/remarkAdmonitions.ts` (+ test), `src/docs/remarkDocLinks.ts` (+ test), `src/docs/sidebar.ts` (+ test), `src/docs/docsIndex.ts`, `src/screens/DocsPage.tsx`, `src/components/docs/DocsSidebar.tsx`, `src/styles/docs.css`
- Modify: `docs/tutorial-basics/create-a-page.md` (remove `@docusaurus` import), `src/app/routes.tsx`

**Interfaces:**
- Consumes: `sidebars.js` (629 lines — the structure to port), 175 files under `docs/`.
- Produces: `/docs/:id*` renders any doc; `sidebar.ts` exports `SIDEBAR: SidebarNode[]` (`type SidebarNode = string | { label: string; items: SidebarNode[] }`) and `flattenSidebar(): string[]`; `docsIndex.ts` exports `DOC_MODULES: Record<string, () => Promise<{ default: ComponentType; frontmatter?: Record<string, unknown> }>>` keyed by doc id.

- [ ] **Step 1: MDX in vite.config.ts.** Add imports and plugin (BEFORE react()):

```ts
import mdx from '@mdx-js/rollup'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import remarkDirective from 'remark-directive'
import { remarkAdmonitions } from './src/docs/remarkAdmonitions'
import { remarkDocLinks } from './src/docs/remarkDocLinks'
// in plugins array, first:
{ enforce: 'pre' as const, ...mdx({
  format: 'mdx',                    // parity: Docusaurus 3 parses .md as MDX too
  include: /\.mdx?$/,
  providerImportSource: '@mdx-js/react',
  remarkPlugins: [remarkGfm, remarkFrontmatter, remarkMdxFrontmatter, remarkDirective, remarkAdmonitions, remarkDocLinks],
}) },
```

- [ ] **Step 2: remarkAdmonitions (TDD).** Test first (`src/docs/remarkAdmonitions.test.ts`) using `compile` from `@mdx-js/mdx`:

```ts
import { describe, it, expect } from 'vitest'
import { compile } from '@mdx-js/mdx'
import remarkDirective from 'remark-directive'
import { remarkAdmonitions } from './remarkAdmonitions'

describe('remarkAdmonitions', () => {
  it('maps :::note blocks to admonition divs', async () => {
    const out = String(await compile(':::note\nhello\n:::', {
      remarkPlugins: [remarkDirective, remarkAdmonitions],
    }))
    expect(out).toContain('admonition')
    expect(out).toContain('admonition-note')
  })
})
```

Run → FAIL. Implement:

```ts
import { visit } from 'unist-util-visit'
import type { Root } from 'mdast'

const TYPES = new Set(['note', 'tip', 'info', 'warning', 'caution', 'danger'])

export function remarkAdmonitions() {
  return (tree: Root) => {
    visit(tree, (node: any) => {
      if (node.type !== 'containerDirective' || !TYPES.has(node.name)) return
      const data = node.data || (node.data = {})
      data.hName = 'div'
      data.hProperties = { className: ['admonition', `admonition-${node.name}`] }
      const label = node.children?.find((c: any) => c.data?.directiveLabel)
      const title = label
        ? label.children?.map((c: any) => c.value).join('')
        : node.name.toUpperCase()
      node.children = [
        { type: 'paragraph', data: { hName: 'p', hProperties: { className: ['admonition-title'] } },
          children: [{ type: 'text', value: title }] },
        ...(node.children || []).filter((c: any) => !c.data?.directiveLabel),
      ]
    })
  }
}
```

Run → PASS.

- [ ] **Step 3: remarkDocLinks (TDD).** Docusaurus rewrites relative `./x.md` links; plain MDX does not. Test:

```ts
import { describe, it, expect } from 'vitest'
import { compile } from '@mdx-js/mdx'
import { remarkDocLinks } from './remarkDocLinks'

describe('remarkDocLinks', () => {
  it('rewrites relative .md links to /docs routes', async () => {
    // The vfile's `path` drives resolution — pass value+path as a vfile-compatible object.
    const out = String(await compile(
      { value: '[x](./other-doc.md)', path: '/repo/docs/backend/page.md' },
      { remarkPlugins: [remarkDocLinks] },
    ))
    expect(out).toContain('/docs/backend/other-doc')
  })
  it('leaves absolute and external links alone', async () => {
    const out = String(await compile(
      { value: '[x](https://example.com/a.md) [y](/docs/intro/UBS_Framework_Features)', path: '/repo/docs/backend/page.md' },
      { remarkPlugins: [remarkDocLinks] },
    ))
    expect(out).toContain('https://example.com/a.md')
    expect(out).toContain('/docs/intro/UBS_Framework_Features')
  })
})
```

Implement:

```ts
import { visit } from 'unist-util-visit'
import type { Root } from 'mdast'
import path from 'node:path'

export function remarkDocLinks() {
  return (tree: Root, file: { path?: string }) => {
    const p = (file.path || '').replace(/\\/g, '/')
    const m = p.match(/\/docs\/(.+)\.mdx?$/)
    if (!m) return
    const dir = path.posix.dirname(m[1])
    visit(tree, 'link', (node: { url: string }) => {
      const match = node.url.match(/^(\.{1,2}\/[^#?]*)\.mdx?(#.*)?$/)
      if (!match) return
      const resolved = path.posix.normalize(path.posix.join(dir, match[1]))
      node.url = `/docs/${resolved}${match[2] || ''}`
    })
  }
}
```

Run → PASS.

- [ ] **Step 4: Sidebar port (TDD).** Test (`src/docs/sidebar.test.ts`): `flattenSidebar()` returns an array whose first element is `'init'`, whose last is `'projects/badar-hms/Opera_Config'`-region entry (assert exact last id after porting), length > 120, and contains `'backend/tenancy'` and `'hms-documentation/admin-apis/validation-duplicate'`. Then port: transcribe `sidebars.js`'s `tutorialSidebar` array into `src/docs/sidebar.ts` as `SIDEBAR: SidebarNode[]` (mechanical: `{type:'category', label, items}` → `{label, items}`; doc-id strings stay strings — all 7 top-level categories, all ~133 ids, order preserved), plus:

```ts
export type SidebarNode = string | { label: string; items: SidebarNode[] }
export function flattenSidebar(nodes: SidebarNode[] = SIDEBAR): string[] {
  return nodes.flatMap(n => (typeof n === 'string' ? [n] : flattenSidebar(n.items)))
}
```

Run tests → PASS.

- [ ] **Step 5: docsIndex.ts** — glob loader keyed by id:

```ts
const mods = import.meta.glob([
  '/docs/**/*.md', '/docs/**/*.mdx', '!/docs/superpowers/**',
]) as Record<string, () => Promise<{ default: React.ComponentType; frontmatter?: Record<string, unknown> }>>

export const DOC_MODULES: typeof mods = {}
for (const [file, loader] of Object.entries(mods)) {
  const id = file.replace(/^\/docs\//, '').replace(/\.mdx?$/, '')
  DOC_MODULES[id] = loader
}
```

- [ ] **Step 6: DocsPage + DocsSidebar + docs.css.** `DocsPage` reads `useParams()['*']` as the doc id, `React.lazy`-loads `DOC_MODULES[id]` (unknown id → design 404 card), wraps content in `<article className="docs-prose">` inside a `card(theme)` panel; renders `DocsSidebar` (280px, glass panel, collapsible categories from `SIDEBAR`, active id highlighted indigo, persisted open-state in component state seeded from the active id's ancestor chain) on the left of the article; prev/next footer buttons from `flattenSidebar()` neighbors. `docs.css` — write the prose styles with design tokens (all real CSS, no placeholders):

```css
.docs-prose { font-size: 0.95rem; line-height: 1.75; }
.docs-prose h1 { font-size: 1.9rem; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 1rem; }
.docs-prose h2 { font-size: 1.35rem; font-weight: 700; margin: 2rem 0 0.75rem; }
.docs-prose h3 { font-size: 1.1rem; font-weight: 700; margin: 1.5rem 0 0.5rem; }
.docs-prose p { margin: 0.75rem 0; }
.docs-prose a { color: var(--ifm-color-primary); text-decoration: none; }
.docs-prose a:hover { text-decoration: underline; }
.docs-prose ul, .docs-prose ol { padding-left: 1.4rem; margin: 0.75rem 0; }
.docs-prose li { margin: 0.3rem 0; }
.docs-prose code { font-family: var(--ifm-font-family-monospace); font-size: 0.85em;
  background: var(--ifm-color-emphasis-100); border: 1px solid var(--ifm-color-emphasis-200);
  border-radius: 6px; padding: 0.1em 0.35em; }
.docs-prose pre { background: #030509; color: #A5B4FC; border-radius: 16px;
  padding: 1rem 1.25rem; overflow-x: auto; font-size: 12.5px; line-height: 1.75; }
.docs-prose pre code { background: none; border: none; padding: 0; color: inherit; }
.docs-prose table { border-collapse: collapse; width: 100%; margin: 1rem 0; display: block; overflow-x: auto; }
.docs-prose th, .docs-prose td { border: 1px solid var(--ifm-color-emphasis-200); padding: 0.5rem 0.75rem; text-align: left; }
.docs-prose th { background: var(--ifm-color-emphasis-100); font-weight: 700; }
.docs-prose blockquote { border-left: 3px solid var(--ifm-color-primary); margin: 1rem 0;
  padding: 0.25rem 1rem; color: var(--ifm-color-emphasis-600); }
.docs-prose img { max-width: 100%; border-radius: 12px; }
.admonition { border-radius: 12px; padding: 0.85rem 1rem; margin: 1rem 0; border: 1px solid; }
.admonition-title { font-weight: 800; font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 0.35rem; }
.admonition-note, .admonition-info { border-color: rgba(79,70,229,0.3); background: rgba(79,70,229,0.07); }
.admonition-tip { border-color: rgba(16,185,129,0.35); background: rgba(16,185,129,0.08); }
.admonition-warning, .admonition-caution { border-color: rgba(245,158,11,0.35); background: rgba(245,158,11,0.08); }
.admonition-danger { border-color: rgba(239,68,68,0.35); background: rgba(239,68,68,0.08); }
```

Code highlighting: wrap MDX `pre`/`code` via `MDXProvider components` with a `CodeBlock` using `prism-react-renderer` (`Highlight` with `themes.github`/`themes.dracula` chosen by `useTheme()`), language from `className="language-x"`.

- [ ] **Step 7: Fix `docs/tutorial-basics/create-a-page.md`** — delete the `@docusaurus` import lines (or delete the tutorial-basics/extras folders entirely if they're template leftovers not in `SIDEBAR` — check: they are NOT in sidebars.js, so DELETE `docs/tutorial-basics/` and `docs/tutorial-extras/`).
- [ ] **Step 8: Route + full verify.** `/docs/*` → `<DocsPage/>`. `npm run build` — this compiles all 160+ MDX files; fix any per-file MDX syntax errors surfaced (edit the doc minimally, note each in the commit). Dev check: `/docs/intro/UBS_Framework_Features`, one HMS deep page, one page with admonitions, one with tables/code; sidebar tree complete vs `flattenSidebar()` count; prev/next navigates; direct URL load works. Commit: `feat: docs engine — MDX pipeline, sidebar, themed layout`

---

### Task 17: Cleanup, CLAUDE.md, final verification

**Files:**
- Delete: `docusaurus.config.js`, `sidebars.js`, `plugins/`, `babel.config.js` (if present), `src/theme/`, `src/pages/` (all — every page now has a screen), `src/css/custom.css`, `src/components/HomepageFeatures/`, `src/components/portal/AuthRoot.jsx`, `blog/`, `static/` (after confirming Task 1 moved the kept assets), `build/`, `.docusaurus/`
- Modify: `CLAUDE.md` (rewrite), `README.md` (commands section), `.gitignore` (drop Docusaurus entries, keep `dist`)

**Interfaces:** none — terminal task.

- [ ] **Step 1:** `grep -r "@theme\|@docusaurus\|pages/tools" src/` → must return ONLY the two compat shims and alias config. Fix any stragglers before deleting.
- [ ] **Step 2:** Delete the files listed above. `npm run build` + `npm test` → green.
- [ ] **Step 3:** Rewrite `CLAUDE.md`: commands (`npm run dev|build|preview|test`), env table (`VITE_*` names), architecture (Vite SPA, shell/guards, screens vs ported portal components, docs engine, compat layers — shims + legacy globals + Infima tokens), route table, "adding a new tool screen" recipe (screen in `src/screens/`, route in `routes.tsx`, sidebar entry, hub card), CSS conventions (design.css tokens + lib.tsx helpers; portal-compat.css is legacy-port surface, shrink it over time). Update README quick-start.
- [ ] **Step 4: Full verification sweep** (dev server + backend):
  - Sign-in gate, restricted account, org switching, theme toggle persistence.
  - Every tool screen smoke (checklists from Tasks 7–15).
  - Docs: 5 sampled pages incl. deepest HMS path; direct deep-link reload.
  - `/tools/github/callback?error=x` standalone; popup flow if backend available.
  - `npm run preview` + hard refresh on a deep route (SPA fallback locally).
  - Both themes on: SignIn, ToolsHub, GitHub, Meetings detail, TenantAdmin, a docs page.
- [ ] **Step 5:** Commit: `chore: remove Docusaurus, rewrite project docs for Vite app`

---

## Self-Review Notes

- **Spec coverage:** Architecture/stack → Tasks 1–5; shell+auth → 5–6; every route-map row → 6–16 (callback 6, about/home/hub 7, notify/lucid 8, apiObject 9, database/mapper 10, projects/myProjects 11, repos 12, github+PRs+sandbox 13, meetings 14, tenantAdmin 15, docs 16); styling strategy → 3–4; verification → per-task + 17; out-of-scope respected (no ping-to-merge, no search, blog deleted).
- **Known deviations locked in:** meetings stages stay inside WorkflowPanel under `/tools/meetingWorkflow/:meetingId` (deep-linkable meeting, stage internal) rather than four fully separate routes — preserves the 1015-line panel's flow while adopting the design's stage rail; Assign Tenant under System only.
- **Type consistency:** `AccessState` kinds, `SidebarNode`, `useTheme`, `env`/`installLegacyGlobals`, shim props are each defined once and referenced with the same names across tasks.
- **Deployment:** Vercel (`vercel.json`, Task 1) AND the existing Docker/nginx path (Dockerfile updated same task); env renames flagged for both.
