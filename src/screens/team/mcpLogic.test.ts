import { describe, it, expect } from 'vitest'
import { mcpUrl, claudeCommand, cursorConfig, tokenState, validateTokenName, EXPIRY_CHOICES } from './mcpLogic'

describe('mcpLogic', () => {
  it('builds the MCP URL from the API base, without a double slash', () => {
    expect(mcpUrl('https://api.gobizzi.com')).toBe('https://api.gobizzi.com/mcp')
    expect(mcpUrl('https://api.gobizzi.com/')).toBe('https://api.gobizzi.com/mcp')
  })

  it('gives the Claude Code command and the Cursor config with the token in the Authorization header', () => {
    const url = 'https://api.gobizzi.com/mcp'
    expect(claudeCommand(url, 'ubs_pat_X')).toBe('claude mcp add --transport http ubs https://api.gobizzi.com/mcp --header "Authorization: Bearer ubs_pat_X"')
    expect(JSON.parse(cursorConfig(url, 'ubs_pat_X'))).toEqual({
      mcpServers: { ubs: { url: 'https://api.gobizzi.com/mcp', headers: { Authorization: 'Bearer ubs_pat_X' } } },
    })
  })

  it('says whether a token is active, expired or revoked', () => {
    const now = new Date('2026-10-14T10:00:00Z')
    const base = { id: 1, name: 'x', scope: 'read' as const, prefix: 'ubs_pat_AAAA', createdAt: '2026-10-01T00:00:00Z', lastUsedAt: null }
    expect(tokenState({ ...base, expiresAt: '2027-01-01T00:00:00Z', revokedAt: null }, now)).toBe('active')
    expect(tokenState({ ...base, expiresAt: '2026-10-01T00:00:00Z', revokedAt: null }, now)).toBe('expired')
    expect(tokenState({ ...base, expiresAt: '2027-01-01T00:00:00Z', revokedAt: '2026-10-02T00:00:00Z' }, now)).toBe('revoked')
  })

  it('validates the token name and offers 30, 90 and 365 days', () => {
    expect(validateTokenName('  ')).toBe('Give the token a name, e.g. "laptop".')
    expect(validateTokenName('x'.repeat(61))).toBe('The name can be at most 60 characters.')
    expect(validateTokenName('laptop')).toBeNull()
    expect(EXPIRY_CHOICES).toEqual([30, 90, 365])
  })
})
