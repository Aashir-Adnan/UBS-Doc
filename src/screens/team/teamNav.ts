// Tab bar model for the Team section. The active tab is derived from the URL
// rather than held in state, so a deep link (or the task-detail route, which
// has no tab of its own) lights the right tab on first paint.
export type TeamTabKey = 'people' | 'tasks' | 'board' | 'time' | 'stats'
export interface TeamTab { key: TeamTabKey; label: string; path: string }

export const TEAM_BASE = '/tools/team'

export const TEAM_TABS: TeamTab[] = [
  { key: 'people', label: 'People', path: TEAM_BASE },
  { key: 'tasks', label: 'Tasks', path: `${TEAM_BASE}/tasks` },
  { key: 'board', label: 'Board', path: `${TEAM_BASE}/board` },
  { key: 'time', label: 'Time', path: `${TEAM_BASE}/time` },
  { key: 'stats', label: 'Stats', path: `${TEAM_BASE}/stats` },
]

// `/tools/team/tasks/:taskId` counts as the Tasks tab; anything else under the
// section (including the bare base and an unknown child) falls back to People,
// which is the index route.
export function activeTab(pathname: string): TeamTabKey {
  const rest = pathname.replace(/\/+$/, '').slice(TEAM_BASE.length)
  if (rest === '/board' || rest.startsWith('/board/')) return 'board'
  if (rest === '/tasks' || rest.startsWith('/tasks/')) return 'tasks'
  if (rest === '/time' || rest.startsWith('/time/')) return 'time'
  if (rest === '/stats' || rest.startsWith('/stats/')) return 'stats'
  return 'people'
}
