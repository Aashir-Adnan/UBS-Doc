import { describe, it, expect } from 'vitest'
import { legacyTasksRedirect } from './redirect'

describe('legacyTasksRedirect', () => {
  it('redirects the bare legacy path with no query string', () => {
    expect(legacyTasksRedirect('')).toBe('/tools/team/tasks')
  })

  it('preserves a query string such as ?project=x', () => {
    expect(legacyTasksRedirect('?project=x')).toBe('/tools/team/tasks?project=x')
  })

  it('preserves multiple query params unchanged', () => {
    expect(legacyTasksRedirect('?project=x&assignee=u1')).toBe('/tools/team/tasks?project=x&assignee=u1')
  })
})
