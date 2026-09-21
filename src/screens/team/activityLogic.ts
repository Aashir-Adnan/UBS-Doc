// Pure wording for the task history: one sentence per change, and a relative
// time. No React, no DOM.
import { STATUS_LABEL, scopeLabel, type ActivityChange, type TaskActor } from '../tasksLogic'

const label = (status: string | number | null) => (status === null || status === undefined ? 'none' : (STATUS_LABEL[String(status)] ?? String(status)))
const names = (people: TaskActor[]) => people.map((p) => p.name).join(', ')

const COUNT_LABEL: Record<string, string> = {
  passedApiTests: 'API tests passed',
  passedQaTests: 'QA tests passed',
  passedAcceptanceCriteria: 'acceptance criteria passed',
}

// "moved it to Done (was Open)", "set the scope to QA", "assigned Ana, removed Ben" …
// Every sentence is phrased to follow the actor's name: "<Ana> moved it to Done".
export function describeChange(c: ActivityChange): string {
  switch (c.field) {
    case 'status':
      return `moved it to ${label(c.to)}${c.from ? ` (was ${label(c.from)})` : ''}`
    case 'scope': {
      const to = scopeLabel(c.to === null ? null : String(c.to))
      return to ? `set the scope to ${to}` : 'cleared the scope'
    }
    case 'implementationStatus':
      return `set the implementation status to ${String(c.to ?? 'none').replace(/_/g, ' ')}`
    case 'passedApiTests':
    case 'passedQaTests':
    case 'passedAcceptanceCriteria':
      return `set ${COUNT_LABEL[c.field]} to ${c.to ?? 'none'}`
    case 'title':
      return 'changed the title'
    case 'description':
      return 'changed the description'
    case 'assignees': {
      const parts: string[] = []
      if (c.added.length) parts.push(`assigned ${names(c.added)}`)
      if (c.removed.length) parts.push(`unassigned ${names(c.removed)}`)
      return parts.join(' and ') || 'changed the assignees'
    }
    case 'project':
      return c.to ? `moved it to the ${c.to} project${c.from ? ` (from ${c.from})` : ''}` : `removed it from ${c.from ?? 'its project'}`
    case 'blocked_by':
      return c.action === 'added' ? `made it blocked by "${c.title}"` : `unblocked it from "${c.title}"`
    case 'subtask':
      return `added a subtask "${c.title}"`
    default:
      return 'changed this task'
  }
}

// "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago", then a
// date. Returns null — never "Invalid Date" — for a missing or bad timestamp.
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null
  const at = new Date(iso).getTime()
  if (Number.isNaN(at)) return null
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d} days ago`
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// What a card prints in place of a name it cannot resolve.
export function actorName(actor: TaskActor | null | undefined): string {
  if (!actor) return 'Someone'
  return actor.unknown ? 'Former member' : actor.name
}

// The one-line summary for list rows and board cards:
// "Created by Ana · Updated by Ben, 2 hours ago". Either half is left out when
// unknown; a task with neither returns null so nothing is drawn.
export function whoLine(
  task: { createdBy?: TaskActor | null; updatedBy?: (TaskActor & { at: string | null }) | null },
  now: number = Date.now(),
): string | null {
  const parts: string[] = []
  if (task.createdBy) parts.push(`Created by ${actorName(task.createdBy)}`)
  if (task.updatedBy) {
    const when = relativeTime(task.updatedBy.at, now)
    parts.push(`Updated by ${actorName(task.updatedBy)}${when ? `, ${when}` : ''}`)
  }
  return parts.length ? parts.join(' · ') : null
}
