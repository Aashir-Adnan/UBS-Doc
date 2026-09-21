import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { c, txt, muted } from '../../lib'
import type { Theme } from '../../types'
import { isTerminal, STATUS_LABEL, type TaskRow } from '../tasksLogic'
import { AvatarStack } from './Avatar'
import { progressPercent } from './hierarchyLogic'

// A task's subtasks as a checklist: a progress bar, then one row per subtask with
// a checkbox, the title (a link to the subtask), who holds it and its status.
//
// Ticking a box finishes the subtask (unticking reopens it) through the same
// status call the board uses, so the parent completes on its own once the last
// one is ticked. With no permission to move tasks the boxes are read-only.
export default function SubtaskChecklist({ task, theme, search, canToggle, busyId, onToggle }: {
  task: TaskRow
  theme: Theme
  search: string
  canToggle: boolean
  busyId: string | null
  onToggle: (subtaskId: string) => void
}) {
  const d = theme === 'dark'
  const subtasks = task.subtasks ?? []
  const progress = task.subtaskProgress ?? { done: 0, total: subtasks.length }
  const pct = progressPercent({ subtaskProgress: progress })
  const complete = progress.total > 0 && progress.done === progress.total

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className={c('flex-1 h-2 rounded-full overflow-hidden', d ? 'bg-white/10' : 'bg-slate-200')}
          role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Subtasks finished">
          <div className={c('h-full rounded-full tr', complete ? 'bg-emerald-500' : 'bg-indigo-500')} style={{ width: `${pct}%` }} />
        </div>
        <span className={c('text-xs font-bold shrink-0', complete ? 'text-emerald-500' : muted(theme))}>
          {progress.done} of {progress.total} done
        </span>
      </div>

      <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
        {subtasks.map((s) => {
          const done = isTerminal(s.status)
          const busy = busyId === s.id
          return (
            <li key={s.id} className={c('flex items-center gap-3 rounded-xl border px-3 py-2', d ? 'border-white/8 bg-white/4' : 'border-slate-200 bg-slate-50')}>
              <button
                type="button"
                role="checkbox"
                aria-checked={done}
                aria-label={`${done ? 'Reopen' : 'Finish'} ${s.title}`}
                disabled={!canToggle || busy}
                onClick={() => onToggle(s.id)}
                title={canToggle ? (done ? 'Reopen this subtask' : 'Mark this subtask done') : 'You need permission to update tasks'}
                className={c(
                  'w-5 h-5 rounded-md border inline-flex items-center justify-center shrink-0 tr',
                  done
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : d ? 'border-white/25 text-transparent' : 'border-slate-300 text-transparent',
                  canToggle && !busy ? 'cursor-pointer hover:border-indigo-400' : 'cursor-default',
                  busy ? 'opacity-50' : '',
                )}
              >
                <Check size={13} strokeWidth={3} />
              </button>
              <Link
                to={`/tools/team/tasks/${s.id}${search}`}
                className={c('flex-1 min-w-0 text-sm font-semibold no-underline hover:underline truncate', done ? muted(theme) : txt(theme), done ? 'line-through' : '')}
              >
                {s.title}
              </Link>
              <AvatarStack people={s.assignees} size={22} theme={theme} />
              <span className={c('text-[11px] font-semibold shrink-0', muted(theme))}>{STATUS_LABEL[s.status] ?? s.status}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
