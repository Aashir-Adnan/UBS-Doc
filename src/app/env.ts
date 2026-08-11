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
