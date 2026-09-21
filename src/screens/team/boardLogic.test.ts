import { describe, it, expect } from 'vitest'
import {
  COLUMNS, columnOf, statusForColumn, groupByColumn, dropOutcome, classifyDropError,
  releaseOverride, retireOverrides, blockedLabel, edgeScrollDelta, dropBlockReason, plainRuleMessage,
} from './boardLogic'
import type { TaskRow, TaskRef } from '../tasksLogic'

const t = (id: string, status: string): TaskRow => ({
  id, title: id, type: 'feature', status, implementationStatus: null,
  assignees: [], blockedBy: [], blocks: [], isBlocked: false,
  channelUrl: null, createdAt: '', updatedAt: '',
  description: null, scope: null, modules: [], createdBy: null,
  passedApiTests: null, passedQaTests: null, passedAcceptanceCriteria: null,
  projectId: null, projectName: null,
})

describe('COLUMNS', () => {
  it('is the four fixed columns in order', () => {
    expect(COLUMNS.map((c) => c.key)).toEqual(['open', 'pending', 'in_progress', 'done'])
    expect(COLUMNS.map((c) => c.status)).toEqual(['open', 'pending', 'in_progress', 'done'])
  })
})

describe('columnOf', () => {
  it('maps a terminal status other than "done" onto the Done column', () => {
    expect(columnOf('resolved')).toBe('done')
    expect(columnOf('closed')).toBe('done')
    expect(columnOf('done')).toBe('done')
  })
  it('maps the non-terminal statuses onto their own columns', () => {
    expect(columnOf('open')).toBe('open')
    expect(columnOf('pending')).toBe('pending')
    expect(columnOf('in_progress')).toBe('in_progress')
  })
})

describe('statusForColumn', () => {
  it('is the inverse of columnOf for the four column keys', () => {
    expect(statusForColumn('open')).toBe('open')
    expect(statusForColumn('pending')).toBe('pending')
    expect(statusForColumn('in_progress')).toBe('in_progress')
    expect(statusForColumn('done')).toBe('done')
  })
})

describe('groupByColumn', () => {
  it('keeps every task exactly once, in a column per its status, preserving order', () => {
    const tasks = [t('A', 'open'), t('B', 'resolved'), t('C', 'in_progress'), t('D', 'open')]
    const groups = groupByColumn(tasks)
    expect(groups.open.map((x) => x.id)).toEqual(['A', 'D'])
    expect(groups.pending.map((x) => x.id)).toEqual([])
    expect(groups.in_progress.map((x) => x.id)).toEqual(['C'])
    expect(groups.done.map((x) => x.id)).toEqual(['B'])
    const total = Object.values(groups).reduce((n, arr) => n + arr.length, 0)
    expect(total).toBe(tasks.length)
  })
  it('returns every column key even when empty', () => {
    const groups = groupByColumn([])
    expect(Object.keys(groups).sort()).toEqual(['done', 'in_progress', 'open', 'pending'])
  })
})

describe('dropOutcome', () => {
  it('is a no-op when dropped on its current column', () => {
    expect(dropOutcome(t('A', 'open'), 'open')).toEqual({ change: false })
    expect(dropOutcome(t('A', 'resolved'), 'done')).toEqual({ change: false })
  })
  it('reports the new status when dropped on a different column', () => {
    expect(dropOutcome(t('A', 'open'), 'in_progress')).toEqual({ change: true, status: 'in_progress' })
  })
  it('moving a terminal task to Done again is a no-op regardless of its exact terminal status', () => {
    expect(dropOutcome(t('A', 'closed'), 'done')).toEqual({ change: false })
  })
})

describe('classifyDropError', () => {
  it('classifies a 403 as forbidden with the permission sentence', () => {
    expect(classifyDropError({ status: 403, message: "Permission 'update_discord_tasks' is required for this action" }))
      .toEqual({ kind: 'forbidden', text: "You can't move tasks. Ask an admin for the update_discord_tasks permission." })
  })
  it('classifies a message mentioning Permission as forbidden even without a status', () => {
    expect(classifyDropError({ message: "Permission 'update_discord_tasks' is required for this action" }).kind).toBe('forbidden')
  })
  it('classifies 502 and 503 as offline', () => {
    expect(classifyDropError({ status: 502, message: 'Discord bot is not reachable' }))
      .toEqual({ kind: 'offline', text: 'Discord bot is offline, try again.' })
    expect(classifyDropError({ status: 503, message: '' }).kind).toBe('offline')
  })
  it('classifies the offline wordings by message when the status says nothing', () => {
    expect(classifyDropError({ message: 'Discord bot is not reachable' }).kind).toBe('offline')
    expect(classifyDropError({ message: 'The bot is OFFLINE right now' }).kind).toBe('offline')
  })
  // A deployment fault is not an outage: retrying never fixes it, so these
  // three must not get the "try again" sentence even though CSAAS sends them
  // under the same 502/503 as a genuinely unreachable bot.
  it('classifies a missing bot link as misconfigured, not offline', () => {
    expect(classifyDropError({ status: 503, message: 'Discord bot link is not configured' }))
      .toEqual({ kind: 'other', text: 'Discord bot link is misconfigured. Tell an admin.' })
  })
  it('classifies a bot that refused the call as misconfigured', () => {
    expect(classifyDropError({ status: 502, message: 'Discord bot rejected the request (configuration)' }))
      .toEqual({ kind: 'other', text: 'Discord bot link is misconfigured. Tell an admin.' })
  })
  it('classifies an unparseable bot reply as misconfigured', () => {
    expect(classifyDropError({ status: 502, message: 'Discord bot returned an unreadable reply' }))
      .toEqual({ kind: 'other', text: 'Discord bot link is misconfigured. Tell an admin.' })
  })
  it('recognises the misconfiguration wordings without a status too', () => {
    expect(classifyDropError({ message: 'Discord bot link is not configured' }).kind).toBe('other')
    expect(classifyDropError({ message: 'discord bot REJECTED THE REQUEST (configuration)' }).text)
      .toBe('Discord bot link is misconfigured. Tell an admin.')
  })
  it('still calls a plain unreachable 502 offline', () => {
    expect(classifyDropError({ status: 502, message: 'Discord bot is not reachable' }).kind).toBe('offline')
  })
  it('classifies a browser network failure as offline', () => {
    // A fetch that never reached CSAAS throws a TypeError with no status, and
    // the wording differs per browser.
    expect(classifyDropError({ message: 'Failed to fetch' }).kind).toBe('offline')
    expect(classifyDropError({ message: 'NetworkError when attempting to fetch resource.' }).kind).toBe('offline')
    expect(classifyDropError({ message: 'Load failed' }).kind).toBe('offline')
  })
  it('passes anything else through as "other" with its own message', () => {
    expect(classifyDropError({ status: 404, message: 'Task not found' }))
      .toEqual({ kind: 'other', text: 'Task not found' })
  })
  it('falls back to a generic sentence when there is no message at all', () => {
    expect(classifyDropError({})).toEqual({ kind: 'other', text: 'Could not move the card.' })
    expect(classifyDropError({ status: 500, message: '' }).text).toBe('Could not move the card.')
  })
  it('lets the status win over the text: a 403 whose message mentions offline is still forbidden', () => {
    expect(classifyDropError({ status: 403, message: 'bot is offline' }).kind).toBe('forbidden')
  })
})

describe('releaseOverride', () => {
  it('removes the entry when it still holds the status that request set', () => {
    expect(releaseOverride({ A: 'done', B: 'open' }, 'A', 'done')).toEqual({ B: 'open' })
  })
  it('keeps the entry when a newer move already replaced it', () => {
    // Drop 1 (-> done) resolves after drop 2 (-> open) overwrote the override:
    // drop 1 must not pull the card back out from under the newer move.
    expect(releaseOverride({ A: 'open' }, 'A', 'done')).toEqual({ A: 'open' })
  })
  it('is a no-op for an id that is not overridden', () => {
    const before = { B: 'open' }
    expect(releaseOverride(before, 'A', 'done')).toBe(before)
  })
  it('does not mutate the map it is given', () => {
    const before = { A: 'done' }
    releaseOverride(before, 'A', 'done')
    expect(before).toEqual({ A: 'done' })
  })
})

describe('retireOverrides', () => {
  it('drops overrides the payload now agrees with', () => {
    expect(retireOverrides({ A: 'done', B: 'open' }, [t('A', 'done'), t('B', 'pending')]))
      .toEqual({ B: 'open' })
  })
  it('keeps an override the payload has not caught up with yet', () => {
    expect(retireOverrides({ A: 'done' }, [t('A', 'open')])).toEqual({ A: 'done' })
  })
  it('keeps an override whose task is not in the list at all', () => {
    // Filtered out of view, or a refetch that failed and left the payload
    // stale: either way the server has not been seen to agree.
    expect(retireOverrides({ A: 'done' }, [])).toEqual({ A: 'done' })
  })
  it('returns the same map when nothing retires, so the effect cannot loop', () => {
    const before = { A: 'done' }
    expect(retireOverrides(before, [t('A', 'open')])).toBe(before)
    expect(retireOverrides({}, [t('A', 'open')])).toEqual({})
  })
  it('retires several at once and does not mutate the map it is given', () => {
    const before = { A: 'done', B: 'open', C: 'pending' }
    expect(retireOverrides(before, [t('A', 'done'), t('B', 'open'), t('C', 'in_progress')]))
      .toEqual({ C: 'pending' })
    expect(before).toEqual({ A: 'done', B: 'open', C: 'pending' })
  })
})

describe('blockedLabel', () => {
  const ref = (id: string, title: string, status?: string): TaskRef => ({ id, title, status })

  it('names every open blocker', () => {
    expect(blockedLabel([ref('b1', 'Fix the API'), ref('b2', 'Ship the schema')]))
      .toBe('Blocked by: Fix the API, Ship the schema')
  })

  it('leaves out a blocker that is already closed, done or resolved', () => {
    expect(blockedLabel([ref('b1', 'Already done', 'done'), ref('b2', 'Still open', 'open')]))
      .toBe('Blocked by: Still open')
  })

  it('falls back to a bare "Blocked" when every blocker has finished, or none is named', () => {
    expect(blockedLabel([ref('b1', 'Closed one', 'closed'), ref('b2', 'Resolved one', 'resolved')]))
      .toBe('Blocked')
    expect(blockedLabel([])).toBe('Blocked')
  })

  it('treats a missing status as still open', () => {
    expect(blockedLabel([ref('b1', 'No status set')])).toBe('Blocked by: No status set')
  })
})

describe('edgeScrollDelta', () => {
  const box = { left: 100, right: 1100 }
  it('does not scroll away from the edges', () => {
    expect(edgeScrollDelta(600, box)).toBe(0)
    expect(edgeScrollDelta(190, box)).toBe(0)
    expect(edgeScrollDelta(1010, box)).toBe(0)
  })
  it('scrolls left near the left edge and right near the right edge', () => {
    expect(edgeScrollDelta(150, box)).toBeLessThan(0)
    expect(edgeScrollDelta(1050, box)).toBeGreaterThan(0)
  })
  it('scrolls faster the closer to the edge, up to the top speed', () => {
    expect(Math.abs(edgeScrollDelta(110, box))).toBeGreaterThan(Math.abs(edgeScrollDelta(180, box)))
    expect(edgeScrollDelta(1500, box)).toBe(28)
    expect(edgeScrollDelta(0, box)).toBe(-28)
  })
})

describe('dropBlockReason', () => {
  const withSubs = { ...t('P', 'in_progress'), subtasks: [{ id: 'a', title: 'Sub a', status: 'open', assignees: [] }, { id: 'b', title: 'Sub b', status: 'done', assignees: [] }] }
  it('refuses a drop onto Done while a subtask is open, and says which', () => {
    expect(dropBlockReason(withSubs, 'done')).toBe('Finish its subtasks first (1 open: Sub a).')
  })
  it('allows every other column, and a task already in Done', () => {
    expect(dropBlockReason(withSubs, 'open')).toBeNull()
    expect(dropBlockReason(withSubs, 'pending')).toBeNull()
    expect(dropBlockReason(withSubs, 'in_progress')).toBeNull()
    expect(dropBlockReason({ ...withSubs, status: 'closed' }, 'done')).toBeNull()
  })
  it('allows Done once every subtask is finished, or with no subtasks', () => {
    expect(dropBlockReason({ ...withSubs, subtasks: [{ id: 'b', title: 'Sub b', status: 'done', assignees: [] }] }, 'done')).toBeNull()
    expect(dropBlockReason(t('X', 'open'), 'done')).toBeNull()
  })
})

describe('the bot\'s refusal as a toast', () => {
  const message = "**Parent** can't be marked done yet — 2 subtasks are still open:\n• Sub a\n• Sub b"
  it('flattens the markdown and the bullet list to one plain line', () => {
    expect(plainRuleMessage(message)).toBe("Parent can't be marked done yet — 2 subtasks are still open: Sub a · Sub b")
  })
  it('is what a 409 shows, ahead of the offline and generic wordings', () => {
    expect(classifyDropError({ status: 409, message })).toEqual({ kind: 'other', text: plainRuleMessage(message) })
    expect(classifyDropError({ status: 409, message: '' }).text).toBe('That move is not allowed right now.')
  })
})
