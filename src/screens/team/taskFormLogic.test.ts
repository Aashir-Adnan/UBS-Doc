import { describe, it, expect } from 'vitest'
import type { TaskRow, TasksPayload } from '../tasksLogic'
import {
  formFromTask, diffChanges, validateForm, emptyCreateForm, validateCreateForm, createPayload,
  blockerCandidates, saveErrorText, scopeOptionsFor,
} from './taskFormLogic'

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
  it('validates title, project and the bug repository limit', () => {
    expect(validateCreateForm({ ...emptyCreateForm('P1'), title: '' })).toBe('A task needs a title.')
    expect(validateCreateForm({ ...emptyCreateForm(''), title: 'x' })).toBe('Pick a project for the task.')
    expect(validateCreateForm({ ...emptyCreateForm('P1'), title: 'x', type: 'bug', repositoryIds: ['R1', 'R2'] })).toBe('A bug can name one repository.')
    expect(validateCreateForm({ ...emptyCreateForm('P1'), title: 'x' })).toBeNull()
  })
  it('builds the payload: modules split and deduped for a feature, dropped for a bug', () => {
    const f = { ...emptyCreateForm('P1'), title: ' Sync ', description: '  ', scope: 'qa', modules: 'auth, billing , auth,, ',
      holderIds: ['u1'], repositoryIds: ['R1', 'R2'], tracksApi: true }
    expect(createPayload(f)).toEqual({
      type: 'feature', title: 'Sync', description: null, project_id: 'P1', scope: 'qa', modules: ['auth', 'billing'],
      holder_ids: ['u1'], repository_ids: ['R1', 'R2'], tracks: { api_tests: true, qa_tests: false, acceptance_criteria: false },
    })
    expect(createPayload({ ...f, type: 'bug' })).toMatchObject({ type: 'bug', modules: [], repository_ids: ['R1'] })
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
    expect(saveErrorText({ status: 403, message: 'x' })).toBe('You need the update_discord_tasks permission to change tasks. Ask an admin.')
    expect(saveErrorText({ status: 404, message: 'Task not found' })).toBe('This task no longer exists. Refresh the page.')
    expect(saveErrorText({ status: 502, message: 'Discord bot rejected the request (configuration)' })).toBe('Discord bot link is misconfigured. Tell an admin.')
    expect(saveErrorText({ status: 502, message: 'Discord bot is not reachable' })).toBe('Discord bot is offline, try again.')
    expect(saveErrorText({ message: 'Failed to fetch' })).toBe('Discord bot is offline, try again.')
    expect(saveErrorText({ status: 409, message: "**Git Sync** can't be marked done yet — 1 subtask is still open:\n• Tests" })).toBe("Git Sync can't be marked done yet — 1 subtask is still open: Tests")
    expect(saveErrorText({ status: 400, message: 'u9 is not a member of this Discord server.' })).toBe('u9 is not a member of this Discord server.')
    expect(saveErrorText({})).toBe('Could not save. Try again.')
  })
})

describe('scopeOptionsFor', () => {
  it('keeps a legacy free-text scope selectable so an untouched save does not erase it', () => {
    expect(scopeOptionsFor('backend').map((o) => o.value)).toEqual(['', 'backend', 'frontend', 'qa', 'design'])
    expect(scopeOptionsFor('GitSync').map((o) => o.value)).toEqual(['', 'backend', 'frontend', 'qa', 'design', 'GitSync'])
  })
})
