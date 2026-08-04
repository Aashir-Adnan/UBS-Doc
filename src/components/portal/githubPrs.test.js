import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { listPullRequests } from './githubPrs';

// Raw GitHub REST shape, trimmed to the fields the mapper reads.
const RAW_PR = {
  number: 47,
  title: 'feat: OAuth2 PKCE flow for mobile clients',
  head: { ref: 'feature/pkce-mobile' },
  base: { ref: 'main' },
  state: 'open',
  draft: false,
  user: { login: 'octocat' },
  html_url: 'https://github.com/granjur/auth-service/pull/47',
  updated_at: '2026-08-01T10:20:30Z',
};

function mockFetch(payload, { ok = true, status = 200 } = {}) {
  const fn = vi.fn().mockResolvedValue({ ok, status, json: async () => payload });
  globalThis.fetch = fn;
  return fn;
}

describe('listPullRequests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // window is absent under vitest's `node` environment; define it so the
    // helper's `typeof window !== 'undefined'` PAT lookup is exercised.
    globalThis.window = { __GIT_PAT__: 'tok-123' };
  });

  afterEach(() => {
    delete globalThis.window;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('builds the pulls URL with the state and per_page params', async () => {
    const fetchMock = mockFetch([]);
    await listPullRequests('granjur', 'auth-service', 'closed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/granjur/auth-service/pulls?state=closed&per_page=50',
    );
  });

  it('defaults the state to open', async () => {
    const fetchMock = mockFetch([]);
    await listPullRequests('granjur', 'api-gateway');
    expect(fetchMock.mock.calls[0][0]).toContain('state=open');
    expect(fetchMock.mock.calls[0][0]).toContain('per_page=50');
  });

  it('sends the injected PAT as a Bearer token', async () => {
    const fetchMock = mockFetch([]);
    await listPullRequests('granjur', 'auth-service');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer tok-123' });
  });

  it('omits the Authorization header when no PAT is injected', async () => {
    globalThis.window = {};
    const fetchMock = mockFetch([]);
    await listPullRequests('granjur', 'auth-service');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({});
  });

  it('maps the GitHub payload onto the card shape', async () => {
    mockFetch([RAW_PR]);
    const prs = await listPullRequests('granjur', 'auth-service');
    expect(prs).toEqual([
      {
        number: 47,
        title: 'feat: OAuth2 PKCE flow for mobile clients',
        branch: 'feature/pkce-mobile',
        state: 'open',
        draft: false,
        user: 'octocat',
        url: 'https://github.com/granjur/auth-service/pull/47',
        updatedAt: '2026-08-01T10:20:30Z',
      },
    ]);
  });

  it('tolerates missing head/user objects', async () => {
    mockFetch([{ ...RAW_PR, head: undefined, user: undefined }]);
    const [pr] = await listPullRequests('granjur', 'auth-service');
    expect(pr.branch).toBeUndefined();
    expect(pr.user).toBeUndefined();
    expect(pr.number).toBe(47);
  });

  it('throws with the GitHub message when the response is not ok', async () => {
    mockFetch({ message: 'Not Found' }, { ok: false, status: 404 });
    await expect(listPullRequests('granjur', 'nope')).rejects.toThrow('GitHub 404: Not Found');
  });

  it('falls back to a generic message when the error body has none', async () => {
    mockFetch({}, { ok: false, status: 500 });
    await expect(listPullRequests('granjur', 'auth-service')).rejects.toThrow('GitHub 500: request failed');
  });
});
