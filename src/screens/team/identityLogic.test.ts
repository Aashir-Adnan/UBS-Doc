import { describe, it, expect } from 'vitest'
import type { TasksPayload } from '../tasksLogic'
import { needsLink, viewerLine, normalizeCode, codeProblem, linkErrorText } from './identityLogic'

const base = { generatedAt: '', projects: [], members: [] } as TasksPayload

describe('needsLink', () => {
  it('only when the backend says unlinked and not see-all', () => {
    expect(needsLink(null)).toBe(false)
    expect(needsLink(base)).toBe(false) // an older backend sends no viewer: behave as before
    expect(needsLink({ ...base, viewer: { linked: false, seesAll: false, isAdmin: false, discordIds: [], name: null } })).toBe(true)
    expect(needsLink({ ...base, viewer: { linked: false, seesAll: true, isAdmin: true, discordIds: [], name: null } })).toBe(false)
    expect(needsLink({ ...base, viewer: { linked: true, seesAll: false, isAdmin: false, discordIds: ['1'], name: 'Ana' } })).toBe(false)
  })
})

describe('viewerLine', () => {
  it('names the viewer, or says they see everything', () => {
    expect(viewerLine(undefined)).toBeNull()
    expect(viewerLine({ linked: true, seesAll: false, isAdmin: false, discordIds: ['1'], name: 'Ana' })).toBe('Signed in as Ana')
    expect(viewerLine({ linked: true, seesAll: true, isAdmin: false, discordIds: ['1'], name: 'Ana' })).toBe('Signed in as Ana · viewing every project')
    expect(viewerLine({ linked: false, seesAll: true, isAdmin: true, discordIds: [], name: null })).toBe('Viewing every project')
    expect(viewerLine({ linked: true, seesAll: false, isAdmin: false, discordIds: ['1'], name: null })).toBe('Signed in with your Discord account')
  })
})

describe('codes', () => {
  it('normalizes spaces, dashes and case', () => {
    expect(normalizeCode(' abc-234 ')).toBe('ABC234')
  })
  it('explains a malformed code before sending it', () => {
    expect(codeProblem('ABC234')).toBeNull()
    expect(codeProblem('')).toBe('Enter the 6-character code from /link.')
    expect(codeProblem('ABC23')).toBe('Codes are 6 letters and digits, like ABC234.')
    expect(codeProblem('ABC0I1')).toBe('Codes are 6 letters and digits, like ABC234.')
  })
})

describe('linkErrorText', () => {
  it('shows the server sentence for refusals, a plain one otherwise', () => {
    expect(linkErrorText({ status: 400, message: 'That code is not valid. Run /link in Discord for a new one.' })).toBe('That code is not valid. Run /link in Discord for a new one.')
    expect(linkErrorText({ status: 503, message: 'Linking by code is not available yet.' })).toBe('Linking by code is not available yet.')
    expect(linkErrorText({ status: 429, message: 'Too many attempts. Wait a few minutes, then run /link again.' })).toBe('Too many attempts. Wait a few minutes, then run /link again.')
    expect(linkErrorText({ status: 401, message: 'x' })).toBe('Sign in again, then link your account.')
    expect(linkErrorText({ status: 502, message: 'x' })).toBe('The server did not answer. Try again in a moment.')
    expect(linkErrorText({ message: 'Failed to fetch' })).toBe('The server did not answer. Try again in a moment.')
  })
})
