import { describe, it, expect } from 'vitest'
import {
  rangeBounds, dayKey, parseDayKey, weekKeyOf, bucketKeys, rollup, fillSeries, cumulative, stackByMember,
  memberColor, MEMBER_COLORS, completionPercent, memberBreakdown, estimateSummary, minutesInRange, linePath, niceMax,
} from './statsLogic'
import type { TaskRow } from '../tasksLogic'

const task = (over: Partial<TaskRow>): TaskRow => ({
  id: 'x', title: 't', type: 'feature', status: 'open', implementationStatus: null, assignees: [], blockedBy: [], blocks: [],
  isBlocked: false, channelUrl: null, createdAt: '', updatedAt: '', description: null, scope: null, modules: [], createdBy: null,
  passedApiTests: null, passedQaTests: null, passedAcceptanceCriteria: null, projectId: 'p1', projectName: 'P', ...over,
})

describe('rangeBounds', () => {
  const now = new Date(2026, 8, 23, 15, 30) // 23 Sep 2026, local
  it('30d is thirty days back at local midnight, day buckets', () => {
    const r = rangeBounds('30d', now)
    expect(r.since).toEqual(new Date(2026, 7, 24, 0, 0, 0, 0))
    expect(r.until).toEqual(now)
    expect(r.bucket).toBe('day')
  })
  it('90d is week buckets', () => {
    const r = rangeBounds('90d', now)
    expect(r.since).toEqual(new Date(2026, 5, 25, 0, 0, 0, 0))
    expect(r.bucket).toBe('week')
  })
  it('all has no lower bound and week buckets', () => {
    expect(rangeBounds('all', now)).toEqual({ since: null, until: now, bucket: 'week' })
  })
})

describe('day and week keys', () => {
  it('round-trips a local day', () => {
    const d = new Date(2026, 0, 5)
    expect(dayKey(d)).toBe('2026-01-05')
    expect(parseDayKey('2026-01-05')).toEqual(d)
  })
  it('weekKeyOf is the Monday of that week', () => {
    expect(weekKeyOf('2026-09-23')).toBe('2026-09-21') // Wednesday -> Monday
    expect(weekKeyOf('2026-09-21')).toBe('2026-09-21')
    expect(weekKeyOf('2026-09-27')).toBe('2026-09-21') // Sunday belongs to the Monday before
  })
  it('bucketKeys lists every day, or every Monday, from since up to until', () => {
    expect(bucketKeys(new Date(2026, 8, 1), new Date(2026, 8, 4), 'day')).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
    expect(bucketKeys(new Date(2026, 8, 1), new Date(2026, 8, 4, 12), 'day')).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'])
    expect(bucketKeys(new Date(2026, 8, 2), new Date(2026, 8, 23), 'week')).toEqual(['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'])
  })
})

describe('series', () => {
  it('rollup to weeks sums the days of each Monday-started week; day bucket is unchanged', () => {
    const pts = [{ day: '2026-09-01', n: 2 }, { day: '2026-09-03', n: 3 }, { day: '2026-09-08', n: 1 }]
    expect(rollup(pts, 'week')).toEqual([{ day: '2026-08-31', n: 5 }, { day: '2026-09-07', n: 1 }])
    expect(rollup(pts, 'day')).toEqual(pts)
  })
  it('fillSeries zero-fills the gaps in key order and ignores points outside the keys', () => {
    expect(fillSeries([{ day: 'b', n: 4 }, { day: 'z', n: 9 }], ['a', 'b', 'c'])).toEqual([0, 4, 0])
  })
  it('cumulative runs a total', () => {
    expect(cumulative([1, 0, 2, 3])).toEqual([1, 1, 3, 6])
  })
  it('stackByMember builds a row per key with a column per member, members in first-seen order, named', () => {
    const out = stackByMember(
      [{ day: '2026-09-01', discordId: 'u2', minutes: 30 }, { day: '2026-09-01', discordId: 'u1', minutes: 60 }, { day: '2026-09-02', discordId: 'u1', minutes: 15 }],
      ['2026-09-01', '2026-09-02', '2026-09-03'], 'day', (id) => (id === 'u1' ? 'Ana' : 'Ben'),
    )
    expect(out.members).toEqual([{ discordId: 'u2', name: 'Ben' }, { discordId: 'u1', name: 'Ana' }])
    expect(out.rows).toEqual([[30, 60], [0, 15], [0, 0]])
  })
  it('stackByMember rolls days into weeks when asked', () => {
    const out = stackByMember(
      [{ day: '2026-09-01', discordId: 'u1', minutes: 10 }, { day: '2026-09-03', discordId: 'u1', minutes: 20 }],
      ['2026-08-31', '2026-09-07'], 'week', () => 'Ana',
    )
    expect(out.rows).toEqual([[30], [0]])
  })
  it('memberColor cycles the palette', () => {
    expect(memberColor(0)).toBe(MEMBER_COLORS[0])
    expect(memberColor(MEMBER_COLORS.length)).toBe(MEMBER_COLORS[0])
  })
  it('minutesInRange totals everyone, or one person', () => {
    const pts = [{ day: 'a', discordId: 'u1', minutes: 10 }, { day: 'a', discordId: 'u2', minutes: 5 }]
    expect(minutesInRange(pts)).toBe(15)
    expect(minutesInRange(pts, 'u2')).toBe(5)
  })
})

describe('snapshot math', () => {
  it('completionPercent is done over total, null with no tasks', () => {
    expect(completionPercent([task({ status: 'done' }), task({ status: 'closed' }), task({ status: 'open' }), task({ status: 'in_progress' })])).toBe(50)
    expect(completionPercent([])).toBeNull()
  })
  it('memberBreakdown counts only that person’s tasks', () => {
    const tasks = [
      task({ status: 'open', assignees: [{ discordId: 'u1', name: 'Ana' }] }),
      task({ status: 'in_progress', assignees: [{ discordId: 'u1', name: 'Ana' }, { discordId: 'u2', name: 'Ben' }] }),
      task({ status: 'resolved', assignees: [{ discordId: 'u2', name: 'Ben' }] }),
      task({ status: 'pending', assignees: [{ discordId: 'u1', name: 'Ana' }] }),
    ]
    expect(memberBreakdown('u1', tasks)).toEqual({ open: 2, inProgress: 1, done: 0 }) // pending counts as open
    expect(memberBreakdown('u2', tasks)).toEqual({ open: 0, inProgress: 1, done: 1 })
  })
  it('estimateSummary sums logged and estimate over tasks that have an estimate; null when none do', () => {
    expect(estimateSummary([task({ estimateMinutes: 120, timeLogged: 60 }), task({ estimateMinutes: null, timeLogged: 999 }), task({ estimateMinutes: 30 })]))
      .toEqual({ logged: 60, estimate: 150 })
    expect(estimateSummary([task({ timeLogged: 10 })])).toBeNull()
  })
})

describe('drawing helpers', () => {
  it('niceMax rounds up to a friendly axis maximum, never zero', () => {
    expect(niceMax(0)).toBe(1)
    expect(niceMax(7)).toBe(8)
    expect(niceMax(23)).toBe(25)
    expect(niceMax(130)).toBe(150)
    expect(niceMax(1000)).toBe(1000)
  })
  it('linePath maps values across the width and inverts y', () => {
    expect(linePath([0, 10], 100, 50, 10)).toBe('M0,50 L100,0')
    expect(linePath([5], 100, 50, 10)).toBe('M0,25 L100,25')
    expect(linePath([], 100, 50, 10)).toBe('')
  })
})
