import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { c } from '../../lib'
import type { Theme } from '../../types'

// The filter bar's dropdown. A bare <select> draws the browser's own arrow flush
// against the rounded edge; here the native arrow is removed and a chevron is
// laid over reserved right padding, so it sits inside the control at the same
// inset on every browser. The wrapper carries the width (`.input-base` sets
// width:100%, which would otherwise stretch each select across the whole row).
export default function FilterSelect({ label, value, onChange, theme, children }: {
  label: string
  value: string
  onChange: (value: string) => void
  theme: Theme
  children: ReactNode
}) {
  const d = theme === 'dark'
  return (
    <div className="relative w-full sm:w-44">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={c('input-base appearance-none h-10 pl-3.5 pr-9 cursor-pointer truncate', d ? 'input-dark' : 'input-light')}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className={c('pointer-events-none absolute right-3 top-1/2 -translate-y-1/2', d ? 'text-white/45' : 'text-slate-400')}
      />
    </div>
  )
}
