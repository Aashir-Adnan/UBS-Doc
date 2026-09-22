import type { ReactNode } from 'react'
import { Sun, Moon } from 'lucide-react'
import { c } from '../lib'
import type { Theme } from '../types'

// The Light/Dark segmented pill. Lives here rather than inside the sidebar
// because the sign-in screen needs the same control and renders standalone,
// outside AppLayout — two copies of a control this fiddly drift apart.
//
// The pill is the whole component; surrounding chrome (the sidebar's divider,
// the sign-in screen's corner placement) belongs to the caller and arrives
// through `className`.

export default function ThemeSwitch({ theme, toggleTheme, className }: {
  theme: Theme
  toggleTheme: () => void
  className?: string
}) {
  const d = theme === 'dark'
  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={c('flex p-1 rounded-full', d ? 'bg-white/5' : 'bg-slate-100', className)}
    >
      {/* Each button sets a theme rather than toggling blindly, so pressing
          the one already active is a no-op instead of a flip. */}
      <ThemeBtn label="Light" icon={<Sun size={11} />} active={!d} onClick={() => d && toggleTheme()} dark={d} />
      <ThemeBtn label="Dark" icon={<Moon size={11} />} active={d} onClick={() => !d && toggleTheme()} dark={d} />
    </div>
  )
}

function ThemeBtn({ label, icon, active, onClick, dark }: {
  label: string; icon: ReactNode; active: boolean; onClick: () => void; dark: boolean
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={c(
      'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-full text-[11px] font-bold tr cursor-pointer border-0',
      active
        ? dark
          ? 'bg-indigo-500/30 text-indigo-300 shadow-sm'
          : 'bg-white text-indigo-600 shadow-sm'
        : c('bg-transparent', dark
          ? 'text-white/30 hover:text-white/55'
          : 'text-slate-400 hover:text-slate-600')
    )}>
      {icon} {label}
    </button>
  )
}
