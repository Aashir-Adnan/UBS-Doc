import { describe, it, expect } from 'vitest'
import { memberWorkload, sortMembers, filterMembers, personOptions, assigneeAfterProjectChange } from './teamLogic'
import type { TaskRow, TeamMember, ProjectGroup, TasksPayload } from '../tasksLogic'

const t = (id: string, status: string, assignees: string[], isBlocked = false): TaskRow => ({
  id, title: id, type: 'feature', status, implementationStatus: null,
  assignees: assignees.map((a) => ({ discordId: a, name: `Name ${a}` })),
  blockedBy: [], blocks: [], isBlocked, channelUrl: null, createdAt: '', updatedAt: '',
  description: null, scope: null, modules: [], createdBy: null,
  passedApiTests: null, passedQaTests: null, passedAcceptanceCriteria: null,
  projectId: null, projectName: null,
})

const member = (discordId: string, name: string, projects: TeamMember['projects'] = []): TeamMember => ({
  discordId, name, username: name.toLowerCase(), roleNames: [], status: 'active', verified: true, projects,
})

describe('memberWorkload', () => {
  const tasks = [
    t('A', 'open', ['u1']),
    t('B', 'in_progress', ['u1'], true),
    t('C', 'done', ['u1']),
    t('D', 'open', ['u2']),
  ]

  it('counts only tasks the member is assigned to', () => {
    expect(memberWorkload(member('u2', 'Bo'), tasks)).toEqual({ open: 1, in_progress: 0, blocked: 0, total: 1 })
  })

  it('counts open, in_progress, blocked (non-terminal + isBlocked) and total (non-terminal)', () => {
    expect(memberWorkload(member('u1', 'Ada'), tasks)).toEqual({ open: 1, in_progress: 1, blocked: 1, total: 2 })
  })

  it('a member with no assigned tasks gets all zeros', () => {
    expect(memberWorkload(member('u3', 'Cy'), tasks)).toEqual({ open: 0, in_progress: 0, blocked: 0, total: 0 })
  })
})

describe('sortMembers', () => {
  it('sorts by open workload descending, then by name', () => {
    const tasks = [t('A', 'open', ['u1']), t('B', 'open', ['u1']), t('C', 'open', ['u2'])]
    const members = [member('u2', 'Zoe'), member('u1', 'Ada'), member('u3', 'Bo')]
    expect(sortMembers(members, tasks).map((m) => m.discordId)).toEqual(['u1', 'u2', 'u3'])
  })

  it('breaks ties alphabetically by name', () => {
    const members = [member('u2', 'Zoe'), member('u1', 'Ada')]
    expect(sortMembers(members, []).map((m) => m.name)).toEqual(['Ada', 'Zoe'])
  })

  it('does not mutate the input array', () => {
    const members = [member('u2', 'Zoe'), member('u1', 'Ada')]
    sortMembers(members, [])
    expect(members.map((m) => m.discordId)).toEqual(['u2', 'u1'])
  })
})

describe('filterMembers', () => {
  const projects: ProjectGroup[] = [
    { id: 'p1', name: 'Framework', docsSlug: 'framework', members: [], counts: { open: 0, in_progress: 0, pending: 0, done: 0, blocked: 0 },
      tasks: [t('A', 'open', ['u1'], true)] },
    { id: 'p2', name: 'Other', docsSlug: 'other', members: [], counts: { open: 0, in_progress: 0, pending: 0, done: 0, blocked: 0 },
      tasks: [t('B', 'open', ['u2'])] },
  ]
  const members = [
    member('u1', 'Ada Explicit', [{ id: 'p1', name: 'Framework', docsSlug: 'framework', role: 'developer' }]),
    member('u2', 'Bo AssignedOnly'),
    member('u3', 'Cy Unrelated'),
  ]

  it('narrows to members on the project (explicit) or assigned to a task within it', () => {
    const out = filterMembers(members, projects, { projectSlug: 'framework', assigneeId: null, blockedOnly: false, query: '' })
    expect(out.map((m) => m.discordId)).toEqual(['u1'])
  })

  it('narrows to members assigned within the project even with no explicit membership', () => {
    const out = filterMembers(members, projects, { projectSlug: 'other', assigneeId: null, blockedOnly: false, query: '' })
    expect(out.map((m) => m.discordId)).toEqual(['u2'])
  })

  it('assigneeId keeps only that member', () => {
    const out = filterMembers(members, projects, { projectSlug: null, assigneeId: 'u3', blockedOnly: false, query: '' })
    expect(out.map((m) => m.discordId)).toEqual(['u3'])
  })

  it('query matches name or username case-insensitively', () => {
    const out = filterMembers(members, projects, { projectSlug: null, assigneeId: null, blockedOnly: false, query: 'EXPLICIT' })
    expect(out.map((m) => m.discordId)).toEqual(['u1'])
  })

  it('blockedOnly keeps only members with at least one blocked task', () => {
    const out = filterMembers(members, projects, { projectSlug: null, assigneeId: null, blockedOnly: true, query: '' })
    expect(out.map((m) => m.discordId)).toEqual(['u1'])
  })
})

describe('personOptions', () => {
  const roster = (id: string, name: string): TeamMember => ({
    discordId: id, name, username: null, roleNames: [], status: 'active', verified: true, projects: [],
  })
  const grp = (slug: string | null, members: [string, string][]): ProjectGroup => ({
    id: slug, name: slug ?? 'none', docsSlug: slug,
    members: members.map(([discordId, name]) => ({ discordId, name, username: null, role: null, source: 'explicit' as const })),
    counts: { open: 0, in_progress: 0, pending: 0, done: 0, blocked: 0 }, tasks: [],
  })
  const payload = (seesAll: boolean): TasksPayload => ({
    generatedAt: '',
    projects: [grp('a', [['2', 'Zed M'], ['1', 'Amy M']]), grp('b', [['1', 'Amy M'], ['3', 'Bob M']])],
    members: [roster('1', 'Amy'), roster('2', 'Zed'), roster('3', 'Bob'), roster('4', 'Cy')],
    viewer: { linked: true, seesAll, isAdmin: false, discordIds: [], name: null },
  })

  it('a selected project gives its members, sorted, named from the roster', () => {
    expect(personOptions(payload(false), 'a')).toEqual([{ id: '1', name: 'Amy' }, { id: '2', name: 'Zed' }])
  })
  it('a selected project is the same for a viewer who sees everything', () => {
    expect(personOptions(payload(true), 'b')).toEqual([{ id: '1', name: 'Amy' }, { id: '3', name: 'Bob' }])
  })
  it('all projects, not seeing everything: union of visible projects, de-duplicated and sorted', () => {
    expect(personOptions(payload(false), null)).toEqual([{ id: '1', name: 'Amy' }, { id: '3', name: 'Bob' }, { id: '2', name: 'Zed' }])
  })
  it('all projects, seeing everything: the full roster', () => {
    expect(personOptions(payload(true), null).map((p) => p.id)).toEqual(['1', '3', '4', '2'])
  })
  it('falls back to the member entry name when not on the roster', () => {
    const p = payload(false)
    p.members = []
    expect(personOptions(p, 'a')).toEqual([{ id: '1', name: 'Amy M' }, { id: '2', name: 'Zed M' }])
  })
  it('an unknown project slug gives nobody; a missing payload gives nobody', () => {
    expect(personOptions(payload(false), 'nope')).toEqual([])
    expect(personOptions(null, null)).toEqual([])
  })
  it('a missing viewer is treated as not seeing everything', () => {
    const p = payload(true)
    delete p.viewer
    expect(personOptions(p, null).map((x) => x.id)).toEqual(['1', '3', '2'])
  })
})

describe('assigneeAfterProjectChange', () => {
  const opts = [{ id: '1', name: 'Amy' }, { id: '2', name: 'Zed' }]
  it('keeps an assignee who is offered', () => expect(assigneeAfterProjectChange(opts, '1')).toBe('1'))
  it('resets an assignee who is not offered', () => expect(assigneeAfterProjectChange(opts, '9')).toBeNull())
  it('keeps "Anyone"', () => expect(assigneeAfterProjectChange(opts, null)).toBeNull())
})
