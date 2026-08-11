import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { loadRuntimeKeys } from '../state/runtimeKeysSlice'
import { store } from '../state/store'
import { initFirebase as initFirebaseUntyped } from '../components/portal/firebase'
import AppRoutes from './routes'

type RuntimeKeys = Record<string, string>

// firebase.js is plain JS with a `overrideConfig = null` default param and no
// JSDoc; with allowJs on / checkJs off, tsc still infers that default's type
// for the exported signature, narrowing the parameter to the literal type
// `null`. An ambient `declare module` override does NOT help here — TS only
// falls back to ambient module declarations when a specifier fails to resolve
// to a real file, and this one resolves fine, so the real (too-narrow)
// inferred signature always wins. Re-typing the imported binding once, here,
// is the least-hacky fix; every call site below is fully typed as a result.
const initFirebase = initFirebaseUntyped as (
  overrideConfig?: RuntimeKeys | null
) => unknown

// Copied verbatim (field-for-field) from src/components/portal/AuthRoot.jsx's
// toFirebaseConfig — AuthRoot is not ported, but this exact runtime-keys →
// Firebase mapping must keep working the same way.
function toFirebaseConfig(runtimeKeys: RuntimeKeys = {}) {
  const fallback =
    (typeof window !== 'undefined' &&
      (window as unknown as { __FIREBASE_CONFIG__?: RuntimeKeys }).__FIREBASE_CONFIG__) ||
    {}
  return {
    apiKey: runtimeKeys.FIREBASE_API_KEY || fallback.apiKey || '',
    authDomain: runtimeKeys.FIREBASE_AUTH_DOMAIN || fallback.authDomain || '',
    projectId: runtimeKeys.FIREBASE_PROJECT_ID || fallback.projectId || '',
    storageBucket: runtimeKeys.FIREBASE_STORAGE_BUCKET || fallback.storageBucket || '',
    messagingSenderId:
      runtimeKeys.FIREBASE_MESSAGING_SENDER_ID || fallback.messagingSenderId || '',
    appId: runtimeKeys.FIREBASE_APP_ID || fallback.appId || '',
    measurementId: runtimeKeys.FIREBASE_MEASUREMENT_ID || fallback.measurementId || '',
  }
}

function getRuntimeKeysState() {
  return (store.getState() as { runtimeKeys: { keys: RuntimeKeys } }).runtimeKeys
}

export default function App() {
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(loadRuntimeKeys() as never)
  }, [dispatch])

  useEffect(() => {
    // Mirrors AuthRoot.jsx's two effects: init immediately from whatever keys
    // are in the store right now (empty on first render — initFirebase falls
    // back to window.__FIREBASE_CONFIG__, set by installLegacyGlobals in
    // main.tsx before this ever runs), then re-init on every store change so
    // the app upgrades once loadRuntimeKeys resolves.
    initFirebase(toFirebaseConfig(getRuntimeKeysState().keys))
    const unsubscribe = store.subscribe(() => {
      initFirebase(toFirebaseConfig(getRuntimeKeysState().keys))
    })
    return unsubscribe
  }, [])

  return <AppRoutes />
}
