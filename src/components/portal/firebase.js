import { initializeApp } from "firebase/app";

let firebaseApp = null;

/** Initialize Firebase on the client when config is available. Call from AuthRoot useEffect. */
export function initFirebase() {
  if (typeof window === 'undefined') return null;
  if (firebaseApp) return firebaseApp;
  const config = window.__FIREBASE_CONFIG__;
  if (!config || !config.apiKey) return null;
  firebaseApp = initializeApp(config);
  return firebaseApp;
}

/** Use after initFirebase() has run (e.g. in AuthRoot useEffect). For getAuth(), use getAuth(initFirebase()) so auth is ready when user clicks sign in. */
export { firebaseApp };