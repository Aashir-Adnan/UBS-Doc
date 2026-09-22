import { c, txt, muted } from '../../lib'
import type { Theme } from '../../types'
import type { TaskRow } from '../tasksLogic'
import { formatDuration, estimatePercent, isOverEstimate, topContributors } from './timeLogic'
import Avatar from './Avatar'

// The Time field on a task's detail page: the running total, an estimate bar
// once there is an estimate to measure against, and who logged the time.
// TaskDetail only renders this at all once the backend has shipped either
// `timeLogged` or `estimateMinutes` for the task; within it, `timeLogged ?? 0`
// is the right fallback for a present-but-partial payload (a real zero, not a
// missing value — TaskDetail already told the difference before mounting this).
export default function TimeSection({ task, theme }: { task: TaskRow; theme: Theme }) {
  const d = theme === 'dark'
  const logged = task.timeLogged ?? 0
  const hasEstimate = task.estimateMinutes !== null && task.estimateMinutes !== undefined
  const pct = estimatePercent(logged, task.estimateMinutes) ?? 0
  const over = isOverEstimate(logged, task.estimateMinutes)
  // Already sorted descending by the backend; never re-sorted here.
  const contributors = topContributors(task.timeByPerson ?? [], 5)

  return (
    <div>
      <p className={c('text-lg font-extrabold m-0', txt(theme))}>
        {formatDuration(logged)} <span className={c('text-xs font-bold uppercase tracking-wide', muted(theme))}>logged</span>
      </p>

      {hasEstimate && (
        <div className="mt-3 mb-1">
          <div className="flex items-center gap-3 mb-1.5">
            <div className={c('flex-1 h-2 rounded-full overflow-hidden', d ? 'bg-white/10' : 'bg-slate-200')}
              role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Logged against the estimate">
              <div className={c('h-full rounded-full tr', over ? 'bg-red-500' : 'bg-indigo-500')} style={{ width: `${pct}%` }} />
            </div>
            <span className={c('text-xs font-bold shrink-0', over ? 'text-red-500' : muted(theme))}>{pct}%</span>
          </div>
          <p className={c('text-xs font-semibold m-0', muted(theme))}>
            {formatDuration(logged)} of {formatDuration(task.estimateMinutes)}
          </p>
        </div>
      )}

      {contributors.length > 0 && (
        <div className={hasEstimate ? 'mt-4' : 'mt-3'}>
          <p className={c('text-[11px] font-bold uppercase tracking-wide m-0 mb-1.5', muted(theme))}>Logged by</p>
          <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
            {contributors.map((person, i) => {
              // A synthetic "N others" rollup row has no discordId — no real
              // person to draw an Avatar for, so a plain placeholder stands in.
              const isPerson = 'discordId' in person
              return (
                <li key={isPerson ? person.discordId : `others-${i}`} className="flex items-center gap-2">
                  {isPerson
                    ? <Avatar person={person} size={20} theme={theme} />
                    : (
                      <span
                        aria-hidden="true"
                        style={{ width: 20, height: 20 }}
                        className={c('rounded-full inline-flex items-center justify-center shrink-0 text-[10px] font-bold select-none',
                          d ? 'bg-white/10 text-white/40' : 'bg-slate-200 text-slate-500')}
                      >
                        …
                      </span>
                    )}
                  <span className={c('text-xs font-semibold flex-1 min-w-0 truncate', txt(theme))}>{person.name}</span>
                  <span className={c('text-xs font-semibold shrink-0', muted(theme))}>{formatDuration(person.minutes)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
