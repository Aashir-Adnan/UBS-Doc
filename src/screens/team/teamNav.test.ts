import { describe, it, expect } from 'vitest'
import { activeTab, TEAM_TABS } from './teamNav'

describe('activeTab', () => {
  it('treats the section root as the People tab', () => {
    expect(activeTab('/tools/team')).toBe('people')
  })

  it('treats a trailing slash on the root as the People tab', () => {
    expect(activeTab('/tools/team/')).toBe('people')
  })

  it('lights Tasks on the tasks list', () => {
    expect(activeTab('/tools/team/tasks')).toBe('tasks')
  })

  it('lights Tasks on a task detail route', () => {
    expect(activeTab('/tools/team/tasks/abc')).toBe('tasks')
  })

  it('lights Board on the board', () => {
    expect(activeTab('/tools/team/board')).toBe('board')
  })

  it('falls back to People for an unknown child route', () => {
    expect(activeTab('/tools/team/nope')).toBe('people')
  })
})

describe('TEAM_TABS', () => {
  it('lists People, Tasks, Board and Time with their paths', () => {
    expect(TEAM_TABS.map((t) => [t.key, t.path])).toEqual([
      ['people', '/tools/team'],
      ['tasks', '/tools/team/tasks'],
      ['board', '/tools/team/board'],
      ['time', '/tools/team/time'],
    ])
  })
})

describe('the Time tab', () => {
  it('is a tab and resolves from its path', () => {
    expect(TEAM_TABS.map((t) => t.key)).toContain('time')
    expect(activeTab('/tools/team/time')).toBe('time')
  })
})
