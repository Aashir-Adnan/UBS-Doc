import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, GitBranch, GitPullRequest, Plus, PanelLeft } from 'lucide-react'
import { c, card, txt, muted, divider } from '../lib'
import { useTheme } from '../app/ThemeContext'
import { useAuthTyped } from '../components/portal/authTypes'
import AuroraText from '../components/ui/aurora-text'
import GithubWorkflow from '../components/portal/GithubWorkflow'

// Design chrome from design/UBS Dev Tools Portal (1)/src/screens/GitHub.tsx:
// gradient H1, notification bell, and the Repositories | Issues | Pull
// Requests | New Issue underline tab bar. Everything below the tab bar is the
// untouched GithubWorkflow feature tree (repo selector, issue creator with the
// [Agent Call] body format, issue status panel with bot blink lights, comment
// threads, pull requests with ping-to-merge, file explorer, 60s notification
// polling) — this screen only drives its new optional `tab` prop and mirrors
// the state it exposes (selected repo, notifications) for the header chrome.
// GithubWorkflow stays mounted across tab switches so the selected repo and
// notification history survive.
//
// Every panel, including Pull Requests, is GithubWorkflow's own: functionality
// parity over the pre-migration page comes first, and its PRs panel already
// carries features the design mock does not show (per-PR changed files, ping
// history, ping delete) alongside the mock's Ping to merge.

type Tab = 'repos' | 'issues' | 'prs' | 'newissue'

interface Repo { slug: string; name: string; owner: string; repo: string; branch?: string }

interface NotifItem {
  id: string
  issueNumber: number
  issueTitle: string
  commenter?: string
  preview?: string
  url: string
  repoLabel: string
}

interface NotifState {
  items: NotifItem[]
  dismiss: (id: string) => void
  dismissAll: () => void
}

const TABS: { key: Tab; label: string; Icon: typeof GitBranch | null }[] = [
  { key: 'repos', label: 'Repositories', Icon: GitBranch },
  { key: 'issues', label: 'Issues', Icon: null },
  { key: 'prs', label: 'Pull Requests', Icon: GitPullRequest },
  { key: 'newissue', label: 'New Issue', Icon: Plus },
]

const NO_NOTIFS: NotifState = { items: [], dismiss: () => {}, dismissAll: () => {} }

export default function GitHub() {
  const { theme } = useTheme()
  const { user } = useAuthTyped()
  const d = theme === 'dark'

  const [tab, setTab] = useState<Tab>('repos')
  const [repo, setRepo] = useState<Repo | null>(null)
  const [notifs, setNotifs] = useState<NotifState>(NO_NOTIFS)
  const [explorerOpen, setExplorerOpen] = useState(true)

  // Stable identities: GithubWorkflow fires these from effects, so a new
  // function every render would loop.
  const handleRepoChange = useCallback((next: Repo | null) => {
    setRepo(next)
    // Picking a repo drops you into Issues (as the mock does); clearing the
    // selection from inside the workspace sends you back to the grid.
    setTab(next ? 'issues' : 'repos')
  }, [])
  const handleNotifications = useCallback((next: NotifState) => setNotifs(next), [])
  const handleRequestTab = useCallback((next: Tab) => setTab(next), [])

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      {/* Header */}
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-10 pt-6 lg:pt-10 pb-0">
        <Breadcrumbs theme={theme} repo={repo} />
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-extrabold screen-title">
            <AuroraText>GitHub Workspace</AuroraText>
          </h1>
          <div className="flex items-center gap-1.5">
            {tab !== 'repos' && repo && (
              <button
                type="button"
                onClick={() => setExplorerOpen(v => !v)}
                title={explorerOpen ? 'Hide file explorer' : 'Show file explorer'}
                aria-pressed={explorerOpen}
                className={c('p-2.5 rounded-xl tr',
                  explorerOpen
                    ? 'text-indigo-500'
                    : d ? 'text-white/50 hover:bg-white/6' : 'text-slate-400 hover:bg-slate-100')}>
                <PanelLeft size={18} />
              </button>
            )}
            <NotificationBell notifs={notifs} theme={theme} />
          </div>
        </div>
      </div>

      {/* Tab bar + workspace */}
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-10 py-6">
        <div className={c('flex border-b mb-5', d ? 'border-indigo-500/12' : 'border-slate-200')}>
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={c(
                'flex items-center gap-2 px-5 py-3 text-sm font-semibold relative tr',
                tab === t.key
                  ? 'text-indigo-500'
                  : d ? 'text-white/38 hover:text-white/70' : 'text-slate-400 hover:text-slate-700',
              )}>
              {t.Icon && <t.Icon size={14} />}
              {t.label}
              {tab === t.key && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-indigo-500 rounded-t" />}
            </button>
          ))}
        </div>

        <GithubWorkflow
          user={user}
          tab={tab}
          explorerOpen={explorerOpen}
          onRepoChange={handleRepoChange}
          onNotificationsChange={handleNotifications}
          onRequestTab={handleRequestTab}
        />
      </div>
    </div>
  )
}

/* ── Breadcrumb (adds the selected repo as a trailing crumb) ─────────────── */

function Breadcrumbs({ theme, repo }: { theme: 'light' | 'dark'; repo: Repo | null }) {
  const d = theme === 'dark'
  const items = ['UBS', 'Dev Tools', 'GitHub', ...(repo ? [`${repo.owner}/${repo.repo}`] : [])]
  return (
    <nav className="flex items-center gap-1.5 mb-7">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className={d ? 'text-white/20' : 'text-slate-300'}>/</span>}
          <span className={c('text-xs font-semibold tr',
            i === items.length - 1
              ? (d ? 'text-indigo-400' : 'text-indigo-600')
              : (d ? 'text-white/35' : 'text-slate-400'),
            i === items.length - 1 && repo ? 'mono' : '',
          )}>{item}</span>
        </span>
      ))}
    </nav>
  )
}

/* ── Notification bell ───────────────────────────────────────────────────── */

function NotificationBell({ notifs, theme }: { notifs: NotifState; theme: 'light' | 'dark' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const d = theme === 'dark'
  const count = notifs.items.length

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(v => !v)} aria-label={`${count} notifications`}
        className={c('p-2.5 rounded-xl tr', d ? 'hover:bg-white/6 text-white/50' : 'hover:bg-slate-100 text-slate-400')}>
        <Bell size={19} />
      </button>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 rounded-full bg-red-500 text-white flex items-center justify-center font-bold pointer-events-none"
          style={{ fontSize: 9, width: 17, height: 17 }}>{count}</span>
      )}

      {open && (
        <div className={c(card(theme), 'absolute right-0 top-12 w-[min(320px,calc(100vw-2rem))] z-40 overflow-hidden slide-up')}>
          <div className={c('flex items-center justify-between px-4 py-2.5 border-b', divider(theme))}>
            <span className={c('section-kicker', d ? 'text-white/28' : 'text-slate-300')}>Notifications</span>
            {count > 0 && (
              <button type="button" onClick={notifs.dismissAll}
                className="text-[11px] font-bold text-indigo-500 tr hover:opacity-75">Clear all</button>
            )}
          </div>
          {count === 0 ? (
            <p className={c('text-xs text-center py-5 m-0', muted(theme))}>No new notifications</p>
          ) : (
            <ul className="list-none m-0 p-0 max-h-[300px] overflow-y-auto">
              {notifs.items.map(n => (
                <li key={n.id} className={c('px-4 py-3 border-b last:border-b-0', divider(theme))}>
                  <div className="flex items-start gap-2">
                    <a href={n.url} target="_blank" rel="noopener noreferrer"
                      className={c('flex-1 text-xs font-semibold leading-snug', txt(theme))}>{n.issueTitle}</a>
                    <button type="button" onClick={() => notifs.dismiss(n.id)}
                      className={c('text-xs leading-none tr', muted(theme))}>&times;</button>
                  </div>
                  <p className={c('text-[11px] mt-1 mb-0', muted(theme))}>
                    <strong>{n.commenter}</strong> commented · {n.repoLabel}#{n.issueNumber}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
