import { describe, it, expect } from 'vitest'
import { applyFilters, assigneeOptions, statusTone, DEFAULT_FILTERS, type ProjectGroup } from './tasksLogic'

const t = (id: string, status: string, assignees: string[], isBlocked = false, title = id) => ({
  id, title, type: 'feature', status, implementationStatus: null,
  assignees: assignees.map((a) => ({ discordId: a, name: `Name ${a}` })),
  blockedBy: [], blocks: [], isBlocked, channelUrl: null, createdAt: '', updatedAt: '',
})
const projects: ProjectGroup[] = [
  { id: 'p1', name: 'Framework', docsSlug: 'framework', members: [], counts: { open: 2, in_progress: 0, pending: 0, done: 1, blocked: 1 },
    tasks: [t('A', 'open', ['u1'], true, 'Git Sync'), t('B', 'open', ['u2']), t('C', 'done', ['u1'])] },
  { id: null, name: 'No project', docsSlug: null, members: [], counts: { open: 1, in_progress: 0, pending: 0, done: 0, blocked: 0 },
    tasks: [t('N', 'open', [])] },
]

describe('applyFilters', () => {
  it('returns everything with the defaults, keeping empty groups out', () => {
    expect(applyFilters(projects, DEFAULT_FILTERS).map((p) => p.tasks.length)).toEqual([3, 1])
  })
  it('status "active" hides terminal tasks and drops a group with nothing left', () => {
    const out = applyFilters(projects, { ...DEFAULT_FILTERS, status: 'active' })
    expect(out[0].tasks.map((x) => x.id)).toEqual(['A', 'B'])
  })
  it('project, assignee, blockedOnly and query narrow independently', () => {
    expect(applyFilters(projects, { ...DEFAULT_FILTERS, projectSlug: 'framework' }).map((p) => p.id)).toEqual(['p1'])
    expect(applyFilters(projects, { ...DEFAULT_FILTERS, assigneeId: 'u2' })[0].tasks.map((x) => x.id)).toEqual(['B'])
    expect(applyFilters(projects, { ...DEFAULT_FILTERS, blockedOnly: true })[0].tasks.map((x) => x.id)).toEqual(['A'])
    expect(applyFilters(projects, { ...DEFAULT_FILTERS, query: 'git' })[0].tasks.map((x) => x.id)).toEqual(['A'])
    expect(applyFilters(projects, { ...DEFAULT_FILTERS, query: 'zzz' })).toEqual([])
  })
})

describe('assigneeOptions', () => {
  it('lists each person once, sorted by name', () => {
    expect(assigneeOptions(projects)).toEqual([{ id: 'u1', name: 'Name u1' }, { id: 'u2', name: 'Name u2' }])
  })
})

describe('statusTone', () => {
  it('blocked beats status; terminal is done; in_progress is active; else idle', () => {
    expect(statusTone(t('x', 'open', [], true))).toBe('bad')
    expect(statusTone(t('x', 'closed', []))).toBe('done')
    expect(statusTone(t('x', 'in_progress', []))).toBe('active')
    expect(statusTone(t('x', 'pending', []))).toBe('idle')
  })
})
