import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useOutletContext, useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import AuroraText from '../../components/ui/aurora-text'
import SearchInput from '../../components/ui/search-input'
import { c, muted, Breadcrumb } from '../../lib'
import FilterSelect from './FilterSelect'
import { useTheme } from '../../app/ThemeContext'
import { fetchDiscordTasks } from '../../components/discordTasks/api'
import { applyFilters, assigneeOptions, DEFAULT_FILTERS, type Filters, type TasksPayload } from '../tasksLogic'
import { activeTab, TEAM_TABS } from './teamNav'

// The Team section shell: one fetch of GET /api/discord/tasks shared by every
// tab (People, Tasks, Board and task detail), the tab bar, the filter bar and
// the refresh button. Tabs are routes, so the payload lives here rather than in
// any one tab — switching tabs must not refetch.

export interface TeamContext {
  payload: TasksPayload | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  filters: Filters
  setFilter: (patch: Partial<Filters>) => void
  people: { id: string; name: string }[]
}

// Typed accessor for the children below <Outlet context={…}>. Every tab reads
// the section state through this instead of fetching for itself.
export function useTeam(): TeamContext {
  return useOutletContext<TeamContext>()
}

export default function TeamLayout() {
  const { theme } = useTheme()
  const d = theme === 'dark'
  const { pathname, search } = useLocation()
  const [params, setParams] = useSearchParams()
  const [payload, setPayload] = useState<TasksPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, projectSlug: params.get('project') })

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await fetchDiscordTasks()
      setPayload({
        generatedAt: data?.generatedAt ?? '',
        projects: Array.isArray(data?.projects) ? data.projects : [],
        members: Array.isArray(data?.members) ? data.members : [],
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  // Only the project filter is mirrored into the URL (`?project=`) — that is
  // the one Projects.tsx deep-links into, and the one Tasks.tsx already synced.
  const setFilter = useCallback((patch: Partial<Filters>) => {
    const next = { ...filters, ...patch }
    setFilters(next)
    if ('projectSlug' in patch) {
      const p = new URLSearchParams(params)
      if (next.projectSlug) p.set('project', next.projectSlug); else p.delete('project')
      setParams(p, { replace: true })
    }
  }, [filters, params, setParams])

  const projects = payload?.projects ?? []
  const visible = useMemo(() => applyFilters(projects, filters), [projects, filters])
  const people = useMemo(() => assigneeOptions(projects), [projects])
  const total = visible.reduce((n, p) => n + p.tasks.length, 0)
  const blocked = visible.reduce((n, p) => n + p.tasks.filter((t) => t.isBlocked).length, 0)

  const tab = activeTab(pathname)
  const context: TeamContext = { payload, loading, error, refresh, filters, setFilter, people }

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-10 py-8 lg:py-12">
        <Breadcrumb items={['UBS', 'Dev Tools', 'Team']} theme={theme} />
        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="font-extrabold mb-2 screen-title"><AuroraText>Team</AuroraText></h1>
            <p className={c('text-sm font-medium', muted(theme))}>
              {payload?.members.length ?? 0} {payload?.members.length === 1 ? 'person' : 'people'} · {total} task{total === 1 ? '' : 's'} · {blocked} blocked
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SearchInput value={filters.query} onChange={(v) => setFilter({ query: v })} placeholder="Search tasks…" width={240} theme={theme} />
            <button type="button" onClick={() => void refresh()} disabled={loading} title="Refresh"
              className={c('h-11 w-11 inline-flex items-center justify-center rounded-xl tr', d ? 'text-white/50 hover:bg-white/6' : 'text-slate-400 hover:bg-slate-100', loading ? 'opacity-50' : '')}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* Tabs are links, not state: each keeps the current query string so a
            project or assignee filter survives the hop between tabs. */}
        <div className={c('flex border-b mb-6 overflow-x-auto', d ? 'border-white/8' : 'border-slate-200')}>
          {TEAM_TABS.map((t) => (
            <Link key={t.key} to={`${t.path}${search}`}
              className={c(
                'flex-shrink-0 px-5 py-3 text-sm font-semibold relative tr whitespace-nowrap no-underline',
                tab === t.key ? 'text-indigo-500' : d ? 'text-white/35 hover:text-white/65' : 'text-slate-400 hover:text-slate-700',
              )}>
              {t.label}
              {tab === t.key && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-indigo-500 rounded-t" />}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Status is a tasks-list concept: the board has its own columns and
              People counts open work, so it only shows on the Tasks tab. */}
          {tab === 'tasks' && (
            <FilterSelect label="Status" theme={theme} value={filters.status} onChange={(v) => setFilter({ status: v as Filters['status'] })}>
              <option value="all">All statuses</option><option value="active">Active</option><option value="done">Done</option>
            </FilterSelect>
          )}
          <FilterSelect label="Project" theme={theme} value={filters.projectSlug ?? ''} onChange={(v) => setFilter({ projectSlug: v || null })}>
            <option value="">All projects</option>
            {projects.filter((p) => p.docsSlug).map((p) => <option key={p.docsSlug!} value={p.docsSlug!}>{p.name}</option>)}
          </FilterSelect>
          <FilterSelect label="Assignee" theme={theme} value={filters.assigneeId ?? ''} onChange={(v) => setFilter({ assigneeId: v || null })}>
            <option value="">Anyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </FilterSelect>
          <label className={c('flex items-center gap-2 text-xs font-semibold cursor-pointer', muted(theme))}>
            <input type="checkbox" checked={filters.blockedOnly} onChange={(e) => setFilter({ blockedOnly: e.target.checked })} /> Blocked only
          </label>
        </div>

        {/* The one error banner for the section — tabs never render their own. */}
        {error && (
          <div className={c('rounded-xl px-4 py-3 mb-5 text-sm font-medium border', d ? 'bg-red-500/10 border-red-500/25 text-red-300' : 'bg-red-50 border-red-200 text-red-600')}>
            Could not load tasks: {error}
          </div>
        )}

        <Outlet context={context} />
      </div>
    </div>
  )
}
