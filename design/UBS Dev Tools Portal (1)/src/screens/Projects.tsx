import { useState } from 'react'
import { FolderOpen, ChevronRight, Plus, ChevronDown, Search, ExternalLink } from 'lucide-react'
import { c, card, txt, muted, divider, inputCls, chipMint, chipAmber, chipRed, chipIndigo, chipGray, Breadcrumb, Checkbox } from '../lib'
import type { Screen, Theme } from '../types'

interface Props { navigate: (s: Screen) => void; theme: Theme; screen: 'projects' | 'my-projects' | 'repositories' }

const PROJECTS = [
  { name: 'UBS Dev Portal', desc: 'Internal developer operations hub for the granjur.com engineering organization.', tags: ['React', 'Vite'] },
  { name: 'Auth Service', desc: 'OAuth2 / OIDC microservice managing tenant authentication and role-based access control.', tags: ['Node.js', 'JWT'] },
  { name: 'API Gateway', desc: 'Central reverse proxy with sliding-window rate limiting, request routing, and monitoring.', tags: ['Node.js', 'NGINX'] },
  { name: 'Tenant Admin', desc: 'Multi-tenant provisioning UI and admin console with full audit logging.', tags: ['React', 'Tailwind'] },
  { name: 'ERD Mapper', desc: 'Interactive database schema visualization tool with draggable ERD canvas.', tags: ['React', 'Canvas'] },
  { name: 'Notify Service', desc: 'Bug reporting and feature request management with Slack and email integrations.', tags: ['Node.js', 'SendGrid'] },
]

const MY_PROJECTS = [
  { name: 'ubs-dev-portal.granjur.com', status: 'Live', branch: 'main', updated: '5 min ago', commits: 247 },
  { name: 'auth-staging.granjur.com', status: 'Building', branch: 'feature/pkce', updated: '2 min ago', commits: 183 },
  { name: 'api-gw-preview.granjur.com', status: 'Live', branch: 'main', updated: '1 hr ago', commits: 94 },
  { name: 'erd-mapper-dev.granjur.com', status: 'Down', branch: 'feature/canvas', updated: '3 hrs ago', commits: 61 },
]

const REPOS = [
  { name: 'auth-service', framework: 'Node', platforms: ['AWS Lambda', 'Docker'], paths: ['src/auth/', 'src/middleware/', '__tests__/'] },
  { name: 'tenant-admin-ui', framework: 'React', platforms: ['Vercel', 'CloudFront'], paths: ['src/components/', 'src/pages/', 'src/hooks/'] },
  { name: 'api-gateway', framework: 'Node', platforms: ['AWS ECS', 'Docker'], paths: ['src/routes/', 'src/proxy/', 'config/'] },
]

const FEATURES = [
  { name: 'OAuth2 PKCE Flow', repos: ['auth-service'], status: 'Live' },
  { name: 'Sliding-Window Rate Limiting', repos: ['api-gateway'], status: 'Building' },
  { name: 'ERD Canvas Renderer', repos: ['erd-mapper'], status: 'Dev' },
  { name: 'Tenant Provisioning UI', repos: ['tenant-admin-ui'], status: 'Live' },
  { name: 'Meeting Transcription', repos: ['meeting-service'], status: 'Building' },
  { name: 'API Object Builder', repos: ['ubs-dev-portal'], status: 'Live' },
]

export default function ProjectsScreen({ navigate, theme, screen }: Props) {
  const d = theme === 'dark'
  if (screen === 'projects') return <ProjectsGrid theme={theme} />
  if (screen === 'my-projects') return <MyProjectsView theme={theme} />
  return <RepositoriesView theme={theme} />
}

function ProjectsGrid({ theme }: { theme: Theme }) {
  const d = theme === 'dark'
  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[1240px] mx-auto px-10 py-12">
        <Breadcrumb items={['UBS', 'Dev Tools', 'Projects']} theme={theme} />
        <h1 className="grad-text font-extrabold mb-8" style={{ fontSize: 40, letterSpacing: '-0.025em' }}>Projects</h1>
        <div className="grid grid-cols-3 gap-5">
          {PROJECTS.map((p, i) => (
            <div key={i} className={c(card(theme), 'p-6 group cursor-pointer tr rounded-2xl', d ? 'card-hover-dark' : 'card-hover-light')}>
              <div className="flex items-center gap-3 mb-4">
                <div className={c('w-9 h-9 rounded-xl flex items-center justify-center',
                  d ? 'bg-indigo-500/12 border border-indigo-500/20' : 'bg-indigo-50 border border-indigo-100')}>
                  <FolderOpen size={17} className="text-indigo-500" />
                </div>
                <span className={c('font-bold text-sm', txt(theme))}>{p.name}</span>
              </div>
              <p className={c('text-xs leading-relaxed mb-4', muted(theme))}>{p.desc}</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {p.tags.map(t => <span key={t} className={chipGray(theme)}>{t}</span>)}
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 tr">
                <button className={c('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold tr',
                  d ? 'bg-indigo-500/14 text-indigo-400 hover:bg-indigo-500/22' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100')}>
                  Documentation
                </button>
                <button className={c('flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border tr',
                  d ? 'border-white/8 text-white/45 hover:text-white hover:border-white/18' : 'border-slate-200 text-slate-500 hover:text-slate-700')}>
                  Open <ExternalLink size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MyProjectsView({ theme }: { theme: Theme }) {
  const d = theme === 'dark'
  const statusChip = (s: string) =>
    s === 'Live' ? chipMint(theme) :
    s === 'Building' ? chipAmber(theme) :
    chipRed(theme)
  const statusDot = (s: string) =>
    s === 'Live' ? 'bg-emerald-400' :
    s === 'Building' ? 'bg-amber-400 blink' : 'bg-red-500'

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[900px] mx-auto px-10 py-12">
        <Breadcrumb items={['UBS', 'Dev Tools', 'My Projects']} theme={theme} />
        <h1 className="grad-text font-extrabold mb-8" style={{ fontSize: 40, letterSpacing: '-0.025em' }}>My Projects</h1>
        <div className="grid grid-cols-2 gap-5">
          {MY_PROJECTS.map((p, i) => (
            <div key={i} className={c(card(theme), 'p-6 rounded-2xl')}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={c('w-2 h-2 rounded-full', statusDot(p.status))} />
                    <span className={c('text-xs mono font-semibold', muted(theme))}>{p.branch}</span>
                  </div>
                  <p className={c('font-bold text-sm mono leading-snug', txt(theme))}>{p.name}</p>
                </div>
                <span className={statusChip(p.status)}>{p.status}</span>
              </div>
              <div className={c('flex items-center justify-between pt-4 border-t text-xs', divider(theme))}>
                <span className={muted(theme)}>Updated {p.updated}</span>
                <span className={muted(theme)}>{p.commits} commits</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function RepositoriesView({ theme }: { theme: Theme }) {
  const [tab, setTab] = useState<'repos' | 'features'>('repos')
  const [expanded, setExpanded] = useState(new Set<number>([0]))
  const [featureQ, setFeatureQ] = useState('')
  const d = theme === 'dark'

  const statusChip = (s: string) =>
    s === 'Live' ? chipMint(theme) :
    s === 'Building' ? chipAmber(theme) :
    chipIndigo(theme)

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[900px] mx-auto px-10 py-12">
        <Breadcrumb items={['UBS', 'Dev Tools', 'Repositories']} theme={theme} />
        <div className="flex items-center justify-between mb-6">
          <h1 className="grad-text font-extrabold" style={{ fontSize: 40, letterSpacing: '-0.025em' }}>Repositories</h1>
          {tab === 'repos' && (
            <button className={c('flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl border tr',
              d ? 'border-indigo-500/20 text-white/40 hover:text-white hover:border-indigo-500/40' : 'border-slate-200 text-slate-400 hover:text-slate-700')}>
              ⬇ Pull all repos
            </button>
          )}
        </div>

        <div className={c('inline-flex p-1 rounded-xl mb-6', d ? 'bg-white/5' : 'bg-slate-100')}>
          {(['repos', 'features'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={c('px-5 py-1.5 rounded-lg text-xs font-bold tr',
                tab === t
                  ? d ? 'bg-indigo-500/28 text-indigo-300' : 'bg-white text-indigo-600 shadow-sm'
                  : d ? 'text-white/38' : 'text-slate-500'
              )}>
              {t === 'repos' ? 'Repositories' : 'Features'}
            </button>
          ))}
        </div>

        {tab === 'repos' && (
          <div className="flex flex-col gap-3">
            {REPOS.map((r, i) => (
              <div key={i} className={c(card(theme), 'overflow-hidden rounded-2xl')}>
                <button className="w-full flex items-center gap-4 px-5 py-4"
                  onClick={() => setExpanded(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })}>
                  <span className="text-base shrink-0">📦</span>
                  <span className={c('flex-1 text-sm font-bold mono text-left', txt(theme))}>{r.name}</span>
                  {/* Framework toggles */}
                  <div className="flex items-center gap-2">
                    {['Node', 'React'].map(fw => (
                      <div key={fw} className="flex items-center gap-1.5">
                        <div className={c('relative w-7 h-3.5 rounded-full tr',
                          r.framework === fw ? 'bg-indigo-600' : d ? 'bg-white/10' : 'bg-slate-200')}>
                          <div className={c('absolute top-[1.5px] w-2.5 h-2.5 rounded-full bg-white shadow-sm tr',
                            r.framework === fw ? 'left-[13px]' : 'left-[1.5px]')} />
                        </div>
                        <span className={c('text-[10px] font-semibold', muted(theme))}>{fw}</span>
                      </div>
                    ))}
                  </div>
                  <ChevronDown size={14} className={c(muted(theme), 'tr ml-1', expanded.has(i) ? 'rotate-180' : '')} />
                </button>
                {expanded.has(i) && (
                  <div className={c('px-5 pb-5 border-t', divider(theme))}>
                    <div className="grid grid-cols-2 gap-5 mt-4">
                      <div>
                        <p className={c('section-kicker mb-2.5', d ? 'text-white/28' : 'text-slate-400')}>Platforms</p>
                        <div className="flex flex-wrap gap-1.5">
                          {r.platforms.map(p => <span key={p} className={chipIndigo(theme)}>{p}</span>)}
                        </div>
                      </div>
                      <div>
                        <p className={c('section-kicker mb-2.5', d ? 'text-white/28' : 'text-slate-400')}>File Paths</p>
                        <div className="flex flex-wrap gap-1.5">
                          {r.paths.map(p => <span key={p} className={c(chipGray(theme), 'mono text-[10px]')}>{p}</span>)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <button className={c(
              'rounded-2xl p-5 border-2 border-dashed flex items-center justify-center gap-2 text-sm font-semibold tr',
              d ? 'border-indigo-500/20 text-white/30 hover:border-indigo-500/40 hover:text-white/55' : 'border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-600'
            )}>
              <Plus size={15} /> Add Repository
            </button>
          </div>
        )}

        {tab === 'features' && (
          <div>
            <div className={c('flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm w-72 mb-5',
              d ? 'bg-white/5 border-indigo-500/20' : 'bg-white border-slate-200')}>
              <Search size={14} className={muted(theme)} />
              <input value={featureQ} onChange={e => setFeatureQ(e.target.value)} placeholder="Search features…"
                className="bg-transparent outline-none flex-1 text-sm" style={{ color: 'inherit' }} />
            </div>
            <div className="flex flex-col gap-3">
              {FEATURES.filter(f => f.name.toLowerCase().includes(featureQ.toLowerCase())).map((f, i) => (
                <div key={i} className={c(card(theme), 'p-5 flex items-center justify-between rounded-2xl')}>
                  <div>
                    <p className={c('font-bold text-sm mb-1.5', txt(theme))}>{f.name}</p>
                    <div className="flex gap-1.5">
                      {f.repos.map(r => <span key={r} className={c(chipGray(theme), 'mono text-[10px]')}>{r}</span>)}
                    </div>
                  </div>
                  <span className={statusChip(f.status)}>{f.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
