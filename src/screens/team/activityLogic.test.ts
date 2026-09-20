import { describe, it, expect } from 'vitest'
import { describeChange, relativeTime, actorName, whoLine } from './activityLogic'

const p = (name: string) => ({ discordId: name, name })

describe('describeChange', () => {
  it('says where a status moved to and from', () => {
    expect(describeChange({ field: 'status', from: 'open', to: 'in_progress' })).toBe('moved it to In progress (was Open)')
    expect(describeChange({ field: 'status', from: null, to: 'done' })).toBe('moved it to Done')
  })
  it('labels the scope, and says when it was cleared', () => {
    expect(describeChange({ field: 'scope', from: null, to: 'qa' })).toBe('set the scope to QA')
    expect(describeChange({ field: 'scope', from: 'qa', to: null })).toBe('cleared the scope')
    expect(describeChange({ field: 'scope', from: null, to: 'GitSync' })).toBe('set the scope to GitSync')
  })
  it('names test counts and the implementation status', () => {
    expect(describeChange({ field: 'passedQaTests', from: 2, to: 5 })).toBe('set QA tests passed to 5')
    expect(describeChange({ field: 'implementationStatus', from: null, to: 'in_progress' })).toBe('set the implementation status to in progress')
  })
  it('never quotes a title or description', () => {
    expect(describeChange({ field: 'title' })).toBe('changed the title')
    expect(describeChange({ field: 'description' })).toBe('changed the description')
  })
  it('names who was assigned and who was taken off', () => {
    expect(describeChange({ field: 'assignees', added: [p('Ana'), p('Ben')], removed: [p('Cy')] })).toBe('assigned Ana, Ben and unassigned Cy')
    expect(describeChange({ field: 'assignees', added: [], removed: [p('Cy')] })).toBe('unassigned Cy')
    expect(describeChange({ field: 'assignees', added: [], removed: [] })).toBe('changed the assignees')
  })
  it('describes a project move and blocker changes', () => {
    expect(describeChange({ field: 'project', from: 'Framework', to: 'CSAAS' })).toBe('moved it to the CSAAS project (from Framework)')
    expect(describeChange({ field: 'project', from: 'Framework', to: null })).toBe('removed it from Framework')
    expect(describeChange({ field: 'blocked_by', action: 'added', title: 'Router fix' })).toBe('made it blocked by "Router fix"')
    expect(describeChange({ field: 'blocked_by', action: 'removed', title: 'Router fix' })).toBe('unblocked it from "Router fix"')
  })
  it('falls back to a generic sentence for a field it does not know', () => {
    expect(describeChange({ field: 'something_new' } as never)).toBe('changed this task')
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-09-20T12:00:00.000Z').getTime()
  const ago = (ms: number) => new Date(now - ms).toISOString()
  it('reads naturally across the ranges', () => {
    expect(relativeTime(ago(20_000), now)).toBe('just now')
    expect(relativeTime(ago(60_000), now)).toBe('1 minute ago')
    expect(relativeTime(ago(5 * 60_000), now)).toBe('5 minutes ago')
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe('3 hours ago')
    expect(relativeTime(ago(30 * 3_600_000), now)).toBe('yesterday')
    expect(relativeTime(ago(4 * 86_400_000), now)).toBe('4 days ago')
  })
  it('falls back to a date after a week', () => {
    expect(relativeTime(ago(30 * 86_400_000), now)).toMatch(/\d{4}/)
  })
  it('is null for missing or bad timestamps, and never negative for a future one', () => {
    expect(relativeTime(null, now)).toBeNull()
    expect(relativeTime('nope', now)).toBeNull()
    expect(relativeTime(new Date(now + 60_000).toISOString(), now)).toBe('just now')
  })
})

describe('actorName', () => {
  it('shows the name, "Former member" for an unresolved id, and "Someone" for nobody', () => {
    expect(actorName({ name: 'Ana' })).toBe('Ana')
    expect(actorName({ name: 'Member …1234', unknown: true })).toBe('Former member')
    expect(actorName(null)).toBe('Someone')
  })
})

describe('whoLine', () => {
  const now = new Date('2026-09-20T12:00:00.000Z').getTime()
  const at = new Date(now - 2 * 3_600_000).toISOString()
  it('joins the creator and the last updater', () => {
    expect(whoLine({ createdBy: { name: 'Ana' }, updatedBy: { name: 'Ben', at, viaSite: false } as never }, now)).toBe('Created by Ana · Updated by Ben, 2 hours ago')
  })
  it('leaves out a half that is unknown, and returns null when both are', () => {
    expect(whoLine({ createdBy: { name: 'Ana' } }, now)).toBe('Created by Ana')
    expect(whoLine({ updatedBy: { name: 'Ben', at: null } as never }, now)).toBe('Updated by Ben')
    expect(whoLine({}, now)).toBeNull()
  })
  it('never prints an unresolved id', () => {
    expect(whoLine({ createdBy: { name: 'Member …1234', unknown: true } }, now)).toBe('Created by Former member')
  })
})
