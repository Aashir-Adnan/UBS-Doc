import { useEffect } from 'react'
import { X } from 'lucide-react'
import { c } from '../../lib'
import { useTheme } from '../../app/ThemeContext'

// The Board's one piece of transient feedback: the warning that came back with
// a successful move, or the reason a move failed. Fixed to the bottom-right so
// it never shifts the columns, and self-dismissing — errors stay a little less
// long than the info notes because they are short sentences.
//
// role="status" (polite) rather than alert: a drop the visitor just made is not
// an interruption, and the error text is also reachable by reading the board.

export type ToastTone = 'info' | 'error'

const DISMISS_MS: Record<ToastTone, number> = { info: 8000, error: 6000 }

export default function Toast({ message, tone, onClose }: { message: string; tone: ToastTone; onClose: () => void }) {
  const { theme } = useTheme()
  const d = theme === 'dark'

  // Re-armed whenever the message or tone changes, so a second toast replacing
  // the first gets its own full dwell rather than inheriting what was left.
  useEffect(() => {
    const id = setTimeout(onClose, DISMISS_MS[tone])
    return () => clearTimeout(id)
  }, [message, tone, onClose])

  return (
    <div
      role="status"
      className={c(
        'fixed bottom-5 right-5 z-50 max-w-[min(380px,calc(100vw-2.5rem))] rounded-xl border px-4 py-3',
        'flex items-start gap-3 text-sm font-medium shadow-lg',
        tone === 'error'
          ? d ? 'bg-red-500/12 border-red-500/30 text-red-200' : 'bg-red-50 border-red-200 text-red-700'
          : d ? 'bg-indigo-500/12 border-indigo-500/30 text-indigo-100' : 'bg-indigo-50 border-indigo-200 text-indigo-700',
      )}
    >
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="shrink-0 p-0.5 rounded-md opacity-60 hover:opacity-100 tr bg-transparent border-0 cursor-pointer text-inherit"
      >
        <X size={14} />
      </button>
    </div>
  )
}
