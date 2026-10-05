# UBS Framework Portal (UBS-Doc)

The **documentation site and developer-tools portal** for the **UBS Framework**, Granjur's configuration-driven, multi-tenant Node.js REST framework. It's one **Vite + React 19 + MDX** single-page app with two jobs:

1. **📚 Documentation** (`/docs/*`): framework internals (API objects, tenancy, roles and permissions, payments, sockets, GitHub workflows), API references, frontend guides, database guides, and full project documentation such as **Badar HMS**. It's written in MDX and compiled by Vite.
2. **🧰 Dev Tools Portal** (`/tools/*`): an internal toolbox for SQL/ERD tooling, the Lucidchart sanitiser, notifications, an API-object builder, the GitHub agent workflow, the AI meeting → tasks workflow, projects and repositories, tenant administration, and a **team workspace** (task board, task hierarchy, time tracking, stats) that stays in sync with the [Granjur Discord Bot](https://github.com/Aashir-Adnan/Granjur-Discord-Bot).

The whole site is behind **Google Sign-in**. Tools also require an `@granjur.com` account or a provisioned tenant.

---

## Table of contents

- [Features](#features)
- [Route map](#route-map)
- [Architecture](#architecture)
  - [Bootstrap](#bootstrap)
  - [Gates](#gates)
  - [Screens vs. ported components](#screens-vs-ported-components)
  - [Docs engine](#docs-engine)
  - [Auth, runtime keys & platform crypto](#auth-runtime-keys--platform-crypto)
  - [Compatibility layers](#compatibility-layers)
- [Documentation content](#documentation-content)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Testing](#testing)
- [Adding a tool screen](#adding-a-tool-screen)
- [Adding documentation](#adding-documentation)
- [Styling conventions](#styling-conventions)
- [Deployment](#deployment)
- [Claude Code sub-agents](#claude-code-sub-agents)
- [Project structure](#project-structure)

---

## Features

| Tool | Route | What it does |
|------|-------|--------------|
| **Database tools** | `/tools/database`, `/tools/database/mapper` | Upload SQL schemas and map them visually as an **ERD** (auto-layout), plus a project-DB → base-DB mapper |
| **Lucid sanitize** | `/tools/lucid` | Cleans Lucidchart-exported schemas so they can be imported |
| **Notify** | `/tools/notify` | Send and inspect notifications |
| **API builder** | `/tools/apiObject` | Generate UBS `global.<Name>_object` API configs |
| **GitHub workflow** | `/tools/github` | File `[Agent Call]` issues to the AI coding agent, follow bot/human stages, review PRs, ping to merge. GitHub OAuth goes through `/tools/github/callback`. |
| **GitHub sandbox** | `/tools/github-sandbox` | The mock-data version ([github-workflow-sandbox](https://github.com/Aashir-Adnan/github-workflow-sandbox) is also a git submodule here) |
| **Meeting workflow** | `/tools/meetingWorkflow[/create\|/:id]` | Create a meeting, add notes and documents, then go through the AI stages (context → notes → review tasks → commit) |
| **Projects / My projects** | `/tools/projects`, `/tools/myProjects` | Project grid and detail pages (e.g. the custom **Badar HMS** view), tenant-scoped "my projects" |
| **Repositories** | `/tools/repos` | Repositories per project and scope |
| **Tenant admin** | `/tools/tenantAdmin` | Tenants, URDD assignments, role and permission management |
| **Team workspace** | `/tools/team/{tasks,board,stats,time}`, `/tools/tasks` | The Discord-bot task system on the web: task list, **kanban board**, task detail with history and subtasks, **dependency graph**, create, edit and **JSON import**, member picker, **clock in/out** and time tab, stats charts (bars, stacked bars, cumulative lines, sparklines), identity-link cards |

---

## Route map

| Route | Screen | Gate |
|-------|--------|------|
| `/` | `Home` | Site |
| `/about` | `About` | Site |
| `/docs` | Redirects to the first sidebar doc | Site |
| `/docs/*` | `DocsPage` | Site (any signed-in Google user) |
| `/tools` | `ToolsHub` | Site + Tool |
| `/tools/database` · `/tools/database/mapper` | `DatabaseTools` (upload / mapper) | Site + Tool |
| `/tools/lucid` · `/tools/notify` | `Notify` (`lucid-sanitize` / `notify`) | Site + Tool |
| `/tools/apiObject` | `APIBuilder` | Site + Tool |
| `/tools/github` | `GitHub` | Site + Tool |
| `/tools/github-sandbox` | `GithubSandbox` (URL only) | Site + Tool |
| `/tools/github/callback` | `GithubCallback` | **None** (OAuth target) |
| `/tools/meetingWorkflow` · `/create` · `/:meetingId` | `Meetings` / `MeetingCreate` / `MeetingDetail` | Site + Tool |
| `/tools/projects` · `/view` | `Projects` (grid / detail) | Site + Tool |
| `/tools/myProjects` · `/view` | `MyProjects` (grid / detail) | Site + Tool |
| `/tools/repos` | `Repositories` | Site + Tool |
| `/tools/tenantAdmin` | `TenantAdmin` | Site + Tool |
| `/tools/team/…` (`tasks`, `tasks/new`, `tasks/import`, `tasks/:taskId`, `board`, `stats`, `time`) | `screens/team/*` | Site + Tool |
| `*` | `NotFound` | — |

---

## Architecture

### Bootstrap

`src/app/main.tsx`:

1. `installLegacyGlobals(env)` runs **first**, copying the typed env onto `window.__API_BASE_URL__`, `window.__FIREBASE_CONFIG__` and friends for the ported code.
2. It then imports the Redux store, `AuthProvider`, `ThemeProvider` and `App` dynamically.
3. It mounts `<ReduxProvider><AuthProvider><ThemeProvider><BrowserRouter><App/>…`.
4. `App.tsx` dispatches `loadRuntimeKeys` and (re)initialises Firebase from the runtime keys once they arrive.

### Gates

1. **`SiteGate`** wraps everything except the OAuth callback. With no Google user it shows `SignIn`. Otherwise it dispatches `fetchUserUrdds` and renders `AppLayout` (sidebar, theme, animated shader background).
2. **`ToolGuard`** wraps every `/tools/*` route (through the `T()` helper). Using `usePortalAccess()`, it allows `@granjur.com` accounts or users with a tenant-scoped URDD. Everyone else sees `AccessState kind="restricted"`.

### Screens vs. ported components

- **`src/screens/`** contains the redesigned, routed views. They use `lib.tsx` helpers (`c`, `card`, `txt`, `muted`, `Breadcrumb`, chips/toggles), Tailwind, and `useTheme()` for light/dark.
- **`src/components/portal/`** (plus `tenantProjects/`, `meetingWorkflow/`, `projects/`) holds the feature logic carried over from the Docusaurus era: auth store, Firebase, GitHub workflow, tenancy/roles, uploads, SQL/ERD. Screens use these components; they aren't routed directly.
- **Pure logic lives in tested `*Logic.ts` modules** (`tasksLogic`, `erdLayout`, `tenantAdminLogic`, `team/*Logic.ts`).

### Docs engine

- MDX is compiled by `@mdx-js/rollup` with `remark-gfm`, `remark-frontmatter`, `remark-mdx-frontmatter`, `remark-directive` and `rehype-slug`, plus two custom plugins: **`remarkAdmonitions`** (`:::note` blocks) and **`remarkDocLinks`** (relative doc links).
- `src/docs/docsIndex.ts` globs `docs/**/*.md(x)` (excluding `docs/superpowers/`) into `DOC_MODULES`, so **every doc is routable by its id**.
- `src/docs/sidebar.ts` (`SIDEBAR`) is the **only** sidebar source. The root `sidebars.js` isn't used, so don't edit it.
- `DocsPage.tsx` lazy-loads the MDX and renders `DocsSidebar` with prev/next navigation.

### Auth, runtime keys & platform crypto

- `authStore.jsx` (`AuthProvider`) holds the Google user.
- `runtimeKeysClient.js` encrypts a request with `VITE_SECRET_KEY`, calls `GET /api/runtimekeys?version=1`, decrypts the response with `VITE_PLATFORM_KEY`, and applies the returned keys (which override the build-time Firebase config).
- `utils/platformCrypto.js` provides **AES-ECB (PKCS7)** JSON encryption with `crypto-js`, with keys padded or cut to 32 bytes. It's the wire format for all encrypted backend calls.
- `services/apiAuth.js`, `authToken.js` and `portalSignIn.js` handle the portal's backend session tokens.
- Backend responses are unwrapped as `payload.return ?? payload ?? data`.

### Compatibility layers

Docusaurus-era code runs unchanged thanks to:

1. **Import shims:** `@theme/Layout` maps to `src/compat/Layout.tsx`, and `@docusaurus/Link` maps to `src/compat/Link.tsx` (aliased in `vite.config.ts` and `tsconfig.json`).
2. **Legacy globals:** `window.__*__`.
3. **Infima token CSS:** `src/styles/portal-compat.css` re-declares the `--ifm-*` and `--brand-*` variables. This file should shrink as screens are rebuilt.

---

## Documentation content

| Section (`docs/`) | Contents |
|-------------------|----------|
| `intro/` | UBS Framework features, why Node.js (MD + PDF) |
| `backend/` | Framework intro, **tenancy**, **roles & permissions**, payments, Socket.io, local Whisper setup, GitHub workflows, FAQs |
| `frontend/` | Frontend intro, UBS frontend conventions, tenant scoping, FAQs |
| `database/` | Project DB → base DB mapper, Lucidchart workflow |
| `api/` | Overview, authentication, guest auth and refresh tokens, guest networking, permissions, plan management, payment gateways and methods, admin code, utilities |
| `agents/` | The `[Agent Call]` issue format, the Claude GitHub-issues agent |
| `hms-documentation/` | **Badar HMS** (~160 pages): admin APIs, guest APIs, major and minor implementations, tenant governance, tenant creation flow, payment gateways, seed-data requirements |
| `projects/badar-hms/` | Project overview pages |
| top level | `init.md`, `meeting-workflow-flow.md`, `ROLE_PERMISSIONS_IMPLEMENTED.md`, `FRONTEND_TENANT_PROJECT_ACCESS.md`, `FRONTEND_REPOS_MEETINGS_TENANCY.md` |

Other material in the repo: `data/project-status.json` (a feature matrix across projects and platforms), `competition/` (UI competition evaluation and setup guides), `public/sql/`, `docs-engine-diagram.md`, `PR-12-vite-design-revamp.md`.

---

## Tech stack

| Concern | Library |
|---------|---------|
| Build | Vite 8, `@vitejs/plugin-react`, TypeScript 5.7 |
| UI | React 19, React Router 7, Tailwind CSS 4, `lucide-react`, `clsx` |
| State | Redux Toolkit (`runtimeKeys`, `org` slices) |
| Docs | MDX 3 (`@mdx-js/rollup`, `@mdx-js/react`), remark/rehype plugins, `prism-react-renderer`, `marked` |
| Auth | Firebase 12 (Google) |
| Crypto | `crypto-js` |
| Tests | Vitest 3 |

Requires **Node.js ≥ 20**.

---

## Getting started

```bash
git clone --recurse-submodules https://github.com/Aashir-Adnan/UBS-Doc.git
cd UBS-Doc
npm install
cp .env.example .env     # fill in the values below
npm run dev              # http://localhost:5173
```

Point `VITE_BASE_URL` at a running UBS backend (e.g. CSAAS) for the tools. The docs work without one.

---

## Environment variables

All variables are read in `src/app/env.ts`. **Every one of them ends up in the browser bundle.**

| Variable | Purpose |
|----------|---------|
| `VITE_FIREBASE_API_KEY`, `…_AUTH_DOMAIN`, `…_PROJECT_ID`, `…_STORAGE_BUCKET`, `…_MESSAGING_SENDER_ID`, `…_APP_ID`, `…_MEASUREMENT_ID` | Fallback Firebase config for Google Sign-in (runtime keys override it) |
| `VITE_BASE_URL` | Backend base URL (default `http://localhost:3000`) |
| `VITE_SECRET_KEY` | Encrypts the runtime-keys request |
| `VITE_PLATFORM_KEY` | Decrypts the runtime-keys response |
| `VITE_PLATFORM_NAME` / `VITE_PLATFORM_VERSION` | Platform identity for encrypted requests |
| `VITE_GIT_USERNAME` / `VITE_GIT_PAT` | GitHub identity for the GitHub workflow tool |
| `VITE_TILE_OUTLINES` | `"false"` hides the tool-tile outlines |

The Docker and Vercel builds also accept the legacy names (`SECRET_KEY`, `PLATFORM_KEY`, `API_BASE_URL`, …).

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` / `npm start` | Vite dev server with HMR |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve `dist/` |
| `npm test` | `vitest run --passWithNoTests` |
| `npx tsc --noEmit` | Type-check |

---

## Testing

Unit tests sit next to the code (`*.test.ts` / `*.test.js`): ERD layout, task logic, tenant admin, doc components, env, and in the team workspace the board, hierarchy, dependency graph, clock, import, member picker, stats, time, payload, preview, identity and redirect logic. Services (`apiAuth`, `authToken`, `portalSignIn`) are tested too.

```bash
npm test
```

---

## Adding a tool screen

1. Create `src/screens/<Name>.tsx` with the `lib.tsx` helpers and `useTheme()`.
2. Put the feature logic in `src/components/portal/<feature>/` and have the screen use it.
3. Add `<Route path="/tools/<name>" element={T(<Name />)} />` to `src/app/routes.tsx`.
4. Add a nav entry to `TOOLS` in `src/components/Sidebar.tsx`.
5. Add a card to `TOOLS` in `src/screens/ToolsHub.tsx`.
6. Style it with Tailwind and the `design.css`/`tokens.css` tokens. Avoid `portal-compat.css`.

## Adding documentation

1. Add `docs/<section>/<page>.md(x)` with front matter (`title`, `sidebar_position`, …).
2. Link it in `src/docs/sidebar.ts` if it should appear in the sidebar. Every doc is reachable at `/docs/<id>` either way.
3. `:::note` / `:::tip` / `:::warning` admonitions and relative doc links work as they did in Docusaurus.

---

## Styling conventions

| File | Role |
|------|------|
| `src/styles/tokens.css` | Design tokens (colour, spacing) |
| `src/styles/design.css` | Shell, cards, chips, inputs (used through `lib.tsx`) |
| `src/styles/docs.css` | MDX rendering |
| `src/styles/portal-compat.css` | **Legacy only.** Remove rules from it as components are rebuilt. |

Tailwind is available for new screens. The project doesn't use CSS modules.

---

## Deployment

- **Vercel** (`vercel.json`): `npm run build` → `dist/`, with an SPA rewrite `/(.*) → /index.html`.
- **Docker** (`Dockerfile`): `node:20-slim` builds, then `nginx:stable-alpine` serves `dist/` with `try_files $uri $uri/ /index.html`.

```bash
docker build -t ubs-doc --build-arg VITE_BASE_URL=https://api.example.com .
docker run -p 8080:80 ubs-doc
```

---

## Claude Code sub-agents

`.claude/agents/` contains **15 UBS-specialised sub-agents** that carry the framework conventions inline: the `*_object` shape, the URDD/RDD/URDP RBAC chain, the `created_by` tenant-isolation rule, and the AES wire format. They are:

**Core:** `ubs-api-builder`, `ubs-tenancy-governance`, `ubs-database-architect`, `ubs-security-crypto`, `ubs-code-reviewer`, `ubs-debugger`, `ubs-qa-expert`, `ubs-portal-frontend`, `ubs-docs-writer`.

**Subsystems:** `ubs-integrations-engineer`, `ubs-payments-billing`, `ubs-realtime-engineer`, `ubs-resource-generator`, `ubs-cron-automation`, `ubs-migration-engineer`.

Copy them to `~/.claude/agents/` to use them in any project. See `.claude/agents/README.md`.

---

## Project structure

```
UBS-Doc/
├── index.html  vite.config.ts  vitest.config.ts  tsconfig.json  vercel.json  Dockerfile
├── docs/                       # MDX documentation (see "Documentation content")
├── data/project-status.json    # Cross-project feature matrix
├── public/sql/                 # Downloadable SQL
├── github-workflow-sandbox/    # git submodule
├── .claude/agents/             # UBS sub-agents
└── src/
    ├── app/                    # main.tsx, App.tsx, AppLayout.tsx, routes.tsx, env.ts, ThemeContext.tsx
    ├── screens/                # Routed views (+ team/ workspace with charts/ and *Logic.ts)
    ├── components/
    │   ├── guards/             # SiteGate, ToolGuard, AccessState
    │   ├── portal/             # Ported feature logic (auth, GitHub, tenancy, ERD, …)
    │   ├── meetingWorkflow/    # Meeting workflow API + panels
    │   ├── projects/           # BadarHMSView
    │   ├── docs/               # CodeBlock, DocsSidebar
    │   └── ui/                 # Shader background, primitives
    ├── docs/                   # docsIndex, sidebar, remark plugins
    ├── services/               # runtimeKeysClient, apiAuth, authToken, portalSignIn
    ├── state/                  # Redux store, runtimeKeys + org slices
    ├── utils/                  # platformCrypto, …
    ├── styles/                 # tokens, design, docs, portal-compat
    ├── compat/                 # @theme/Layout & @docusaurus/Link shims
    └── lib.tsx                 # Design helpers
```

For detailed contributor notes, see [`CLAUDE.md`](CLAUDE.md).
