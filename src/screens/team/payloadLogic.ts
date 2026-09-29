import type { TasksPayload } from '../tasksLogic'

// Shape of whatever GET /api/discord/tasks actually returns, before we trust
// it. `fetchDiscordTasks` casts the response to `TasksPayload` at the call
// site (`components/discordTasks/api.ts`) — that's a type assertion, not a
// runtime guarantee — so every field here is `unknown` until normalized.
type RawPayload = {
  generatedAt?: unknown
  projects?: unknown
  members?: unknown
  repositories?: unknown
  projectRepos?: unknown
  viewer?: unknown
} | null | undefined

// Turns a raw /discord/tasks response into a TasksPayload the rest of the
// Team section can trust. Defensive on every field: an older backend has
// never heard of `repositories`, `projectRepos` or `viewer` and omits them
// entirely (`repositories`/`viewer` must come back `undefined`, not `[]`/a
// fake viewer; `projectRepos` comes back `[]` — a project with no repository
// links reads the same whether the backend sent an empty list or none at
// all), and garbage input (null, a string, an unrelated object) must still
// yield empty lists rather than throwing.
export function normalizePayload(data: unknown): TasksPayload {
  const d = data as RawPayload
  return {
    generatedAt: (d?.generatedAt as string | undefined) ?? '',
    projects: Array.isArray(d?.projects) ? (d.projects as TasksPayload['projects']) : [],
    members: Array.isArray(d?.members) ? (d.members as TasksPayload['members']) : [],
    repositories: Array.isArray(d?.repositories) ? (d.repositories as NonNullable<TasksPayload['repositories']>) : undefined,
    projectRepos: Array.isArray(d?.projectRepos) ? (d.projectRepos as NonNullable<TasksPayload['projectRepos']>) : [],
    viewer: d?.viewer && typeof d.viewer === 'object' ? (d.viewer as TasksPayload['viewer']) : undefined,
  }
}
