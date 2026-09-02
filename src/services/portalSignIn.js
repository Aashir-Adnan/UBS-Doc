import { API_BASE_URL } from '@site/src/components/portal/config';
import { setAccessToken } from './authToken';

// Trades a Google/Firebase ID token for the framework access token.
//
// This replaces the old fire-and-forget upsert that posted { google_uid, email }
// and ignored failures. The backend now verifies the ID token server-side and
// derives the caller's identity from it, so this call is the session — if it
// fails there is no portal session and the failure has to surface.

export async function exchangeIdTokenForAccessToken(idToken) {
  if (!idToken) throw new Error('No Google ID token to sign in with.');

  const response = await fetch(`${API_BASE_URL}/api/portal/users/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(text || response.statusText || 'Sign-in failed.');
  }

  if (!response.ok) {
    throw new Error(
      body?.message || body?.error || text || response.statusText || 'Sign-in failed.',
    );
  }

  // Same envelope unwrapping the rest of the app uses.
  const payload = body?.payload?.return ?? body?.payload ?? body;
  const accessToken = payload?.accessToken;
  if (!accessToken) {
    throw new Error('Sign-in succeeded but the server returned no access token.');
  }

  setAccessToken(accessToken);
  return payload;
}
