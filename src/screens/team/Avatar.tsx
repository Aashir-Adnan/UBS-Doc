import { useState } from 'react'
import { c } from '../../lib'
import type { Theme } from '../../types'
import { initialsOf, safeAvatarUrl, stackSplit } from './avatarLogic'

// A Discord profile picture, or the person's initials when there is none (the
// bot has not synced them yet, the URL is not Discord's, or the image fails to
// load). Decorative: every place that draws one also prints the name beside it.

interface Person { name: string; avatarUrl?: string | null }

export default function Avatar({ person, size = 24, theme }: { person: Person; size?: number; theme: Theme }) {
  // Remember the URL that failed rather than a bare flag, so a fresh URL for the
  // same component instance (after a refresh) gets its own chance to load.
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const url = safeAvatarUrl(person.avatarUrl)
  const src = url && url !== failedFor ? url : null
  const box = { width: size, height: size }
  const d = theme === 'dark'

  if (src) {
    return (
      <img
        src={src} alt="" title={person.name} width={size} height={size} loading="lazy"
        referrerPolicy="no-referrer" onError={() => setFailedFor(src)} style={box}
        className={c('rounded-full object-cover shrink-0', d ? 'bg-white/10' : 'bg-slate-200')}
      />
    )
  }
  return (
    <span
      aria-hidden="true" title={person.name}
      style={{ ...box, fontSize: Math.max(9, Math.round(size * 0.4)) }}
      className={c('rounded-full inline-flex items-center justify-center font-bold shrink-0 select-none',
        d ? 'bg-indigo-500/25 text-indigo-200' : 'bg-indigo-100 text-indigo-600')}
    >
      {initialsOf(person.name)}
    </span>
  )
}

// Overlapping faces for a task's assignees, with a "+N" for the overflow.
export function AvatarStack({ people, size = 24, max = 3, theme }: { people: Person[]; size?: number; max?: number; theme: Theme }) {
  if (!people.length) return null
  const { shown, hidden } = stackSplit(people, max)
  const d = theme === 'dark'
  return (
    <span className="inline-flex items-center shrink-0" aria-hidden="true">
      {shown.map((p, i) => (
        <span key={i} className={c('rounded-full ring-2', d ? 'ring-[#0b1020]' : 'ring-white', i > 0 && '-ml-1.5')}>
          <Avatar person={p} size={size} theme={theme} />
        </span>
      ))}
      {hidden > 0 && (
        <span
          style={{ height: size, minWidth: size, fontSize: Math.max(9, Math.round(size * 0.4)) }}
          className={c('-ml-1.5 rounded-full ring-2 inline-flex items-center justify-center font-bold px-1',
            d ? 'ring-[#0b1020] bg-white/12 text-white/70' : 'ring-white bg-slate-200 text-slate-600')}
        >
          +{hidden}
        </span>
      )}
    </span>
  )
}
