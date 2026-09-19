// Pure board logic: the four fixed columns, the status<->column mapping, and
// the drop-outcome decision the Board screen uses to decide whether to call
// setTaskStatus at all. No React, no DOM — see Board.tsx for the drag/drop UI.
import { isTerminal, type TaskRef, type TaskRow } from '../tasksLogic'

export interface BoardColumn { key: string; label: string; status: string }

export const COLUMNS: BoardColumn[] = [
  { key: 'open', label: 'Open', status: 'open' },
  { key: 'pending', label: 'Pending', status: 'pending' },
  { key: 'in_progress', label: 'In progress', status: 'in_progress' },
  { key: 'done', label: 'Done', status: 'done' },
]

// Every terminal status (closed/done/resolved) lands in the Done column; the
// other three statuses map 1:1 onto their own column. Anything unrecognized
// falls back to Open rather than being dropped from the board.
export function columnOf(status: string): string {
  if (isTerminal(status)) return 'done'
  const col = COLUMNS.find((c) => c.status === status)
  return col ? col.key : 'open'
}

// Inverse of columnOf for the four column keys: the status a card takes on
// when dropped into that column.
export function statusForColumn(key: string): string {
  const col = COLUMNS.find((c) => c.key === key)
  return col ? col.status : key
}

export function groupByColumn(tasks: TaskRow[]): Record<string, TaskRow[]> {
  const groups: Record<string, TaskRow[]> = {}
  for (const c of COLUMNS) groups[c.key] = []
  for (const task of tasks) {
    const key = columnOf(task.status)
    if (!groups[key]) groups[key] = []
    groups[key].push(task)
  }
  return groups
}

export type DropOutcome = { change: false } | { change: true; status: string }

// Dropping a card back on its own column (including any terminal status
// dropped again on Done) is a no-op; otherwise the task moves to the
// column's status.
export function dropOutcome(task: TaskRow, columnKey: string): DropOutcome {
  if (columnOf(task.status) === columnKey) return { change: false }
  return { change: true, status: statusForColumn(columnKey) }
}

export type DropErrorKind = 'forbidden' | 'offline' | 'other'
export interface DropError { kind: DropErrorKind; text: string }

// What to put in the toast when a drop's setTaskStatus call rejects. The HTTP
// status decides first — it is the one part of the response CSAAS can't phrase
// differently — and the message is only consulted when the status is missing or
// says nothing useful (a network-layer throw, say). CSAAS sends the specific
// sentence in `payload`, which api.ts surfaces as the error message.
export function classifyDropError(err: { status?: number; message?: string }): DropError {
  const status = err?.status
  const message = (err?.message ?? '').trim()
  const forbidden: DropError = { kind: 'forbidden', text: "You can't move tasks. Ask an admin for the update_discord_tasks permission." }
  const offline: DropError = { kind: 'offline', text: 'Discord bot is offline, try again.' }
  const misconfigured: DropError = { kind: 'other', text: 'Discord bot link is misconfigured. Tell an admin.' }
  if (status === 403) return forbidden
  // A missing DISCORD_BOT_SECRET, a bot that answered 401/503, and a reply
  // CSAAS could not parse all arrive under the same 502/503 as "unreachable",
  // so the sentence has to be read before the status is trusted. None of them
  // is fixed by trying again, so they must not say "try again" — the three
  // phrases below are the ones discordTasksStatus.js sends.
  if (/not configured|rejected the request|unreadable reply/i.test(message)) return misconfigured
  if (status === 502 || status === 503) return offline
  if (/permission/i.test(message)) return forbidden
  if (/not reachable|offline|failed to fetch|networkerror|load failed/i.test(message)) return offline
  return { kind: 'other', text: message || 'Could not move the card.' }
}

// --- Optimistic override bookkeeping ------------------------------------
//
// The Board holds a card where the visitor dropped it, keyed by task id, until
// the payload catches up. Both of these are about *ownership*: a slow request
// must never undo a newer move, and an override must only be dropped once
// something has actually confirmed it.

// Remove `id` only if it still carries the status the finishing request set.
// If a second drop on the same card overwrote it, the newer move owns the
// entry and the older request leaves it alone.
export function releaseOverride(
  overrides: Record<string, string>,
  id: string,
  status: string,
): Record<string, string> {
  if (overrides[id] !== status) return overrides
  const next = { ...overrides }
  delete next[id]
  return next
}

// Drop every override the server now agrees with. This is the only thing that
// retires a successful move: if the refetch failed and left the payload stale,
// no task matches, nothing retires, and the card stays where it was put.
// Returns the same object when nothing changes so the effect cannot loop.
export function retireOverrides(
  overrides: Record<string, string>,
  tasks: Pick<TaskRow, 'id' | 'status'>[],
): Record<string, string> {
  const ids = Object.keys(overrides)
  if (ids.length === 0) return overrides
  const settled = tasks.filter((t) => overrides[t.id] === t.status)
  if (settled.length === 0) return overrides
  const next = { ...overrides }
  for (const t of settled) delete next[t.id]
  return next
}

// What the board's "Blocked" chip says: name what's actually still open, not
// a blocker that's already done — the List view already does this (its own
// inline computation, not shared here), and a bare "Blocked" tag forces a
// click into the card just to find out by what.
export function blockedLabel(blockedBy: TaskRef[]): string {
  const openBlockers = blockedBy.filter((b) => !isTerminal(b.status ?? ''))
  return openBlockers.length ? `Blocked by: ${openBlockers.map((b) => b.title).join(', ')}` : 'Blocked'
}
