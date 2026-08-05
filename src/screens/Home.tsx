import { useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, Wrench, ChevronRight, Zap, Shield, Globe, GitBranch } from 'lucide-react'
import { c, card, txt, muted, sub, divider, Breadcrumb } from '../lib'
import { useTheme } from '../app/ThemeContext'
import AuroraText from '../components/ui/aurora-text'

const DOCS = [
  { label: 'Framework Features', sub: 'Core capabilities of the UBS platform', icon: '🚀', to: '/docs/intro/UBS_Framework_Features' },
  { label: 'Why Node', sub: 'Advantages of the Node-based architecture', icon: '⚡', to: '/docs/intro/Node-Advantages' },
  { label: 'Backend', sub: 'API layer, permissions, and query engine', icon: '🖥️', to: '/docs/backend/UBS-intro' },
  { label: 'Frontend', sub: 'Portal architecture and conventions', icon: '🎨', to: '/docs/frontend/UBS-intro' },
  { label: 'Database', sub: 'Schema design and Lucidchart workflow', icon: '🗄️', to: '/docs/database/Lucidchart' },
  { label: 'Agents', sub: 'Agent-call issue format and workflow', icon: '🤖', to: '/docs/agents/agent-issue-format' },
  { label: 'Projects — Badar HMS', sub: 'Opera PMS configuration reference', icon: '📁', to: '/docs/projects/badar-hms/Opera_Config' },
]

const STORIES = [
  {
    icon: <Zap size={17} />,
    accent: '#4F46E5',
    title: 'AI-Powered Meeting Summaries',
    blurb: 'Record, transcribe, and extract action items from engineering stand-ups — then push them directly as GitHub issues.',
  },
  {
    icon: <GitBranch size={17} />,
    accent: '#7C3AED',
    title: 'GitHub Agent Workflow',
    blurb: 'Create agent-call issues, review PRs, and get bot-driven code suggestions without leaving the portal.',
  },
  {
    icon: <Globe size={17} />,
    accent: '#10B981',
    title: 'Multi-Tenant Infrastructure',
    blurb: 'Provision users, assign roles, and enforce RBAC across tenants from a single admin console.',
  },
  {
    icon: <Shield size={17} />,
    accent: '#F59E0B',
    title: 'Schema-First API Builder',
    blurb: 'Upload SQL schemas, visualize ERDs, and auto-generate API object configurations with zero boilerplate.',
  },
]

export default function Home() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const d = theme === 'dark'
  const bgCls = d ? 'aurora-dark' : 'aurora-light'

  return (
    <div className={c('min-h-full', bgCls)}>
      <div className="max-w-[1240px] mx-auto px-10 py-12">
        <Breadcrumb items={['UBS', 'Home']} theme={theme} />

        {/* Hero ─────────────────────────────────────────────── */}
        <div className="relative mb-16">
          {/* Subtle glow behind headline */}
          {d && (
            <div className="absolute -top-8 -left-8 w-96 h-40 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse, rgba(79,70,229,0.18) 0%, transparent 70%)', filter: 'blur(32px)' }} />
          )}

          <p className="section-kicker text-indigo-500 mb-4">Internal Developer Platform</p>
          <h1 className="font-extrabold mb-5"
            style={{ fontSize: 52, letterSpacing: '-0.03em', lineHeight: 1.08, maxWidth: 640, color: 'inherit' }}>
            <span className={txt(theme)}>Build faster,</span><br />
            <AuroraText>ship with confidence.</AuroraText>
          </h1>
          <p className={c('text-[17px] mb-9 leading-relaxed max-w-xl font-medium', sub(theme))}>
            The UBS Dev Tools Portal unifies your team's engineering workflows — from AI-powered meetings to GitHub, databases, and API generation — in one command center.
          </p>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/docs/backend/UBS-intro')}
              className="btn-primary flex items-center gap-2.5 px-6 py-3 text-sm">
              <BookOpen size={15} /> Explore Documentation <ArrowRight size={14} />
            </button>
            <button onClick={() => navigate('/tools')}
              className={c('btn-outline-indigo flex items-center gap-2.5 px-6 py-3 text-sm', d ? 'dark-variant' : '')}>
              <Wrench size={14} /> Open Dev Tools
            </button>
          </div>
        </div>

        {/* Content grid ──────────────────────────────────────── */}
        <div className="grid grid-cols-[1fr_340px] gap-8 items-start">
          {/* Docs list */}
          <div className={c(card(theme), 'overflow-hidden')}>
            <div className={c('px-6 py-4 border-b flex items-center justify-between', divider(theme))}>
              <span className={c('font-bold text-[15px]', txt(theme))}>Documentation</span>
              <button onClick={() => navigate('/docs/intro/UBS_Framework_Features')}
                className={c('text-xs font-semibold text-indigo-500 hover:text-indigo-600 tr flex items-center gap-1')}>
                View all <ChevronRight size={12} />
              </button>
            </div>
            {DOCS.map((doc, i) => (
              <button key={i}
                onClick={() => navigate(doc.to)}
                className={c(
                  'w-full flex items-center gap-4 px-6 py-4 border-b last:border-0 text-left tr',
                  divider(theme),
                  d ? 'hover:bg-indigo-500/[0.04]' : 'hover:bg-indigo-50/50'
                )}>
                <span className="text-xl shrink-0">{doc.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={c('text-sm font-semibold mb-0.5', txt(theme))}>{doc.label}</p>
                  <p className={c('text-xs truncate', muted(theme))}>{doc.sub}</p>
                </div>
                <ChevronRight size={14} className={muted(theme)} />
              </button>
            ))}
          </div>

          {/* Story cards */}
          <div className="flex flex-col gap-3.5">
            {STORIES.map((s, i) => (
              <div key={i} className={c(card(theme), 'card-hover-' + (d ? 'dark' : 'light'), 'p-5 tr cursor-pointer')}>
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white"
                    style={{ background: s.accent }}>
                    {s.icon}
                  </div>
                  <div>
                    <p className={c('text-sm font-bold mb-1.5', txt(theme))}>{s.title}</p>
                    <p className={c('text-xs leading-relaxed', muted(theme))}>{s.blurb}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
