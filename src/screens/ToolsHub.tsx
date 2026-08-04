import { useNavigate } from 'react-router-dom'
import { Database, Map, Activity, Bell, Zap, FolderOpen, GitBranch, MessageSquare, FolderGit2, BarChart3, Shield, LogOut } from 'lucide-react'
import { c, txt, muted } from '../lib'
import { useTheme } from '../app/ThemeContext'
import { useAuthTyped } from '../components/portal/authTypes'

const TOOLS = [
  { label: 'Database', desc: 'Upload and inspect SQL schemas', Icon: Database, route: '/tools/database', from: '#4F46E5', to: '#6366F1' },
  { label: 'ERD Mapper', desc: 'Interactive entity-relationship diagrams', Icon: Map, route: '/tools/database/mapper', from: '#7C3AED', to: '#9333EA' },
  { label: 'Lucid Sanitize', desc: 'Clean Lucidchart export files', Icon: Activity, route: '/tools/lucid', from: '#10B981', to: '#059669' },
  { label: 'Notify', desc: 'Report bugs and request features', Icon: Bell, route: '/tools/notify', from: '#F59E0B', to: '#D97706' },
  { label: 'API Object Builder', desc: 'Generate typed API configuration objects', Icon: Zap, route: '/tools/apiObject', from: '#4F46E5', to: '#10B981' },
  { label: 'Projects', desc: 'Browse team projects and docs', Icon: FolderOpen, route: '/tools/projects', from: '#3B82F6', to: '#4F46E5' },
  { label: 'GitHub', desc: 'Issues, PRs, and agent workflows', Icon: GitBranch, route: '/tools/github', from: '#6366F1', to: '#7C3AED' },
  { label: 'Meetings', desc: 'Record, transcribe, and analyze meetings', Icon: MessageSquare, route: '/tools/meetingWorkflow', from: '#7C3AED', to: '#4F46E5' },
  { label: 'Repositories', desc: 'Track repos, features, and platforms', Icon: FolderGit2, route: '/tools/repos', from: '#10B981', to: '#3B82F6' },
  { label: 'My Projects', desc: 'Monitor your deployment statuses', Icon: BarChart3, route: '/tools/myProjects', from: '#3B82F6', to: '#10B981' },
  { label: 'Tenant Admin', desc: 'Provision users and manage roles', Icon: Shield, route: '/tools/tenantAdmin', from: '#EF4444', to: '#DC2626' },
]

export default function ToolsHub() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { user, signOut } = useAuthTyped()
  const d = theme === 'dark'
  const firstName = user?.name?.split(' ')[0] || user?.email || 'there'

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[1240px] mx-auto px-10 py-12">
        {/* Hero */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <p className="section-kicker text-indigo-500 mb-3">Dev Tools Portal</p>
            <h1 className={c('font-extrabold mb-2', txt(theme))} style={{ fontSize: 40, letterSpacing: '-0.025em' }}>
              Welcome, {firstName} 👋
            </h1>
            <p className={c('text-sm font-medium', muted(theme))}>What are you building today?</p>
          </div>
          <button onClick={signOut}
            className={c(
              'flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full tr border mt-2',
              d ? 'border-white/8 text-white/35 hover:text-white/65 hover:border-white/14' : 'border-slate-200 text-slate-400 hover:text-slate-600'
            )}>
            <LogOut size={12} /> Sign out
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-3 xl:grid-cols-4 gap-4">
          {TOOLS.map((t, i) => (
            <ToolCard key={i} {...t} dark={d} navigate={navigate} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ToolCard({ label, desc, Icon, route, from, to, dark, navigate }: any) {
  return (
    <button
      onClick={() => navigate(route)}
      className={c(
        'group relative overflow-hidden p-6 text-left tr rounded-2xl',
        dark ? 'card-dark card-hover-dark' : 'card-light card-hover-light'
      )}>
      {/* Corner glow on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 tr pointer-events-none rounded-2xl"
        style={{ background: `radial-gradient(ellipse 80% 60% at 20% 0%, ${from}12, transparent)` }} />

      {/* Icon tile */}
      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white mb-4 tr group-hover:scale-105"
        style={{
          background: from,
          boxShadow: `0 1px 3px ${from}30, 0 4px 12px ${from}25`
        }}>
        <Icon size={20} />
      </div>

      <p className={c('font-bold text-sm mb-1.5', dark ? 'text-white' : 'text-[#0F172A]')}>{label}</p>

      {/* Description: hidden by default, slides in on hover */}
      <p className={c(
        'text-xs leading-relaxed tr max-h-0 opacity-0 overflow-hidden group-hover:max-h-12 group-hover:opacity-100',
        dark ? 'text-white/45' : 'text-slate-400'
      )}>
        {desc}
      </p>
    </button>
  )
}
