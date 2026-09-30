import { describe, it, expect } from 'vitest'
import { clockedInTaskLabel, isClockUnavailable, formatElapsed, elapsedNow, clockTaskChoices, taskClockAction, clockOutcomeText, clockOutText } from './clockLogic'
import type { ClockStatus, ClockInResult } from '../../components/discordTasks/api'
import type { ProjectGroup, TaskRow } from '../tasksLogic'

const active = (over: Partial<Extract<ClockStatus, { active: true }>> = {}): ClockStatus => ({
  active: true, entryId: 'e1', taskId: 't1', taskTitle: 'Fix login', projectName: 'Portal',
  clockInAt: '2026-09-30T08:00:00.000Z', elapsedSeconds: 600, ...over,
})
const off: ClockStatus = { active: false }

const task = (id: string, title: string, status = 'open'): TaskRow => ({ id, title, status } as TaskRow)
const group = (name: string, tasks: TaskRow[]): ProjectGroup => ({
  id: name, name, docsSlug: null, members: [],
  counts: { open: 0, in_progress: 0, pending: 0, done: 0, blocked: 0 }, tasks,
})

describe('formatElapsed', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatElapsed(0)).toBe('0m')
    expect(formatElapsed(59)).toBe('0m')
    expect(formatElapsed(45 * 60)).toBe('45m')
    expect(formatElapsed(80 * 60)).toBe('1h 20m')
    expect(formatElapsed(25 * 3600)).toBe('25h')
  })
  it('treats negative or non-finite as 0m', () => {
    expect(formatElapsed(-5)).toBe('0m')
    expect(formatElapsed(Number.NaN)).toBe('0m')
  })
})

describe('elapsedNow', () => {
  it('adds the time since the fetch to the server count', () => {
    expect(elapsedNow(active({ elapsedSeconds: 600 }), 1_000_000, 1_000_000 + 90_500)).toBe(690)
  })
  it('never goes negative', () => {
    expect(elapsedNow(active({ elapsedSeconds: 5 }), 2_000_000, 1_000_000)).toBe(5)
    expect(elapsedNow(active({ elapsedSeconds: -10 }), 0, 0)).toBe(0)
  })
  it('ignores clockInAt entirely', () => {
    const far = active({ elapsedSeconds: 60, clockInAt: '1999-01-01T00:00:00.000Z' })
    expect(elapsedNow(far, 0, 30_000)).toBe(90)
  })
  it('is 0 when not clocked in', () => {
    expect(elapsedNow(off, 0, 10_000)).toBe(0)
  })
})

describe('clockTaskChoices', () => {
  const projects = [
    group('Portal', [task('a', 'Fix login'), task('b', 'Old thing', 'done'), task('c', 'Closed one', 'closed'), task('d', 'Resolved one', 'resolved')]),
    group('Mobile app', [task('e', 'Push notifications', 'in_progress')]),
  ]
  it('puts General work first and drops finished tasks', () => {
    const out = clockTaskChoices(projects, '')
    expect(out[0]).toEqual({ id: null, label: 'General work' })
    expect(out.map((x) => x.id)).toEqual([null, 'a', 'e'])
  })
  it('filters by title, case-insensitively', () => {
    expect(clockTaskChoices(projects, 'LOGIN').map((x) => x.id)).toEqual([null, 'a'])
  })
  it('filters by project name', () => {
    expect(clockTaskChoices(projects, 'mobile').map((x) => x.id)).toEqual([null, 'e'])
  })
  it('caps the tasks at 50', () => {
    const many = [group('P', Array.from({ length: 80 }, (_, i) => task(`t${i}`, `Task ${i}`)))]
    const out = clockTaskChoices(many, '')
    expect(out).toHaveLength(51)
    expect(out[0].id).toBeNull()
  })
})

describe('taskClockAction', () => {
  it('clock-in when clocked out', () => expect(taskClockAction(off, 't1')).toBe('clock-in'))
  it('clock-out on the same task', () => expect(taskClockAction(active(), 't1')).toBe('clock-out'))
  it('switch from another task', () => expect(taskClockAction(active(), 't2')).toBe('switch'))
  it('switch when clocked in on general work', () => {
    expect(taskClockAction(active({ taskId: null, taskTitle: 'General work' }), 't2')).toBe('switch')
  })
})

describe('outcome texts', () => {
  const started: ClockInResult = { outcome: 'started', stopped: null, status: active() }
  it('started', () => expect(clockOutcomeText(started)).toBe('Clocked in on Fix login.'))
  it('switched', () => {
    const r: ClockInResult = { outcome: 'switched', stopped: { title: 'General work', minutes: 12 }, status: active() }
    expect(clockOutcomeText(r)).toBe('Switched from General work to Fix login.')
  })
  it('unchanged', () => {
    expect(clockOutcomeText({ ...started, outcome: 'unchanged' })).toBe('Already clocked in on Fix login.')
  })
  it('clock out', () => {
    expect(clockOutText({ minutes: 80, taskTitle: 'Fix login', taskTotalMinutes: 200 })).toBe('Clocked out — 1h 20m.')
    expect(clockOutText({ minutes: 0, taskTitle: null, taskTotalMinutes: 0 })).toBe('Clocked out — 0m.')
  })
})

describe('clockedInTaskLabel', () => {
  it('uses a non-empty title', () => expect(clockedInTaskLabel({ taskId: 't1', taskTitle: 'Fix login' })).toBe('Fix login'))
  it('says a task when the id is set but the title is missing', () => expect(clockedInTaskLabel({ taskId: 't1', taskTitle: null })).toBe('a task'))
  it('says General work with neither', () => expect(clockedInTaskLabel({ taskId: null, taskTitle: null })).toBe('General work'))
  it('keeps the backend hidden-task shape as a task', () => expect(clockedInTaskLabel({ taskId: null, taskTitle: 'a task' })).toBe('a task'))
})

describe('isClockUnavailable', () => {
  it('is unavailable only when nothing ever succeeded', () => {
    expect(isClockUnavailable(null, true)).toBe(true)
    expect(isClockUnavailable(true, true)).toBe(false)
    expect(isClockUnavailable(false, true)).toBe(false)
    expect(isClockUnavailable(null, false)).toBe(false)
  })
})
