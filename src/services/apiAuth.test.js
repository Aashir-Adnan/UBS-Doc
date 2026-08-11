import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const BASE = 'http://api.test';

// config.js reads window.__API_BASE_URL__ at module scope, so it has to be set
// before the module graph under test is imported.
globalThis.window = globalThis.window || globalThis;
window.__API_BASE_URL__ = BASE;
if (!window.location) window.location = { href: 'http://app.test/' };

const { installApiAuth } = await import('./apiAuth');
const {
  setAccessToken, getAccessToken, onSessionExpired, __resetAuthTokenForTests,
} = await import('./authToken');

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('installApiAuth', () => {
  let calls;
  let uninstall;
  let respondWith;

  beforeEach(() => {
    __resetAuthTokenForTests();
    calls = [];
    respondWith = () => jsonResponse({ ok: true });
    window.fetch = vi.fn(async (input, init) => {
      calls.push({ input, init });
      return respondWith(input, init);
    });
    uninstall = installApiAuth(BASE);
  });

  afterEach(() => {
    uninstall();
    __resetAuthTokenForTests();
  });

  const headerOf = (i = 0) => new Headers(calls[i].init?.headers).get('accesstoken');

  it('attaches the token to API calls', async () => {
    setAccessToken('tok-1');
    await fetch(`${BASE}/api/portal/users/list`);
    expect(headerOf()).toBe('tok-1');
  });

  it('sends no auth header when there is no token', async () => {
    await fetch(`${BASE}/api/runtimekeys?version=1`);
    expect(headerOf()).toBeNull();
  });

  it('leaves requests to other origins alone', async () => {
    setAccessToken('tok-1');
    await fetch('https://securetoken.googleapis.com/v1/token');
    expect(headerOf()).toBeNull();
  });

  it('preserves the caller’s own headers and body', async () => {
    setAccessToken('tok-1');
    await fetch(`${BASE}/api/portal/org/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"org_id":1}',
    });
    const sent = new Headers(calls[0].init.headers);
    expect(sent.get('content-type')).toBe('application/json');
    expect(sent.get('accesstoken')).toBe('tok-1');
    expect(calls[0].init.body).toBe('{"org_id":1}');
    expect(calls[0].init.method).toBe('POST');
  });

  it('does not clobber an explicit accesstoken header', async () => {
    setAccessToken('tok-1');
    await fetch(`${BASE}/api/portal/users/list`, { headers: { accesstoken: 'explicit' } });
    expect(headerOf()).toBe('explicit');
  });

  it('adopts a rolled token from x-new-accesstoken', async () => {
    setAccessToken('tok-1');
    respondWith = () => jsonResponse({ ok: true }, { headers: { 'x-new-accesstoken': 'tok-2' } });
    await fetch(`${BASE}/api/portal/users/list`);
    expect(getAccessToken()).toBe('tok-2');
  });

  it('keeps the current token when no rolled token comes back', async () => {
    setAccessToken('tok-1');
    await fetch(`${BASE}/api/portal/users/list`);
    expect(getAccessToken()).toBe('tok-1');
  });

  it('reports expiry and clears the token on a 401', async () => {
    const expired = vi.fn();
    onSessionExpired(expired);
    setAccessToken('tok-1');
    respondWith = () => jsonResponse({ message: 'unauthorized' }, { status: 401 });

    await fetch(`${BASE}/api/portal/users/list`);

    expect(expired).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it('does not report expiry for a 401 on an unauthenticated call', async () => {
    // No token presented — e.g. runtime keys before sign-in. Not a dead session.
    const expired = vi.fn();
    onSessionExpired(expired);
    respondWith = () => jsonResponse({}, { status: 401 });

    await fetch(`${BASE}/api/runtimekeys?version=1`);

    expect(expired).not.toHaveBeenCalled();
  });

  it('does not report expiry for a 401 from the sign-in exchange', async () => {
    // A stale token can still be in storage while a fresh sign-in is attempted;
    // a rejected ID token is the caller's error to show, not a session teardown.
    const expired = vi.fn();
    onSessionExpired(expired);
    setAccessToken('stale');
    respondWith = () => jsonResponse({ message: 'bad idToken' }, { status: 401 });

    await fetch(`${BASE}/api/portal/users/signin`, { method: 'POST' });

    expect(expired).not.toHaveBeenCalled();
  });

  it('still returns the response body to the caller', async () => {
    setAccessToken('tok-1');
    respondWith = () => jsonResponse({ payload: { return: { users: [1, 2] } } });
    const res = await fetch(`${BASE}/api/portal/users/list`);
    await expect(res.json()).resolves.toEqual({ payload: { return: { users: [1, 2] } } });
  });

  it('does not double-wrap when installed twice', async () => {
    const expired = vi.fn();
    onSessionExpired(expired);
    const second = installApiAuth(BASE);
    setAccessToken('tok-1');
    respondWith = () => jsonResponse({}, { status: 401 });

    await fetch(`${BASE}/api/portal/users/list`);

    expect(expired).toHaveBeenCalledTimes(1);
    second();
  });

  it('restores the original fetch on uninstall', async () => {
    const patched = window.fetch;
    uninstall();
    expect(window.fetch).not.toBe(patched);
    uninstall = () => {};
  });
});
