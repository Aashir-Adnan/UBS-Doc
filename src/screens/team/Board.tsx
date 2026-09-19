import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Ban } from 'lucide-react'
import { c, card, txt, muted, chipGray, chipRed } from '../../lib'
import { useTheme } from '../../app/ThemeContext'
import type { Theme } from '../../types'
import { allTasks, applyFilters, statusTone, STATUS_LABEL, type TaskRow } from '../tasksLogic'
import { useActingPermissions } from '../../components/portal/tenantProjects/useActingPermissions'
import { setTaskStatus } from '../../components/discordTasks/api'
import {
  COLUMNS, groupByColumn, dropOutcome, classifyDropError, releaseOverride, retireOverrides, blockedLabel,
  type BoardColumn,
} from './boardLogic'
import { toneChip } from './chips'
import Toast, { type ToastTone } from './Toast'
import { useTeam } from './TeamLayout'

// The Board tab: the same filtered corpus as the Tasks tab, laid out in the
// four fixed columns, with native HTML drag and drop writing a status change
// back through CSAAS and the Discord bot.
//
// Two things make this simpler than it looks:
//   * the board always shows every status (the status select is hidden on this
//     tab), so filters go in with `status: 'all'`;
//   * a move is optimistic through an `overrides` map keyed by task id rather
//     than a copy of the payload — the payload belongs to TeamLayout, and after
//     refresh() lands the override is dropped and the server's row takes over.

// The MIME type is our own: `text/task-id` keeps a card dragged onto anything
// else on the page (or out of the window) from pasting an opaque id.
const DRAG_TYPE = 'text/task-id'

// `seq` only exists to key the <Toast>: two identical consecutive messages
// would otherwise reuse the same element and keep the first one's dying timer.
interface ToastState { message: string; tone: ToastTone; seq: number }

export default function Board() {
  const { theme } = useTheme()
  const { payload, loading, error, filters, refresh } = useTeam()
  const { search } = useLocation()
  const { has, loaded } = useActingPermissions()
  const canMove = has('update_discord_tasks')

  const [overrides, setOverrides] = useState<Record<string, string>>({})
  // The newest status requested per card, readable synchronously. A setState
  // updater only runs at the next render, so it cannot tell a finishing
  // request whether it is still the current one for that card — this can.
  const latest = useRef<Record<string, string>>({})
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)

  const projects = payload?.projects ?? []
  // The board has no status filter of its own — its columns are the statuses —
  // so the shared filter bar's status value is deliberately overridden here.
  const tasks = useMemo(
    () => allTasks(applyFilters(projects, { ...filters, status: 'all' })),
    [projects, filters],
  )
  // Optimistic statuses are applied at render time only; nothing mutates the
  // payload, so a refresh or a tab switch cannot be left holding a stale copy.
  const shown = useMemo(
    () => tasks.map((t) => (overrides[t.id] ? { ...t, status: overrides[t.id] } : t)),
    [tasks, overrides],
  )
  const groups = useMemo(() => groupByColumn(shown), [shown])

  // An override retires only when the payload is seen to carry that status.
  // Nothing else drops one: if a refetch fails and leaves the payload stale,
  // the card stays where the visitor put it rather than snapping back to a
  // column the server no longer agrees with.
  useEffect(() => {
    setOverrides((prev) => retireOverrides(prev, tasks))
  }, [tasks])

  // Stable identity: Toast re-arms its dismiss timer whenever onClose changes,
  // and refresh() re-renders this component mid-toast.
  const closeToast = useCallback(() => setToast(null), [])
  const showToast = useCallback((message: string, tone: ToastTone) => {
    setToast((prev) => ({ message, tone, seq: (prev?.seq ?? 0) + 1 }))
  }, [])

  const move = useCallback(async (task: TaskRow, status: string) => {
    latest.current[task.id] = status
    setOverrides((prev) => ({ ...prev, [task.id]: status }))
    try {
      const result = await setTaskStatus(task.id, status)
      // The bot warns (never refuses) about moves it considers questionable —
      // starting a blocked task, closing one with open blockers.
      if (result?.warning) showToast(result.warning, 'info')
      // Counts and blocked state are derived server-side, so the authoritative
      // board comes from a refetch. Nothing is cleared here: the effect above
      // retires the override once the payload carries the new status, and if
      // this refetch failed it simply stays until the next one succeeds.
      await refresh()
    } catch (err) {
      // Ownership-checked twice over: releaseOverride leaves the map alone
      // unless this request's status is still the one on the card, and the
      // toast is suppressed for a request a newer drop has already replaced.
      const superseded = latest.current[task.id] !== status
      setOverrides((prev) => releaseOverride(prev, task.id, status))
      if (!superseded) showToast(classifyDropError(err as { status?: number; message?: string }).text, 'error')
      // A rejection does not prove nothing was written: a request that timed
      // out (or whose reply was unreadable) may have reached the bot and
      // changed the task. Having just dropped the override, refetch so the
      // board shows what the server actually holds rather than the pre-drop
      // column. Fire-and-forget — a failed refresh leaves the stale payload,
      // which is where the board already was.
      void refresh()
    }
  }, [refresh, showToast])

  const onDrop = useCallback((e: DragEvent, col: BoardColumn) => {
    e.preventDefault()
    setDragOver(null)
    if (!canMove) return
    const id = e.dataTransfer.getData(DRAG_TYPE)
    if (!id) return
    const task = shown.find((t) => t.id === id)
    if (!task) return
    const outcome = dropOutcome(task, col.key)
    if (!outcome.change) return
    void move(task, outcome.status)
  }, [canMove, shown, move])

  if (loading && !payload) {
    return (
      <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
        <p className={c('text-sm font-medium m-0', muted(theme))}>Loading…</p>
      </div>
    )
  }
  // TeamLayout renders the section's one error banner.
  if (!payload) return null

  return (
    <>
      {loaded && !canMove && (
        <p className={c('text-xs font-semibold mb-4 rounded-xl px-4 py-2.5 border',
          theme === 'dark' ? 'border-white/8 bg-white/4 text-white/55' : 'border-slate-200 bg-slate-50 text-slate-500')}>
          You can view the board. Ask an admin for the update_discord_tasks permission to move cards.
        </p>
      )}

      {!error && tasks.length === 0 && (
        <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
          <p className={c('text-sm font-medium m-0', muted(theme))}>
            {projects.length ? 'No tasks match these filters.' : 'No tasks yet.'}
          </p>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-2 items-start">
          {COLUMNS.map((col) => (
            <Column
              key={col.key}
              col={col}
              tasks={groups[col.key] ?? []}
              theme={theme}
              search={search}
              canMove={canMove}
              over={dragOver === col.key}
              onDragOver={(e) => {
                if (!canMove) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dragOver !== col.key) setDragOver(col.key)
              }}
              onDragLeave={(e) => {
                // Crossing from the column onto one of its own cards fires a
                // leave on the column; ignoring those stops the highlight
                // flickering as the pointer moves down a stack of cards.
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
                setDragOver((k) => (k === col.key ? null : k))
              }}
              onDrop={(e) => onDrop(e, col)}
            />
          ))}
        </div>
      )}

      {toast && <Toast key={toast.seq} message={toast.message} tone={toast.tone} onClose={closeToast} />}
    </>
  )
}

function Column({ col, tasks, theme, search, canMove, over, onDragOver, onDragLeave, onDrop }: {
  col: BoardColumn
  tasks: TaskRow[]
  theme: Theme
  search: string
  canMove: boolean
  over: boolean
  onDragOver: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}) {
  const d = theme === 'dark'
  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={c(
        'flex-1 min-w-[250px] rounded-2xl p-3 border tr',
        over
          ? d ? 'border-indigo-400/60 bg-indigo-500/10' : 'border-indigo-300 bg-indigo-50/70'
          : d ? 'border-white/8 bg-white/3' : 'border-slate-200 bg-slate-50/60',
      )}
    >
      <div className="flex items-baseline justify-between gap-2 px-1 mb-2.5">
        <h2 className={c('font-extrabold text-sm m-0', txt(theme))}>{col.label}</h2>
        <span className={c('text-[11px] font-bold px-2 py-0.5 rounded-full', chipGray(theme))}>{tasks.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((t) => <Card key={t.id} t={t} col={col} theme={theme} search={search} canMove={canMove} />)}
        {tasks.length === 0 && (
          <p className={c('text-xs font-medium text-center py-6 m-0', muted(theme))}>Nothing here</p>
        )}
      </div>
    </section>
  )
}

function Card({ t, col, theme, search, canMove }: { t: TaskRow; col: BoardColumn; theme: Theme; search: string; canMove: boolean }) {
  const d = theme === 'dark'
  return (
    <article
      draggable={canMove}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, t.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={c(
        'rounded-xl border p-3 tr',
        canMove ? 'cursor-grab active:cursor-grabbing' : '',
        d ? 'border-white/8 bg-white/6 hover:border-white/16' : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      <p className={c('text-sm font-semibold m-0 mb-1 leading-snug', txt(theme))}>
        <Link to={`/tools/team/tasks/${t.id}${search}`} className={c('no-underline hover:underline', txt(theme))}>{t.title}</Link>
      </p>
      <p className={c('text-[11px] font-medium m-0', muted(theme))}>
        {t.projectName || 'No project'}
        {' · '}
        {t.assignees.length ? t.assignees.map((a) => a.name).join(', ') : 'Unassigned'}
      </p>
      {(col.key === 'done' || t.isBlocked) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {/* Done holds three different statuses (done/closed/resolved), so only
              there does the card spell out which one it actually is. */}
          {col.key === 'done' && (
            <span className={c('text-[10px] font-bold px-1.5 py-0.5 rounded-md', toneChip[statusTone(t)](theme))}>
              {STATUS_LABEL[t.status] ?? t.status}
            </span>
          )}
          {t.isBlocked && (() => {
            const label = blockedLabel(t.blockedBy)
            return (
              <span
                title={label}
                className={c('text-[10px] font-bold px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 max-w-full', chipRed(theme))}
              >
                <Ban size={10} className="shrink-0" /> <span className="truncate">{label}</span>
              </span>
            )
          })()}
        </div>
      )}
    </article>
  )
}
