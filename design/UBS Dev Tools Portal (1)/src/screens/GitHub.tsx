import { useState } from 'react'
import { Bell, ChevronRight, ChevronDown, GitBranch, GitPullRequest, Plus, X, Check,
  AlertTriangle, File, Folder, FolderOpen } from 'lucide-react'
import AuroraText from '../components/ui/aurora-text'
import SearchInput from '../components/ui/search-input'
import { c, card, txt, muted, divider, inputCls, chipMint, chipIndigo, chipAmber, chipGray, Breadcrumb } from '../lib'
import type { Screen, Theme } from '../types'

interface Props { navigate: (s: Screen) => void; theme: Theme }
type Tab = 'repos' | 'issues' | 'prs' | 'newissue'

/* ── File tree data ─────────────────────────────────────────── */
interface TreeNode { name: string; type: 'file' | 'folder'; children?: TreeNode[] }

const FILE_TREE: TreeNode[] = [
  {
    name: 'auth-service', type: 'folder', children: [
      { name: 'src', type: 'folder', children: [
        { name: 'auth', type: 'folder', children: [
          { name: 'token.ts', type: 'file' },
          { name: 'pkce.ts', type: 'file' },
          { name: 'oauth.ts', type: 'file' },
        ]},
        { name: 'middleware', type: 'folder', children: [
          { name: 'rbac.ts', type: 'file' },
          { name: 'rate-limit.ts', type: 'file' },
        ]},
        { name: 'index.ts', type: 'file' },
      ]},
      { name: '__tests__', type: 'folder', children: [
        { name: 'pkce.test.ts', type: 'file' },
        { name: 'auth.test.ts', type: 'file' },
      ]},
      { name: 'package.json', type: 'file' },
    ]
  },
]

const REPOS = [
  { name: 'auth-service', owner: 'granjur', branch: 'main', tags: ['Node.js', 'Express', 'JWT'] },
  { name: 'api-gateway', owner: 'granjur', branch: 'main', tags: ['Node.js', 'NGINX', 'Docker'] },
  { name: 'tenant-admin-ui', owner: 'granjur', branch: 'develop', tags: ['React', 'Vite', 'Tailwind'] },
  { name: 'db-migrations', owner: 'granjur', branch: 'main', tags: ['SQL', 'PostgreSQL'] },
  { name: 'erd-mapper', owner: 'granjur', branch: 'feature/canvas', tags: ['React', 'Canvas API'] },
  { name: 'notify-service', owner: 'granjur', branch: 'main', tags: ['Node.js', 'SendGrid'] },
]

const ISSUES = [
  {
    title: '[Agent Call] Implement OAuth2 PKCE flow for mobile clients',
    statusDot: 'bg-emerald-400', stage: 'PR Ready', mine: true,
    body: 'We need to extend the current OAuth2 implementation to support PKCE for mobile clients. This involves updating the token exchange endpoint and adding code_challenge validation to the authorization flow.',
    comments: [
      { bot: true, text: "I've analyzed the codebase. The `auth/token.ts` handler needs a code_challenge verifier step. I'll open a draft PR with the implementation." },
      { bot: false, text: 'Looks solid. Make sure the tests cover edge cases around code_verifier length validation.' },
      { bot: true, text: 'PR #47 is open with full test coverage. All CI checks passing. Ready for your review.' },
    ]
  },
  {
    title: '[Agent Call] Add sliding-window rate limiting to /api/v2 routes',
    statusDot: 'bg-amber-400 blink', stage: 'Awaiting Bot Response', mine: true,
    body: 'The /api/v2 endpoints need sliding-window rate limiting backed by Redis. Limit should be 100 req/min per tenant_id.',
    comments: [
      { bot: false, text: 'Please use express-rate-limit with a Redis adapter. Key by tenant_id from the JWT payload. Limit: 100/min.' },
    ]
  },
  {
    title: '[Agent Call] Generate ERD canvas from uploaded SQL schema',
    statusDot: 'bg-indigo-400', stage: 'Awaiting Your Response', mine: false,
    body: 'Parse the uploaded SQL schema file and render a visual ERD using the canvas drawing API with draggable nodes.',
    comments: [
      { bot: true, text: "I've parsed the schema and found 12 tables with 8 FK relationships. Here's my proposed layout algorithm and the table node component structure. Should I proceed with the implementation?" },
    ]
  },
]

const PRS = [
  {
    title: 'feat: OAuth2 PKCE flow for mobile clients',
    branch: 'feature/pkce-mobile',
    mergeable: true,
    files: [
      { name: 'src/auth/token.ts', add: 87, del: 12 },
      { name: 'src/auth/pkce.ts', add: 124, del: 0 },
      { name: 'src/middleware/rbac.ts', add: 34, del: 5 },
      { name: '__tests__/pkce.test.ts', add: 156, del: 0 },
    ]
  },
  {
    title: 'fix: tenant isolation in shared connection pool',
    branch: 'fix/tenant-db-isolation',
    mergeable: false,
    files: [
      { name: 'src/db/pool.ts', add: 23, del: 41 },
      { name: 'src/db/tenant.ts', add: 67, del: 18 },
    ]
  },
]

export default function GitHub({ navigate, theme }: Props) {
  const [tab, setTab] = useState<Tab>('repos')
  const [repoQ, setRepoQ] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [prFilter, setPrFilter] = useState<'Open' | 'Closed' | 'All'>('Open')
  const [pingModal, setPingModal] = useState<number | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [pathChips, setPathChips] = useState(['src/auth/token.ts', 'src/middleware/'])
  const [treeExpanded, setTreeExpanded] = useState(new Set(['auth-service', 'src']))
  const d = theme === 'dark'

  const toggleTree = (name: string) => {
    setTreeExpanded(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n })
  }

  const TABS = [
    { key: 'repos' as Tab, label: 'Repositories', Icon: GitBranch },
    { key: 'issues' as Tab, label: 'Issues', Icon: null },
    { key: 'prs' as Tab, label: 'Pull Requests', Icon: GitPullRequest },
    { key: 'newissue' as Tab, label: 'New Issue', Icon: Plus },
  ]

  const stagePill = (stage: string) =>
    stage === 'PR Ready' ? chipMint(theme) :
    stage === 'Awaiting Bot Response' ? chipAmber(theme) :
    chipIndigo(theme)

  const filteredRepos = REPOS.filter(r => `${r.owner}/${r.name}`.includes(repoQ.toLowerCase()))

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      {/* Header */}
      <div className="max-w-[1240px] mx-auto px-10 pt-10 pb-0">
        <Breadcrumb items={['UBS', 'Dev Tools', 'GitHub']} theme={theme} />
        <div className="flex items-center justify-between mb-0">
          <h1 className="font-extrabold" style={{ fontSize: 40, letterSpacing: '-0.025em' }}>
            <AuroraText>GitHub Workspace</AuroraText>
          </h1>
          <div className="relative">
            <button className={c('p-2.5 rounded-xl tr', d ? 'hover:bg-white/6 text-white/50' : 'hover:bg-slate-100 text-slate-400')}>
              <Bell size={19} />
            </button>
            <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 rounded-full bg-red-500 text-white flex items-center justify-center font-bold"
              style={{ fontSize: 9, width: 17, height: 17 }}>3</span>
          </div>
        </div>
      </div>

      {/* Layout: file-tree + main */}
      <div className="max-w-[1240px] mx-auto px-10 py-6 flex gap-5 items-start">
        {/* File explorer */}
        {(tab === 'issues' || tab === 'prs' || tab === 'newissue') && (
          <div className={c(card(theme), 'w-56 shrink-0 overflow-hidden')}>
            <div className={c('px-3 py-2.5 border-b section-kicker', divider(theme), d ? 'text-white/28' : 'text-slate-300')}>
              Explorer
            </div>
            <div className="py-1.5 px-1">
              <TreeNodes nodes={FILE_TREE} depth={0} expanded={treeExpanded} toggle={toggleTree} dark={d} />
            </div>
          </div>
        )}

        {/* Main panel */}
        <div className="flex-1 min-w-0">
          {/* Tab bar */}
          <div className={c('flex border-b mb-5', d ? 'border-indigo-500/12' : 'border-slate-200')}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={c(
                  'flex items-center gap-2 px-5 py-3 text-sm font-semibold relative tr',
                  tab === t.key
                    ? 'text-indigo-500'
                    : d ? 'text-white/38 hover:text-white/70' : 'text-slate-400 hover:text-slate-700'
                )}>
                {t.Icon && <t.Icon size={14} />}
                {t.label}
                {tab === t.key && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-indigo-500 rounded-t" />}
              </button>
            ))}
          </div>

          {/* ── Repos ─────────────────────────────────────── */}
          {tab === 'repos' && (
            <div>
              <div className="mb-5">
                <SearchInput value={repoQ} onChange={setRepoQ} placeholder="Search repositories…" width={288} theme={theme} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                {filteredRepos.map((r, i) => (
                  <button key={i} onClick={() => setTab('issues')}
                    className={c(card(theme), 'p-5 text-left tr rounded-2xl', d ? 'card-hover-dark' : 'card-hover-light')}>
                    <div className="flex items-center gap-2 mb-3">
                      <GitBranch size={15} className="text-indigo-500 shrink-0" />
                      <span className={c('text-xs mono', muted(theme))}>{r.owner}/</span>
                      <span className={c('text-sm font-bold truncate', txt(theme))}>{r.name}</span>
                    </div>
                    <div className="mb-3">
                      <span className={chipIndigo(theme)}>{r.branch}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {r.tags.map(tag => (
                        <span key={tag} className={chipGray(theme)}>{tag}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Issues ───────────────────────────────────── */}
          {tab === 'issues' && (
            <div className="flex flex-col gap-3">
              {ISSUES.map((issue, i) => (
                <div key={i} className={c(card(theme), 'overflow-hidden')}>
                  <button className="w-full flex items-center gap-4 px-5 py-4 text-left"
                    onClick={() => setExpanded(expanded === i ? null : i)}>
                    <div className={c('w-2.5 h-2.5 rounded-full shrink-0', issue.statusDot)} />
                    <span className={c('flex-1 text-sm font-semibold mono leading-snug', txt(theme))}>
                      {issue.title}
                    </span>
                    {issue.mine && <span className={chipIndigo(theme)}>mine</span>}
                    <span className={stagePill(issue.stage)}>{issue.stage}</span>
                    <ChevronDown size={14} className={c(muted(theme), 'tr', expanded === i ? 'rotate-180' : '')} />
                  </button>
                  {expanded === i && (
                    <div className={c('px-5 pb-5 border-t', divider(theme))}>
                      <p className={c('text-xs leading-relaxed mt-4 mb-5', muted(theme))}>{issue.body}</p>
                      <div className="flex flex-col gap-3 mb-4">
                        {issue.comments.map((cm, j) => (
                          <div key={j} className={c(
                            'flex gap-3 items-start rounded-xl p-3.5',
                            cm.bot
                              ? d ? 'bg-indigo-500/8 border border-indigo-500/18' : 'bg-indigo-50 border border-indigo-100'
                              : d ? 'bg-white/[0.03]' : 'bg-slate-50'
                          )}>
                            <span className="text-base shrink-0">{cm.bot ? '🤖' : '👤'}</span>
                            <p className={c('text-xs leading-relaxed', d ? 'text-white/60' : 'text-slate-600')}>{cm.text}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input placeholder="Reply to thread…" className={c(inputCls(theme), 'flex-1 text-sm')} />
                        <button className="btn-primary px-4 py-2 text-xs rounded-xl whitespace-nowrap">Send</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Pull Requests ─────────────────────────────── */}
          {tab === 'prs' && (
            <div>
              <div className={c('inline-flex p-1 rounded-xl mb-5', d ? 'bg-white/5' : 'bg-slate-100')}>
                {(['Open', 'Closed', 'All'] as const).map(f => (
                  <button key={f} onClick={() => setPrFilter(f)}
                    className={c(
                      'px-4 py-1.5 rounded-lg text-xs font-bold tr',
                      prFilter === f
                        ? d ? 'bg-indigo-500/30 text-indigo-300' : 'bg-white text-indigo-600 shadow-sm'
                        : d ? 'text-white/38' : 'text-slate-500'
                    )}>{f}</button>
                ))}
              </div>
              <div className="flex flex-col gap-4">
                {PRS.map((pr, i) => (
                  <div key={i} className={c(card(theme), 'overflow-hidden')}>
                    <div className={c('px-5 py-2.5 text-xs font-bold flex items-center gap-2',
                      pr.mergeable
                        ? d ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
                        : d ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-700'
                    )}>
                      {pr.mergeable ? <Check size={13} /> : <AlertTriangle size={13} />}
                      {pr.mergeable ? 'Ready to merge' : 'Conflicts detected — rebase required before merge'}
                    </div>
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className={c('font-bold text-sm mb-1', txt(theme))}>{pr.title}</p>
                          <span className={c('mono text-xs', muted(theme))}>{pr.branch}</span>
                        </div>
                        <button onClick={() => setPingModal(i)}
                          className={c('btn-outline-indigo px-4 py-2 text-xs', d ? 'dark-variant' : '')}>
                          Ping to merge
                        </button>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {pr.files.map((f, j) => (
                          <div key={j} className={c('flex items-center justify-between px-3.5 py-2 rounded-xl',
                            d ? 'bg-white/[0.03]' : 'bg-slate-50')}>
                            <div className="flex items-center gap-2.5">
                              <File size={13} className="text-indigo-400 shrink-0" />
                              <span className={c('mono text-xs', d ? 'text-white/60' : 'text-slate-600')}>{f.name}</span>
                            </div>
                            <div className="flex items-center gap-2 mono text-xs">
                              <span className="text-emerald-500">+{f.add}</span>
                              <span className="text-red-400">−{f.del}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── New Issue ─────────────────────────────────── */}
          {tab === 'newissue' && (
            <div className={c(card(theme), 'p-7 max-w-[680px]')}>
              <h2 className={c('font-bold text-[15px] mb-5', txt(theme))}>Create Agent Call Issue</h2>
              <div className="flex flex-col gap-4">
                <div>
                  <label className={c('section-kicker block mb-2', d ? 'text-white/28' : 'text-slate-300')}>Title</label>
                  <div className="flex items-center gap-2.5">
                    <span className={chipIndigo(theme) + ' mono shrink-0'}>[Agent Call]</span>
                    <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                      placeholder="Brief description of the task"
                      className={c(inputCls(theme), 'text-sm flex-1')} />
                  </div>
                </div>
                <div>
                  <label className={c('section-kicker block mb-2', d ? 'text-white/28' : 'text-slate-300')}>Task Description</label>
                  <textarea value={newBody} onChange={e => setNewBody(e.target.value)}
                    placeholder="Describe the task in detail. The AI agent will parse this and begin working…"
                    rows={6}
                    className={c(inputCls(theme), 'resize-none text-sm')} />
                </div>

                {/* Advanced toggle */}
                <button onClick={() => setShowAdvanced(v => !v)}
                  className={c('flex items-center gap-2 text-xs font-semibold tr w-fit',
                    d ? 'text-white/35 hover:text-white/65' : 'text-slate-400 hover:text-slate-600')}>
                  <ChevronDown size={13} className={c('tr', showAdvanced ? 'rotate-180' : '')} />
                  Advanced options
                </button>

                {showAdvanced && (
                  <div className={c('rounded-xl p-4 border', d ? 'bg-white/[0.03] border-indigo-500/14' : 'bg-slate-50 border-slate-200')}>
                    <label className={c('section-kicker block mb-3', d ? 'text-white/28' : 'text-slate-300')}>Context Files</label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {pathChips.map((chip, i) => (
                        <span key={i} className={c(chipIndigo(theme), 'mono')}>
                          {chip}
                          <button onClick={() => setPathChips(p => p.filter((_, j) => j !== i))} className="ml-1 opacity-60 hover:opacity-100 tr"><X size={10} /></button>
                        </span>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className={c('section-kicker block mb-1.5', d ? 'text-white/28' : 'text-slate-300')}>Type</label>
                        <select className={c(inputCls(theme), 'text-sm')}>
                          <option>Bug</option><option>Feature</option><option>Refactor</option><option>Docs</option>
                        </select>
                      </div>
                      <div>
                        <label className={c('section-kicker block mb-1.5', d ? 'text-white/28' : 'text-slate-300')}>Priority</label>
                        <select className={c(inputCls(theme), 'text-sm')}>
                          <option>High</option><option>Medium</option><option>Low</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <button className="btn-primary w-full py-3 text-sm rounded-xl mt-1">
                  Create Issue
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ping modal */}
      {pingModal !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setPingModal(null)}>
          <div className={c(card(theme), 'rounded-2xl p-7 w-[400px] slide-up')} onClick={e => e.stopPropagation()}>
            <h3 className={c('font-bold text-base mb-2', txt(theme))}>Ping to Merge</h3>
            <p className={c('text-sm mb-5 leading-relaxed', muted(theme))}>
              This will notify the PR reviewer and request merge approval for{' '}
              <span className={c('font-semibold mono', d ? 'text-indigo-300' : 'text-indigo-600')}>{PRS[pingModal]?.branch}</span>.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setPingModal(null)}
                className={c('flex-1 py-2.5 rounded-xl text-sm font-semibold border tr',
                  d ? 'border-white/10 text-white/45 hover:text-white/70' : 'border-slate-200 text-slate-500 hover:text-slate-700')}>
                Cancel
              </button>
              <button onClick={() => setPingModal(null)}
                className="btn-primary flex-1 py-2.5 text-sm rounded-xl">
                Send Ping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── File tree component ─────────────────────────────────────── */
function TreeNodes({ nodes, depth, expanded, toggle, dark }: {
  nodes: TreeNode[]; depth: number; expanded: Set<string>; toggle: (n: string) => void; dark: boolean
}) {
  return (
    <>
      {nodes.map((node, i) => (
        <div key={i}>
          <button
            onClick={() => node.type === 'folder' && toggle(node.name)}
            className={c(
              'w-full flex items-center gap-1.5 py-1 px-2 rounded-lg text-[11.5px] font-medium tr text-left',
              dark ? 'text-white/55 hover:bg-white/5 hover:text-white/80' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            )}
            style={{ paddingLeft: 8 + depth * 14 }}>
            {node.type === 'folder'
              ? expanded.has(node.name)
                ? <FolderOpen size={12} className="text-indigo-400 shrink-0" />
                : <Folder size={12} className="text-indigo-400/60 shrink-0" />
              : <File size={12} className={dark ? 'text-white/28 shrink-0' : 'text-slate-300 shrink-0'} />
            }
            <span className="truncate">{node.name}</span>
            {node.type === 'folder' && (
              <ChevronRight size={10} className={c('ml-auto shrink-0 tr', expanded.has(node.name) ? 'rotate-90' : '')} />
            )}
          </button>
          {node.type === 'folder' && expanded.has(node.name) && node.children && (
            <TreeNodes nodes={node.children} depth={depth + 1} expanded={expanded} toggle={toggle} dark={dark} />
          )}
        </div>
      ))}
    </>
  )
}
