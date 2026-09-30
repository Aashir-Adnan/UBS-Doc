// Pure team-roster logic: per-member workload counts, roster sorting, and the
// shared filter bar's member-side narrowing. No React, no DOM.
import type { TeamTabKey } from './teamNav'
import { isTerminal, type ProjectGroup, type TaskRow, type TasksPayload, type TeamMember } from '../tasksLogic'

export interface MemberWorkload { open: number; in_progress: number; blocked: number; total: number }

// Counts tasks where the member is among the assignees. `blocked` counts
// non-terminal blocked tasks (a done/closed/resolved task is never "blocked"
// in any UI sense even if isBlocked was left stale); `total` counts every
// non-terminal assigned task regardless of status.
export function memberWorkload(member: TeamMember, tasks: TaskRow[]): MemberWorkload {
  const assigned = tasks.filter((t) => t.assignees.some((a) => a.discordId === member.discordId))
  let open = 0
  let inProgress = 0
  let blocked = 0
  let total = 0
  for (const task of assigned) {
    if (task.status === 'open') open += 1
    if (task.status === 'in_progress') inProgress += 1
    if (!isTerminal(task.status)) {
      total += 1
      if (task.isBlocked) blocked += 1
    }
  }
  return { open, in_progress: inProgress, blocked, total }
}

// Busiest members first (by open task count), ties broken by name. Returns a
// fresh array; never mutates the input.
export function sortMembers(members: TeamMember[], tasks: TaskRow[]): TeamMember[] {
  return [...members].sort((a, b) => {
    const openDiff = memberWorkload(b, tasks).open - memberWorkload(a, tasks).open
    if (openDiff !== 0) return openDiff
    return a.name.localeCompare(b.name)
  })
}

export interface TeamFilters {
  projectSlug: string | null
  assigneeId: string | null
  blockedOnly: boolean
  query: string
}

// `projects` carries both the project directory (to resolve projectSlug ->
// docsSlug) and the tasks (to know who is assigned within that project) —
// the brief calls for passing projects rather than a flat task list so both
// are available from one argument.
export function filterMembers(members: TeamMember[], projects: ProjectGroup[], filters: TeamFilters): TeamMember[] {
  const needle = filters.query.trim().toLowerCase()
  const project = filters.projectSlug ? projects.find((p) => p.docsSlug === filters.projectSlug) ?? null : null
  const projectTasks = project ? project.tasks : []
  const allProjectTasks = projects.flatMap((p) => p.tasks)

  return members.filter((member) => {
    if (filters.projectSlug) {
      const onProject = member.projects.some((p) => p.docsSlug === filters.projectSlug)
      const assignedInProject = projectTasks.some((t) => t.assignees.some((a) => a.discordId === member.discordId))
      if (!onProject && !assignedInProject) return false
    }
    if (filters.assigneeId && member.discordId !== filters.assigneeId) return false
    if (needle) {
      const haystack = `${member.name} ${member.username ?? ''}`.toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    if (filters.blockedOnly && memberWorkload(member, allProjectTasks).blocked <= 0) return false
    return true
  })
}

export interface PersonOption { id: string; name: string }

// The shared Assignee / person select's options, following the Project filter.
// A selected project offers its members; "All projects" offers the members of
// every project the viewer can see, except for a viewer who sees everything,
// who gets the full roster (so Time and Stats can list people with no tasks).
// Names come from the roster when the person is on it.
// Only on People, Tasks and Board: Time and Stats are gated by
// view_discord_time, not project membership, so there the options stay the
// full roster whatever the project filter says.
export function followsProject(tab: TeamTabKey): boolean {
  return tab !== 'time' && tab !== 'stats'
}

export function personOptions(payload: TasksPayload | null, projectSlug: string | null, tab: TeamTabKey): PersonOption[] {
  if (!payload) return []
  if (!followsProject(tab)) {
    return payload.members.map((m) => ({ id: m.discordId, name: m.name })).sort((a, b) => a.name.localeCompare(b.name))
  }
  const roster = new Map(payload.members.map((m) => [m.discordId, m.name]))
  const byId = new Map<string, string>()
  if (!projectSlug && payload.viewer?.seesAll) {
    for (const m of payload.members) byId.set(m.discordId, m.name)
  } else {
    const groups = projectSlug ? payload.projects.filter((p) => p.docsSlug === projectSlug) : payload.projects
    for (const g of groups) for (const m of g.members) if (!byId.has(m.discordId)) byId.set(m.discordId, roster.get(m.discordId) ?? m.name)
  }
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}

// Keep the selected assignee only if the options still offer them, else fall
// back to "Anyone" (null). On Time and Stats the assignee is never reset.
export function assigneeAfterProjectChange(options: PersonOption[], assigneeId: string | null, tab: TeamTabKey): string | null {
  if (!followsProject(tab)) return assigneeId
  return assigneeId && options.some((o) => o.id === assigneeId) ? assigneeId : null
}
