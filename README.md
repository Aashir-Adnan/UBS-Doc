# Website

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator. It serves as both **documentation** and a **dev tools portal** (database tools, Lucid sanitize, bug reports).

## Installation

```bash
npm install
```

## Local Development

```bash
npm start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

## Build

```bash
npm run build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## Portal (Dev Tools)

The **Documentation** section uses the doc sidebar. The **Dev Tools**, **Lucid Sanitize**, and **About Dev** pages are part of the integrated portal and require:

- **Google Sign-in** (Firebase): set `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID` in your environment (or in a `.env` file if you install `dotenv` and load it before the build).
- **API base URL** for tools: set `VITE_API_BASE_URL` (default: `http://localhost:3000`).

Access to Dev Tools and Lucid Sanitize is restricted to `@granjur.com` (and configured) accounts.

## Deployment

Using SSH:

```bash
USE_SSH=true yarn deploy
```

Not using SSH:

```bash
GIT_USER=<Your GitHub username> yarn deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.
