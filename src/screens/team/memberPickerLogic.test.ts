import { describe, it, expect } from 'vitest'
import type { TeamMember } from '../tasksLogic'
import { pickerOptions, matchesQuery, selectedPeople } from './memberPickerLogic'

const m = (over: Partial<TeamMember>): TeamMember => ({
  discordId: 'x', name: 'X', username: null, roleNames: [], status: 'approved', verified: true, projects: [], ...over,
})
const members = [
  m({ discordId: 'u1', name: 'zoe', username: 'zoe_k', projects: [{ id: 'P1', name: 'Framework', docsSlug: null, role: 'developer' }] }),
  m({ discordId: 'u2', name: 'Adam', username: 'adam', avatarUrl: 'https://cdn.discordapp.com/a.png' }),
  m({ discordId: 'u3', name: 'Client Co', kind: 'client' }),
  m({ discordId: 'u4', name: 'Pending Pat', verified: false }),
  m({ discordId: 'u5', name: 'Ben', kind: 'staff', projects: [{ id: 'P1', name: 'Framework', docsSlug: null, role: 'qa' }] }),
]

describe('pickerOptions', () => {
  it('verified staff only, project members first, each group by name', () => {
    const g = pickerOptions(members, 'P1', [])
    expect(g.project.map((o) => o.discordId)).toEqual(['u5', 'u1'])
    expect(g.others.map((o) => o.discordId)).toEqual(['u2'])
  })
  it('an older backend without kind treats everyone as staff', () => {
    const g = pickerOptions([m({ discordId: 'a', name: 'A' })], null, [])
    expect(g.others.map((o) => o.discordId)).toEqual(['a'])
  })
  it('someone already selected stays offered even if no longer assignable', () => {
    const g = pickerOptions(members, 'P1', ['u3', 'u4'])
    expect(g.others.map((o) => [o.discordId, o.selected])).toEqual([['u2', false], ['u3', true], ['u4', true]])
  })
  it('no project: everyone is in "others"', () => {
    expect(pickerOptions(members, null, []).project).toEqual([])
  })
})

describe('matchesQuery', () => {
  const [o] = pickerOptions(members, 'P1', []).project.filter((x) => x.discordId === 'u1')
  it('matches display name or username, any case', () => {
    expect(matchesQuery(o, 'ZO')).toBe(true)
    expect(matchesQuery(o, '_k')).toBe(true)
    expect(matchesQuery(o, 'adam')).toBe(false)
    expect(matchesQuery(o, '  ')).toBe(true)
  })
})

describe('selectedPeople', () => {
  it('names each id, and an id with no member row gets a short label', () => {
    expect(selectedPeople(members, ['u2', 'gone1234'])).toEqual([
      { discordId: 'u2', name: 'Adam', avatarUrl: 'https://cdn.discordapp.com/a.png' },
      { discordId: 'gone1234', name: 'Member …1234' },
    ])
  })
})
