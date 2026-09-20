import { c, chipIndigo, chipMint, chipAmber, chipViolet, chipGray } from '../../lib'
import type { Theme } from '../../types'
import { scopeLabel, scopeTone, type ScopeTone } from '../tasksLogic'

// One colour per discipline; anything else (an older free-text scope) is grey.
const TONE_CHIP: Record<ScopeTone, (t: Theme) => string> = {
  backend: chipIndigo,
  frontend: chipMint,
  qa: chipAmber,
  design: chipViolet,
  other: chipGray,
}

// The task's scope as a small pill. `showEmpty` draws a muted "No scope" for a
// task without one, so every card on the board reads the same way.
export default function ScopeBadge({ scope, theme, showEmpty = false }: { scope: string | null; theme: Theme; showEmpty?: boolean }) {
  const label = scopeLabel(scope)
  if (!label) {
    if (!showEmpty) return null
    return (
      <span className={c('text-[11px] font-semibold px-2 py-0.5 rounded-md border border-dashed shrink-0',
        theme === 'dark' ? 'border-white/15 text-white/35' : 'border-slate-300 text-slate-400')}>
        No scope
      </span>
    )
  }
  return <span className={c('text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0', TONE_CHIP[scopeTone(scope)](theme))}>{label}</span>
}
