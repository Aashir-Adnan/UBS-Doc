import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Home, BookOpen, Wrench, Info, Database, Map, Activity, Bell, Zap,
  FolderOpen, GitBranch, MessageSquare, FolderGit2, BarChart3, Shield,
  Sun, Moon, Server, Monitor, Bot, FolderKanban, X
} from 'lucide-react'
import { c } from '../lib'
import type { Theme } from '../types'
import OrgSwitcher from './portal/tenantProjects/OrgSwitcher'

interface SidebarProps {
  /** Drawer state below lg; ignored at lg+ where the rail is permanent. */
  open?: boolean
  onClose?: () => void
  theme: Theme
  toggleTheme: () => void
}

interface NavItem {
  label: string
  to: string
  Icon: typeof Home
}

const PRIMARY: NavItem[] = [
  { to: '/', label: 'Home', Icon: Home },
  { to: '/docs/intro/UBS_Framework_Features', label: 'Documentation', Icon: BookOpen },
  { to: '/tools', label: 'Dev Tools', Icon: Wrench },
  { to: '/about', label: 'About', Icon: Info },
]

function isPrimaryActive(item: NavItem, pathname: string) {
  switch (item.label) {
    case 'Home': return pathname === '/'
    case 'Documentation': return pathname.startsWith('/docs')
    case 'Dev Tools': return pathname.startsWith('/tools')
    case 'About': return pathname.startsWith('/about')
    default: return false
  }
}

const TOOLS: NavItem[] = [
  { to: '/tools/database', label: 'Database', Icon: Database },
  { to: '/tools/database/mapper', label: 'ERD Mapper', Icon: Map },
  { to: '/tools/lucid', label: 'Lucid Sanitize', Icon: Activity },
  { to: '/tools/notify', label: 'Notify', Icon: Bell },
  { to: '/tools/apiObject', label: 'API Object Builder', Icon: Zap },
  { to: '/tools/projects', label: 'Projects', Icon: FolderOpen },
  { to: '/tools/github', label: 'GitHub', Icon: GitBranch },
  { to: '/tools/meetingWorkflow', label: 'Meetings', Icon: MessageSquare },
  { to: '/tools/repos', label: 'Repositories', Icon: FolderGit2 },
  { to: '/tools/myProjects', label: 'My Projects', Icon: BarChart3 },
  { to: '/tools/tenantAdmin', label: 'Tenant Admin', Icon: Shield },
]

const DOCS: NavItem[] = [
  { to: '/docs/intro/Node-Advantages', label: 'Framework Intro', Icon: BookOpen },
  { to: '/docs/backend/UBS-intro', label: 'Backend', Icon: Server },
  { to: '/docs/frontend/UBS-intro', label: 'Frontend', Icon: Monitor },
  { to: '/docs/database/Lucidchart', label: 'Database', Icon: Database },
  { to: '/docs/agents/agent-issue-format', label: 'Agents', Icon: Bot },
  { to: '/docs/projects/badar-hms/Opera_Config', label: 'Projects', Icon: FolderKanban },
]

export default function Sidebar({ theme, toggleTheme, open = false, onClose }: SidebarProps) {
  const d = theme === 'dark'
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const showTools = pathname.startsWith('/tools')
  const showDocs = pathname.startsWith('/docs')
  const subNavItems = showTools ? TOOLS : showDocs ? DOCS : null

  return (
    <aside
      // Off-canvas below lg (slides in over the scrim), permanent rail at lg+.
      // `overflow-y-auto` because on a short phone in landscape the nav is
      // taller than the viewport.
      aria-hidden={!open ? undefined : false}
      className={c(
        'fixed left-0 top-0 bottom-0 w-60 max-w-[85vw] flex flex-col z-40 overflow-hidden',
        'transition-transform duration-200 ease-out lg:transition-none',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        d ? 'aurora-panel-dark border-r border-sky-500/10' : 'bg-white border-r border-slate-100'
      )}>
      {/* Brand + org switcher */}
      <div className="px-4 pt-5 pb-3 shrink-0">
        <div className="flex items-center gap-2.5 mb-4 px-1">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-extrabold text-xs shrink-0"
            style={{ background: '#4F46E5' }}>
            U
          </div>
          <span className={c('font-extrabold text-sm tracking-tight', d ? 'text-white' : 'text-[#0F172A]')}>
            UBS
          </span>
          <div className={c('w-1.5 h-1.5 rounded-full ml-auto', 'bg-emerald-400')} style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className={c('lg:hidden -mr-1 p-1 rounded-lg tr',
              d ? 'text-white/50 hover:bg-white/8' : 'text-slate-400 hover:bg-slate-100')}
          >
            <X size={16} />
          </button>
        </div>

        <OrgSwitcher />
      </div>

      {/* Primary nav */}
      <nav className="px-3 mt-1">
        <p className={c('section-kicker px-2 mb-1.5', d ? 'text-white/22' : 'text-slate-300')}>Navigation</p>
        {PRIMARY.map((item) => (
          <NavRow
            key={item.to}
            icon={<item.Icon size={15} />}
            label={item.label}
            active={isPrimaryActive(item, pathname)}
            dark={d}
            onClick={() => navigate(item.to)}
          />
        ))}
      </nav>

      {/* Tools / Docs sub-nav */}
      {subNavItems && (
        <nav className="px-3 mt-4 flex-1 overflow-y-auto">
          <p className={c('section-kicker px-2 mb-1.5', d ? 'text-white/22' : 'text-slate-300')}>
            {showTools ? 'Tools' : 'Docs'}
          </p>
          {subNavItems.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + '/')
            return (
              <button
                key={item.to}
                onClick={() => navigate(item.to)}
                className={c(
                  'w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-xl text-[12px] font-semibold tr mb-0.5',
                  active
                    ? d
                      ? 'bg-indigo-500/15 text-indigo-300'
                      : 'bg-indigo-50 text-indigo-600'
                    : d
                      ? 'text-white/42 hover:bg-white/5 hover:text-white/75'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                )}>
                <item.Icon size={13} className={active ? '' : 'opacity-70'} />
                {item.label}
              </button>
            )
          })}
        </nav>
      )}

      {/* Theme toggle */}
      <div className={c('px-4 py-4 mt-auto border-t', d ? 'border-indigo-500/10' : 'border-slate-100')}>
        <div className={c(
          'flex p-1 rounded-full',
          d ? 'bg-white/5' : 'bg-slate-100'
        )}>
          <ThemeBtn label="Light" icon={<Sun size={11} />} active={!d} onClick={() => d && toggleTheme()} dark={d} />
          <ThemeBtn label="Dark" icon={<Moon size={11} />} active={d} onClick={() => !d && toggleTheme()} dark={d} />
        </div>
      </div>
    </aside>
  )
}

function NavRow({ icon, label, active, dark, onClick }: {
  icon: ReactNode; label: string; active: boolean; dark: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} className={c(
      'relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold tr mb-0.5',
      active ? 'nav-active-bar' : '',
      active
        ? dark
          ? 'bg-indigo-500/14 text-indigo-300'
          : 'bg-indigo-50 text-indigo-600'
        : dark
          ? 'text-white/50 hover:bg-white/[0.04] hover:text-white/80'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
    )}>
      <span className={active ? '' : 'opacity-75'}>{icon}</span>
      {label}
    </button>
  )
}

function ThemeBtn({ label, icon, active, onClick, dark }: {
  label: string; icon: ReactNode; active: boolean; onClick: () => void; dark: boolean
}) {
  return (
    <button onClick={onClick} className={c(
      'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-[11px] font-bold tr',
      active
        ? dark
          ? 'bg-indigo-500/30 text-indigo-300 shadow-sm'
          : 'bg-white text-indigo-600 shadow-sm'
        : dark
          ? 'text-white/30 hover:text-white/55'
          : 'text-slate-400 hover:text-slate-600'
    )}>
      {icon} {label}
    </button>
  )
}
