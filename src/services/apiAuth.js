import { API_BASE_URL } from '@site/src/components/portal/config';
import { getAccessToken, setAccessToken, notifySessionExpired, renewSession } from './authToken';

// Attaches the access token to every backend call, adopts rolled tokens, and
// reports expiry — implemented as one wrapper around window.fetch rather than
// as a helper each caller opts into.
//
// The reason is coverage: there are 21 fetch call sites across 14 files, and
// most are inline in components ported verbatim from the Docusaurus era
// (GithubWorkflow, FileUpload, LucidSanitize, BugReport, CreateMeeting, several
// screens) on top of the tenantApi/meetingWorkflow helpers. Threading a header
// through all of them would mean editing ported code the revamp deliberately
// leaves alone, and any one missed call site is a silent 401 in production.
// Wrapping fetch makes the guarantee structural instead of a checklist.
//
// Only requests to the API origin are touched. Firebase's own traffic to
// googleapis.com passes straight through.

const AUTH_HEADER = 'accesstoken';
const NEW_TOKEN_HEADER = 'x-new-accesstoken';

// The one endpoint that authenticates with a Firebase ID token in the body
// instead of a token in the header. A 401 here means bad credentials or a
// backend missing FIREBASE_PROJECT_ID / GOOGLE_CLIENT_ID — the caller reports
// that, and it must not be mistaken for an expired session.
const SIGNIN_PATH = '/api/portal/users/signin';

function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input.url === 'string') return input.url; // Request
  return '';
}

function absolute(url) {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

export function installApiAuth(baseUrl = API_BASE_URL) {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return () => {};
  }
  // Idempotent: StrictMode double-invokes effects and Vite HMR re-runs modules,
  // and wrapping a wrapper would double-fire the expiry notification.
  if (window.fetch.__ubsApiAuth) return () => {};

  const original = window.fetch.bind(window);
  const base = absolute(String(baseUrl).replace(/\/$/, ''));

  // The call as sent with `token`: the header added unless the call site set
  // its own (a deliberate header always wins).
  const withToken = (input, init, token) => {
    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    const headers = new Headers(init?.headers ?? (isRequest ? input.headers : undefined));
    if (headers.has(AUTH_HEADER)) return { input, init, added: false };
    headers.set(AUTH_HEADER, token);
    if (isRequest && !init?.headers) return { input: new Request(input, { headers }), init, added: true };
    return { input, init: { ...init, headers }, added: true };
  };

  // Rolled token. Requires the backend to send
  // `Access-Control-Expose-Headers: x-new-accesstoken` — cross-origin JS
  // cannot read the header otherwise, and we simply keep the current token.
  const adoptRolled = (response) => {
    const rolled = response.headers.get(NEW_TOKEN_HEADER);
    if (rolled) setAccessToken(rolled);
  };

  const patched = async (input, init) => {
    const url = absolute(requestUrl(input));
    if (!url.startsWith(base)) return original(input, init);

    const token = getAccessToken();
    if (!token) return original(input, init);

    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    // A Request's body can be read once; keep an unread copy for a repeat.
    // A streamed body cannot be replayed at all, so that call is never repeated.
    const spare = isRequest && !input.bodyUsed ? input.clone() : null;
    const replayable = isRequest ? Boolean(spare) : !(typeof ReadableStream !== 'undefined' && init?.body instanceof ReadableStream);

    const first = withToken(input, init, token);
    let response = await original(first.input, first.init);
    adoptRolled(response);

    // Only an expiry if we actually presented a token. A 401 with no token is
    // an unauthenticated call (runtime keys before sign-in), not a dead session.
    if (response.status !== 401 || url.includes(SIGNIN_PATH)) return response;

    // The token this wrapper added has died: renew it from the Google session and
    // repeat the call once. A token another call already replaced is used as
    // it is. A token the call site set itself is the call site's business.
    if (first.added && replayable) {
      const current = getAccessToken();
      const renewed = current && current !== token ? true : await renewSession();
      const fresh = getAccessToken();
      if (renewed && fresh && fresh !== token) {
        const again = withToken(spare ?? input, init, fresh);
        response = await original(again.input, again.init);
        adoptRolled(response);
        if (response.status !== 401) return response;
      }
    }

    notifySessionExpired();
    return response;
  };

  patched.__ubsApiAuth = true;
  window.fetch = patched;

  return () => {
    if (window.fetch === patched) window.fetch = original;
  };
}
