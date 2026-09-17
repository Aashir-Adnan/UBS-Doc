import { describe, it, expect } from 'vitest'
import { COLUMNS, columnOf, statusForColumn, groupByColumn, dropOutcome } from './boardLogic'
import type { TaskRow } from '../tasksLogic'

const t = (id: string, status: string): TaskRow => ({
  id, title: id, type: 'feature', status, implementationStatus: null,
  assignees: [], blockedBy: [], blocks: [], isBlocked: false,
  channelUrl: null, createdAt: '', updatedAt: '',
  description: null, scope: null, modules: [], createdBy: null,
  passedApiTests: null, passedQaTests: null, passedAcceptanceCriteria: null,
  projectId: null, projectName: null,
})

describe('COLUMNS', () => {
  it('is the four fixed columns in order', () => {
    expect(COLUMNS.map((c) => c.key)).toEqual(['open', 'pending', 'in_progress', 'done'])
    expect(COLUMNS.map((c) => c.status)).toEqual(['open', 'pending', 'in_progress', 'done'])
  })
})

describe('columnOf', () => {
  it('maps a terminal status other than "done" onto the Done column', () => {
    expect(columnOf('resolved')).toBe('done')
    expect(columnOf('closed')).toBe('done')
    expect(columnOf('done')).toBe('done')
  })
  it('maps the non-terminal statuses onto their own columns', () => {
    expect(columnOf('open')).toBe('open')
    expect(columnOf('pending')).toBe('pending')
    expect(columnOf('in_progress')).toBe('in_progress')
  })
})

describe('statusForColumn', () => {
  it('is the inverse of columnOf for the four column keys', () => {
    expect(statusForColumn('open')).toBe('open')
    expect(statusForColumn('pending')).toBe('pending')
    expect(statusForColumn('in_progress')).toBe('in_progress')
    expect(statusForColumn('done')).toBe('done')
  })
})

describe('groupByColumn', () => {
  it('keeps every task exactly once, in a column per its status, preserving order', () => {
    const tasks = [t('A', 'open'), t('B', 'resolved'), t('C', 'in_progress'), t('D', 'open')]
    const groups = groupByColumn(tasks)
    expect(groups.open.map((x) => x.id)).toEqual(['A', 'D'])
    expect(groups.pending.map((x) => x.id)).toEqual([])
    expect(groups.in_progress.map((x) => x.id)).toEqual(['C'])
    expect(groups.done.map((x) => x.id)).toEqual(['B'])
    const total = Object.values(groups).reduce((n, arr) => n + arr.length, 0)
    expect(total).toBe(tasks.length)
  })
  it('returns every column key even when empty', () => {
    const groups = groupByColumn([])
    expect(Object.keys(groups).sort()).toEqual(['done', 'in_progress', 'open', 'pending'])
  })
})

describe('dropOutcome', () => {
  it('is a no-op when dropped on its current column', () => {
    expect(dropOutcome(t('A', 'open'), 'open')).toEqual({ change: false })
    expect(dropOutcome(t('A', 'resolved'), 'done')).toEqual({ change: false })
  })
  it('reports the new status when dropped on a different column', () => {
    expect(dropOutcome(t('A', 'open'), 'in_progress')).toEqual({ change: true, status: 'in_progress' })
  })
  it('moving a terminal task to Done again is a no-op regardless of its exact terminal status', () => {
    expect(dropOutcome(t('A', 'closed'), 'done')).toEqual({ change: false })
  })
})
