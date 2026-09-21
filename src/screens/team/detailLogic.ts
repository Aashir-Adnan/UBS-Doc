// Pure presentation helpers for the task detail view. Kept out of the
// component so the date guard and the dependency-chip mapping are testable
// without rendering anything.
import { isTerminal, STATUS_LABEL, type Tone } from '../tasksLogic'

// The one date format the detail view uses. Returns null — never the string
// "Invalid Date" — for a missing, empty or unparseable timestamp, so callers
// can decide what to show in its place.
export function fmtDate(value: string | null | undefined): string | null {
  if (!value) return null
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return null
  return at.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// `statusTone` needs a whole TaskRow (it consults `isBlocked`), but a
// blockedBy/blocks entry carries only an optional status string. This is the
// same mapping minus the blocked case, which a reference cannot express.
export function refTone(status: string | null | undefined): Tone {
  if (!status) return 'idle'
  if (isTerminal(status)) return 'done'
  if (status === 'in_progress') return 'active'
  return 'idle'
}

export function refLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown'
  return STATUS_LABEL[status] ?? status
}

// Test counters are nullable in the payload: a task that never recorded a
// count shows an em dash rather than 0, which would read as "all failed".
export function testCount(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : String(value)
}
