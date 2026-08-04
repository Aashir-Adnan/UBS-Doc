import {
  Home, BookOpen, Wrench, Info, Database, Map, Activity, Bell, Zap,
  FolderOpen, GitBranch, MessageSquare, FolderGit2, BarChart3, Shield,
  ChevronDown, Sun, Moon, Settings
} from 'lucide-react'
import { c } from '../lib'
import type { Screen, Theme } from '../types'

interface SidebarProps {
  current: Screen
  navigate: (s: Screen) => void
  theme: Theme
  toggleTheme: () => void
}

const PRIMARY = [
  { id: 'home' as Screen, label: 'Home', Icon: Home },
  { id: 'home' as Screen, label: 'Documentation', Icon: BookOpen },
  { id: 'tools' as Screen, label: 'Dev Tools', Icon: Wrench },
  { id: 'home' as Screen, label: 'About', Icon: Info },
]

const TOOLS = [
  { id: 'database' as Screen, label: 'Database', Icon: Database },
  { id: 'database' as Screen, label: 'ERD Mapper', Icon: Map },
  { id: 'lucid-sanitize' as Screen, label: 'Lucid Sanitize', Icon: Activity },
  { id: 'notify' as Screen, label: 'Notify', Icon: Bell },
  { id: 'api-builder' as Screen, label: 'API Object Builder', Icon: Zap },
  { id: 'projects' as Screen, label: 'Projects', Icon: FolderOpen },
  { id: 'github' as Screen, label: 'GitHub', Icon: GitBranch },
  { id: 'meetings' as Screen, label: 'Meetings', Icon: MessageSquare },
  { id: 'repositories' as Screen, label: 'Repositories', Icon: FolderGit2 },
  { id: 'my-projects' as Screen, label: 'My Projects', Icon: BarChart3 },
  { id: 'tenant-admin' as Screen, label: 'Tenant Admin', Icon: Shield },
]

const TOOL_SCREENS: Screen[] = ['database','lucid-sanitize','notify','api-builder','projects',
  'github','meetings','meetings-create','meetings-transcribe','meetings-analyze',
  'repositories','my-projects','tenant-admin']

export default function Sidebar({ current, navigate, theme, toggleTheme }: SidebarProps) {
  const d = theme === 'dark'

  return (
    <aside className={c(
      'fixed left-0 top-0 bottom-0 w-60 flex flex-col z-40 overflow-hidden',
      d ? 'aurora-panel-dark border-r border-sky-500/10' : 'bg-white border-r border-slate-100'
    )}>
      {/* Brand + org switcher */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2.5 mb-4 px-1">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-extrabold text-xs shrink-0"
            style={{ background: '#4F46E5' }}>
            U
          </div>
          <span className={c('font-extrabold text-sm tracking-tight', d ? 'text-white' : 'text-[#0F172A]')}>
            UBS
          </span>
          <div className={c('w-1.5 h-1.5 rounded-full ml-auto', 'bg-emerald-400')} style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} />
        </div>

        {/* Org switcher */}
        <button className={c(
          'w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold tr',
          d
            ? 'bg-indigo-500/10 border border-indigo-500/18 text-indigo-300 hover:bg-indigo-500/15'
            : 'bg-indigo-50 border border-indigo-100 text-indigo-600 hover:bg-indigo-100'
        )}>
          <span>granjur.com</span>
          <ChevronDown size={12} />
        </button>
      </div>

      {/* Primary nav */}
      <nav className="px-3 mt-1">
        <p className={c('section-kicker px-2 mb-1.5', d ? 'text-white/22' : 'text-slate-300')}>Navigation</p>
        {PRIMARY.map((item, i) => {
          const active = current === item.id && i === 0
            ? current === 'home'
            : current === item.id && item.id !== 'home'
          return (
            <NavRow
              key={i}
              icon={<item.Icon size={15} />}
              label={item.label}
              active={active}
              dark={d}
              onClick={() => navigate(item.id)}
            />
          )
        })}
      </nav>

      {/* Tools sub-nav */}
      <nav className="px-3 mt-4 flex-1 overflow-y-auto">
        <p className={c('section-kicker px-2 mb-1.5', d ? 'text-white/22' : 'text-slate-300')}>Tools</p>
        {TOOLS.map((item, i) => {
          const active = current === item.id ||
            (item.label === 'Meetings' && TOOL_SCREENS.filter(s => s.startsWith('meeting')).includes(current))
          return (
            <button
              key={i}
              onClick={() => navigate(item.id)}
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

        {/* Access states group */}
        <p className={c('section-kicker px-2 mb-1.5 mt-4', d ? 'text-white/22' : 'text-slate-300')}>States</p>
        {(['loading-state','access-restricted','pending-state'] as Screen[]).map((s) => (
          <button key={s} onClick={() => navigate(s)}
            className={c(
              'w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-xl text-[12px] font-semibold tr mb-0.5',
              current === s
                ? d ? 'bg-indigo-500/15 text-indigo-300' : 'bg-indigo-50 text-indigo-600'
                : d ? 'text-white/35 hover:bg-white/5 hover:text-white/65' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
            )}>
            <Settings size={13} className="opacity-60" />
            {s === 'loading-state' ? 'Loading' : s === 'access-restricted' ? 'Restricted' : 'Pending'}
          </button>
        ))}
      </nav>

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
  icon: React.ReactNode; label: string; active: boolean; dark: boolean; onClick: () => void
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
  label: string; icon: React.ReactNode; active: boolean; onClick: () => void; dark: boolean
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
