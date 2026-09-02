# UBS Dev Tools Portal — Vite migration + Figma design revamp

**Date:** 2026-08-04
**Status:** Approved by user (pre-implementation)
**Design reference:** `design/UBS Dev Tools Portal (1)/` (Figma Make export — the visual source of truth)

## Goal

Replace the Docusaurus site with a single Vite + React app that replicates the Figma
design exactly, while preserving every currently working feature (portal tools, auth,
tenant admin, docs). Where the design has no screen for an existing feature, build it
from the design's own tokens and components.

## Decisions (user-confirmed)

1. **Full Vite migration** — Docusaurus is removed entirely; docs render inside the
   same Vite app via MDX.
2. **Replace at repo root** — the Vite project takes over the root on a feature
   branch; Docusaurus files are deleted as replacements land (history keeps them).
3. **Mixed TS/JS** — new shell/screens in TSX (as the design ships), existing feature
   components/utils stay `.jsx`/`.js` with `allowJs`; restyled, not rewritten.
4. **Vercel hosting** — ship `vercel.json` with an SPA rewrite so deep links work,
   including `/tools/github/callback` (required by the mobile OAuth flow).
5. **GitHub PRs tab** — implement as a real read-only PR list (GitHub REST, existing
   PAT). "Ping to merge" is out of scope.
6. **`/tools/github-sandbox`** — kept as a hidden route (minimal restyle, URL-only).
7. **No docs search** — parity with today (none configured). Can be added later.

## Stack

- Vite 8, React 19, TypeScript 5.7 (`allowJs: true`), Tailwind CSS v4
  (`@tailwindcss/vite`), `lucide-react`, `three` (aurora shader).
- `react-router` for real URLs (the mock's in-memory `Screen` state is replaced by
  routes; screens are otherwise ported as-is).
- Redux Toolkit retained (`runtimeKeys`, `org` slices), Firebase auth retained,
  `crypto-js` retained.
- MDX: `@mdx-js/rollup`, `remark-gfm`, `remark-frontmatter`, `remark-directive` (+
  a small directive→component mapping for `:::note/tip/warning/info/caution`
  admonitions — ~44 occurrences in 10+ files), `prism-react-renderer` for code blocks.

## Architecture

### App shell (exact design)

- **AnoAI aurora shader** fixed behind everything; opacity 0.9 dark / 0.18 light with
  the design's tint overlays. Honors the design exactly.
- **Sidebar (240px fixed):** UBS brand block; **real OrgSwitcher** wired into the
  mock's "granjur.com" switcher slot; primary nav Home / Documentation / Dev Tools /
  About; Tools sub-nav (Database, ERD Mapper, Lucid Sanitize, Notify, API Object
  Builder, Projects, GitHub, Meetings, Repositories, My Projects, Tenant Admin);
  Light/Dark pill toggle at the bottom.
- The mock's "States" sidebar group is demo-only and is **dropped from nav**; its
  three screens (Loading / Access Restricted / Access Pending) become the real
  auth-guard states rendered by the route guard.
- **Auth gates preserved:** site gate (SignIn screen, real Google/Firebase) and
  per-tool portal gate (`usePortalAccess` / `isGranjurEmail`) render the design's
  state screens instead of today's cards.

### Services ported unchanged (logic)

`authStore.jsx`, `runtimeKeysClient.js` + `runtimeKeysSlice.js` + store,
`orgSlice.js` + OrgSwitcher logic, `tenantApi.js` and all
`tenantProjects/*` components, `platformCrypto.js`, `isGranjurEmail.js`,
`githubReposConfig.js`, `sqlParser.js` / `mapperApply.js` / `mapperConfig.js` /
`migrationSql.js`, meeting workflow `api.js`.

**Env injection:** `plugins/portalPlugin.js` (`window.__*__` globals) is replaced by
a config module reading `import.meta.env.VITE_*`. `.env.example` updated to the
`VITE_`-prefixed names. Same browser-visibility caveat as today — no secrets become
*more* exposed, and the backend-proxy TODO stands.

### Route map

| Route | Design screen | Functionality |
|---|---|---|
| `/` | Home | hero, docs entry links, story cards |
| (gate) | SignIn | Firebase Google sign-in |
| `/tools` | ToolsHub | tool cards, real user greeting/sign-out |
| `/tools/database` | DatabaseTools (upload view) | SQL schema upload → resource generation |
| `/tools/database/mapper` | DatabaseTools (ERD view) + mapper form | schema merge + URDD FK rewrites; blueprint ERD canvas renders real `sqlParser` output (tables, PK/FK, relations; drag + zoom per mock) |
| `/tools/lucid` | Notify screen, Lucid variant | real sanitize flow |
| `/tools/notify` | Notify screen, Bug variant | real bug report/feature request POST |
| `/tools/apiObject` | APIBuilder | real `*_object` generator behind Configure/Output tabs |
| `/tools/github` | GitHub workspace | tabs: Repositories (real tracked repos) · Issues (creator in `[Agent Call]` format, status panel, bot blink lights, comment threads, notifications) · Pull Requests (**new: read-only list via GitHub REST**) · New Issue; file explorer sidebar (GitHub tree API) |
| `/tools/github/callback` | *(no mock — minimal themed)* | OAuth popup callback; **URL and behavior unchanged** (mobile OAuth depends on it) |
| `/tools/github-sandbox` | *(hidden)* | kept, URL-only, minimal restyle |
| `/tools/meetings` | Meetings list | meeting list, search, stage rail |
| `/tools/meetings/create` | CreateMeeting | real create flow (title, date/time, agenda, participants, repo/feature scope) |
| `/tools/meetings/transcribe` | MeetingTranscribe | real transcription flow, segments, notes |
| `/tools/meetings/analyze` | MeetingAnalyze | AI notes, action items → GitHub sync |
| `/tools/projects` (+ view) | ProjectsGrid | project docs + optional custom React views |
| `/tools/myProjects` (+ view) | MyProjectsView | current my-projects feature |
| `/tools/repos` | RepositoriesView | tracked-repos add/remove/pull (backend) |
| `/tools/tenantAdmin` | TenantAdmin AdminConsole | see below |
| `/about` | *(no mock — themed)* | current about content |
| `/docs/**` | *(no mock — themed)* | all docs, see Docs engine |

The current meeting workflow lives on one page; it is split across the design's four
staged screens **preserving the same API calls and flow order**. The design's 5-stage
rail (Pre-Meeting → Transcribe → Analyze → Tasks → Report) is the navigation spine.

### Tenant Admin

Design shows the AdminConsole layout (stat cards, tab bar, provision form + members
table, permission-gated pill) but implements only the Provision tab. We keep **our
real tab set** in the design's tab-bar style:

- Org-scoped: Organization, Provision, Grant Projects, Grant Repos, Roles, Permissions.
- **System tab only for super admins** (`activeOrg.is_super_admin`), containing the
  cross-org tools incl. Assign Tenant. The mock's visible "Assign Tenant" top-level
  tab is a **deliberate deviation**: per the org-admin/super-admin model it stays
  inside System. Non-super-admins must never see it.
- Stat cards derive from real member/tenant data; the mock's hardcoded numbers are
  replaced.
- All existing `tenantProjects/*` components are restyled with the design system
  (member rows → mock's members-table styling, chips, inputs) without logic changes.

### Docs engine (Docusaurus replacement)

- All 161 `.md`/`.mdx` files under `docs/` compile through MDX in Vite; loaded with
  `import.meta.glob` (lazy — one chunk per page). `docs/superpowers/**` (specs like
  this one) is **excluded from the glob**.
- `sidebars.js` ports to a typed sidebar config module driving a contextual docs
  sidebar rendered in the design language (glass panel, section kickers, indigo
  active states — extrapolated from the mock's Home docs-list card).
- Frontmatter titles/ordering respected; breadcrumbs + prev/next links; heading
  anchors; `prism-react-renderer` code blocks (github/dracula themes as today).
- Admonitions via `remark-directive` mapped to themed components.
- `docs/tutorial-basics/create-a-page.md` imports `@docusaurus/*` — fix or drop that
  file during migration.

### Styling strategy

The design's `index.css` (tokens, `card-dark/light`, `btn-primary`, `chip`,
`input-*`, animations, blueprint grid) plus `lib.tsx` helpers (`c`, `card`, `txt`,
`muted`, `sub`, `chip*`, `inputCls`, `Breadcrumb`, `SectionHeader`, `Checkbox`,
`Toggle`) become the **single design system**. Ported JSX components swap their
`custom.css` classes for these. `custom.css` and the swizzled theme are retired.
Screens with no mock (docs, mapper form, System panel, callback, about) are built
strictly from these tokens — no new visual language.

## Out of scope

- Docs search, versioning, i18n (none exist today).
- "Ping to merge" and any PR write actions.
- Backend changes of any kind.
- The GitHub-org-connect wizard (separate task, superseded earlier — not part of
  this revamp).

## Risks / notes

- **Shader GPU cost:** full-viewport 35-iteration fragment shader every frame. Keep
  the design as-is, but respect `prefers-reduced-motion` by pausing the RAF loop.
- **Docusaurus MDX vs plain MDX:** admonitions handled; any stray incompatibility
  surfaces at build time (MDX compile errors are per-file and fixable).
- **Env var rename:** deploy config on Vercel must be updated to `VITE_*` names at
  cutover.
- The `.figma/` folder inside the design export is Figma Make tooling — reference
  only, never imported.

## Verification

1. `npm run build` green (Vite + full MDX docs compile).
2. Visual pass of every screen in dark **and** light via dev server (Chrome DevTools
   MCP), compared against the design app.
3. Functional smoke against the real backend: sign-in gate, org switching, all
   tenant-admin tabs (incl. System visibility rules), GitHub issue creation +
   notifications, meetings flow end-to-end, database upload/mapper, notify, lucid,
   projects/repos pages.
4. Docs: sidebar completeness vs old `sidebars.js`, spot-check pages with code
   blocks, tables, admonitions; deep-link a docs URL directly (SPA rewrite).
5. `/tools/github/callback` loads standalone and completes the popup/mobile flow.
