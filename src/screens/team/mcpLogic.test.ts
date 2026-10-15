import { describe, it, expect } from 'vitest'
import {
  mcpUrl, claudeCommand, cursorConfig, tokenState, validateTokenName, EXPIRY_CHOICES,
  INSTALL_SCOPES, CURSOR_CONFIG_PATH, CLAUDE_REMOVE_LOCAL, CLAUDE_MD_SNIPPET, MCP_TOOLS,
} from './mcpLogic'

describe('mcpLogic', () => {
  it('builds the MCP URL from the API base, without a double slash', () => {
    expect(mcpUrl('https://api.gobizzi.com')).toBe('https://api.gobizzi.com/mcp')
    expect(mcpUrl('https://api.gobizzi.com/')).toBe('https://api.gobizzi.com/mcp')
  })

  it('gives the Claude Code command and the Cursor config with the token in the Authorization header', () => {
    const url = 'https://api.gobizzi.com/mcp'
    expect(claudeCommand(url, 'ubs_pat_X', 'local')).toBe('claude mcp add --transport http ubs https://api.gobizzi.com/mcp --header "Authorization: Bearer ubs_pat_X"')
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

  it('adds the server for every project (user scope) by default, or for the current folder only', () => {
    const url = 'https://api.gobizzi.com/mcp'
    expect(claudeCommand(url, 'ubs_pat_X')).toBe('claude mcp add --scope user --transport http ubs https://api.gobizzi.com/mcp --header "Authorization: Bearer ubs_pat_X"')
    expect(claudeCommand(url, 'ubs_pat_X', 'user')).toBe(claudeCommand(url, 'ubs_pat_X'))
    expect(INSTALL_SCOPES.map((o) => o.value)).toEqual(['user', 'local'])
    expect(CURSOR_CONFIG_PATH).toEqual({ user: '~/.cursor/mcp.json', local: '.cursor/mcp.json' })
    // A local entry wins over the user one, so an earlier local add must go first.
    expect(CLAUDE_REMOVE_LOCAL).toBe('claude mcp remove ubs --scope local')
  })

  it('lists the seventeen tools the server has, read tools before write tools', () => {
    expect(MCP_TOOLS.map((t) => t.name)).toEqual([
      'list_projects', 'list_members', 'list_tasks', 'get_task', 'list_time_entries', 'time_report', 'clock_status',
      'create_task', 'update_task', 'create_subtask', 'clock_in', 'clock_out', 'log_time', 'edit_time_entry', 'delete_time_entry', 'add_comment', 'delete_task',
    ])
    expect(MCP_TOOLS.filter((t) => t.write).map((t) => t.name)).toEqual([
      'create_task', 'update_task', 'create_subtask', 'clock_in', 'clock_out', 'log_time', 'edit_time_entry', 'delete_time_entry', 'add_comment', 'delete_task',
    ])
    for (const t of MCP_TOOLS) { expect(t.what).not.toBe(''); expect(t.ask).not.toBe('') }
  })

  it('gives a CLAUDE.md snippet that makes the clock routine automatic, naming the tools it uses', () => {
    for (const needle of ['clock_in', 'clock_out', 'update_task', 'in_progress', 'ubs']) expect(CLAUDE_MD_SNIPPET).toContain(needle)
    expect(CLAUDE_MD_SNIPPET.startsWith('## ')).toBe(true)
    expect(CLAUDE_MD_SNIPPET).not.toMatch(/ubs_pat_/)
  })
})
