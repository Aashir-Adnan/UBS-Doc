# PR #12 — Feature/vite design revamp

> **Repo:** `Aashir-Adnan/UBS-Doc`
> **Branch:** `feature/vite-design-revamp` → `main`
> **Status:** OPEN (not yet merged)
> **Author:** Nauraiz Haider (`BSSE23047`)
> **Created:** 2026-08-07
> **Link:** https://github.com/Aashir-Adnan/UBS-Doc/pull/12

---

## Summary

Replaces Docusaurus with a single **Vite + React Router SPA** and rebuilds every portal screen in the Figma design system.

Before this, the product was two stacked layers: a Docusaurus docs site, plus custom pages under `/tools/*` that repeated the auth guard on every page and inherited Infima's styling. It is now **one React tree with a shared shell, one router, and one design language** across docs and tools.

No feature was dropped and no backend contract changed — apart from the `actionPerformerURDD` port described below, which is a deliberate port of an already-reviewed PR.

- **44 commits, 152 files, +18,323 / −24,473** against `origin/main`
- **Docusaurus gone:** `docusaurus.config.js`, `sidebars.js`, `src/theme/Root.js`, and all 18 files under `src/pages/`
- **Deps removed:** `@docusaurus/core`, `@docusaurus/preset-classic`, `@docusaurus/module-type-aliases`, `@docusaurus/types`, `dotenv`
- **Deps added:** `vite`, `@vitejs/plugin-react`, `react-router-dom`, `typescript`, `vitest`, `tailwindcss`, the MDX + remark/rehype pipeline, `lucide-react`, `marked`
- **69 tests across 11 files** — main has no test runner at all

## Architecture

### Bootstrap (`src/app/main.tsx`)
`installLegacyGlobals(env)` runs before any other module import, because several ported components read `window.__*__` at module scope. Redux, auth, theme, and router providers mount after it.

### Two gates, as route wrappers instead of per-page guards

- **`SiteGate`** wraps everything except the OAuth callback — signs in with Google, then dispatches `fetchUserUrdds` and renders `AppLayout`.
- **`ToolGuard`** wraps each `/tools/*` route via the `T()` helper — `@granjur.com` or a provisioned tenant.

`/tools/github/callback` is the one route declared **outside both gates**. It has to render with no Google session and no sidebar, and its origin-checked `postMessage`, `source: 'github-connect'` tag, and `ubs://github/callback` deep link are load-bearing for the **mobile OAuth flow** — preserved verbatim.

### Screens vs ported components
`src/screens/` holds the design-revamped routed views; `src/components/portal/` keeps the feature logic ported as-is from the Docusaurus era (auth store, GitHub workflow, tenancy, SQL/ERD visualizer). Screens **compose** that logic rather than inlining it, so the backend surface is untouched.

### Docs engine
`docs/` content is unchanged on disk. `import.meta.glob` builds a `{ docId: loader }` map; `src/docs/sidebar.ts` is the ported `tutorialSidebar` tree and now the only source of truth; two custom remark/compat plugins reproduce the Docusaurus-only MDX syntax (`:::note` admonitions, bare relative doc links) that plain MDX does not understand natively.

### Three compat layers (deliberate, so ported code needed near-zero edits)

1. **Import shims** aliased in `vite.config.ts` — `@theme/Layout`, `@docusaurus/Link`. Three files still `import Link from '@docusaurus/Link';`; that's intentional — *do not "fix"* it.
2. **`installLegacyGlobals`** — ported components keep reading `window.__API_BASE_URL__` etc. instead of importing `env` directly.
3. **`src/styles/portal-compat.css`** re-declares the `--ifm-*` / `--brand-*` custom properties Infima used to ship, keeping ~110 ported class rules working. This is a shrink-over-time surface.

## Beyond the migration

### Mobile responsiveness
The 240px rail became an off-canvas drawer below `lg` (scrim, close on navigate/Esc/X); padding and headings scale with `clamp()` instead of fixed 40px inline sizes; grids collapse; the docs tree became a collapsible panel above the article. Verified by sweeping every route in-browser at 390px and 768px, measuring `scrollWidth` vs viewport — page-level horizontal overflow is **0** on all of them.

### Performance — the aurora background
It cost **6.7 ms per megapixel per frame** with nothing capping pixel count or frame rate, so frame rate became a function of monitor size: 127 fps at 1366×768 but only 40 fps at 2560×1440. Fixed by:
- **Capping the drawing buffer** at 1.2 MP and letting CSS upscale;
- **Capping to 30 fps**, with `iTime` driven by elapsed time (a 144 Hz monitor was doing 2.4× the work and animating 2.4× too fast);
- **Dropping three.js for raw WebGL2** — the fragment shader is byte-for-byte unchanged.

| | before | after |
|--|--|--|
| Tenant Admin @ 2562px | 30.2 fps | 60 fps |
| same @ 3839px | — | 60 fps |
| App chunk | 988 K raw / 252 K gz | 488 K / 129 K gz |

three.js was half the main bundle — eagerly imported on every route to draw one triangle with no scene graph, camera, or geometry.

### Design components
Border-beam, search-input, aurora-text, TextAnimate, `NumberTicker`, the gradient primary button, the AI generating loader, and a port of `animate-ui`'s user-presence-avatar (now the meeting participant picker and the three tenant-admin user pickers). The presence avatar is data-driven and uses a hand-rolled FLIP on the Web Animations API rather than pulling in `motion` — the rest of the revamp animates with CSS keyframes and rAF.

## Commit history (authoritative, via `gh`)

```
3314ba7  Add Figma design reference and Vite migration revamp spec
d5dfa0f  Add Vite migration + design revamp implementation plan
427e9ec  chore: replace Docusaurus toolchain with Vite scaffold
e432d2f  feat: env module with legacy window global installer
af36e62  feat: design system, shader, and Docusaurus compat shims
aa1e94e  fix: add vite client type reference
a1de1b4  feat: Infima-compat tokens and re-tinted portal stylesheet
7a64c24  feat: app shell, theme, router skeleton with design sidebar
819ca9b  feat: auth gates with design state screens and OAuth callback route
5edec4d  refactor: shared typed auth accessor for TSX screens
c219bc6  feat: tools hub, home, and about screens in design language
5506d4b  fix: add missing Projects docs link to Home
7bb09f8  feat: notify and lucid screens wired to real flows
b1bf1b3  fix: notify/lucid error-state and blob-url cleanup nits
c63ce51  feat: API object builder in design Configure/Output layout
5e1da42  feat: database tools with live ERD canvas from real schema parsing
0285d76  feat: projects and my-projects screens
2ded40d  feat: repositories screen in design chrome
fecfa4b  feat: github workspace with design shell and read-only PRs tab
e031009  fix: keep full PRs panel with ping-to-merge for parity
4c13818  fix: ping modal portal and keep workspace mounted for polling
9c4f943  feat: meetings suite on design staged screens
788beb2  fix: meetings list/detail loading and fallback robustness
e743462  fix: terminate meetings list loading when no acting urdd
4c4610e  feat: tenant admin console in design chrome with real role model
96a477d  fix: tenant admin stats from portal users list + gate hardening
833d181  feat: docs engine — MDX pipeline, sidebar, themed layout
492f125  fix: docs pipeline fence tracking, bare relative links, case fold
47fca36  chore: remove Docusaurus, rewrite project docs for Vite app
8944de6  fix: final review wave — doc anchors, scroll reset, 404, retint, docs…
f6d3a66  Update design reference: border-beam, search-input, aurora-text compo…
621dbb4  feat: replicate border-beam, search-input, and aurora-text from design
c70bb1a  fix: stable lazy doc components so docs navigation completes
8364c51  feat: folder icons for docs tree categories
9477f5a  feat: fancy gradient primary buttons and AI generating loader
00b141b  feat: loader-only generation states and glassier meeting panel
0d7f57b  fix: log runtime-keys failure instead of showing it on the sign-in card
ce9b2af  fix: opaque dropdown surfaces; add text-animate and number-ticker
853d77b  feat: make the whole site mobile responsive
3455f98  feat: presence-avatar user pickers, glass tenant admin, readable selects
5a8c5c7  fix: stop the presence-avatar group bouncing once its row wraps
89662c9  perf: cap the aurora background's cost instead of scaling it with the…
4ee6df1  feat(portal): authorize org/permission admin endpoints by actionPerfo…
03b7f37  chore: drop the Figma design reference folder
```

> Regenerate authoritative list: `gh pr view 12 -R Aashir-Adnan/UBS-Doc --json commits --jq '.commits[] | "\(.oid[0:7])  \(.messageHeadline)"'`