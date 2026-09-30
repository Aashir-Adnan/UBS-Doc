import { useId, useMemo, useState } from 'react'
import { X, Check } from 'lucide-react'
import { c, txt, muted, chipIndigo, inputCls } from '../../lib'
import type { Theme } from '../../types'
import type { TeamMember } from '../tasksLogic'
import Avatar from './Avatar'
import { matchesQuery, pickerOptions, selectedPeople, type PickerOption } from './memberPickerLogic'

// Pick people from the server's Discord member list: chips for who is chosen,
// a search box, and a list of matches grouped "In this project" / "Everyone
// else". Options keep focus on the search box (mousedown is prevented), so the
// list stays open while several people are picked.
export default function MemberPicker({ members, projectId, value, onChange, theme, label, disabled = false }: {
  members: TeamMember[]
  projectId: string | null
  value: string[]
  onChange: (ids: string[]) => void
  theme: Theme
  label: string
  disabled?: boolean
}) {
  const d = theme === 'dark'
  const inputId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const groups = useMemo(() => pickerOptions(members, projectId, value), [members, projectId, value])
  const chosen = useMemo(() => selectedPeople(members, value), [members, value])
  const shown = {
    project: groups.project.filter((o) => matchesQuery(o, query)),
    others: groups.others.filter((o) => matchesQuery(o, query)),
  }
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  const first = shown.project[0] ?? shown.others[0]

  const row = (o: PickerOption) => (
    <li key={o.discordId}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => toggle(o.discordId)}
        className={c('w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-lg tr',
          d ? 'hover:bg-white/8' : 'hover:bg-slate-100')}
        aria-pressed={o.selected}
      >
        <Avatar person={o} size={22} theme={theme} />
        <span className={c('text-sm font-semibold truncate', txt(theme))}>{o.name}</span>
        {o.username && <span className={c('text-xs truncate', muted(theme))}>@{o.username}</span>}
        {o.selected && <Check size={14} className="ml-auto text-indigo-500 shrink-0" />}
      </button>
    </li>
  )

  return (
    <div>
      <label htmlFor={inputId} className={c('block text-[11px] font-bold uppercase tracking-wide mb-1.5', muted(theme))}>{label}</label>
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {chosen.map((p) => (
            <span key={p.discordId} className={c('inline-flex items-center gap-1.5 text-[11px] font-semibold pl-1 pr-2 py-1 rounded-full', chipIndigo(theme))}>
              <Avatar person={p} size={18} theme={theme} />
              {p.name}
              {!disabled && (
                <button type="button" onClick={() => toggle(p.discordId)} aria-label={`Remove ${p.name}`} className="inline-flex opacity-70 hover:opacity-100">
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          id={inputId}
          className={inputCls(theme)}
          placeholder="Search Discord members…"
          value={query}
          disabled={disabled}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'Enter') { e.preventDefault(); if (first) toggle(first.discordId) }
          }}
          autoComplete="off"
        />
        {open && !disabled && (
          <div className={c('absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border p-1 shadow-lg',
            d ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200')}>
            {shown.project.length > 0 && (
              <>
                <p className={c('text-[10px] font-bold uppercase tracking-wide px-3 pt-2 pb-1 m-0', muted(theme))}>In this project</p>
                <ul className="list-none p-0 m-0">{shown.project.map(row)}</ul>
              </>
            )}
            {shown.others.length > 0 && (
              <>
                <p className={c('text-[10px] font-bold uppercase tracking-wide px-3 pt-2 pb-1 m-0', muted(theme))}>{shown.project.length ? 'Everyone else' : 'Members'}</p>
                <ul className="list-none p-0 m-0">{shown.others.map(row)}</ul>
              </>
            )}
            {!shown.project.length && !shown.others.length && (
              <p className={c('text-sm px-3 py-2 m-0', muted(theme))}>No member matches &ldquo;{query}&rdquo;.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
