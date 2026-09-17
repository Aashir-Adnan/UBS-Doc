import { describe, it, expect } from 'vitest'
import { applyFilters, assigneeOptions, statusTone, unknownProjectSlug, roleLabel, DEFAULT_FILTERS, type ProjectGroup } from './tasksLogic'

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
  it('a null task title does not throw under a non-empty query, and is filtered out by it', () => {
    const nullTitled: ProjectGroup[] = [
      { id: 'p2', name: 'Nullable', docsSlug: 'nullable', members: [], counts: { open: 1, in_progress: 0, pending: 0, done: 0, blocked: 0 },
        tasks: [{ ...t('Z', 'open', []), title: null as unknown as string }] },
    ]
    expect(() => applyFilters(nullTitled, { ...DEFAULT_FILTERS, query: 'git' })).not.toThrow()
    expect(applyFilters(nullTitled, { ...DEFAULT_FILTERS, query: 'git' })).toEqual([])
  })
})

describe('assigneeOptions', () => {
  it('lists each person once, sorted by name', () => {
    expect(assigneeOptions(projects)).toEqual([{ id: 'u1', name: 'Name u1' }, { id: 'u2', name: 'Name u2' }])
  })
})

describe('unknownProjectSlug', () => {
  it('returns null for a null slug', () => {
    expect(unknownProjectSlug(projects, null)).toBeNull()
  })
  it('returns null for a slug that exists', () => {
    expect(unknownProjectSlug(projects, 'framework')).toBeNull()
  })
  it('returns the slug when it does not exist', () => {
    expect(unknownProjectSlug(projects, 'nope')).toBe('nope')
  })
  it('returns the slug when projects is empty', () => {
    expect(unknownProjectSlug([], 'framework')).toBe('framework')
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

describe('roleLabel', () => {
  it('turns stored role keys into readable labels and leaves unknown keys alone', () => {
    expect(roleLabel('backend_developer')).toBe('Backend Developer')
    expect(roleLabel('frontend_developer')).toBe('Frontend Developer')
    expect(roleLabel('qa')).toBe('QA')
    expect(roleLabel('lead')).toBe('Lead')
    expect(roleLabel('something_new')).toBe('something_new')
  })
})
