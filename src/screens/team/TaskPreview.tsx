import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Ban, ExternalLink, Info } from 'lucide-react'
import { c, txt, muted, chipRed } from '../../lib'
import type { Theme } from '../../types'
import { statusTone, STATUS_LABEL, type TaskRow } from '../tasksLogic'
import { blockedLabel } from './boardLogic'
import { popoverPosition } from './previewLogic'
import { toneChip } from './chips'
import Avatar from './Avatar'
import ScopeBadge from './ScopeBadge'
import { whoLine } from './activityLogic'
import { progressText } from './hierarchyLogic'

// The ⓘ button on a board card and the popover it opens: a read-only summary of
// the task (description, scope, project, people, blockers) without leaving the
// board. Click to open, click elsewhere / Esc / scroll to close.
//
// The popover is portalled to <body> and drawn `position: fixed`: the board
// scrolls sideways inside an overflow container, which would clip an absolutely
// positioned child.

const WIDTH = 340
const GUESS_HEIGHT = 340

export default function TaskPreview({ t, theme, search }: { t: TaskRow; theme: Theme; search: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  const d = theme === 'dark'

  const place = useCallback(() => {
    const el = button.current
    if (!el) return
    const width = Math.min(WIDTH, window.innerWidth - 16)
    const height = popover.current?.offsetHeight ?? GUESS_HEIGHT
    setPos(popoverPosition(el.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, { width, height }))
  }, [])

  // First pass positions from a guess; this runs again once the popover is
  // mounted (pos is null until then) and re-places it from its real height,
  // before the browser paints.
  useLayoutEffect(() => {
    if (open) place()
  }, [open, place, pos === null])

  useEffect(() => {
    if (!open) return
    const inside = (target: EventTarget | null) =>
      target instanceof Node && (popover.current?.contains(target) || button.current?.contains(target))
    const onMouseDown = (e: MouseEvent) => { if (!inside(e.target)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    // Any scroll that is not the popover's own moves the button out from under
    // it, so close rather than chase it.
    const onScroll = (e: Event) => { if (!inside(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  const tone = statusTone(t)
  const blocked = t.isBlocked
  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => { setPos(null); setOpen((v) => !v) }}
        aria-label={`Preview ${t.title}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Preview"
        className={c('shrink-0 p-1 -m-1 rounded-full tr cursor-pointer',
          open
            ? 'text-indigo-500'
            : d ? 'text-white/35 hover:text-white/75' : 'text-slate-400 hover:text-slate-700')}
      >
        <Info size={17} />
      </button>

      {open && createPortal(
        <div
          ref={popover}
          role="dialog"
          aria-label={`Preview of ${t.title}`}
          style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, width: Math.min(WIDTH, window.innerWidth - 16), visibility: pos ? 'visible' : 'hidden' }}
          className={c(
            'z-[1000] max-h-[70vh] overflow-y-auto rounded-2xl border p-4 shadow-2xl',
            d ? 'border-white/12 bg-[#0d1224] text-white' : 'border-slate-200 bg-white text-[#0F172A]',
          )}
        >
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className={c('text-[11px] font-bold px-2 py-0.5 rounded-md', toneChip[tone](theme))}>
              {STATUS_LABEL[t.status] ?? t.status}
            </span>
            <ScopeBadge scope={t.scope} theme={theme} showEmpty />
            {t.type === 'bug' && <span className={c('text-[11px] font-bold px-2 py-0.5 rounded-md', chipRed(theme))}>Bug</span>}
          </div>

          <p className={c('text-sm font-bold m-0 mb-1 leading-snug', txt(theme))}>{t.title}</p>
          <p className={c('text-xs m-0 mb-1', muted(theme))}>{t.projectName || 'No project'}</p>
          {whoLine(t) && <p className={c('text-xs m-0 mb-3', muted(theme))}>{whoLine(t)}</p>}
          {!whoLine(t) && <div className="mb-2" />}

          {progressText(t) && (
            <p className={c('text-xs font-semibold m-0 mb-3', muted(theme))}>Subtasks {progressText(t)} finished</p>
          )}

          {t.description
            ? <p className={c('text-xs whitespace-pre-wrap m-0 mb-3 line-clamp-6', d ? 'text-white/70' : 'text-slate-600')}>{t.description}</p>
            : <p className={c('text-xs m-0 mb-3', muted(theme))}>No description</p>}

          <div className="mb-3">
            <p className={c('text-[11px] font-bold uppercase tracking-wide m-0 mb-1.5', muted(theme))}>Assignees</p>
            {t.assignees.length ? (
              <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
                {t.assignees.map((a) => (
                  <li key={a.discordId} className="flex items-center gap-2">
                    <Avatar person={a} size={22} theme={theme} />
                    <span className={c('text-xs font-semibold', txt(theme))}>{a.name}</span>
                  </li>
                ))}
              </ul>
            ) : <p className={c('text-xs m-0', muted(theme))}>Unassigned</p>}
          </div>

          {blocked && (
            <p className={c('text-xs font-semibold m-0 mb-3 inline-flex items-start gap-1 px-2 py-1 rounded-md', chipRed(theme))}>
              <Ban size={12} className="shrink-0 mt-px" /> {blockedLabel(t.blockedBy)}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Link to={`/tools/team/tasks/${t.id}${search}`} onClick={() => setOpen(false)}
              className="text-xs font-bold text-indigo-500 no-underline hover:underline">
              Open task
            </Link>
            {t.channelUrl && (
              <a href={t.channelUrl} target="_blank" rel="noreferrer"
                className={c('text-xs font-semibold no-underline inline-flex items-center gap-1 hover:underline', muted(theme))}>
                <ExternalLink size={11} /> Discord
              </a>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
