import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const BASE = 'http://api.test';

globalThis.window = globalThis.window || globalThis;
window.__API_BASE_URL__ = BASE;
if (!window.location) window.location = { href: 'http://app.test/' };

const { exchangeIdTokenForAccessToken } = await import('./portalSignIn');
const { getAccessToken, __resetAuthTokenForTests } = await import('./authToken');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('exchangeIdTokenForAccessToken', () => {
  let calls;
  let respondWith;

  beforeEach(() => {
    __resetAuthTokenForTests();
    calls = [];
    respondWith = () => jsonResponse({ payload: { return: { accessToken: 'tok-1', user: { id: 1 } } } });
    window.fetch = vi.fn(async (input, init) => {
      calls.push({ input, init });
      return respondWith();
    });
  });

  afterEach(() => __resetAuthTokenForTests());

  it('posts the ID token to the sign-in endpoint', async () => {
    await exchangeIdTokenForAccessToken('id-token-abc');
    expect(calls[0].input).toBe(`${BASE}/api/portal/users/signin`);
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body)).toEqual({ idToken: 'id-token-abc' });
  });

  it('no longer sends google_uid or email as the identity', async () => {
    await exchangeIdTokenForAccessToken('id-token-abc');
    const body = JSON.parse(calls[0].init.body);
    expect(body).not.toHaveProperty('google_uid');
    expect(body).not.toHaveProperty('email');
  });

  it('stores the returned access token', async () => {
    await exchangeIdTokenForAccessToken('id-token-abc');
    expect(getAccessToken()).toBe('tok-1');
  });

  it('returns the unwrapped payload', async () => {
    const payload = await exchangeIdTokenForAccessToken('id-token-abc');
    expect(payload.user).toEqual({ id: 1 });
  });

  it('unwraps a response with no `return` envelope', async () => {
    respondWith = () => jsonResponse({ payload: { accessToken: 'tok-2' } });
    await exchangeIdTokenForAccessToken('id');
    expect(getAccessToken()).toBe('tok-2');
  });

  it('rejects without calling the server when there is no ID token', async () => {
    await expect(exchangeIdTokenForAccessToken(null)).rejects.toThrow(/No Google ID token/);
    expect(calls).toHaveLength(0);
  });

  it('surfaces the server message on failure and stores nothing', async () => {
    // The backend answers 401 here when FIREBASE_PROJECT_ID / GOOGLE_CLIENT_ID
    // is not configured, so this message is the operator's only clue.
    respondWith = () => jsonResponse({ message: 'ID token verification is not configured' }, 401);
    await expect(exchangeIdTokenForAccessToken('id')).rejects.toThrow(/not configured/);
    expect(getAccessToken()).toBeNull();
  });

  it('fails loudly when the response carries no access token', async () => {
    respondWith = () => jsonResponse({ payload: { return: { user: { id: 1 } } } });
    await expect(exchangeIdTokenForAccessToken('id')).rejects.toThrow(/no access token/i);
    expect(getAccessToken()).toBeNull();
  });

  it('reports a non-JSON error body rather than throwing a parse error', async () => {
    respondWith = () => new Response('<html>502</html>', { status: 502 });
    await expect(exchangeIdTokenForAccessToken('id')).rejects.toThrow(/502/);
  });
});
