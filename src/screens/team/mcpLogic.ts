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

// Where the server is added. `user` makes it available in every project on the
// machine; `local` (Claude Code's own default) only in the folder it was run in.
export type InstallScope = 'user' | 'local'
export const INSTALL_SCOPES: { value: InstallScope; label: string; hint: string }[] = [
  { value: 'user', label: 'All projects', hint: 'Available in every folder you open Claude Code or Cursor in. Recommended.' },
  { value: 'local', label: 'This project only', hint: 'Only in the folder you run the command in.' },
]
export const CURSOR_CONFIG_PATH: Record<InstallScope, string> = { user: '~/.cursor/mcp.json', local: '.cursor/mcp.json' }
// A local entry takes precedence over a user one with the same name, so a
// developer who added it locally before removes that first.
export const CLAUDE_REMOVE_LOCAL = 'claude mcp remove ubs --scope local'

export function claudeCommand(url: string, token: string, scope: InstallScope = 'user'): string {
  const flag = scope === 'user' ? '--scope user ' : ''
  return `claude mcp add ${flag}--transport http ubs ${url} --header "Authorization: Bearer ${token}"`
}

export function cursorConfig(url: string, token: string): string {
  return JSON.stringify({ mcpServers: { ubs: { url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2)
}

// The guide's tool list: the server's sixteen tools (CSAAS Src/Mcp/server.js),
// what each does and something to ask Claude that uses it. `write` tools need
// a Full token.
export const MCP_TOOLS: { name: string; write: boolean; what: string; ask: string }[] = [
  { name: 'list_projects', write: false, what: 'The projects you can see, with task counts.', ask: 'Which projects do I have access to?' },
  { name: 'list_members', write: false, what: 'People you can assign, optionally for one project.', ask: 'Who is on the CSAAS project?' },
  { name: 'list_tasks', write: false, what: 'Tasks with filters: project, status, type, assignee, creator, text, blocked, dates. Finished tasks are hidden unless asked for.', ask: 'Show my open bugs in Stitch2Door.' },
  { name: 'get_task', write: false, what: 'One task in full: description, assignees, subtasks, blockers, recent activity and time.', ask: 'Open task 3f9a12bc and summarise what is left.' },
  { name: 'list_time_entries', write: false, what: 'Time entries for you or someone else, for a week or a date range.', ask: 'What did I log this week?' },
  { name: 'time_report', write: false, what: 'Time totals per person and per project.', ask: 'How many hours went into Framework since Monday?' },
  { name: 'clock_status', write: false, what: 'Whether your timer is running, and on what.', ask: 'Am I clocked in?' },
  { name: 'create_task', write: true, what: 'A new task, with start and due dates, its Discord post, GitHub issue and notifications as from the site.', ask: 'Create a bug in CSAAS: login fails on Safari, assign it to me.' },
  { name: 'update_task', write: true, what: 'Change title, description, status, assignees, project, dates, estimate or blockers.', ask: 'Set that task to in progress and add Ali as an assignee.' },
  { name: 'create_subtask', write: true, what: 'A subtask under a task (one level deep).', ask: 'Break this task into subtasks for the API, the UI and the tests.' },
  { name: 'clock_in', write: true, what: 'Start your timer, optionally on a task. A running timer is stopped first.', ask: 'Clock me in on this task.' },
  { name: 'clock_out', write: true, what: 'Stop your timer, with a note of what was done.', ask: 'Clock me out: finished the Safari login fix.' },
  { name: 'log_time', write: true, what: 'Time you already spent, in minutes or from a start to an end, optionally on a task.', ask: 'I forgot the timer — log 2 hours on the login bug for this morning.' },
  { name: 'edit_time_entry', write: true, what: 'Fix one of your own entries: its length, times, task or note.', ask: 'That last entry should be 45 minutes, not an hour.' },
  { name: 'delete_time_entry', write: true, what: 'Delete one of your own entries.', ask: 'Delete the entry I logged by mistake today.' },
  { name: 'add_comment', write: true, what: "A note in the task's Discord post, with your name. Nobody is pinged.", ask: 'Comment on the task: API is done, UI next.' },
]

// Pasted into ~/.claude/CLAUDE.md by a developer who wants the routine to run
// on its own. Without it the server only tells Claude to OFFER to clock in and
// out (owner's choice, 2026-10-14).
export const CLAUDE_MD_SNIPPET = `## UBS tasks (ubs MCP)
- When I start working on a task, find it with the ubs tools, set it to in_progress with update_task and clock_in on it without asking.
- While I work, keep the task's description and status current and add subtasks for large pieces.
- When the work is finished or I stop for the day, clock_out with a one-line note of what was done, and set the task to done if it is finished.
- If I switch to another task, clock_out of the first one with a note before clock_in on the next.
- Ask before changing assignees or creating tasks I did not ask for.`

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
