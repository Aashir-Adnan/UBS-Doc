import { mwGet } from '../meetingWorkflow/api'
import { API_BASE_URL } from '../portal/config'
import type { TaskRow, TasksPayload } from '../../screens/tasksLogic'

// Same transport as the meeting workflow: ${API_BASE_URL}/api + path, response
// unwrapped as payload.return ?? payload ?? data.
export function fetchDiscordTasks(): Promise<TasksPayload> {
  return mwGet('/discord/tasks') as Promise<TasksPayload>
}

// GET /api/discord/time/report?since=&until= — both optional (the server
// defaults to the current UTC week when omitted), but the Time tab always
// passes both so the report matches the week the picker shows. `scope` is
// 'self' when the caller lacks view_discord_time and the server narrowed the
// query to just their own rows. `project` echoes the docsSlug the request
// filtered by (null when none).
export interface TimeReportPerson { discordId: string; name: string; avatarUrl?: string; minutes: number }
export interface TimeReportProject { id: string | null; name: string; minutes: number }
export interface TimeReportPayload {
  since: string
  until: string
  project: string | null
  people: TimeReportPerson[]
  projects: TimeReportProject[]
  scope: 'all' | 'self'
}

// `project` is a docsSlug; omitted means every project. The server echoes it
// back so a response can be matched to the filter that asked for it.
const projectParam = (slug?: string | null) => (slug ? `&project=${encodeURIComponent(slug)}` : '')

export function fetchTimeReport(since: Date, until: Date, projectSlug?: string | null): Promise<TimeReportPayload> {
  const q = `since=${encodeURIComponent(since.toISOString())}&until=${encodeURIComponent(until.toISOString())}${projectParam(projectSlug)}`
  return mwGet(`/discord/time/report?${q}`) as Promise<TimeReportPayload>
}

// mwGet() throws `new Error(await r.text())` — the raw CSAAS error body — so a
// 403 would otherwise render as `{"status":403,"message":…}`. The functions
// below use `apiCall` instead so they can prefer `payload`, then `message`,
// then `statusText`, and carry the HTTP status as `ApiError.status` for the
// caller to render a sentence instead.
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// One fetch for every discordTasks call that needs a real HTTP status: reads
// the body as text (an error body is not always JSON), prefers the server's
// specific `payload` sentence over the generic catalogue `message`, carries
// the status on ApiError, and unwraps the framework's payload.return. CSAAS
// error bodies are { status, message, payload, source, scc }: `message` is
// generic catalogue text ("You do not have permission…") while `payload`
// carries the sentence that names the actual problem ("Permission
// 'update_discord_tasks' is required for this action"). Prefer the specific
// one; on success `payload` is an object, so the string check is the tell.
async function apiCall<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api${path}`, init)
  const text = await res.text()
  let data: Record<string, unknown> = {}
  if (text) {
    try { data = JSON.parse(text) } catch { data = {} }
  }
  if (!res.ok) {
    const specific = typeof data.payload === 'string' && data.payload ? data.payload : ''
    const message = specific || (data.message as string) || (data.error as string) || res.statusText
    throw new ApiError(message, res.status)
  }
  const payload = data.payload as { return?: unknown } | undefined
  return (payload?.return ?? payload ?? data) as T
}

// GET /api/discord/time/entries?discordId=&since=&until= — one person's raw
// entries for the range, sorted ascending by clockInAt server-side (callers
// must not re-sort). `taskId`/`taskTitle` null means general work.
export interface TimeEntry {
  id: string
  clockInAt: string
  clockOutAt: string | null
  minutes: number
  taskId: string | null
  taskTitle: string | null
  projectId: string | null
  projectName: string | null
  note: string | null
  source: string
}
export interface TimeEntriesPayload {
  since: string
  until: string
  project: string | null
  person: { discordId: string; name: string; avatarUrl?: string }
  entries: TimeEntry[]
  truncated: boolean
}
export async function fetchTimeEntries(discordId: string, since: Date, until: Date, projectSlug?: string | null): Promise<TimeEntriesPayload> {
  const q = `discordId=${encodeURIComponent(discordId)}&since=${encodeURIComponent(since.toISOString())}&until=${encodeURIComponent(until.toISOString())}${projectParam(projectSlug)}`
  return apiCall<TimeEntriesPayload>(`/discord/time/entries?${q}`)
}

// GET /api/discord/projects/stats?since=&until=&project= — per-project,
// per-day series for the Stats tab. Every series is sparse and ascending;
// `since` null means all time. `timeScope` is 'self' when the caller lacks
// view_discord_time and `time` holds only their own rows.
export interface DayPoint { day: string; n: number }
export interface TimePoint { day: string; discordId: string; minutes: number }
export interface StaleTask { taskId: string; title: string; lastActivityAt: string | null }
export interface ProjectStats {
  id: string
  name: string
  docsSlug: string | null
  created: DayPoint[]
  completed: DayPoint[]
  events: DayPoint[]
  time: TimePoint[]
  stale: StaleTask[]
  cycleMinutes: number | null
}
export interface ProjectStatsPayload {
  since: string | null
  until: string
  project: string | null
  timeScope: 'all' | 'self'
  approximateCompletion: boolean
  projects: ProjectStats[]
}

export async function fetchProjectStats(since: Date | null, until: Date, projectSlug?: string | null): Promise<ProjectStatsPayload> {
  const parts = [`until=${encodeURIComponent(until.toISOString())}`]
  if (since) parts.push(`since=${encodeURIComponent(since.toISOString())}`)
  if (projectSlug) parts.push(`project=${encodeURIComponent(projectSlug)}`)
  return apiCall<ProjectStatsPayload>(`/discord/projects/stats?${parts.join('&')}`)
}

export interface SetTaskStatusResult {
  task: TaskRow
  warning: string
  unchanged: boolean
}

export async function setTaskStatus(taskId: string, status: string): Promise<SetTaskStatusResult> {
  return apiCall<SetTaskStatusResult>('/discord/tasks/status', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task_id: taskId, status }),
  })
}
