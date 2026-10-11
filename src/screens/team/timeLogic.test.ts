// Pure time-tracking logic: formatting, estimate math, week boundaries and
// contributor rollups. No React, no fetch, no DOM — matched against the bot's
// own formatDuration output and real calendar dates, not just self-consistency.
import { describe, it, expect } from 'vitest'
import {
  formatDuration, estimatePercent, isOverEstimate, weekRange, shiftWeek, topContributors, timeChip,
  dayRange, shiftRange, switchView, parseTimeView,
} from './timeLogic'

describe('formatDuration', () => {
  it('matches what the bot prints, but null (not an em dash) for nothing to show', () => {
    expect(formatDuration(200)).toBe('3h 20m')
    expect(formatDuration(120)).toBe('2h')
    expect(formatDuration(45)).toBe('45m')
    expect(formatDuration(0)).toBe('0m')
    expect(formatDuration(undefined)).toBeNull()
    expect(formatDuration(null)).toBeNull()
  })
})

describe('estimatePercent', () => {
  it('is a percentage of the estimate, capped at 100 for the bar', () => {
    expect(estimatePercent(240, 480)).toBe(50)
    expect(estimatePercent(600, 480)).toBe(100)
  })
  it('is null when there is no usable estimate (division-by-zero guard)', () => {
    expect(estimatePercent(240, null)).toBeNull()
    expect(estimatePercent(240, undefined)).toBeNull()
    expect(estimatePercent(240, 0)).toBeNull()
  })
})

describe('isOverEstimate', () => {
  it('is true only once logged time passes a positive estimate', () => {
    expect(isOverEstimate(600, 480)).toBe(true)
    expect(isOverEstimate(240, 480)).toBe(false)
    expect(isOverEstimate(480, 480)).toBe(false)
  })
  it('is false whenever there is no positive estimate to compare against', () => {
    expect(isOverEstimate(240, null)).toBe(false)
    expect(isOverEstimate(240, undefined)).toBe(false)
    expect(isOverEstimate(240, 0)).toBe(false)
  })
})

describe('weekRange', () => {
  // Sep 24, 2026 is a Thursday (verified against the real calendar); the most
  // recent Monday at/before it is Sep 21, the following Monday is Sep 28.
  // Built from local Date components so this holds under whatever timezone
  // the test runs in — weekRange is documented as local-time, not UTC.
  const thursday = new Date(2026, 8, 24, 15, 0, 0)
  const mondayBefore = new Date(2026, 8, 21, 0, 0, 0)
  const mondayAfter = new Date(2026, 8, 28, 0, 0, 0)

  it('runs from the preceding Monday 00:00 through the following Monday, exclusive', () => {
    const r = weekRange(thursday)
    expect(r.since.getTime()).toBe(mondayBefore.getTime())
    expect(r.until.getTime()).toBe(mondayAfter.getTime())
  })

  it('treats a Monday itself as the start of its own week', () => {
    const r = weekRange(mondayBefore)
    expect(r.since.getTime()).toBe(mondayBefore.getTime())
    expect(r.until.getTime()).toBe(mondayAfter.getTime())
  })
})

describe('shiftWeek', () => {
  const r = weekRange(new Date(2026, 8, 24, 15, 0, 0))

  it('steps a week back', () => {
    const prev = shiftWeek(r, -1)
    expect(prev.since.getTime()).toBe(new Date(2026, 8, 14, 0, 0, 0).getTime())
    expect(prev.until.getTime()).toBe(new Date(2026, 8, 21, 0, 0, 0).getTime())
  })

  it('steps a week forward', () => {
    const next = shiftWeek(r, 1)
    expect(next.since.getTime()).toBe(new Date(2026, 8, 28, 0, 0, 0).getTime())
    expect(next.until.getTime()).toBe(new Date(2026, 9, 5, 0, 0, 0).getTime())
  })
})

describe('topContributors', () => {
  const list = [
    { discordId: 'a', name: 'Ana', minutes: 300 },
    { discordId: 'b', name: 'Ben', minutes: 120 },
    { discordId: 'c', name: 'Cy', minutes: 60 },
    { discordId: 'd', name: 'Di', minutes: 30 },
  ]

  it('rolls everything past max into one trailing "N others" row', () => {
    const out = topContributors(list, 2)
    expect(out.map((x) => x.name)).toEqual(['Ana', 'Ben', '2 others'])
    expect(out[2].minutes).toBe(90)
    // the kept entries are the same objects, not rebuilt
    expect(out[0]).toBe(list[0])
    expect(out[1]).toBe(list[1])
  })

  it('singularizes the trailing row to "1 other" when exactly one is rolled up', () => {
    const out = topContributors(list, 3)
    expect(out.map((x) => x.name)).toEqual(['Ana', 'Ben', 'Cy', '1 other'])
    expect(out[3].minutes).toBe(30)
  })

  it('keeps exactly max items with no trailing row when the count is exact', () => {
    const out = topContributors(list, 4)
    expect(out).toEqual(list)
    expect(out.length).toBe(4)
  })

  it('returns everything unchanged when max exceeds the list length', () => {
    const out = topContributors(list, 10)
    expect(out.length).toBe(4)
    expect(out).toEqual(list)
  })

  it('returns an empty list unchanged', () => {
    expect(topContributors([], 3)).toEqual([])
  })
})

describe('timeChip', () => {
  it('is null when there is nothing logged, and the formatted duration otherwise', () => {
    expect(timeChip({ timeLogged: 0 })).toBeNull()
    expect(timeChip({})).toBeNull()
    expect(timeChip({ timeLogged: 125 })).toBe('2h 5m')
  })
})

import { csvFilename, csvRows, entriesByTask, toCsv } from './timeLogic'
import type { TimeEntriesPayload, TimeEntry } from '../../components/discordTasks/api'

describe('toCsv', () => {
  it('writes a header and quotes only what needs it', () => {
    const csv = toCsv([['Date', 'Task'], ['2026-09-22 09:00', 'Simple']])
    expect(csv).toBe('Date,Task\r\n2026-09-22 09:00,Simple')
  })

  it('quotes fields containing a comma, a quote or a newline', () => {
    // Task titles and notes routinely contain all three; getting this wrong
    // corrupts the file silently rather than failing loudly.
    const csv = toCsv([['a,b', 'say "hi"', 'line1\nline2']])
    expect(csv).toBe('"a,b","say ""hi""","line1\nline2"')
  })

  it('renders null and undefined as empty, not as the word null', () => {
    expect(toCsv([[null, undefined, 0]])).toBe(',,0')
  })

  it('escapes a string cell starting with =, +, - or @ with a leading single quote', () => {
    // note/taskTitle are free text typed by any guild member; a leading
    // formula character is evaluated by Excel/Sheets on open, and RFC 4180
    // quoting alone does not stop it.
    const csv = toCsv([['=cmd|calc', '+1', '-a', '@mention', 'plain']])
    expect(csv).toBe("'=cmd|calc,'+1,'-a,'@mention,plain")
  })

  it('still quotes an escaped cell that also needs RFC 4180 quoting', () => {
    const csv = toCsv([['=a,b']])
    expect(csv).toBe('"\'=a,b"')
  })

  it('does not escape a numeric cell, so a real negative number (e.g. Minutes) stays a plain number', () => {
    expect(toCsv([[-30, 30]])).toBe('-30,30')
  })
})

describe('csvFilename', () => {
  it('slugifies the person and carries the range', () => {
    // Built as local midnights, not UTC instants: csvFilename is only ever
    // fed weekRange's local-midnight output, and reading UTC instants here
    // would make this test's result depend on the host's timezone offset.
    expect(csvFilename('Ali Raza', new Date(2026, 8, 21), new Date(2026, 8, 28)))
      .toBe('time-ali-raza-2026-09-21-to-2026-09-27.csv')
  })
})

describe('entriesByTask', () => {
  it('totals per task, keeps general work separate, and sorts by minutes', () => {
    const rows = entriesByTask([
      { taskId: 't1', taskTitle: 'Login', projectName: 'Core', minutes: 30 },
      { taskId: null, taskTitle: null, projectName: null, minutes: 45 },
      { taskId: 't1', taskTitle: 'Login', projectName: 'Core', minutes: 60 },
    ] as unknown as TimeEntry[])
    expect(rows).toEqual([
      { taskId: 't1', taskTitle: 'Login', projectName: 'Core', minutes: 90 },
      { taskId: null, taskTitle: 'General work', projectName: null, minutes: 45 },
    ])
  })
})

describe('csvRows', () => {
  // Built from local Date components, then round-tripped through
  // toISOString(), exactly the shape a real clockInAt string has. csvRows
  // reads it back with local getters, so as long as the fixture and the
  // assertion agree on "local" (both do, implicitly, on whatever machine runs
  // this test), the expected stamp holds regardless of the host's UTC
  // offset — unlike a fixture hand-written as a UTC ISO string, which would
  // shift by the offset and fail on negative-UTC-offset machines.
  const clockInAt = new Date(2026, 1, 5, 8, 5, 0).toISOString() // local: 2026-02-05 08:05

  const payload = {
    since: '2026-02-02T00:00:00.000Z',
    until: '2026-02-09T00:00:00.000Z',
    person: { discordId: 'u1', name: 'Ana' },
    truncated: false,
    entries: [
      {
        id: 'e1', clockInAt, clockOutAt: null, minutes: 65,
        taskId: 't1', taskTitle: 'Login', projectId: 'p1', projectName: 'Core',
        note: 'fixed a bug', source: 'discord',
      },
      {
        id: 'e2', clockInAt, clockOutAt: null, minutes: 20,
        taskId: null, taskTitle: null, projectId: null, projectName: null,
        note: null, source: 'discord',
      },
    ],
  } as unknown as TimeEntriesPayload

  it('is a header row plus one row per entry, with a zero-padded YYYY-MM-DD HH:mm stamp', () => {
    const rows = csvRows(payload)
    expect(rows[0]).toEqual(['Date', 'Person', 'Project', 'Task', 'Minutes', 'Note', 'Source'])
    expect(rows[1][0]).toBe('2026-02-05 08:05')
    expect(rows[1]).toEqual(['2026-02-05 08:05', 'Ana', 'Core', 'Login', 65, 'fixed a bug', 'discord'])
  })

  it('falls back a null taskTitle to "General work"', () => {
    const rows = csvRows(payload)
    expect(rows[2][3]).toBe('General work')
  })

  it('renders a null projectName and note as empty columns end-to-end through toCsv', () => {
    const lines = toCsv(csvRows(payload)).split('\r\n')
    expect(lines[2]).toBe('2026-02-05 08:05,Ana,,General work,20,,discord')
  })
})

// Local dates throughout, like weekRange: built with the local-time Date
// constructor so the tests mean the same thing in any timezone.
describe('dayRange', () => {
  it('runs from local midnight to the next local midnight', () => {
    const r = dayRange(new Date(2026, 9, 12, 15, 30))
    expect(r.since).toEqual(new Date(2026, 9, 12, 0, 0, 0, 0))
    expect(r.until).toEqual(new Date(2026, 9, 13, 0, 0, 0, 0))
  })
  it('crosses a month end', () => {
    const r = dayRange(new Date(2026, 9, 31, 23, 59))
    expect(r.until).toEqual(new Date(2026, 10, 1, 0, 0, 0, 0))
  })
})

describe('shiftRange', () => {
  it('moves a day by days', () => {
    const r = dayRange(new Date(2026, 9, 12))
    expect(shiftRange(r, 'day', -1)).toEqual(dayRange(new Date(2026, 9, 11)))
    expect(shiftRange(r, 'day', 1)).toEqual(dayRange(new Date(2026, 9, 13)))
  })
  it('moves a week by weeks, exactly as shiftWeek does', () => {
    const r = weekRange(new Date(2026, 9, 12))
    expect(shiftRange(r, 'week', -1)).toEqual(shiftWeek(r, -1))
    expect(shiftRange(r, 'week', 2)).toEqual(shiftWeek(r, 2))
  })
})

describe('switchView', () => {
  const today = new Date(2026, 9, 14, 10, 0) // a Wednesday
  it('week to day opens today when the shown week holds today', () => {
    expect(switchView(weekRange(today), 'day', today)).toEqual(dayRange(today))
  })
  it("week to day opens that week's Monday when the week does not hold today", () => {
    const earlier = weekRange(new Date(2026, 8, 24)) // Mon 21 Sep .. Sun 27 Sep
    expect(switchView(earlier, 'day', today)).toEqual(dayRange(new Date(2026, 8, 21)))
  })
  it('day to week opens the week holding that day', () => {
    const sunday = dayRange(new Date(2026, 9, 18))
    expect(switchView(sunday, 'week', today)).toEqual(weekRange(new Date(2026, 9, 18)))
  })
  it('the same view keeps the range', () => {
    const r = dayRange(new Date(2026, 9, 2))
    expect(switchView(r, 'day', today)).toEqual(r)
  })
})

describe('parseTimeView', () => {
  it('reads ?view=day and treats anything else as week', () => {
    expect(parseTimeView('day')).toBe('day')
    expect(parseTimeView('week')).toBe('week')
    for (const v of [null, undefined, '', 'Day', 'month']) expect(parseTimeView(v)).toBe('week')
  })
})

describe('csvFilename for one day', () => {
  it('names the single day once', () => {
    const r = dayRange(new Date(2026, 9, 12))
    expect(csvFilename('Ali Khan', r.since, r.until)).toBe('time-ali-khan-2026-10-12.csv')
  })
  it('a week keeps its from-to name', () => {
    const r = weekRange(new Date(2026, 9, 12))
    expect(csvFilename('Ali Khan', r.since, r.until)).toBe('time-ali-khan-2026-10-12-to-2026-10-18.csv')
  })
})
