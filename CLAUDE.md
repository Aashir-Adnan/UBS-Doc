# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install         # install dependencies (Node >= 20)
npm run dev          # Vite dev server with HMR (alias: npm start)
npm run build        # production static build → /dist
npm run preview       # serve the production build locally (dist/)
npm test            # vitest run --passWithNoTests
npx tsc --noEmit      # typecheck (no build output)
```

No linter config is present.

## Environment variables

Read at build/runtime via `import.meta.env` in `src/app/env.ts` (`buildEnv`). Copy `.env.example` to `.env`. Vite only exposes vars prefixed `VITE_` to client code — there is no server-side re-read step (the old `plugins/portalPlugin.js` build-time injection is gone).

| Variable | Purpose |
|---|---|
| `VITE_FIREBASE_*` | Firebase fallback credentials for Google Sign-in (overridden by runtime keys when available) |
| `VITE_BASE_URL` | Backend base URL (default `http://localhost:3000`) |
| `VITE_SECRET_KEY` | Key to encrypt the runtime-keys request to the backend |
| `VITE_PLATFORM_KEY` | Key to decrypt the runtime-keys response payload |
| `VITE_PLATFORM_NAME` | Platform identity sent in the runtime-keys request |
| `VITE_PLATFORM_VERSION` | Platform version sent in the runtime-keys request |
| `VITE_GIT_USERNAME` | GitHub username for API calls |
| `VITE_GIT_PAT` | GitHub PAT for GitHub Dev Workflow tool |
| `VITE_TILE_OUTLINES` | Set `"false"` to hide tool-tile outlines (default on) |

`src/app/env.ts` builds a typed `env` object from `import.meta.env`, then `installLegacyGlobals(env)` (called in `src/app/main.tsx`, before any other module import) mirrors it onto `window.__FIREBASE_CONFIG__`, `window.__API_BASE_URL__`, `window.__VITE_SECRET_KEY__`, `window.__VITE_PLATFORM_KEY__`, `window.__VITE_PLATFORM_NAME__`, `window.__VITE_PLATFORM_VERSION__`, `window.__GIT_USERNAME__`, `window.__GIT_PAT__`, `window.__TILE_OUTLINES__` — the ported components below still read these globals unchanged. **All are visible in the browser.** Secrets should be scoped minimally until a backend proxy is in place. Dockerfile/Vercel build args still use the legacy names (`SECRET_KEY`, `PLATFORM_KEY`, `API_BASE_URL`, …) as fallback aliases for `VITE_*`.

## Architecture

This is a single Vite SPA — the two Docusaurus-era layers (docs site + custom-pages portal) are now one React Router tree with a shared shell. There is no Docusaurus, no static site generation, no build-time plugin injection.

### Bootstrap (`src/app/main.tsx`)

1. `installLegacyGlobals(env)` — must run first; several ported components read `window.__*__` at module scope.
2. Dynamic imports of `store` (Redux), `AuthProvider`, `ThemeProvider`, `App` — deferred until after step 1.
3. Mounts `<ReduxProvider><AuthProvider><ThemeProvider><BrowserRouter><App /></BrowserRouter></ThemeProvider></AuthProvider></ReduxProvider>`.
4. Global stylesheets imported here: `src/styles/design.css`, `tokens.css`, `portal-compat.css`, `docs.css`.

`src/app/App.tsx` dispatches `loadRuntimeKeys` (Redux thunk) on mount and (re-)initialises Firebase from whatever runtime keys are in the store, subscribing to the store so it upgrades once the async fetch resolves — this replaces the old `AuthRoot.jsx` two-effect pattern verbatim.

### Routing and gates (`src/app/routes.tsx`)

Two nested gates, both still present, now expressed as route wrappers instead of full-page repeated guards:

1. **Site gate** (`SiteGate`, `src/components/guards/SiteGate.tsx`): wraps every route except the OAuth callback. Shows `SignIn` screen if no Google user; otherwise dispatches `fetchUserUrdds` and renders children inside `AppLayout` (sidebar + theme shell).
2. **Tool gate** (`ToolGuard`, `src/components/guards/ToolGuard.tsx`): wraps each individual `/tools/*` route via the `T()` helper in `routes.tsx`. Uses `usePortalAccess()` (`src/components/portal/usePortalAccess.js`) to show `AccessState kind="restricted"` unless the account is `@granjur.com` or has been provisioned into a tenant (a URDD with a non-null `tenant_id`).

`/tools/github/callback` is the one route declared **outside** both gates — it must render with no Google session and no sidebar (OAuth popup/redirect target). See `src/screens/GithubCallback.jsx`.

`AccessState` (`src/components/guards/AccessState.tsx`) is the single shared loading/restricted UI used by both gates.

### Screens vs ported portal components

- **`src/screens/`** — the design-revamped, routed top-level views (one per route in `routes.tsx`): `Home`, `About`, `ToolsHub`, `SignIn`, `DatabaseTools`, `Notify` (also serves Lucid Sanitize via `screen="lucid-sanitize"`), `APIBuilder`, `GitHub`, `GithubSandbox`, `Meetings`/`MeetingCreate`/`MeetingDetail`, `Projects`, `MyProjects`, `Repositories`, `TenantAdmin`, `DocsPage`. These own layout, the design shell's visual language (`lib.tsx` helpers, Tailwind utility classes, `card`/`chip*`/`Breadcrumb` primitives), and light/dark theming via `useTheme()`.
- **`src/components/portal/`** and **`src/components/portal/tenantProjects/`** — the underlying feature logic, largely ported as-is from the Docusaurus custom-pages era (auth store, Firebase init, GitHub workflow logic, tenancy/role management, file upload, SQL/ERD visualizer, etc.). Screens compose these; they are not routed directly.
- **`src/components/meetingWorkflow/`**, **`src/components/projects/`** — feature-specific ported components (meeting workflow API/panel pieces, `BadarHMSView`).
- **`src/components/guards/`** — the two gate components plus `AccessState`.
- **`src/components/docs/`**, **`src/components/ui/`** — docs rendering (`CodeBlock`, `DocsSidebar`) and generic UI (e.g. the animated shader background used by `AppLayout`).

### Docs engine (`src/docs/`, `docs/`)

Docs are `.md`/`.mdx` files under `docs/` (unchanged location/content), now compiled by Vite's MDX pipeline (`@mdx-js/rollup` in `vite.config.ts`) instead of Docusaurus.

- **`src/docs/docsIndex.ts`** — `import.meta.glob(['/docs/**/*.md', '/docs/**/*.mdx', '!/docs/superpowers/**'])` builds `DOC_MODULES`, a `{ docId: loader }` map. Every doc under `docs/` is routable by id even if absent from the sidebar tree; `docs/superpowers/` (spec/plan scaffolding, not documentation) is excluded.
- **`src/docs/sidebar.ts`** — `SIDEBAR: SidebarNode[]`, ported verbatim from the old `sidebars.js` `tutorialSidebar` array (this file is now the **only** source of truth — the Docusaurus `sidebars.js` has been deleted). `flattenSidebar()` (used by `routes.tsx` to resolve `/docs` → first doc) walks this tree.
- **`src/docs/remarkAdmonitions.ts`**, **`remarkDocLinks.ts`** — remark plugins registered in `vite.config.ts` that reproduce Docusaurus-specific MDX syntax (`:::note` admonitions, bare relative doc links) that plain MDX doesn't understand natively.
- **`src/screens/DocsPage.tsx`** — resolves the current `/docs/*` path against `DOC_MODULES`, lazy-loads and renders the MDX, and drives `DocsSidebar` + prev/next footer from `SIDEBAR`.

### Compat layers

Three separate mechanisms exist purely so ported Docusaurus-era code needs zero (or near-zero) edits:

1. **Import shims** (`src/compat/Layout.tsx`, `src/compat/Link.tsx`) — aliased in `vite.config.ts` and `tsconfig.json` (`@theme/Layout` → `src/compat/Layout.tsx`, `@docusaurus/Link` → `src/compat/Link.tsx`). `Layout` sets `document.title`/meta description via effects instead of Docusaurus's Head management; `Link` renders an external `<a>` for absolute/`http(s)` URLs and an internal `react-router-dom` `Link` otherwise. `src/components/portal/tenantProjects/MyProjects.jsx`, `ProjectDetail.jsx`, and `src/components/projects/BadarHMSView.jsx` still `import Link from '@docusaurus/Link'` — this is intentional, resolved by the alias; do not "fix" these imports.
2. **Legacy globals** (`installLegacyGlobals`, see Environment variables above) — lets ported components keep reading `window.__API_BASE_URL__` etc. instead of importing `env` directly.
3. **Infima-token CSS** (`src/styles/portal-compat.css`) — re-declares `--ifm-*` and `--brand-*` custom properties that used to ship for free with Docusaurus's bundled Infima framework CSS, so ~110 ported class rules keep working unchanged. This is a shrink-over-time surface: as ported components get their own screen-native styling, remove the rules (and now-unused custom properties) they no longer need.

### Auth, runtime keys & platform crypto (mostly unchanged from the Docusaurus era)

- **`src/components/portal/authStore.jsx`** (`AuthProvider`) — holds `{ user, setUser, signOut, loading }`; `GoogleSignIn` sets the user. `src/components/portal/authTypes.ts` exports a typed `useAuthTyped` wrapper.
- **Redux** (`src/state/store.js`, `runtimeKeysSlice.js`, `orgSlice.js`) — `runtimeKeys` slice (`loadRuntimeKeys` thunk) and `org` slice (`fetchUserUrdds`, tenant/org context, cleared on sign-out by `SiteGate`).
- **`src/services/runtimeKeysClient.js`** — encrypts a request with `VITE_SECRET_KEY`, GETs `/api/runtimekeys?version=1`, decrypts the response with `VITE_PLATFORM_KEY`, returns `return.keys`. These override the build-time Firebase fallbacks.
- **`src/utils/platformCrypto.js`** — AES-ECB (PKCS7) encrypt/decrypt of JSON via `crypto-js`; keys padded/truncated to 32 bytes. Wire format for all encrypted backend communication.
- **`src/components/portal/config.js`** — exports `API_BASE_URL` (reads `window.__API_BASE_URL__` first, then `process.env.VITE_API_BASE_URL`, then localhost fallback).
- **`src/components/meetingWorkflow/api.js`** — `mwGet/mwPost/mwPostForm/mwDelete`. Backend responses are consistently unwrapped as `payload.return ?? payload ?? data` throughout the app.

## Route table

| Route | Screen | Notes |
|---|---|---|
| `/` | `Home` | |
| `/about` | `About` | |
| `/tools` | `ToolsHub` | hub grid, gated |
| `/tools/database` | `DatabaseTools view="upload"` | |
| `/tools/database/mapper` | `DatabaseTools view="mapper"` | ERD mapper |
| `/tools/lucid` | `Notify screen="lucid-sanitize"` | |
| `/tools/notify` | `Notify screen="notify"` | |
| `/tools/apiObject` | `APIBuilder` | |
| `/tools/github` | `GitHub` | |
| `/tools/github-sandbox` | `GithubSandbox` | URL-only: no sidebar entry, no hub card |
| `/tools/github/callback` | `GithubCallback` | **outside** SiteGate/ToolGuard — OAuth target |
| `/tools/meetingWorkflow` | `Meetings` | list |
| `/tools/meetingWorkflow/create` | `MeetingCreate` | |
| `/tools/meetingWorkflow/:meetingId` | `MeetingDetail` | workflow stages are internal state inside `WorkflowPanel`, not sub-routes |
| `/tools/projects` | `Projects view="grid"` | |
| `/tools/projects/view` | `Projects view="detail"` | |
| `/tools/myProjects` | `MyProjects view="grid"` | |
| `/tools/myProjects/view` | `MyProjects view="detail"` | |
| `/tools/repos` | `Repositories` | |
| `/tools/tenantAdmin` | `TenantAdmin` | Assign Tenant lives under System only |
| `/docs` | redirect | → `/docs/<first sidebar doc>` (`flattenSidebar()[0]`) |
| `/docs/*` | `DocsPage` | site-gated only, no `ToolGuard` — any signed-in Google user can read docs |
| `*` | `NotFound` | themed 404 card, matches `AccessState`'s design language |

## Adding a new tool screen

1. Create `src/screens/<Name>.tsx` (or `.jsx` if porting existing JS logic) using `lib.tsx` helpers (`c`, `card`, `txt`, `muted`, `Breadcrumb`, chip/checkbox/toggle primitives) and `useTheme()` for light/dark.
2. If it wraps existing feature logic, keep that logic in `src/components/portal/` (or a new subfolder there) and have the screen compose it — don't inline backend/business logic into the screen file.
3. Add a `<Route path="/tools/<name>" element={T(<Name />)} />` in `src/app/routes.tsx` (use the `T()` helper so it goes through `ToolGuard`).
4. Add a nav entry to the `TOOLS` array in `src/components/Sidebar.tsx`.
5. Add a card to the `TOOLS` array in `src/screens/ToolsHub.tsx`.
6. Add styles: prefer Tailwind utility classes + `src/styles/design.css`/`tokens.css` tokens for new screen chrome; only touch `src/styles/portal-compat.css` if the screen reuses a ported component that still depends on its `--ifm-*`/`--brand-*` rules.

## CSS conventions

- **`src/styles/tokens.css`** — design tokens (colors, spacing scale) for the new shell.
- **`src/styles/design.css`** — the design-revamp shell/utility styles (shared chrome, cards, chips, inputs) consumed via `lib.tsx` helper functions rather than hand-written class strings.
- **`src/styles/docs.css`** — MDX/docs rendering styles.
- **`src/styles/portal-compat.css`** — legacy port surface only. Re-declares `--ifm-*`/`--brand-*` custom properties and the ported `.sql-erd-*` / GitHub-workflow / tenancy-panel class rules that came from the old `custom.css` verbatim, kept working "as-is" so ported components need no edits. **Shrink this file over time**: when a ported component gets rebuilt with the new design system, delete its rules here (and any custom properties that become unused as a result — verify with a repo-wide grep before removing a property).
- Tailwind (`@tailwindcss/vite`) is available for new screen-native styling. No CSS modules.

## Deployment

- **Vercel** (`vercel.json`): `buildCommand: npm run build`, `outputDirectory: dist`, SPA rewrite (`/(.*) → /index.html`) since routing is now client-side only.
- **Docker/nginx** (`Dockerfile`): multi-stage build (`node:20-slim` → `nginx:stable-alpine`), copies `/app/dist` into the nginx image, `try_files $uri $uri/ /index.html` for SPA fallback. Build args accept both `VITE_*` and legacy-named aliases (`SECRET_KEY`, `PLATFORM_KEY`, `PLATFORM_VERSION`, `PLATFORM_NAME`, `API_BASE_URL`) for CI/CD compatibility.
