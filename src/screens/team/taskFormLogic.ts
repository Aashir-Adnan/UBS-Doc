import type { RepoRef, TaskRow, TasksPayload } from '../tasksLogic'
import type { CreateTaskInput, TaskChanges } from '../../components/discordTasks/api'
import { formatDuration } from './timeLogic'
import { plainRuleMessage } from './boardLogic'

// The edit and create forms' pure half. The Discord bot is the authority on every
// value (utils/taskEditRules.js); these checks only give instant feedback and
// make sure an untouched field is never sent — an unchanged save must write
// nothing, post nothing and log nothing in Discord.

export const TITLE_MAX = 200
export const DESCRIPTION_MAX = 2000
export const MAX_TEST_COUNT = 127

export const STATUS_OPTIONS = ['open', 'pending', 'in_progress', 'resolved', 'closed', 'done'] as const
export const SCOPE_OPTIONS = [
  { value: 'backend', label: 'Backend' },
  { value: 'frontend', label: 'Frontend' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'qa', label: 'QA' },
  { value: 'design', label: 'Design' },
]
export const IMPLEMENTATION_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
]

export interface EditForm {
  title: string
  description: string
  status: string
  scope: string
  implementationStatus: string
  projectId: string
  holderIds: string[]
  passedApiTests: string
  passedQaTests: string
  passedAcceptanceCriteria: string
  estimate: string
  blockerIds: string[]
}

const COUNT_FIELDS = [
  ['passedApiTests', 'passed_api_tests'],
  ['passedQaTests', 'passed_qa_tests'],
  ['passedAcceptanceCriteria', 'passed_acceptance_criteria'],
] as const

const countText = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

export function formFromTask(task: TaskRow): EditForm {
  return {
    title: task.title ?? '',
    description: task.description ?? '',
    status: task.status,
    scope: task.scope ?? '',
    implementationStatus: task.implementationStatus ?? '',
    projectId: task.projectId ?? '',
    holderIds: task.assignees.map((a) => a.discordId),
    passedApiTests: countText(task.passedApiTests),
    passedQaTests: countText(task.passedQaTests),
    passedAcceptanceCriteria: countText(task.passedAcceptanceCriteria),
    estimate: formatDuration(task.estimateMinutes ?? null) ?? '',
    blockerIds: task.blockedBy.map((b) => b.id),
  }
}

/** Only what differs from the task as loaded, in the API's field names. */
export function diffChanges(task: TaskRow, form: EditForm): TaskChanges {
  const base = formFromTask(task)
  const out: TaskChanges = {}
  const title = form.title.trim()
  if (title !== base.title.trim()) out.title = title
  const description = form.description.trim()
  if (description !== base.description.trim()) out.description = description || null
  if (form.status !== base.status) out.status = form.status
  if (form.scope !== base.scope) out.scope = form.scope || null
  if (form.implementationStatus && form.implementationStatus !== base.implementationStatus) out.implementation_status = form.implementationStatus
  if (form.projectId !== base.projectId) out.project_id = form.projectId || null
  if (!sameSet(form.holderIds, base.holderIds)) out.holder_ids = [...form.holderIds]
  for (const [key, apiKey] of COUNT_FIELDS) {
    const v = form[key].trim()
    if (v !== '' && v !== base[key]) out[apiKey] = Number(v)
  }
  const estimate = form.estimate.trim()
  if (estimate !== base.estimate) out.estimate = estimate || null
  if (!sameSet(form.blockerIds, base.blockerIds)) out.blocker_ids = [...form.blockerIds]
  return out
}

export function validateForm(task: TaskRow, form: EditForm): string | null {
  const base = formFromTask(task)
  if (!form.title.trim()) return 'A task needs a title.'
  if (form.title.trim().length > TITLE_MAX) return `The title can be at most ${TITLE_MAX} characters.`
  if (form.description.trim().length > DESCRIPTION_MAX) return `The description can be at most ${DESCRIPTION_MAX} characters.`
  for (const [key] of COUNT_FIELDS) {
    const v = form[key].trim()
    // Discord cannot put a tracked count back to "not tracked" either.
    if (v === '' && base[key] !== '') return `A test count cannot be cleared. Enter a number from 0 to ${MAX_TEST_COUNT}.`
    if (v !== '' && (!/^\d{1,3}$/.test(v) || Number(v) > MAX_TEST_COUNT)) return `Test counts must be whole numbers from 0 to ${MAX_TEST_COUNT}.`
  }
  return null
}

/** The scope select's options: "none", the four, and a legacy free-text value when the task still holds one. */
export function scopeOptionsFor(current: string): { value: string; label: string }[] {
  const opts = [{ value: '', label: 'None' }, ...SCOPE_OPTIONS]
  if (current && !SCOPE_OPTIONS.some((o) => o.value === current)) opts.push({ value: current, label: `${current} (old)` })
  return opts
}

// A bug never needs a repository. The rule (project + scope) picks one when it
// can; otherwise, when the project has linked repositories, the create page
// shows an OPTIONAL picker listing `bugRepoChoices` (repoLogic.ts) whose first
// option is "No repository", and a pick is sent as `repository_ids[0]`. A bug
// with no repository gets no GitHub issue.
export const NO_REPO_OPTION = { value: '', label: 'No repository' }
export const OPTIONAL_REPO_HELP = 'The repository is optional. Without one, no GitHub issue is opened.'
export const PICK_SCOPE_HINT = 'Pick a scope to choose the repository automatically, or pick one below.'

export interface CreateForm {
  type: 'feature' | 'bug'
  title: string
  description: string
  projectId: string
  scope: string
  modules: string // comma-separated, as typed
  holderIds: string[]
  // The "Open a GitHub issue" checkbox. Default on; the create page disables
  // and unchecks it when resolveTaskRepo finds no repository for the project/scope.
  createIssue: boolean
  // The optional bug repository picker's id ('' = No repository). Used only for
  // a bug the rule gives no repository; ignored otherwise.
  repoPick: string
  tracksApi: boolean
  tracksQa: boolean
  tracksAc: boolean
}

export function emptyCreateForm(projectId = ''): CreateForm {
  return { type: 'feature', title: '', description: '', projectId, scope: '', modules: '', holderIds: [], createIssue: true, repoPick: '', tracksApi: false, tracksQa: false, tracksAc: false }
}

/** The picked repository, when the form is a bug the rule gives none and the pick is one of `choices`. */
function pickedFallback(f: CreateForm, resolvedRepo: RepoRef | null, choices: RepoRef[]): RepoRef | null {
  if (f.type !== 'bug' || resolvedRepo || !f.repoPick) return null
  return choices.find((r) => String(r.id) === f.repoPick) ?? null
}

/** Where this task's GitHub issue would go: the rule's repository, else (a bug only) the fallback pick. */
export function bugIssueRepo(f: CreateForm, resolvedRepo: RepoRef | null, choices: RepoRef[] = []): RepoRef | null {
  return resolvedRepo ?? pickedFallback(f, resolvedRepo, choices)
}

/** Whether the create page shows the optional repository picker: a bug in a project, the rule found none, and the project has linked repositories to offer. */
export function showsBugRepoPicker(f: CreateForm, resolvedRepo: RepoRef | null, choices: RepoRef[]): boolean {
  return f.type === 'bug' && !!f.projectId && !resolvedRepo && choices.length > 0
}

/**
 * The line above the optional picker: a scope-less bug in a project with
 * several links could have been routed by the rule had it a scope.
 * `projectLinkCount` is the project's usable links (`projectRepoList(...).length`).
 */
export function bugRepoHint(f: CreateForm, resolvedRepo: RepoRef | null, projectLinkCount: number): string | null {
  if (f.type !== 'bug' || resolvedRepo || f.scope) return null
  return projectLinkCount > 1 ? PICK_SCOPE_HINT : null
}

/**
 * `resolvedRepo` is what `resolveTaskRepo` (repoLogic.ts) found for the
 * form's current project + scope, and `choices` the optional picker's
 * options (`bugRepoChoices`). A bug is never refused for lack of a repository,
 * so neither changes the verdict; they stay in the signature so the create
 * page calls the form logic the same way for every check.
 */
export function validateCreateForm(f: CreateForm, _resolvedRepo: RepoRef | null, _choices: RepoRef[] = []): string | null {
  if (!f.title.trim()) return 'A task needs a title.'
  if (f.title.trim().length > TITLE_MAX) return `The title can be at most ${TITLE_MAX} characters.`
  if (f.description.trim().length > DESCRIPTION_MAX) return `The description can be at most ${DESCRIPTION_MAX} characters.`
  if (!f.projectId) return 'Pick a project for the task.'
  return null
}

export function createPayload(f: CreateForm, resolvedRepo: RepoRef | null, choices: RepoRef[] = []): CreateTaskInput {
  const isBug = f.type === 'bug'
  const picked = pickedFallback(f, resolvedRepo, choices)
  return {
    type: f.type,
    title: f.title.trim(),
    description: f.description.trim() || null,
    project_id: f.projectId,
    scope: f.scope || null,
    modules: isBug ? [] : [...new Set(f.modules.split(',').map((m) => m.trim()).filter(Boolean))],
    holder_ids: [...f.holderIds],
    // The bot applies the same repository rule itself from project + scope;
    // the site sends a repository only for a bug's optional pick.
    repository_ids: picked ? [picked.id] : [],
    create_issue: !!(resolvedRepo ?? picked) && f.createIssue,
    tracks: { api_tests: f.tracksApi, qa_tests: f.tracksQa, acceptance_criteria: f.tracksAc },
  }
}

export interface BlockerGroup { project: string; tasks: { id: string; title: string; status: string }[] }

/** Tasks that can be added as blockers: every other task not already chosen, grouped by project name. */
export function blockerCandidates(payload: TasksPayload, selfId: string, chosen: string[]): BlockerGroup[] {
  return payload.projects
    .map((p) => ({
      project: p.name,
      tasks: p.tasks
        .filter((t) => t.id !== selfId && !chosen.includes(t.id))
        .map((t) => ({ id: t.id, title: t.title, status: t.status }))
        .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })),
    }))
    .filter((g) => g.tasks.length > 0)
    .sort((a, b) => a.project.localeCompare(b.project, undefined, { sensitivity: 'base' }))
}

/** The sentence to show when a save, create or add-subtask call rejects. Status first, like the board's toast. */
export function saveErrorText(err: { status?: number; message?: string }): string {
  const status = err?.status
  const message = (err?.message ?? '').trim()
  // Not every 403 is the permission (identity link, project scoping): show CSAAS's own
  // sentence unless the refusal is about the permission or says nothing.
  if (status === 403) {
    const permission = 'You need the update_discord_tasks permission to change tasks. Ask an admin.'
    return !message || /permission/i.test(message) ? permission : plainRuleMessage(message) || permission
  }
  if (status === 404) return 'This task no longer exists. Refresh the page.'
  // The three configuration failures arrive as 502/503 like "unreachable"; retrying does not fix them.
  if (/not configured|rejected the request|unreadable reply/i.test(message)) return 'Discord bot link is misconfigured. Tell an admin.'
  if (status === 502 || status === 503) return 'Discord bot is offline, try again.'
  if (/not reachable|failed to fetch|networkerror|load failed/i.test(message)) return 'Discord bot is offline, try again.'
  return plainRuleMessage(message) || 'Could not save. Try again.'
}

/**
 * The sentence for a failed *create*. A create writes the task row before it
 * makes the Discord channel (and, for a bug, opens a GitHub issue) — so unlike
 * an edit, a timeout or a 502 here does not mean nothing happened. Retrying on
 * "try again" would make a duplicate row, channel and issue, so those cases get
 * their own sentence pointing at the Tasks list instead. Everything else
 * (a real 400/403/409 rejection, or one of the three misconfiguration
 * sentences) is unambiguous and passes through exactly as saveErrorText phrases it.
 */
export function createMayHaveSucceeded(err: { status?: number; message?: string }): boolean {
  const status = err?.status
  const message = (err?.message ?? '').trim()
  if (status === 403 || status === 400 || status === 409) return false
  // The three configuration sentences (see saveErrorText) are unambiguous too: they are
  // raised before any write is attempted, so "try again" is correct, not misleading.
  if (/not configured|rejected the request|unreadable reply/i.test(message)) return false
  return status === 502 || status === 503 ||
    /not reachable|failed to fetch|networkerror|load failed/i.test(message) ||
    (typeof status === 'number' && status >= 500)
}

export const CREATE_MAYBE_CREATED_TEXT =
  'The Discord bot did not answer in time. The task may already have been created — check the Tasks list before trying again.'

export function createErrorText(err: { status?: number; message?: string }): string {
  if (createMayHaveSucceeded(err)) return CREATE_MAYBE_CREATED_TEXT
  return saveErrorText(err)
}

/** The projects a task can be created in (those with an id): the create form's and the import screen's project list. */
export function projectChoices(projects: TasksPayload['projects']): (TasksPayload['projects'][number] & { id: string })[] {
  return projects.filter((p): p is typeof p & { id: string } => p.id !== null)
}
