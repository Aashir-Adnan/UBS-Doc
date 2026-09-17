// Pure board logic: the four fixed columns, the status<->column mapping, and
// the drop-outcome decision the Board screen uses to decide whether to call
// setTaskStatus at all. No React, no DOM — see Board.tsx for the drag/drop UI.
import { isTerminal, type TaskRow } from '../tasksLogic'

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
  if (status === 403) return forbidden
  if (status === 502 || status === 503) return offline
  if (/permission/i.test(message)) return forbidden
  if (/not reachable|offline|not configured/i.test(message)) return offline
  return { kind: 'other', text: message || 'Could not move the card.' }
}
