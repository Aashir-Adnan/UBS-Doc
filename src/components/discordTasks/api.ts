import { mwGet } from '../meetingWorkflow/api'
import type { TasksPayload } from '../../screens/tasksLogic'

// Same transport as the meeting workflow: ${API_BASE_URL}/api + path, response
// unwrapped as payload.return ?? payload ?? data.
export function fetchDiscordTasks(): Promise<TasksPayload> {
  return mwGet('/discord/tasks') as Promise<TasksPayload>
}
