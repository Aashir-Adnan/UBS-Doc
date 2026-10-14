// Team → MCP: the pure parts of the token page — the MCP URL, the connect
// snippets and a token's state. The token itself is shown once, at creation.
export interface McpToken {
  id: number
  name: string
  scope: 'read' | 'full'
  prefix: string
  createdAt: string | null
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
}
export interface CreatedMcpToken { token: string; id: number; name: string; scope: 'read' | 'full'; prefix: string; createdAt: string | null; expiresAt: string | null }

export const EXPIRY_CHOICES = [30, 90, 365] as const
export const NAME_MAX = 60

export function mcpUrl(apiBase: string): string {
  return `${apiBase.replace(/\/+$/, '')}/mcp`
}

export function claudeCommand(url: string, token: string): string {
  return `claude mcp add --transport http ubs ${url} --header "Authorization: Bearer ${token}"`
}

export function cursorConfig(url: string, token: string): string {
  return JSON.stringify({ mcpServers: { ubs: { url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2)
}

export function tokenState(t: McpToken, now: Date = new Date()): 'active' | 'expired' | 'revoked' {
  if (t.revokedAt) return 'revoked'
  if (t.expiresAt && new Date(t.expiresAt).getTime() <= now.getTime()) return 'expired'
  return 'active'
}

export function validateTokenName(name: string): string | null {
  const v = name.trim()
  if (!v) return 'Give the token a name, e.g. "laptop".'
  if (v.length > NAME_MAX) return `The name can be at most ${NAME_MAX} characters.`
  return null
}
