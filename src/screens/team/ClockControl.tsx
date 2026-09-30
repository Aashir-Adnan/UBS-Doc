import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { c, muted, txt } from '../../lib'
import { useTheme } from '../../app/ThemeContext'
import {
  clockIn, clockOut, fetchClockStatus,
  type ClockStatus,
} from '../../components/discordTasks/api'
import type { ProjectGroup } from '../tasksLogic'
import { clockOutText, clockOutcomeText, clockTaskChoices, elapsedNow, formatElapsed, isClockUnavailable } from './clockLogic'
import { plainRuleMessage } from './boardLogic'
import type { ToastTone } from './Toast'

// The shared clock state for the Team section. TeamLayout calls useClock()
// once and hands the result to the header's ClockControl and, through the Team
// context, to the task page's button — so every view sees the same status and
// every action refreshes it for all of them.
//
// A status fetch that fails (an older backend without the endpoints, or the
// server being down) only marks the clock unavailable: no toast, so the
// 60-second refresh can never loop error messages, and nothing else in the
// Team section depends on it.

const REFRESH_MS = 60_000
const NOTE_MAX = 500
const INACTIVE: ClockStatus = { active: false }

export interface ClockState {
  // null until the first status fetch settles.
  linked: boolean | null
  unavailable: boolean
  status: ClockStatus
  // When the status was fetched; elapsed time ticks forward from this, never
  // from the status's clockInAt.
  fetchedAt: number
  busy: boolean
  refresh: () => Promise<void>
  // Both resolve true when the action went through; errors become a toast.
  clockInOn: (taskId: string | null) => Promise<boolean>
  clockOutNow: (note: string) => Promise<boolean>
  toast: { message: string; tone: ToastTone; seq: number } | null
  dismissToast: () => void
}

export function useClock(): ClockState {
  const [linked, setLinked] = useState<boolean | null>(null)
  const [failed, setFailed] = useState(false)
  const [status, setStatus] = useState<ClockStatus>(INACTIVE)
  const [fetchedAt, setFetchedAt] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<ClockState['toast']>(null)
  const seq = useRef(0)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const show = useCallback((message: string, tone: ToastTone) => {
    setToast((prev) => ({ message, tone, seq: (prev?.seq ?? 0) + 1 }))
  }, [])
  const dismissToast = useCallback(() => setToast(null), [])

  const refresh = useCallback(async () => {
    const mine = ++seq.current
    try {
      const r = await fetchClockStatus()
      if (!alive.current || mine !== seq.current) return
      setLinked(Boolean(r && r.linked))
      setStatus(r && r.linked && r.status ? r.status : INACTIVE)
      setFetchedAt(Date.now())
      setFailed(false)
    } catch {
      if (!alive.current || mine !== seq.current) return
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => { void refresh() }, REFRESH_MS)
    return () => clearInterval(id)
  }, [refresh])

  const clockInOn = useCallback(async (taskId: string | null) => {
    setBusy(true)
    try {
      const result = await clockIn(taskId)
      show(clockOutcomeText(result), 'info')
      // The response already carries the fresh status: apply it at once so a
      // failing follow-up refresh cannot hide a successful action.
      if (alive.current) { seq.current++; setLinked(true); setStatus(result.status ?? INACTIVE); setFetchedAt(Date.now()); setFailed(false) }
      void refresh()
      return true
    } catch (e) {
      show(plainRuleMessage(e instanceof Error ? e.message : '') || 'Could not clock in.', 'error')
      return false
    } finally { if (alive.current) setBusy(false) }
  }, [refresh, show])

  const clockOutNow = useCallback(async (note: string) => {
    setBusy(true)
    try {
      const result = await clockOut(note.slice(0, NOTE_MAX))
      show(clockOutText(result), 'info')
      if (alive.current) { seq.current++; setLinked(true); setStatus(INACTIVE); setFetchedAt(Date.now()); setFailed(false) }
      void refresh()
      return true
    } catch (e) {
      show(plainRuleMessage(e instanceof Error ? e.message : '') || 'Could not clock out.', 'error')
      return false
    } finally { if (alive.current) setBusy(false) }
  }, [refresh, show])

  const unavailable = isClockUnavailable(linked, failed)
  return { linked, unavailable, status, fetchedAt, busy, refresh, clockInOn, clockOutNow, toast, dismissToast }
}

// Closes on Escape and on a press outside `ref`.
function useDismiss(open: boolean, onClose: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [open, onClose, ref])
}

export default function ClockControl({ clock, projects }: { clock: ClockState; projects: ProjectGroup[] }) {
  const { theme } = useTheme()
  const d = theme === 'dark'
  const { linked, unavailable, status, fetchedAt, busy } = clock
  const [now, setNow] = useState(() => Date.now())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [outOpen, setOutOpen] = useState(false)
  const [note, setNote] = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // The elapsed text only needs minute resolution.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  // A dialog or picker left open while the clock changes underneath it (clocked
  // out elsewhere, or in) must not reopen on the next change.
  useEffect(() => {
    if (status.active) setPickerOpen(false); else setOutOpen(false)
  }, [status.active])

  const closePicker = useCallback(() => setPickerOpen(false), [])
  const closeDialog = useCallback(() => setOutOpen(false), [])
  useDismiss(pickerOpen, closePicker, pickerRef)
  useDismiss(outOpen, closeDialog, dialogRef)

  const pill = c('inline-flex items-center gap-2 h-11 px-3 rounded-xl text-xs font-semibold', muted(theme))

  if (unavailable) return <span className={pill}><Clock size={14} /> Clock unavailable</span>
  if (linked === null) return null
  if (!linked) return <span className={pill}><Clock size={14} /> Link your Discord account to clock in</span>

  if (status.active) {
    const elapsed = formatElapsed(elapsedNow(status, fetchedAt, now))
    return (
      <div className="flex items-center gap-2">
        <span className={c('inline-flex items-center gap-2 text-xs font-semibold max-w-[280px]', txt(theme))}>
          <Clock size={14} className="shrink-0 text-indigo-500" />
          <span className="truncate">Clocked in {elapsed} &middot; {status.taskTitle}</span>
        </span>
        <button type="button" disabled={busy} onClick={() => { setNote(''); setOutOpen(true) }}
          className={c('btn-outline-indigo inline-flex items-center px-3 py-1.5 text-xs', d ? 'dark-variant' : '')}>
          Clock out
        </button>
        {outOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Clock out"
              className={c('w-full max-w-md rounded-2xl border p-5 shadow-xl', d ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200')}>
              <h2 className={c('font-extrabold text-base m-0 mb-1', txt(theme))}>Clock out</h2>
              <p className={c('text-xs font-medium m-0 mb-3', muted(theme))}>{status.taskTitle} &middot; {elapsed}</p>
              <label htmlFor="clock-out-note" className={c('block text-[11px] font-bold uppercase tracking-wide mb-1.5', muted(theme))}>Note (optional)</label>
              <textarea id="clock-out-note" className="input-base" rows={3} maxLength={NOTE_MAX} autoFocus
                value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you get done?" />
              <p className={c('text-[11px] text-right m-0 mt-1', muted(theme))}>{note.length}/{NOTE_MAX}</p>
              <div className="flex justify-end gap-2 mt-3">
                <button type="button" onClick={closeDialog}
                  className={c('btn-outline-indigo inline-flex items-center px-3 py-1.5 text-xs', d ? 'dark-variant' : '')}>Cancel</button>
                <button type="button" disabled={busy}
                  onClick={() => { void clock.clockOutNow(note).then((ok) => { if (ok) setOutOpen(false) }) }}
                  className="btn-primary inline-flex items-center px-4 py-1.5 text-xs">Confirm</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const choices = pickerOpen ? clockTaskChoices(projects, query) : []
  return (
    <div ref={pickerRef} className="relative">
      <button type="button" disabled={busy} onClick={() => { setQuery(''); setPickerOpen((o) => !o) }}
        aria-haspopup="listbox" aria-expanded={pickerOpen}
        className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
        <Clock size={14} /> Clock in
      </button>
      {pickerOpen && (
        <div className={c('absolute right-0 z-30 mt-1 w-[min(320px,calc(100vw-2rem))] rounded-xl border p-2 shadow-lg',
          d ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200')}>
          <input className="input-base mb-2" placeholder="Search tasks…" value={query} autoFocus autoComplete="off"
            onChange={(e) => setQuery(e.target.value)} aria-label="Search tasks" />
          <ul role="listbox" className="list-none p-0 m-0 max-h-72 overflow-y-auto">
            {choices.map((ch) => (
              <li key={ch.id ?? '__general__'}>
                <button type="button" role="option" aria-selected={false}
                  onClick={() => { setPickerOpen(false); void clock.clockInOn(ch.id) }}
                  className={c('w-full text-left px-3 py-2 rounded-lg bg-transparent border-0 cursor-pointer tr',
                    d ? 'hover:bg-white/6' : 'hover:bg-slate-100')}>
                  <span className={c('block text-sm font-semibold truncate', txt(theme))}>{ch.label}</span>
                  {ch.projectName && <span className={c('block text-xs truncate', muted(theme))}>{ch.projectName}</span>}
                </button>
              </li>
            ))}
            {choices.length === 1 && query.trim() && (
              <li className={c('text-sm px-3 py-2', muted(theme))}>No task matches &ldquo;{query}&rdquo;.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
