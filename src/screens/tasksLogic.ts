export interface TaskPerson { discordId: string; name: string }
export interface TaskRef { id: string; title: string; status?: string }
export interface TaskRow {
  id: string; title: string; type: string; status: string; implementationStatus: string | null
  assignees: TaskPerson[]; blockedBy: TaskRef[]; blocks: TaskRef[]; isBlocked: boolean
  channelUrl: string | null; createdAt: string; updatedAt: string
}
export interface ProjectMember { discordId: string; name: string; username: string | null; role: string | null; source: 'explicit' | 'inferred' }
export interface ProjectGroup {
  id: string | null; name: string; docsSlug: string | null; members: ProjectMember[]
  counts: { open: number; in_progress: number; pending: number; done: number; blocked: number }
  tasks: TaskRow[]
}
export interface TasksPayload { generatedAt: string; projects: ProjectGroup[] }

export type StatusFilter = 'all' | 'active' | 'done'
export interface Filters { status: StatusFilter; projectSlug: string | null; assigneeId: string | null; blockedOnly: boolean; query: string }
export const DEFAULT_FILTERS: Filters = { status: 'all', projectSlug: null, assigneeId: null, blockedOnly: false, query: '' }

const TERMINAL = new Set(['closed', 'done', 'resolved'])
export const isTerminal = (s: string) => TERMINAL.has(s)

export function applyFilters(projects: ProjectGroup[], f: Filters): ProjectGroup[] {
  const needle = f.query.trim().toLowerCase()
  return projects
    .filter((p) => !f.projectSlug || p.docsSlug === f.projectSlug)
    .map((p) => ({
      ...p,
      tasks: p.tasks.filter((t) => {
        if (f.status === 'active' && isTerminal(t.status)) return false
        if (f.status === 'done' && !isTerminal(t.status)) return false
        if (f.assigneeId && !t.assignees.some((a) => a.discordId === f.assigneeId)) return false
        if (f.blockedOnly && !t.isBlocked) return false
        if (needle && !t.title.toLowerCase().includes(needle)) return false
        return true
      }),
    }))
    .filter((p) => p.tasks.length > 0)
}

// Returns the requested project slug when it is non-empty and no project in
// `projects` carries that `docsSlug` — the signal Tasks.tsx uses to tell "no
// tasks for this real project" apart from "this project slug doesn't exist
// here at all" (e.g. a registry slug with no matching bot docsSlug).
export function unknownProjectSlug(projects: ProjectGroup[], projectSlug: string | null): string | null {
  if (!projectSlug) return null
  return projects.some((p) => p.docsSlug === projectSlug) ? null : projectSlug
}

export function assigneeOptions(projects: ProjectGroup[]): { id: string; name: string }[] {
  const seen = new Map<string, string>()
  for (const p of projects) for (const t of p.tasks) for (const a of t.assignees) if (!seen.has(a.discordId)) seen.set(a.discordId, a.name)
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}

export type Tone = 'done' | 'active' | 'idle' | 'bad'
export function statusTone(t: TaskRow): Tone {
  if (t.isBlocked) return 'bad'
  if (isTerminal(t.status)) return 'done'
  if (t.status === 'in_progress') return 'active'
  return 'idle'
}

export const STATUS_LABEL: Record<string, string> = {
  open: 'Open', pending: 'Pending', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed', done: 'Done',
}
