import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { c, muted } from '../../lib'
import type { Theme } from '../../types'

// Copies a task's link to the clipboard, for pasting into a chat when you want
// an update from whoever owns it.
//
// Two shapes, same behaviour: `button` sits in the task detail header, `link`
// sits in the preview popover's action row beside "Open task" and "Discord".
//
// Follows the copy button in APIBuilder — idle → copied/failed → idle after a
// beat — with one correction: `navigator.clipboard` is *undefined* outside a
// secure context, so calling `.writeText` on it throws synchronously rather
// than rejecting. Checking for it first is what keeps that a "Copy failed"
// label instead of a blank page.

type CopyState = 'idle' | 'copied' | 'failed'

const RESET_MS = 2000
const LABEL: Record<CopyState, string> = { idle: 'Copy link', copied: 'Copied', failed: 'Copy failed' }

export default function CopyLinkButton({ url, theme, variant = 'button' }: {
  url: string
  theme: Theme
  variant?: 'button' | 'link'
}) {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const d = theme === 'dark'

  // A copy right before the view unmounts would otherwise set state on a gone
  // component when the timer fires.
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setState('copied')
    } catch {
      setState('failed')
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), RESET_MS)
  }

  const tone = state === 'copied'
    ? 'text-emerald-500'
    : state === 'failed'
      ? 'text-red-500'
      : null

  return (
    <button
      type="button"
      onClick={copy}
      // The label already says what happened; the title stays constant so the
      // tooltip does not flicker mid-interaction.
      title="Copy a link to this task"
      className={c(
        'inline-flex items-center gap-1.5 font-semibold tr cursor-pointer',
        variant === 'button'
          ? c('text-xs px-2.5 py-1.5 rounded-lg border',
              d ? 'border-white/12 bg-white/[0.04] hover:bg-white/[0.08]' : 'border-slate-200 bg-white hover:bg-slate-50')
          : 'text-xs border-0 bg-transparent p-0',
        tone ?? (variant === 'button' ? (d ? 'text-white/70' : 'text-slate-600') : c(muted(theme), 'hover:underline')),
      )}
    >
      {state === 'copied' ? <Check size={variant === 'button' ? 13 : 11} /> : <Copy size={variant === 'button' ? 13 : 11} />}
      {/* Polite: the visitor just pressed the button, so the outcome is
          expected rather than an interruption. */}
      <span aria-live="polite">{LABEL[state]}</span>
    </button>
  )
}
