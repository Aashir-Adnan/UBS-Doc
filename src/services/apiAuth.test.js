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
  setSessionRenewer,
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

// The backend's token lives 60 minutes and is only rolled in its last 5, so a
// user idle at that moment comes back to a 401. The Google session is still
// good: the wrapper renews the portal token from it and repeats the request
// once, and only a renewal that fails is a real expiry.
describe('installApiAuth — silent renewal', () => {
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

  const sentToken = (input, init) => new Headers(init?.headers ?? input?.headers).get('accesstoken');
  const tokenOf = (i) => sentToken(calls[i].input, calls[i].init);
  // 401 for the dead token, 200 for any other.
  const refuse = (dead) => (input, init) => (sentToken(input, init) === dead
    ? jsonResponse({ message: 'Invalid Token' }, { status: 401 })
    : jsonResponse({ ok: true }));

  it('renews the token and repeats the request once with it; no expiry', async () => {
    const expired = vi.fn();
    onSessionExpired(expired);
    setAccessToken('old');
    const renewer = vi.fn(async () => setAccessToken('new'));
    setSessionRenewer(renewer);
    respondWith = refuse('old');

    const res = await fetch(`${BASE}/api/portal/users/list`);

    expect(res.status).toBe(200);
    expect(renewer).toHaveBeenCalledTimes(1);
    expect([tokenOf(0), tokenOf(1)]).toEqual(['old', 'new']);
    expect(calls).toHaveLength(2);
    expect(expired).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe('new');
  });

  it('keeps the caller\'s method and body on the repeat', async () => {
    setAccessToken('old');
    setSessionRenewer(async () => setAccessToken('new'));
    respondWith = refuse('old');

    await fetch(`${BASE}/api/portal/org/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"org_id":1}',
    });

    expect(calls[1].init.method).toBe('POST');
    expect(calls[1].init.body).toBe('{"org_id":1}');
    expect(new Headers(calls[1].init.headers).get('content-type')).toBe('application/json');
  });

  it('repeats a Request object with its body intact', async () => {
    setAccessToken('old');
    setSessionRenewer(async () => setAccessToken('new'));
    respondWith = refuse('old');

    await fetch(new Request(`${BASE}/api/portal/org/update`, { method: 'POST', body: '{"a":1}' }));

    expect(calls).toHaveLength(2);
    expect(tokenOf(1)).toBe('new');
    await expect(calls[1].input.text()).resolves.toBe('{"a":1}');
  });

  it('requests refused together share one renewal and are each repeated', async () => {
    setAccessToken('old');
    const renewer = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      setAccessToken('new');
    });
    setSessionRenewer(renewer);
    respondWith = refuse('old');

    const [a, b, c] = await Promise.all([
      fetch(`${BASE}/api/portal/users/list`),
      fetch(`${BASE}/api/portal/users/me`),
      fetch(`${BASE}/api/portal/org/list`),
    ]);

    expect([a.status, b.status, c.status]).toEqual([200, 200, 200]);
    expect(renewer).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(6);
  });

  it('a request whose token was already replaced is repeated without another renewal', async () => {
    setAccessToken('old');
    const renewer = vi.fn(async () => setAccessToken('newer'));
    setSessionRenewer(renewer);
    // Another call renewed while this one was in flight.
    respondWith = (input, init) => {
      if (sentToken(input, init) === 'old') {
        setAccessToken('new');
        return jsonResponse({}, { status: 401 });
      }
      return jsonResponse({ ok: true });
    };

    const res = await fetch(`${BASE}/api/portal/users/list`);

    expect(res.status).toBe(200);
    expect(renewer).not.toHaveBeenCalled();
    expect(tokenOf(1)).toBe('new');
  });

  it('reports expiry when the renewal fails', async () => {
    const expired = vi.fn();
    onSessionExpired(expired);
    setAccessToken('old');
    setSessionRenewer(async () => { throw new Error('signed out of Google'); });
    respondWith = refuse('old');

    const res = await fetch(`${BASE}/api/portal/users/list`);

    expect(res.status).toBe(401);
    expect(calls).toHaveLength(1);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it('reports expiry when the repeated request is refused as well, without renewing again', async () => {
    const expired = vi.fn();
    onSessionExpired(expired);
    setAccessToken('old');
    const renewer = vi.fn(async () => setAccessToken('new'));
    setSessionRenewer(renewer);
    respondWith = () => jsonResponse({}, { status: 401 });

    const res = await fetch(`${BASE}/api/portal/users/list`);

    expect(res.status).toBe(401);
    expect(renewer).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('never renews for a 401 from the sign-in call itself', async () => {
    const expired = vi.fn();
    onSessionExpired(expired);
    setAccessToken('stale');
    const renewer = vi.fn(async () => setAccessToken('new'));
    setSessionRenewer(renewer);
    respondWith = () => jsonResponse({ message: 'bad idToken' }, { status: 401 });

    await fetch(`${BASE}/api/portal/users/signin`, { method: 'POST' });

    expect(renewer).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(expired).not.toHaveBeenCalled();
  });

  it('does not renew a token the caller set explicitly', async () => {
    const expired = vi.fn();
    onSessionExpired(expired);
    setAccessToken('old');
    const renewer = vi.fn(async () => setAccessToken('new'));
    setSessionRenewer(renewer);
    respondWith = () => jsonResponse({}, { status: 401 });

    await fetch(`${BASE}/api/portal/users/list`, { headers: { accesstoken: 'explicit' } });

    expect(renewer).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(expired).toHaveBeenCalledTimes(1);
  });
});
