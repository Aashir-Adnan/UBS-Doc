import { describe, it, expect } from 'vitest'
import { fmtDate, refTone, refLabel, testCount, taskUrl } from './detailLogic'

describe('fmtDate', () => {
  it('formats an ISO timestamp with short month, day and year', () => {
    const iso = '2026-09-18T10:00:00.000Z'
    const expected = new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    expect(fmtDate(iso)).toBe(expected)
    expect(fmtDate(iso)).toContain('2026')
  })

  it('returns null for missing, empty or unparseable values', () => {
    expect(fmtDate(null)).toBeNull()
    expect(fmtDate(undefined)).toBeNull()
    expect(fmtDate('')).toBeNull()
    expect(fmtDate('not a date')).toBeNull()
  })
})

describe('refTone', () => {
  it('maps terminal statuses to done', () => {
    expect(refTone('done')).toBe('done')
    expect(refTone('closed')).toBe('done')
    expect(refTone('resolved')).toBe('done')
  })

  it('maps in_progress to active and everything else to idle', () => {
    expect(refTone('in_progress')).toBe('active')
    expect(refTone('open')).toBe('idle')
    expect(refTone('pending')).toBe('idle')
    expect(refTone(undefined)).toBe('idle')
    expect(refTone(null)).toBe('idle')
  })
})

describe('refLabel', () => {
  it('uses the shared status labels and falls back to the raw value', () => {
    expect(refLabel('in_progress')).toBe('In progress')
    expect(refLabel('mystery')).toBe('mystery')
    expect(refLabel(undefined)).toBe('Unknown')
  })
})

describe('testCount', () => {
  it('renders an em dash for null and undefined, the number otherwise', () => {
    expect(testCount(null)).toBe('—')
    expect(testCount(undefined)).toBe('—')
    expect(testCount(0)).toBe('0')
    expect(testCount(12)).toBe('12')
  })
})

describe('taskUrl', () => {
  it('builds an absolute link to the task detail route', () => {
    expect(taskUrl('https://ubs.granjur.com', 'abc123')).toBe('https://ubs.granjur.com/tools/team/tasks/abc123')
  })

  it('does not double the slash when the origin carries a trailing one', () => {
    expect(taskUrl('https://ubs.granjur.com/', 'abc123')).toBe('https://ubs.granjur.com/tools/team/tasks/abc123')
  })

  it('encodes an id so a stray character cannot break the path', () => {
    expect(taskUrl('https://ubs.granjur.com', 'a b/c')).toBe('https://ubs.granjur.com/tools/team/tasks/a%20b%2Fc')
  })
})
