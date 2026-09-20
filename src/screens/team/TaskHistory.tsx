import { c, txt, muted } from '../../lib'
import type { Theme } from '../../types'
import type { TaskRow } from '../tasksLogic'
import Avatar from './Avatar'
import { actorName, describeChange, relativeTime } from './activityLogic'
import { fmtDate } from './detailLogic'

// Who did what to this task, newest first, ending with who created it. Each row
// is one update: a small picture, the person, a sentence per change, and when.
// The bot keeps the newest 15 updates per task; the creation line is always last.
export default function TaskHistory({ task, theme }: { task: TaskRow; theme: Theme }) {
  const entries = task.activity ?? []
  const created = fmtDate(task.createdAt)
  const rows = [
    ...entries.map((e, i) => ({
      key: `a${i}`,
      actor: e.actor,
      text: e.changes.map(describeChange).join('; ') || 'updated this task',
      when: relativeTime(e.at),
      title: e.at ?? undefined,
      viaSite: e.viaSite,
    })),
    ...(task.createdBy || created
      ? [{ key: 'created', actor: task.createdBy, text: 'created this task', when: created, title: task.createdAt, viaSite: false }]
      : []),
  ]
  if (!rows.length) return null
  return (
    <ul className="list-none p-0 m-0 flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key} className="flex items-start gap-2.5">
          <Avatar person={{ name: r.actor?.unknown ? '?' : (r.actor?.name ?? '?'), avatarUrl: r.actor?.avatarUrl }} size={26} theme={theme} />
          <p className={c('text-sm m-0 min-w-0', txt(theme))}>
            <span className="font-semibold">{actorName(r.actor)}</span>{' '}
            <span className={c(theme === 'dark' ? 'text-white/70' : 'text-slate-600')}>{r.text}</span>
            {r.when && <span className={c('text-xs ml-2', muted(theme))} title={r.title}>{r.when}{r.viaSite ? ' · via the site' : ''}</span>}
          </p>
        </li>
      ))}
    </ul>
  )
}
