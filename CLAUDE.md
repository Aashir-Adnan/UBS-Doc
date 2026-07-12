# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # install dependencies (Node >= 20)
npm start          # dev server with hot reload
npm run build      # production static build → /build
npm run clear      # clear Docusaurus cache (run before build if stale)
npm run serve      # serve the production build locally
```

No test runner is configured. No linter config is present.

## Environment variables

Loaded at build time in `docusaurus.config.js` (via `dotenv`) and re-read in `plugins/portalPlugin.js`. Copy `.env.example` to `.env`.

| Variable | Purpose |
|---|---|
| `FIREBASE_*` | Firebase fallback credentials for Google Sign-in (overridden by runtime keys when available) |
| `VITE_BASE_URL` / `API_BASE_URL` | Backend base URL (default `http://localhost:3000`) |
| `VITE_SECRET_KEY` / `SECRET_KEY` | Key to encrypt the runtime-keys request to the backend |
| `VITE_PLATFORM_KEY` / `PLATFORM_KEY` | Key to decrypt the runtime-keys response payload |
| `VITE_PLATFORM_NAME` / `PLATFORM_NAME` | Platform identity sent in the runtime-keys request |
| `VITE_PLATFORM_VERSION` / `PLATFORM_VERSION` | Platform version sent in the runtime-keys request |
| `GIT_USERNAME` | GitHub username for API calls |
| `GIT_PERSONAL_ACCESS_TOKEN` | GitHub PAT for GitHub Dev Workflow tool |
| `TILE_OUTLINES` | Set `false` to hide tool-tile outlines (default on) |

`portalPlugin.js` injects these as `window.__FIREBASE_CONFIG__`, `window.__API_BASE_URL__`, `window.__VITE_SECRET_KEY__`, `window.__VITE_PLATFORM_KEY__`, `window.__VITE_PLATFORM_NAME__`, `window.__VITE_PLATFORM_VERSION__`, `window.__GIT_USERNAME__`, `window.__GIT_PAT__`, `window.__TILE_OUTLINES__` — **all are visible in the browser**. Secrets should be scoped minimally until a backend proxy is in place.

## Architecture

### Two distinct layers in one Docusaurus site

**1. Documentation** (`/docs`, `sidebars.js`) — standard MDX docs with a manually-defined sidebar covering Framework, Backend, Frontend, Database, Agents, and Projects.

**2. Dev Tools Portal** (`/tools/*`) — React SPA-style pages restricted to verified accounts, built on Docusaurus's custom pages system.

### Two root-wrapping layers

The app is wrapped twice, both mounting `AuthProvider`:

- **`plugins/portalPlugin.js` → `wrapRootElement` → `AuthRoot`** (`src/components/portal/AuthRoot.jsx`): on mount dispatches `loadRuntimeKeys` (Redux) and initialises Firebase, re-initialising whenever runtime keys arrive.
- **`src/theme/Root.js`** (swizzled Docusaurus Root): renders the custom app shell — left side-nav (primary + contextual Docs/Tools sub-nav), animated theme toggle, route-transition fade, and a one-time "Welcome" overlay. Wraps children in `AuthProvider` + `AuthGate`, which **gates the entire site** behind a Google sign-in.

### Auth model — two gates

1. **Site gate** (`AuthGate` in `Root.js`): any signed-in Google user passes; otherwise a sign-in card blocks the whole site.
2. **Portal gate** (per tool page): every `/tools/*` page repeats the same three-state guard — unauthenticated → wrong account → content — using `isGranjurEmail()` (`src/utils/isGranjurEmail.js`), which allows `@granjur.com` plus a few hardcoded addresses.

Auth state lives in `AuthProvider` (`src/components/portal/authStore.jsx`), holding `{ user, setUser, signOut }`; `GoogleSignIn` sets the user.

### Runtime keys & platform crypto

- **Redux** (`src/state/store.js`, `runtimeKeysSlice.js`): a single `runtimeKeys` slice with a `loadRuntimeKeys` async thunk.
- **`src/services/runtimeKeysClient.js`**: encrypts a request with `VITE_SECRET_KEY`, GETs `/api/runtimekeys?version=1`, decrypts the response payload with `VITE_PLATFORM_KEY`, and returns `return.keys`. These keys (e.g. `FIREBASE_*`) override the build-time fallbacks in `AuthRoot`.
- **`src/utils/platformCrypto.js`**: AES-ECB (PKCS7) encrypt/decrypt of JSON via `crypto-js`; keys are padded/truncated to 32 bytes. This is the wire format for all encrypted backend communication.

### Backend API helpers

Backend responses are consistently unwrapped as `payload.return ?? payload ?? data`:
- `src/components/meetingWorkflow/api.js` — `mwGet/mwPost/mwPostForm/mwDelete`.
- `src/components/portal/config.js` — exports `API_BASE_URL`.

### Tool pages (`src/pages/tools/`)

| Route | Component(s) | Purpose |
|---|---|---|
| `index.jsx` | hub grid | Cards linking to each tool |
| `database.jsx` | `FileUpload` | Upload SQL schema → generate resources |
| `database/mapper.jsx` | `mapperApply`, `mapperConfig`, `sqlParser` | Map project DB onto base DB; merge SQL with `user`→URDD FK rewrites |
| `lucid.jsx` | `LucidSanitize` | Sanitize Lucid chart exports |
| `apiObject.jsx` | (self-contained) | Build a UBS `*_object` API config JS from a form |
| `notify.jsx` | `BugReport` | Send bug reports / feature requests |
| `github.jsx` | `GithubWorkflow` | GitHub Dev Workflow (see below) |
| `meetingWorkflow.jsx` | meeting components | Create meetings, transcribe, AI notes, sync to GitHub |
| `repos.jsx` | tracked repos (backend) | Add/remove/pull agent-tracked repos |
| `projects/index.jsx`, `projects/view.jsx` | `projectsConfig.js` | Project docs + optional custom React views per project |

The **API Object Builder** (`apiObject.jsx`) is fully client-side: it parses pasted pre/post-process function definitions, extracts their names, and emits a `global.<Name>_object = { versions… }` / `module.exports` JS string matching the UBS backend config shape.

### Database / SQL utilities (`src/utils/`)

`sqlParser.js` parses MySQL/MariaDB `CREATE TABLE` dumps into `{ tables, columns, PKs, FKs }`. `mapperApply.js` / `mapperConfig.js` merge a project schema onto a base schema, rewriting `user`/`user_id` references to the `user_roles_designations_department` (URDD) table. `migrationSql.js` supports migration generation.

### GitHub Dev Workflow tool

- **`src/data/githubReposConfig.js`** — `fetchTrackedRepos()` pulls the repo registry from the backend (`/api/tracked/repos/list`) and normalizes GitHub URLs into `{ slug, name, owner, repo, branch }`.
- **`src/components/portal/GithubWorkflow.jsx`** — repo selector, issue creator (formats to the `[Agent Call]` spec in `docs/agents/agent-issue-format.md`), issue status panel with bot-detection blink lights, file explorer (GitHub tree API), and a frontend-only notification system (polls every 60 s, diffs comment counts, notifies when `NotifyEmail:` in an issue body matches the logged-in user). Issues are created directly from the browser via the GitHub REST API with the injected PAT.

### Adding a new tool page

1. Create `src/pages/tools/<name>.jsx` — copy the three-state auth guard from `notify.jsx`.
2. Create the feature component in `src/components/portal/`.
3. Add a card to `src/pages/tools/index.jsx` and a nav entry to `TOOLS_NAV_ITEMS` in `src/theme/Root.js`.
4. Add styles to `src/css/custom.css` under a clearly labelled section comment.

### CSS conventions

All portal/tool styles live in `src/css/custom.css`, organised by section comments (`/* ========== Section ========== */`). Infima CSS variables (`--ifm-*`) are used throughout for light/dark theme support, alongside `ubs-*` classes for the custom app shell. No CSS modules or Tailwind.
