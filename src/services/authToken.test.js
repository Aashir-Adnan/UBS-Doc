import { describe, it, expect, beforeEach, vi } from 'vitest';

globalThis.window = globalThis.window || globalThis;

const store = new Map();
window.sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const {
  getAccessToken, setAccessToken, clearAccessToken,
  onSessionExpired, notifySessionExpired, __resetAuthTokenForTests,
  setSessionRenewer, renewSession,
} = await import('./authToken');

const KEY = 'ubs-portal-access-token';

describe('access token store', () => {
  beforeEach(() => {
    store.clear();
    __resetAuthTokenForTests();
  });

  it('starts empty', () => {
    expect(getAccessToken()).toBeNull();
  });

  it('round-trips a token', () => {
    setAccessToken('tok-1');
    expect(getAccessToken()).toBe('tok-1');
  });

  it('persists to sessionStorage so a reload can reuse it', () => {
    setAccessToken('tok-1');
    expect(store.get(KEY)).toBe('tok-1');
  });

  it('hydrates from sessionStorage on first read', () => {
    store.set(KEY, 'from-storage');
    __resetAuthTokenForTests();
    expect(getAccessToken()).toBe('from-storage');
  });

  it('clears both memory and storage', () => {
    setAccessToken('tok-1');
    clearAccessToken();
    expect(getAccessToken()).toBeNull();
    expect(store.has(KEY)).toBe(false);
  });

  it('treats an empty string as no token', () => {
    setAccessToken('tok-1');
    setAccessToken('');
    expect(getAccessToken()).toBeNull();
  });

  it('notifies subscribers on expiry and clears the token', () => {
    const a = vi.fn();
    const b = vi.fn();
    onSessionExpired(a);
    onSessionExpired(b);
    setAccessToken('tok-1');

    notifySessionExpired();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it('stops notifying after unsubscribe', () => {
    const a = vi.fn();
    const off = onSessionExpired(a);
    off();
    notifySessionExpired();
    expect(a).not.toHaveBeenCalled();
  });

  it('still notifies the rest when one subscriber throws', () => {
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();
    onSessionExpired(bad);
    onSessionExpired(good);
    expect(() => notifySessionExpired()).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('works memory-only when storage throws (private mode)', () => {
    const original = window.sessionStorage;
    window.sessionStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    };
    __resetAuthTokenForTests();

    expect(() => setAccessToken('tok-1')).not.toThrow();
    expect(getAccessToken()).toBe('tok-1');

    window.sessionStorage = original;
  });
});

// A dead token is renewed silently from the still-signed-in Google session
// before anyone is told the session expired.
describe('session renewal', () => {
  beforeEach(() => {
    store.clear();
    __resetAuthTokenForTests();
  });

  it('answers false when no renewer is registered', async () => {
    expect(await renewSession()).toBe(false);
  });

  it('runs one renewal for any number of callers waiting at once', async () => {
    let calls = 0;
    let release;
    setSessionRenewer(() => {
      calls += 1;
      return new Promise((resolve) => {
        release = () => { setAccessToken('fresh'); resolve(); };
      });
    });
    const a = renewSession();
    const b = renewSession();
    release();
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(calls).toBe(1);
    expect(getAccessToken()).toBe('fresh');
  });

  it('starts a new renewal once the previous one has finished', async () => {
    let calls = 0;
    setSessionRenewer(async () => { calls += 1; setAccessToken(`tok-${calls}`); });
    await renewSession();
    await renewSession();
    expect(calls).toBe(2);
    expect(getAccessToken()).toBe('tok-2');
  });

  it('answers false when the renewer throws, and a later call may try again', async () => {
    setSessionRenewer(async () => { throw new Error('signed out of Google'); });
    expect(await renewSession()).toBe(false);
    setSessionRenewer(async () => setAccessToken('ok'));
    expect(await renewSession()).toBe(true);
  });

  it('answers false when the renewer leaves no token behind', async () => {
    setSessionRenewer(async () => clearAccessToken());
    expect(await renewSession()).toBe(false);
  });

  it('unregistering the renewer stops renewal', async () => {
    const off = setSessionRenewer(async () => setAccessToken('x'));
    off();
    expect(await renewSession()).toBe(false);
  });
});
