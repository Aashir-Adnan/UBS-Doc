import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// config.js reads window.__API_BASE_URL__ at module scope, so it has to be
// set before the module graph under test is imported (same pattern as
// src/services/apiAuth.test.js).
const BASE = 'http://api.test'
globalThis.window = globalThis.window || (globalThis as unknown as Window)
;(window as unknown as { __API_BASE_URL__: string }).__API_BASE_URL__ = BASE

const { setTaskStatus, ApiError } = await import('./api')

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

describe('setTaskStatus', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts task_id and status as JSON to /api/discord/tasks/status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ payload: { return: { task: { id: 'T1' }, warning: '', unchanged: false } } }))
    await setTaskStatus('T1', 'in_progress')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE}/api/discord/tasks/status`)
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ task_id: 'T1', status: 'in_progress' })
  })

  it('unwraps payload.return on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ payload: { return: { task: { id: 'T1' }, warning: 'blocked upstream', unchanged: false } } }))
    const result = await setTaskStatus('T1', 'done')
    expect(result).toEqual({ task: { id: 'T1' }, warning: 'blocked upstream', unchanged: false })
  })

  // CSAAS error bodies are { status, message, payload, source, scc } for every
  // error status: `message` is generic catalogue text and `payload` carries the
  // specific sentence. The specific one is what the board should show.
  it('prefers the string "payload" over the generic catalogue "message" on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      status: 403,
      message: 'You do not have permission to perform this action.',
      payload: "Permission 'update_discord_tasks' is required for this action",
      source: 'DiscordTasksStatus',
      scc: 'E41',
    }, 403))
    await expect(setTaskStatus('T1', 'done')).rejects.toMatchObject({
      message: "Permission 'update_discord_tasks' is required for this action",
      status: 403,
    })
  })

  it('falls back to "message" when the body carries no string payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Please check your input and try again.' }, 400))
    await expect(setTaskStatus('T1', 'nope')).rejects.toMatchObject({
      message: 'Please check your input and try again.',
      status: 400,
    })

    // A non-string payload (or an empty one) must not shadow the message.
    fetchMock.mockResolvedValue(jsonResponse({ message: 'An unexpected error occurred.', payload: {} }, 500))
    await expect(setTaskStatus('T1', 'done')).rejects.toMatchObject({
      message: 'An unexpected error occurred.',
      status: 500,
    })
  })

  it('falls back to data.error, then statusText, when message is absent', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'bad status' }, 400))
    await expect(setTaskStatus('T1', 'nope')).rejects.toMatchObject({ message: 'bad status', status: 400 })

    fetchMock.mockResolvedValue(new Response('', { status: 502, statusText: 'Bad Gateway' }))
    await expect(setTaskStatus('T1', 'done')).rejects.toMatchObject({ message: 'Bad Gateway', status: 502 })
  })

  it('rejects with ApiError instances', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'nope' }, 400))
    try {
      await setTaskStatus('T1', 'done')
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
    }
  })
})
