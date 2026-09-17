import { mwGet } from '../meetingWorkflow/api'
import { API_BASE_URL } from '../portal/config'
import type { TaskRow, TasksPayload } from '../../screens/tasksLogic'

// Same transport as the meeting workflow: ${API_BASE_URL}/api + path, response
// unwrapped as payload.return ?? payload ?? data.
export function fetchDiscordTasks(): Promise<TasksPayload> {
  return mwGet('/discord/tasks') as Promise<TasksPayload>
}

// mwPost() throws `data.error || text`, but CSAAS error bodies for this route
// carry `message` (see DiscordTasksStatus_object), which would otherwise show
// the caller raw JSON. setTaskStatus does its own fetch so it can read
// `message` first and carry the HTTP status for the Board's toast logic
// (403 -> permission sentence, 502 -> "bot is offline", etc.).
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface SetTaskStatusResult {
  task: TaskRow
  warning: string
  unchanged: boolean
}

export async function setTaskStatus(taskId: string, status: string): Promise<SetTaskStatusResult> {
  const res = await fetch(`${API_BASE_URL}/api/discord/tasks/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task_id: taskId, status }),
  })
  const text = await res.text()
  let data: Record<string, unknown> = {}
  if (text) {
    try { data = JSON.parse(text) } catch { data = {} }
  }
  if (!res.ok) {
    // CSAAS error bodies are { status, message, payload, source, scc }: `message`
    // is generic catalogue text ("You do not have permission…") while `payload`
    // carries the sentence that names the actual problem ("Permission
    // 'update_discord_tasks' is required for this action"). Prefer the specific
    // one; on success `payload` is an object, so the string check is the tell.
    const specific = typeof data.payload === 'string' && data.payload ? data.payload : ''
    const message = specific || (data.message as string) || (data.error as string) || res.statusText
    throw new ApiError(message, res.status)
  }
  const payload = data.payload as { return?: unknown } | undefined
  return (payload?.return ?? payload ?? data) as SetTaskStatusResult
}
