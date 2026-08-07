/* Shared helper primitives used across screens */
import type { Theme } from './types'

export function c(...args: (string | boolean | undefined | null)[]) {
  return args.filter(Boolean).join(' ')
}

export function card(theme: Theme, extra = '') {
  return c(theme === 'dark' ? 'card-dark' : 'card-light', 'rounded-2xl', extra)
}

export function txt(theme: Theme) {
  return theme === 'dark' ? 'text-white' : 'text-[#0F172A]'
}

export function muted(theme: Theme) {
  return theme === 'dark' ? 'text-white/45' : 'text-slate-400'
}

export function sub(theme: Theme) {
  return theme === 'dark' ? 'text-white/60' : 'text-slate-500'
}

export function divider(theme: Theme) {
  return theme === 'dark' ? 'border-[rgba(14,165,233,0.1)]' : 'border-slate-100'
}

export function inputCls(theme: Theme, extra = '') {
  return c('input-base px-4 py-2.5', theme === 'dark' ? 'input-dark' : 'input-light', extra)
}

export function chipIndigo(theme: Theme) {
  return theme === 'dark'
    ? 'chip bg-indigo-500/15 text-indigo-300 border border-indigo-500/20'
    : 'chip bg-indigo-50 text-indigo-600 border border-indigo-100'
}

export function chipMint(theme: Theme) {
  return theme === 'dark'
    ? 'chip bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'
    : 'chip bg-emerald-50 text-emerald-600 border border-emerald-100'
}

export function chipAmber(theme: Theme) {
  return theme === 'dark'
    ? 'chip bg-amber-500/12 text-amber-300 border border-amber-500/20'
    : 'chip bg-amber-50 text-amber-600 border border-amber-100'
}

export function chipRed(theme: Theme) {
  return theme === 'dark'
    ? 'chip bg-red-500/12 text-red-300 border border-red-500/20'
    : 'chip bg-red-50 text-red-600 border border-red-100'
}

export function chipViolet(theme: Theme) {
  return theme === 'dark'
    ? 'chip bg-violet-500/15 text-violet-300 border border-violet-500/20'
    : 'chip bg-violet-50 text-violet-600 border border-violet-100'
}

export function chipGray(theme: Theme) {
  return theme === 'dark'
    ? 'chip bg-white/6 text-white/45 border border-white/8'
    : 'chip bg-slate-100 text-slate-500 border border-slate-200'
}

export function Breadcrumb({ items, theme }: { items: string[]; theme: Theme }) {
  const t = theme === 'dark'
  return (
    <nav className="flex items-center gap-1.5 mb-7">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className={t ? 'text-white/20' : 'text-slate-300'}>/</span>}
          <span className={c(
            'text-xs font-semibold tr',
            i === items.length - 1
              ? (t ? 'text-indigo-400' : 'text-indigo-600')
              : (t ? 'text-white/35 hover:text-white/60' : 'text-slate-400 hover:text-slate-600'),
            i < items.length - 1 ? 'cursor-pointer' : ''
          )}>{item}</span>
        </span>
      ))}
    </nav>
  )
}

export function SectionHeader({ label, theme }: { label: string; theme: Theme }) {
  return (
    <p className={c('section-kicker mb-3', theme === 'dark' ? 'text-white/30' : 'text-slate-400')}>
      {label}
    </p>
  )
}

export function Checkbox({ checked, onChange, theme }: { checked: boolean; onChange: () => void; theme: Theme }) {
  const t = theme === 'dark'
  return (
    <button
      onClick={onChange}
      className={c('w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 tr',
        checked
          ? 'bg-indigo-600 border-indigo-600'
          : t ? 'bg-white/5 border-indigo-500/25' : 'bg-white border-slate-300'
      )}>
      {checked && (
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  )
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} className={c(
      'relative w-9 h-[20px] rounded-full tr',
      checked ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-white/10'
    )}>
      <div className={c(
        'absolute top-[2px] w-4 h-4 rounded-full bg-white shadow-sm tr',
        checked ? 'left-[18px]' : 'left-[2px]'
      )} />
    </button>
  )
}
