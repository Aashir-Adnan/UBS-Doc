import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw, ExternalLink, Ban } from 'lucide-react'
import AuroraText from '../components/ui/aurora-text'
import SearchInput from '../components/ui/search-input'
import { c, card, txt, muted, Breadcrumb, chipRed, chipGray, chipIndigo, chipMint, chipAmber, inputCls } from '../lib'
import { useTheme } from '../app/ThemeContext'
import type { Theme } from '../types'
import { fetchDiscordTasks } from '../components/discordTasks/api'
import {
  applyFilters, assigneeOptions, statusTone, DEFAULT_FILTERS, STATUS_LABEL,
  type Filters, type ProjectGroup, type TaskRow, type Tone,
} from './tasksLogic'

// Project tasks straight from the Discord bot's database, via CSAAS
// GET /api/discord/tasks. Filtering is client-side: the corpus is a few dozen
// rows and the endpoint returns every status.

const toneChip: Record<Tone, (t: Theme) => string> = { done: chipMint, active: chipIndigo, idle: chipAmber, bad: chipRed }

export default function Tasks() {
  const { theme } = useTheme()
  const d = theme === 'dark'
  const [params, setParams] = useSearchParams()
  const [projects, setProjects] = useState<ProjectGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, projectSlug: params.get('project') })

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await fetchDiscordTasks()
      setProjects(Array.isArray(data?.projects) ? data.projects : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const set = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch }
    setFilters(next)
    if ('projectSlug' in patch) {
      const p = new URLSearchParams(params)
      if (next.projectSlug) p.set('project', next.projectSlug); else p.delete('project')
      setParams(p, { replace: true })
    }
  }

  const visible = useMemo(() => applyFilters(projects, filters), [projects, filters])
  const people = useMemo(() => assigneeOptions(projects), [projects])
  const total = visible.reduce((n, p) => n + p.tasks.length, 0)
  const blocked = visible.reduce((n, p) => n + p.tasks.filter((t) => t.isBlocked).length, 0)
  const sel = inputCls(theme, 'text-xs py-2 px-3 rounded-xl')

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-10 py-8 lg:py-12">
        <Breadcrumb items={['UBS', 'Dev Tools', 'Tasks']} theme={theme} />
        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="font-extrabold mb-2 screen-title"><AuroraText>Tasks</AuroraText></h1>
            <p className={c('text-sm font-medium', muted(theme))}>{total} task{total === 1 ? '' : 's'} · {blocked} blocked</p>
          </div>
          <div className="flex items-center gap-3">
            <SearchInput value={filters.query} onChange={(v) => set({ query: v })} placeholder="Search tasks…" width={240} theme={theme} />
            <button type="button" onClick={() => void refresh()} disabled={loading} title="Refresh"
              className={c('p-2.5 rounded-xl tr', d ? 'text-white/50 hover:bg-white/6' : 'text-slate-400 hover:bg-slate-100', loading ? 'opacity-50' : '')}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          <select className={sel} value={filters.status} onChange={(e) => set({ status: e.target.value as Filters['status'] })}>
            <option value="all">All statuses</option><option value="active">Active</option><option value="done">Done</option>
          </select>
          <select className={sel} value={filters.projectSlug ?? ''} onChange={(e) => set({ projectSlug: e.target.value || null })}>
            <option value="">All projects</option>
            {projects.filter((p) => p.docsSlug).map((p) => <option key={p.docsSlug!} value={p.docsSlug!}>{p.name}</option>)}
          </select>
          <select className={sel} value={filters.assigneeId ?? ''} onChange={(e) => set({ assigneeId: e.target.value || null })}>
            <option value="">Anyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className={c('flex items-center gap-2 text-xs font-semibold cursor-pointer', muted(theme))}>
            <input type="checkbox" checked={filters.blockedOnly} onChange={(e) => set({ blockedOnly: e.target.checked })} /> Blocked only
          </label>
        </div>

        {error && (
          <div className={c('rounded-xl px-4 py-3 mb-5 text-sm font-medium border', d ? 'bg-red-500/10 border-red-500/25 text-red-300' : 'bg-red-50 border-red-200 text-red-600')}>
            Could not load tasks: {error}
          </div>
        )}
        {!loading && !error && visible.length === 0 && (
          <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
            <p className={c('text-sm font-medium', muted(theme))}>{projects.length ? 'No tasks match these filters.' : 'No tasks yet.'}</p>
          </div>
        )}

        <div className="flex flex-col gap-5">
          {visible.map((p) => <ProjectCard key={p.id ?? 'none'} p={p} theme={theme} />)}
        </div>
      </div>
    </div>
  )
}

function ProjectCard({ p, theme }: { p: ProjectGroup; theme: Theme }) {
  const d = theme === 'dark'
  return (
    <section className={c(card(theme), 'rounded-2xl p-5 sm:p-6')}>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <h2 className={c('font-extrabold text-lg', txt(theme))}>{p.name}</h2>
        <p className={c('text-xs font-semibold', muted(theme))}>
          {p.counts.open} open · {p.counts.in_progress} in progress · {p.counts.done} done{p.counts.blocked ? ` · ${p.counts.blocked} blocked` : ''}
        </p>
      </div>
      {p.members.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {p.members.map((m) => (
            <span key={m.discordId} title={m.source === 'inferred' ? 'Assigned to tasks here' : (m.role ?? undefined)}
              className={c('text-[11px] font-semibold px-2.5 py-1 rounded-full', m.source === 'explicit' ? chipIndigo(theme) : chipGray(theme))}>
              {m.name}{m.role ? ` · ${m.role}` : ''}
            </span>
          ))}
        </div>
      )}
      <ul className={c('divide-y', d ? 'divide-white/6' : 'divide-slate-100')}>
        {p.tasks.map((t) => <TaskLine key={t.id} t={t} theme={theme} />)}
      </ul>
    </section>
  )
}

function TaskLine({ t, theme }: { t: TaskRow; theme: Theme }) {
  const tone = statusTone(t)
  return (
    <li className="py-3 flex flex-wrap items-start gap-x-3 gap-y-1.5">
      <span className={c('text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0', toneChip[tone](theme))}>{STATUS_LABEL[t.status] ?? t.status}</span>
      <div className="flex-1 min-w-[200px]">
        <p className={c('text-sm font-semibold', txt(theme))}>
          {t.title}
          {t.channelUrl && (
            <a href={t.channelUrl} target="_blank" rel="noreferrer" title="Open in Discord" className="inline-flex ml-1.5 align-middle opacity-60 hover:opacity-100">
              <ExternalLink size={12} />
            </a>
          )}
        </p>
        <p className={c('text-xs', muted(theme))}>
          {t.assignees.length ? t.assignees.map((a) => a.name).join(', ') : 'Unassigned'}
          {t.type === 'bug' ? ' · bug' : ''}
        </p>
        {t.isBlocked && (
          <p className={c('text-xs font-semibold mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md', chipRed(theme))}>
            <Ban size={11} /> Blocked by: {t.blockedBy.filter((b) => !['closed', 'done', 'resolved'].includes(b.status ?? '')).map((b) => b.title).join(', ')}
          </p>
        )}
      </div>
    </li>
  )
}
