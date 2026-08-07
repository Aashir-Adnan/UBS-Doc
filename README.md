# UBS Framework Portal

This site is a Vite + React single-page app. It serves as both **documentation** (MDX under `docs/`) and a **dev tools portal** (database tools, Lucid sanitize, GitHub workflow, meetings, tenant admin, and more under `/tools/*`).

## Installation

```bash
npm install
```

## Local Development

```bash
npm run dev
```

Starts the Vite dev server with hot module reload at `http://localhost:5173` (or `npm start`, an alias for the same command).

## Build

```bash
npm run build
```

Generates a production build into the `dist` directory, deployable to any static host with SPA fallback routing (all paths rewrite to `index.html`).

## Preview

```bash
npm run preview
```

Serves the production build from `dist` locally, for a final check before deploying.

## Test

```bash
npm test
```

Runs the Vitest suite (`vitest run --passWithNoTests`). Typecheck separately with `npx tsc --noEmit`.

## Portal (Dev Tools)

The **Documentation** section (`/docs/*`) and the **Dev Tools Portal** (`/tools/*`) both sit behind a site-wide Google Sign-in gate. The Dev Tools Portal additionally restricts access to `@granjur.com` (and a small set of configured) accounts.

Copy `.env.example` to `.env` and set:

- **Firebase** (Google Sign-in): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID`.
- **API base URL** for tools: `VITE_BASE_URL` (default: `http://localhost:3000`).
- See `CLAUDE.md` for the full environment variable table and architecture notes.

## Deployment

Deployable as a static SPA (Vercel — see `vercel.json`) or via the included `Dockerfile` (multi-stage build, served by nginx with SPA fallback).
