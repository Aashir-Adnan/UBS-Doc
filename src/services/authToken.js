// The framework access token the backend hands back from
// POST /api/portal/users/signin, and the single place it lives.
//
// Kept at module scope rather than in React state because the API layer
// (src/services/apiAuth.js) has to read it synchronously from inside a fetch
// wrapper, outside any component tree.
//
// Persisted to sessionStorage, not localStorage: this is a bearer credential,
// and sessionStorage is scoped to the tab and dropped when it closes. The cost
// is that a brand-new tab starts without one — AuthProvider handles that by
// re-exchanging the Firebase ID token before it reports the user as signed in,
// so nothing can fire an API call in the gap.
//
// Never log the value.

const STORAGE_KEY = 'ubs-portal-access-token';

let accessToken = null;
let hydrated = false;
const expiryListeners = new Set();
let sessionRenewer = null;
let renewing = null;

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    accessToken = window.sessionStorage.getItem(STORAGE_KEY) || null;
  } catch {
    // Private mode / storage disabled — memory-only is still a working session.
    accessToken = null;
  }
}

export function getAccessToken() {
  hydrate();
  return accessToken;
}

export function setAccessToken(token) {
  hydrate();
  accessToken = token || null;
  try {
    if (accessToken) window.sessionStorage.setItem(STORAGE_KEY, accessToken);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Memory-only fallback, as above.
  }
}

export function clearAccessToken() {
  setAccessToken(null);
}

// Fired when the backend rejects a token we actually presented (401), i.e. the
// session is over. AuthProvider subscribes and drops the user back to sign-in.
export function onSessionExpired(listener) {
  expiryListeners.add(listener);
  return () => expiryListeners.delete(listener);
}

export function notifySessionExpired() {
  clearAccessToken();
  expiryListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // One bad subscriber must not stop the others from tearing down.
    }
  });
}

// The backend's token lives 60 minutes and is only rolled in its last five, so
// a user who is idle at that moment comes back to a 401 although their Google
// session is still good. AuthProvider registers a renewer that trades a fresh
// Google ID token for a new portal token; the API layer calls renewSession()
// on a 401 before treating it as an expired session.
export function setSessionRenewer(renewer) {
  sessionRenewer = typeof renewer === 'function' ? renewer : null;
  return () => {
    if (sessionRenewer === renewer) sessionRenewer = null;
  };
}

// One renewal at a time: every request refused while a renewal is running
// waits for that same renewal. True when it left a token behind.
export function renewSession() {
  if (!sessionRenewer) return Promise.resolve(false);
  if (!renewing) {
    const renewer = sessionRenewer;
    renewing = (async () => {
      try {
        await renewer();
        return Boolean(getAccessToken());
      } catch {
        return false;
      } finally {
        renewing = null;
      }
    })();
  }
  return renewing;
}

// Test seam.
export function __resetAuthTokenForTests() {
  accessToken = null;
  hydrated = false;
  expiryListeners.clear();
  sessionRenewer = null;
  renewing = null;
}
