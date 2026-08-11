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
