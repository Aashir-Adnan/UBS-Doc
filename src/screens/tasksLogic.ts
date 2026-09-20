export interface TaskPerson { discordId: string; name: string; avatarUrl?: string }
export interface TaskRef { id: string; title: string; status?: string }
export interface TaskRow {
  id: string; title: string; type: string; status: string; implementationStatus: string | null
  assignees: TaskPerson[]; blockedBy: TaskRef[]; blocks: TaskRef[]; isBlocked: boolean
  channelUrl: string | null; createdAt: string; updatedAt: string
  description: string | null; scope: string | null; modules: string[]
  createdBy: TaskPerson | null
  passedApiTests: number | null; passedQaTests: number | null; passedAcceptanceCriteria: number | null
  projectId: string | null; projectName: string | null
}
export interface ProjectMember { discordId: string; name: string; username: string | null; avatarUrl?: string; role: string | null; source: 'explicit' | 'inferred' }
export interface ProjectGroup {
  id: string | null; name: string; docsSlug: string | null; members: ProjectMember[]
  counts: { open: number; in_progress: number; pending: number; done: number; blocked: number }
  tasks: TaskRow[]
}
export interface TeamProjectRef { id: string; name: string; docsSlug: string | null; role: string }
export interface TeamMember {
  discordId: string; name: string; username: string | null; avatarUrl?: string; roleNames: string[]
  status: string; verified: boolean; projects: TeamProjectRef[]
}
export interface TasksPayload { generatedAt: string; projects: ProjectGroup[]; members: TeamMember[] }

// Flattens every task across every project group into one list, in group then
// in-group order — the shape graph/board/team logic operate on when they need
// "all tasks" rather than the per-project grouping.
export function allTasks(projects: ProjectGroup[]): TaskRow[] {
  return projects.flatMap((p) => p.tasks)
}

// Finds a single task by id anywhere in the payload, along with the project
// group it belongs to (TaskDetail needs both: the task's own fields, and the
// project name/slug for breadcrumbs and the "back to project" link).
export function findTask(payload: TasksPayload, id: string): { task: TaskRow; project: ProjectGroup } | null {
  for (const project of payload.projects) {
    const task = project.tasks.find((t) => t.id === id)
    if (task) return { task, project }
  }
  return null
}

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
        if (needle && !(t.title ?? '').toLowerCase().includes(needle)) return false
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

// Stored role keys come from the bot's PROJECT_MEMBER_ROLES; the site only labels them.
export const ROLE_LABEL: Record<string, string> = {
  lead: 'Lead', developer: 'Developer', backend_developer: 'Backend Developer',
  frontend_developer: 'Frontend Developer', qa: 'QA', design: 'Design',
}
export const roleLabel = (role: string) => ROLE_LABEL[role] ?? role

// A task's discipline. The bot stores lowercase keys (backend/frontend/qa/design);
// a task from before that change may still carry free text, which is shown as-is.
export const SCOPE_LABEL: Record<string, string> = { backend: 'Backend', frontend: 'Frontend', qa: 'QA', design: 'Design' }
const isFixedScope = (s: string) => Object.prototype.hasOwnProperty.call(SCOPE_LABEL, s)
export const scopeLabel = (scope: string | null | undefined): string | null => {
  const s = (scope ?? '').trim()
  if (!s) return null
  return isFixedScope(s) ? SCOPE_LABEL[s] : s
}
// Which chip colour a scope takes; anything that is not one of the four is 'other'.
export type ScopeTone = 'backend' | 'frontend' | 'qa' | 'design' | 'other'
export const scopeTone = (scope: string | null | undefined): ScopeTone => {
  const s = (scope ?? '').trim()
  return isFixedScope(s) ? (s as ScopeTone) : 'other'
}
