import { describe, it, expect } from 'vitest'
import type { RepoRef, TaskRow, TasksPayload } from '../tasksLogic'
import {
  formFromTask, diffChanges, validateForm, emptyCreateForm, validateCreateForm, createPayload,
  blockerCandidates, saveErrorText, createErrorText, scopeOptionsFor, bugIssueRepo, bugRepoHint,
} from './taskFormLogic'

const R1: RepoRef = { id: 'r1', name: 'Framework_Node', url: 'https://github.com/ubs-dev-org/Framework_Node' }

function task(over: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'T', title: 'Git Sync', type: 'feature', status: 'open', implementationStatus: 'not_started',
    assignees: [{ discordId: 'u1', name: 'Ana' }], blockedBy: [{ id: 'B', title: 'Blocker', status: 'open' }], blocks: [],
    isBlocked: true, channelUrl: null, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z',
    description: null, scope: 'backend', modules: [], createdBy: null,
    passedApiTests: null, passedQaTests: 3, passedAcceptanceCriteria: null,
    projectId: 'P1', projectName: 'Framework', estimateMinutes: 120,
    ...over,
  }
}

describe('formFromTask / diffChanges', () => {
  it('an untouched form sends nothing, even where the DB holds null', () => {
    const t = task()
    expect(diffChanges(t, formFromTask(t))).toEqual({})
    expect(formFromTask(t)).toMatchObject({ description: '', estimate: '2h', passedApiTests: '', passedQaTests: '3', holderIds: ['u1'], blockerIds: ['B'] })
  })
  it('sends exactly the changed fields in API names', () => {
    const t = task()
    const f = { ...formFromTask(t), title: ' Renamed ', description: 'Now described', status: 'in_progress', scope: '', projectId: '',
      implementationStatus: 'done', holderIds: ['u2', 'u1'], passedApiTests: '4', estimate: '8h 30m', blockerIds: [] }
    expect(diffChanges(t, f)).toEqual({
      title: 'Renamed', description: 'Now described', status: 'in_progress', scope: null, project_id: null,
      implementation_status: 'done', holder_ids: ['u2', 'u1'], passed_api_tests: 4, estimate: '8h 30m', blocker_ids: [],
    })
  })
  it('lists are compared as sets; whitespace-only text edits are not changes', () => {
    const t = task({ assignees: [{ discordId: 'u1', name: 'Ana' }, { discordId: 'u2', name: 'Bo' }] })
    const f = { ...formFromTask(t), holderIds: ['u2', 'u1'], title: 'Git Sync  ', description: '   ' }
    expect(diffChanges(t, f)).toEqual({})
  })
  it('a cleared estimate is sent as null; a cleared description as null', () => {
    const t = task({ description: 'old' })
    expect(diffChanges(t, { ...formFromTask(t), estimate: '', description: '' })).toEqual({ estimate: null, description: null })
  })
  it('an unset implementation status is left alone until one is picked', () => {
    const t = task({ implementationStatus: null })
    expect(formFromTask(t).implementationStatus).toBe('')
    expect(diffChanges(t, formFromTask(t))).toEqual({})
  })
})

describe('validateForm', () => {
  it('title required and capped; description capped', () => {
    const t = task()
    expect(validateForm(t, { ...formFromTask(t), title: '  ' })).toBe('A task needs a title.')
    expect(validateForm(t, { ...formFromTask(t), title: 'x'.repeat(201) })).toBe('The title can be at most 200 characters.')
    expect(validateForm(t, { ...formFromTask(t), description: 'x'.repeat(2001) })).toBe('The description can be at most 2000 characters.')
  })
  it('test counts: 0 to 127, and a set count cannot be cleared', () => {
    const t = task()
    expect(validateForm(t, { ...formFromTask(t), passedApiTests: '128' })).toBe('Test counts must be whole numbers from 0 to 127.')
    expect(validateForm(t, { ...formFromTask(t), passedApiTests: '1.5' })).toBe('Test counts must be whole numbers from 0 to 127.')
    expect(validateForm(t, { ...formFromTask(t), passedQaTests: '' })).toBe('A test count cannot be cleared. Enter a number from 0 to 127.')
    expect(validateForm(t, { ...formFromTask(t), passedApiTests: '' })).toBeNull()
    expect(validateForm(t, formFromTask(t))).toBeNull()
  })
})

describe('create form', () => {
  const NO_REPO_MESSAGE = 'This project has no repository — add one in Discord with /repos add.'
  const R2: RepoRef = { id: 'r2', name: 'Framework_React', url: 'https://github.com/ubs-dev-org/Framework_React' }

  it('validates title and project', () => {
    expect(validateCreateForm({ ...emptyCreateForm('P1'), title: '' }, null)).toBe('A task needs a title.')
    expect(validateCreateForm({ ...emptyCreateForm(''), title: 'x' }, null)).toBe('Pick a project for the task.')
    expect(validateCreateForm({ ...emptyCreateForm('P1'), title: 'x' }, null)).toBeNull()
  })
  it('refuses a bug only when there is no repository at all to pick, with the exact sentence', () => {
    expect(validateCreateForm({ ...emptyCreateForm('P1'), title: 'x', type: 'bug' }, null)).toBe(NO_REPO_MESSAGE)
    expect(validateCreateForm({ ...emptyCreateForm('P1'), title: 'x', type: 'bug' }, null, [])).toBe(NO_REPO_MESSAGE)
    expect(validateCreateForm({ ...emptyCreateForm('P1'), title: 'x', type: 'bug' }, R1)).toBeNull()
  })

  // F5 (final review, 2026-09-30; spec §5): the bug fallback picker.
  it('a bug the rule gives no repository must pick one of the choices', () => {
    const bug = { ...emptyCreateForm('P1'), title: 'x', type: 'bug' as const }
    expect(validateCreateForm(bug, null, [R1, R2])).toBe('Pick a repository for the bug.')
    expect(validateCreateForm({ ...bug, repoPick: 'gone' }, null, [R1, R2])).toBe('Pick a repository for the bug.')
    expect(validateCreateForm({ ...bug, repoPick: 'r2' }, null, [R1, R2])).toBeNull()
  })
  it('the pick is ignored when the rule resolves a repository', () => {
    const bug = { ...emptyCreateForm('P1'), title: 'x', type: 'bug' as const, repoPick: 'r2' }
    expect(validateCreateForm(bug, R1, [R1, R2])).toBeNull()
    expect(createPayload(bug, R1, [R1, R2])).toMatchObject({ repository_ids: [], create_issue: true })
    expect(bugIssueRepo(bug, R1, [R1, R2])).toEqual(R1)
  })
  it('the payload carries the pick as repository_ids for a bug the rule gives none', () => {
    const bug = { ...emptyCreateForm('P1'), title: 'x', type: 'bug' as const, repoPick: 'r2' }
    expect(createPayload(bug, null, [R1, R2])).toMatchObject({ type: 'bug', repository_ids: ['r2'], create_issue: true })
    expect(createPayload({ ...bug, createIssue: false }, null, [R1, R2])).toMatchObject({ repository_ids: ['r2'], create_issue: false })
    expect(bugIssueRepo(bug, null, [R1, R2])).toEqual(R2)
  })
  it('a pick that is not among the choices is never sent', () => {
    const bug = { ...emptyCreateForm('P1'), title: 'x', type: 'bug' as const, repoPick: 'gone' }
    expect(createPayload(bug, null, [R1, R2])).toMatchObject({ repository_ids: [], create_issue: false })
    expect(bugIssueRepo(bug, null, [R1, R2])).toBeNull()
  })
  it('a feature never sends a pick', () => {
    const feature = { ...emptyCreateForm('P1'), title: 'x', repoPick: 'r2' }
    expect(createPayload(feature, null, [R1, R2])).toMatchObject({ repository_ids: [], create_issue: false })
    expect(bugIssueRepo(feature, null, [R1, R2])).toBeNull()
  })
  it('defaults the pick to empty', () => {
    expect(emptyCreateForm('P1').repoPick).toBe('')
  })
  it('hints at the scope only for a scope-less bug in a project with several links', () => {
    const HINT = 'Pick a scope to choose the repository automatically, or pick one below.'
    const bug = { ...emptyCreateForm('P1'), title: 'x', type: 'bug' as const }
    expect(bugRepoHint(bug, null, 2)).toBe(HINT)
    expect(bugRepoHint(bug, null, 1)).toBeNull()
    expect(bugRepoHint(bug, null, 0)).toBeNull()
    expect(bugRepoHint({ ...bug, scope: 'design' }, null, 2)).toBeNull()
    expect(bugRepoHint(bug, R1, 2)).toBeNull()
    expect(bugRepoHint({ ...bug, type: 'feature' }, null, 2)).toBeNull()
  })
  it('allows a feature with no resolvable repository', () => {
    expect(validateCreateForm({ ...emptyCreateForm('P1'), title: 'x', type: 'feature' }, null)).toBeNull()
  })
  it('defaults createIssue to on', () => {
    expect(emptyCreateForm('P1').createIssue).toBe(true)
  })
  it('builds the payload: modules split and deduped for a feature, dropped for a bug; empty repository_ids always', () => {
    const f = { ...emptyCreateForm('P1'), title: ' Sync ', description: '  ', scope: 'qa', modules: 'auth, billing , auth,, ',
      holderIds: ['u1'], tracksApi: true }
    expect(createPayload(f, R1)).toEqual({
      type: 'feature', title: 'Sync', description: null, project_id: 'P1', scope: 'qa', modules: ['auth', 'billing'],
      holder_ids: ['u1'], repository_ids: [], create_issue: true, tracks: { api_tests: true, qa_tests: false, acceptance_criteria: false },
    })
    expect(createPayload({ ...f, type: 'bug' }, R1)).toMatchObject({ type: 'bug', modules: [], repository_ids: [], create_issue: true })
  })
  it('a feature with no repository is sent with create_issue false, even if the checkbox was left on', () => {
    expect(createPayload({ ...emptyCreateForm('P1'), title: 'x' }, null)).toMatchObject({ repository_ids: [], create_issue: false })
  })
  it('create_issue off is honoured when a repository is resolved', () => {
    expect(createPayload({ ...emptyCreateForm('P1'), title: 'x', createIssue: false }, R1)).toMatchObject({ create_issue: false })
  })
})

describe('blockerCandidates', () => {
  it('every other task, grouped by project, without self or the ones already chosen', () => {
    const payload = {
      generatedAt: '', members: [],
      projects: [
        { id: 'P2', name: 'Zeta', docsSlug: null, members: [], counts: { open: 0, in_progress: 0, pending: 0, done: 0, blocked: 0 }, tasks: [task({ id: 'Z1', title: 'Zed' })] },
        { id: 'P1', name: 'Alpha', docsSlug: null, members: [], counts: { open: 0, in_progress: 0, pending: 0, done: 0, blocked: 0 }, tasks: [task({ id: 'T' }), task({ id: 'B', title: 'Blocker' }), task({ id: 'C', title: 'Chain', status: 'done' })] },
      ],
    } as TasksPayload
    expect(blockerCandidates(payload, 'T', ['B'])).toEqual([
      { project: 'Alpha', tasks: [{ id: 'C', title: 'Chain', status: 'done' }] },
      { project: 'Zeta', tasks: [{ id: 'Z1', title: 'Zed', status: 'open' }] },
    ])
  })
})

describe('saveErrorText', () => {
  it('status first, then the sentence', () => {
    expect(saveErrorText({ status: 403, message: "Permission 'update_discord_tasks' is required for this action" })).toBe('You need the update_discord_tasks permission to change tasks. Ask an admin.')
    expect(saveErrorText({ status: 403, message: '' })).toBe('You need the update_discord_tasks permission to change tasks. Ask an admin.')
    // A 403 that is not about the permission shows CSAAS's own sentence (identity link, project scoping).
    expect(saveErrorText({ status: 403, message: 'Link your Discord account to change tasks.' })).toBe('Link your Discord account to change tasks.')
    expect(saveErrorText({ status: 403, message: 'You can only change tasks in projects you are part of.' })).toBe('You can only change tasks in projects you are part of.')
    expect(saveErrorText({ status: 404, message: 'Task not found' })).toBe('This task no longer exists. Refresh the page.')
    expect(saveErrorText({ status: 502, message: 'Discord bot rejected the request (configuration)' })).toBe('Discord bot link is misconfigured. Tell an admin.')
    expect(saveErrorText({ status: 502, message: 'Discord bot is not reachable' })).toBe('Discord bot is offline, try again.')
    expect(saveErrorText({ message: 'Failed to fetch' })).toBe('Discord bot is offline, try again.')
    expect(saveErrorText({ status: 409, message: "**Git Sync** can't be marked done yet — 1 subtask is still open:\n• Tests" })).toBe("Git Sync can't be marked done yet — 1 subtask is still open: Tests")
    expect(saveErrorText({ status: 400, message: 'Member …u9 is not a member of this Discord server.' })).toBe('Member …u9 is not a member of this Discord server.')
    expect(saveErrorText({})).toBe('Could not save. Try again.')
  })
})

describe('createErrorText', () => {
  const MAYBE_CREATED = 'The Discord bot did not answer in time. The task may already have been created — check the Tasks list before trying again.'

  it('a 502 timeout says the task may already exist, not "try again"', () => {
    expect(createErrorText({ status: 502, message: 'Discord bot is not reachable' })).toBe(MAYBE_CREATED)
  })
  it('a network failure (no status) says the same thing', () => {
    expect(createErrorText({ message: 'Failed to fetch' })).toBe(MAYBE_CREATED)
  })
  it('the bot\'s own "server not available" 502 also says the task may already exist', () => {
    expect(createErrorText({ status: 502, message: 'The Discord server is not available to the bot right now.' })).toBe(MAYBE_CREATED)
  })
  it('a 400 bot rejection sentence passes through unchanged', () => {
    expect(createErrorText({ status: 400, message: 'Member …u9 is not a member of this Discord server.' })).toBe('Member …u9 is not a member of this Discord server.')
  })
  it('403 passes through exactly as saveErrorText phrases it', () => {
    expect(createErrorText({ status: 403, message: "Permission 'update_discord_tasks' is required for this action" })).toBe('You need the update_discord_tasks permission to change tasks. Ask an admin.')
    expect(createErrorText({ status: 403, message: 'You can only change tasks in projects you are part of.' })).toBe('You can only change tasks in projects you are part of.')
  })
  it('a misconfiguration sentence passes through unchanged (raised before any write)', () => {
    expect(createErrorText({ status: 502, message: 'Discord bot rejected the request (configuration)' })).toBe('Discord bot link is misconfigured. Tell an admin.')
  })
})

describe('scopeOptionsFor', () => {
  it('keeps a legacy free-text scope selectable so an untouched save does not erase it', () => {
    expect(scopeOptionsFor('backend').map((o) => o.value)).toEqual(['', 'backend', 'frontend', 'mobile', 'qa', 'design'])
    expect(scopeOptionsFor('GitSync').map((o) => o.value)).toEqual(['', 'backend', 'frontend', 'mobile', 'qa', 'design', 'GitSync'])
  })
})
