import type { ReactNode } from 'react'
import { Lock, Clock } from 'lucide-react'
import { c, card, txt, muted } from '../../lib'
import { useTheme } from '../../app/ThemeContext'

// Extracted from the design's TenantAdmin.tsx AccessStateScreen — the 380px
// centered card used for every non-content state a gate can land on.
export type AccessStateKind = 'loading' | 'restricted' | 'pending'

interface Props {
  kind: AccessStateKind
  email?: string
  onSignOut?: () => void
}

export default function AccessState({ kind, email, onSignOut }: Props) {
  const { theme } = useTheme()
  const d = theme === 'dark'

  const config = {
    loading: {
      icon: <div className="w-10 h-10 rounded-full border-[3px] border-indigo-500/25 border-t-indigo-500 spin" />,
      title: 'Loading…',
      sub: 'Connecting to UBS Dev Tools. This should only take a moment.',
      showEmail: false,
      action: null as ReactNode,
    },
    restricted: {
      icon: (
        <div className={c('w-12 h-12 rounded-2xl flex items-center justify-center',
          d ? 'bg-red-500/14 border border-red-500/22' : 'bg-red-50 border border-red-200')}>
          <Lock size={22} className={d ? 'text-red-400' : 'text-red-600'} />
        </div>
      ),
      title: 'Access Restricted',
      sub: "Your account hasn't been provisioned for UBS Dev Tools. Contact your administrator to request access.",
      showEmail: true,
      action: (
        <button onClick={onSignOut}
          className={c('mt-5 text-xs font-semibold tr', d ? 'text-white/30 hover:text-white/60' : 'text-slate-400 hover:text-indigo-600')}>
          Sign out →
        </button>
      ),
    },
    pending: {
      icon: (
        <div className={c('w-12 h-12 rounded-2xl flex items-center justify-center',
          d ? 'bg-amber-500/12 border border-amber-500/22' : 'bg-amber-50 border border-amber-200')}>
          <Clock size={22} className={d ? 'text-amber-400' : 'text-amber-600'} />
        </div>
      ),
      title: 'Access Pending',
      sub: "You're signed in but not yet provisioned. An administrator will approve your access shortly.",
      showEmail: true,
      action: null as ReactNode,
    },
  }

  const cfg = config[kind]

  return (
    <div className={c('min-h-full flex items-center justify-center p-8', d ? 'aurora-dark' : 'aurora-light')}>
      <div className={c('w-[380px] text-center', card(theme), 'rounded-3xl px-10 py-12')}>
        <div className="flex justify-center mb-5">{cfg.icon}</div>
        <h2 className={c('font-extrabold text-xl mb-2.5', txt(theme))}>{cfg.title}</h2>
        <p className={c('text-sm leading-relaxed', muted(theme))}>{cfg.sub}</p>
        {cfg.showEmail && email && (
          <p className={c('text-xs mono mt-3', muted(theme))}>{email}</p>
        )}
        {cfg.action}
      </div>
    </div>
  )
}
