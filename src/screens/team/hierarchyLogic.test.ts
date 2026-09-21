import { describe, it, expect } from 'vitest'
import {
  isSubtask, topLevel, openSubtasks, progressText, progressPercent, nextSubtaskStatus, finishBlockedReason, groupHierarchy,
} from './hierarchyLogic'
import type { TaskRow, TaskSubtask } from '../tasksLogic'

const sub = (id: string, status: string): TaskSubtask => ({ id, title: `Sub ${id}`, status, assignees: [] })
const task = (id: string, extra: Partial<TaskRow> = {}): TaskRow => ({
  id, title: id, type: 'feature', status: 'open', implementationStatus: null,
  assignees: [], blockedBy: [], blocks: [], isBlocked: false,
  channelUrl: null, createdAt: '', updatedAt: '',
  description: null, scope: null, modules: [], createdBy: null,
  passedApiTests: null, passedQaTests: null, passedAcceptanceCriteria: null,
  projectId: null, projectName: null,
  ...extra,
})

describe('progress', () => {
  it('reads "done/total" and a percentage, and nothing without subtasks', () => {
    const t = task('P', { subtaskProgress: { done: 3, total: 5 } })
    expect(progressText(t)).toBe('3/5')
    expect(progressPercent(t)).toBe(60)
    expect(progressText(task('X'))).toBeNull()
    expect(progressText(task('X', { subtaskProgress: { done: 0, total: 0 } }))).toBeNull()
    expect(progressPercent(task('X'))).toBe(0)
  })
})

describe('the finish rule', () => {
  it('lists open subtasks, treating done, closed and resolved as finished', () => {
    const t = task('P', { subtasks: [sub('a', 'done'), sub('b', 'open'), sub('c', 'closed'), sub('d', 'in_progress'), sub('e', 'resolved')] })
    expect(openSubtasks(t).map((s) => s.id)).toEqual(['b', 'd'])
    expect(finishBlockedReason(t)).toBe('Finish its subtasks first (2 open: Sub b, Sub d).')
  })
  it('names at most three', () => {
    const t = task('P', { subtasks: ['a', 'b', 'c', 'd', 'e'].map((i) => sub(i, 'open')) })
    expect(finishBlockedReason(t)).toBe('Finish its subtasks first (5 open: Sub a, Sub b, Sub c, …).')
  })
  it('is null with no subtasks or when all are finished', () => {
    expect(finishBlockedReason(task('P'))).toBeNull()
    expect(finishBlockedReason(task('P', { subtasks: [sub('a', 'done')] }))).toBeNull()
  })
})

describe('the checklist toggle', () => {
  it('finishes an open subtask and reopens a finished one', () => {
    expect(nextSubtaskStatus(sub('a', 'open'))).toBe('done')
    expect(nextSubtaskStatus(sub('a', 'in_progress'))).toBe('done')
    expect(nextSubtaskStatus(sub('a', 'done'))).toBe('open')
    expect(nextSubtaskStatus(sub('a', 'resolved'))).toBe('open')
  })
})

describe('topLevel / isSubtask', () => {
  it('drops the tasks that have a parent', () => {
    const rows = [task('P'), task('S', { parent: { id: 'P', title: 'P' } }), task('X')]
    expect(topLevel(rows).map((t) => t.id)).toEqual(['P', 'X'])
    expect(isSubtask(rows[1])).toBe(true)
    expect(isSubtask(rows[0])).toBe(false)
  })
})

describe('groupHierarchy', () => {
  const P = task('P', { subtasks: [sub('S2', 'open'), sub('S1', 'done')] })
  const S1 = task('S1', { parent: { id: 'P', title: 'P' } })
  const S2 = task('S2', { parent: { id: 'P', title: 'P' } })
  it('nests subtasks under their parent, in the parent\'s order', () => {
    const g = groupHierarchy([P, S1, task('X'), S2])
    expect(g.map((x) => x.task.id)).toEqual(['P', 'X'])
    expect(g[0].children.map((c) => c.id)).toEqual(['S2', 'S1'])
    expect(g[1].children).toEqual([])
  })
  it('keeps a subtask whose parent is not in the list as a top-level row', () => {
    const g = groupHierarchy([S1, task('X')])
    expect(g.map((x) => x.task.id)).toEqual(['S1', 'X'])
  })
  it('never loses a task: every input appears exactly once', () => {
    const input = [S2, P, S1, task('X')]
    const g = groupHierarchy(input)
    const ids = g.flatMap((x) => [x.task.id, ...x.children.map((c) => c.id)]).sort()
    expect(ids).toEqual(input.map((t) => t.id).sort())
  })
})
