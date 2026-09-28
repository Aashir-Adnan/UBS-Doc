import { describe, it, expect } from 'vitest'
import { normalizePayload } from './payloadLogic'

describe('normalizePayload', () => {
  it('keeps viewer and repositories from a full backend payload', () => {
    const raw = {
      generatedAt: '2026-09-29T00:00:00Z',
      projects: [{ id: 'p1', name: 'Framework', docsSlug: 'framework', members: [], counts: { open: 0, in_progress: 0, pending: 0, done: 0, blocked: 0 }, tasks: [] }],
      members: [{ discordId: 'u1', name: 'Ada', username: 'ada', roleNames: [], status: 'active', verified: true, projects: [] }],
      repositories: [{ id: 'r1', name: 'bot', url: 'https://example.com/bot' }],
      viewer: { linked: true, seesAll: false, isAdmin: false, discordIds: ['u1'], name: 'Ada' },
    }
    const out = normalizePayload(raw)
    expect(out.generatedAt).toBe('2026-09-29T00:00:00Z')
    expect(out.projects).toEqual(raw.projects)
    expect(out.members).toEqual(raw.members)
    expect(out.repositories).toEqual(raw.repositories)
    expect(out.viewer).toEqual(raw.viewer)
  })

  it('leaves viewer and repositories undefined for an older backend that never sent them', () => {
    const raw = { generatedAt: '2026-09-29T00:00:00Z', projects: [], members: [] }
    const out = normalizePayload(raw)
    expect(out.repositories).toBeUndefined()
    expect(out.viewer).toBeUndefined()
    expect(out.projects).toEqual([])
    expect(out.members).toEqual([])
  })

  it('turns garbage input into empty lists instead of throwing', () => {
    expect(normalizePayload(null)).toEqual({ generatedAt: '', projects: [], members: [], repositories: undefined, viewer: undefined })
    expect(normalizePayload(undefined)).toEqual({ generatedAt: '', projects: [], members: [], repositories: undefined, viewer: undefined })
    expect(normalizePayload('not an object')).toEqual({ generatedAt: '', projects: [], members: [], repositories: undefined, viewer: undefined })
    expect(normalizePayload({ projects: 'nope', members: 42, viewer: 'nope', repositories: {} })).toEqual({
      generatedAt: '', projects: [], members: [], repositories: undefined, viewer: undefined,
    })
  })
})
