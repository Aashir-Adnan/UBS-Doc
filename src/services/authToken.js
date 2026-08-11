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

// Test seam.
export function __resetAuthTokenForTests() {
  accessToken = null;
  hydrated = false;
  expiryListeners.clear();
}
