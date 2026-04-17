# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # install dependencies
npm start          # dev server with hot reload
npm run build      # production static build → /build
npm run clear      # clear Docusaurus cache (run before build if stale)
npm run serve      # serve the production build locally
```

No test runner is configured. No linter config is present.

## Environment variables

Loaded at build time via `plugins/portalPlugin.js` (uses `dotenv`). Copy `.env.example` to `.env`.

| Variable | Purpose |
|---|---|
| `FIREBASE_*` | Firebase project credentials for Google Sign-in |
| `API_BASE_URL` | Backend base URL (default `http://localhost:3000`) |
| `GIT_USERNAME` | GitHub username for API calls |
| `GIT_PERSONAL_ACCESS_TOKEN` | GitHub PAT for GitHub Dev Workflow tool |

The plugin injects these as `window.__FIREBASE_CONFIG__`, `window.__API_BASE_URL__`, `window.__GIT_USERNAME__`, `window.__GIT_PAT__` — **they are visible in the browser**. The PAT should be scoped minimally until a backend proxy is in place.

## Architecture

### Two distinct layers in one Docusaurus site

**1. Documentation** (`/docs`, `sidebars.js`) — standard MDX docs with a manually-defined sidebar covering Framework, Agents, and Projects.

**2. Dev Tools Portal** (`/tools/*`) — React SPA-style pages restricted to verified accounts, built on top of Docusaurus's custom pages system.

### Auth model

- `plugins/portalPlugin.js` wraps the root element with `AuthRoot`, which initialises Firebase and mounts `AuthProvider`
- `AuthProvider` (`src/components/portal/authStore.jsx`) holds `{ user, setUser, signOut }` in React context
- `GoogleSignIn` sets the user; `isGranjurEmail()` (`src/utils/isGranjurEmail.js`) gates access — checks `@granjur.com` plus hardcoded allowed addresses
- Every tool page repeats the same three-state guard: unauthenticated → wrong account → content

### Adding a new tool page

1. Create `src/pages/tools/<name>.jsx` — copy the auth guard pattern from `notify.jsx`
2. Create the feature component in `src/components/portal/`
3. Add a card to `src/pages/tools/index.jsx` (the hub grid)
4. Add styles to `src/css/custom.css` under a clearly labelled section comment

### GitHub Dev Workflow tool

- **`src/data/githubReposConfig.js`** — registry of repos (slug, name, owner, repo). Add entries here to expose repos in the tool.
- **`src/components/portal/GithubWorkflow.jsx`** — all logic: repo selector, issue creator (formats to `[Agent Call]` spec from `docs/agents/agent-issue-format.md`), issue status panel with bot-detection blink lights, file explorer (GitHub tree API), and frontend-only notification system (polls every 60 s, diffs comment counts, fires notifications when `NotifyEmail:` in the issue body matches the logged-in user).
- Issues are created directly from the browser using the GitHub REST API with the injected PAT.

### CSS conventions

All portal/tool styles live in `src/css/custom.css` organised by section comments (`/* ========== Section ========== */`). Infima CSS variables (`--ifm-*`) are used throughout for light/dark theme support. No CSS modules or Tailwind.

### `portalPlugin.js`

The only custom Docusaurus plugin. Does two things: injects runtime config as `window.*` globals via `injectHtmlTags`, and wraps the root element with `AuthRoot` via `wrapRootElement`.
