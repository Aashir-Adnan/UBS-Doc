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
