import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useOutletContext, useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import AuroraText from '../../components/ui/aurora-text'
import SearchInput from '../../components/ui/search-input'
import { c, muted, Breadcrumb } from '../../lib'
import FilterSelect from './FilterSelect'
import { useTheme } from '../../app/ThemeContext'
import { fetchDiscordTasks } from '../../components/discordTasks/api'
import { applyFilters, DEFAULT_FILTERS, SCOPE_FILTERS, parseScopeFilter, scopeAppliesOn, type Filters, type TasksPayload } from '../tasksLogic'
import { activeTab, TEAM_TABS } from './teamNav'
import LinkCard from './LinkCard'
import { showsLinkCard, viewerLine } from './identityLogic'
import { normalizePayload } from './payloadLogic'
import { assigneeAfterProjectChange, personOptions } from './teamLogic'
import ClockControl, { useClock, type ClockState } from './ClockControl'
import Toast from './Toast'

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
  // Set by the Time and Stats tabs from their own response: true when the
  // server narrowed time data to the caller (no view_discord_time). The shell
  // uses it to hide the Assignee select on Time, where every other choice
  // would 403.
  timeSelfScoped: boolean
  setTimeSelfScoped: (v: boolean) => void
  // The shared clock (header control, task-page button). `status` is the
  // server's; `refresh` refetches it.
  clock: ClockState
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
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, projectSlug: params.get('project'), scope: parseScopeFilter(params.get('scope')) })
  const [timeSelfScoped, setTimeSelfScoped] = useState(false)
  const clock = useClock()
  const tab = activeTab(pathname)

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await fetchDiscordTasks()
      setPayload(normalizePayload(data))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  // The project and scope filters are mirrored into the URL (`?project=`,
  // `?scope=`): Projects.tsx deep-links into the first, and both survive the
  // hop between tabs and can be shared.
  const setFilter = useCallback((patch: Partial<Filters>) => {
    const next = { ...filters, ...patch }
    // A project change drops an assignee the new project does not offer, in
    // the same update, so the state never holds a person the list hides.
    if ('projectSlug' in patch && !('assigneeId' in patch)) {
      next.assigneeId = assigneeAfterProjectChange(personOptions(payload, next.projectSlug, tab), next.assigneeId, tab)
    }
    setFilters(next)
    if ('projectSlug' in patch || 'scope' in patch) {
      const p = new URLSearchParams(params)
      if (next.projectSlug) p.set('project', next.projectSlug); else p.delete('project')
      if (next.scope !== 'all') p.set('scope', next.scope); else p.delete('scope')
      setParams(p, { replace: true })
    }
  }, [filters, params, payload, tab, setParams])

  const projects = payload?.projects ?? []
  // The header counts follow what is filterable on this tab: scope has no
  // control on People, Time or Stats, so it does not narrow them.
  const visible = useMemo(
    () => applyFilters(projects, scopeAppliesOn(tab) ? filters : { ...filters, scope: 'all' }),
    [projects, filters, tab],
  )
  // Follows the Project filter (see personOptions). Still roster-based for a
  // viewer who sees everything: people log time on general work and on tasks
  // they are not assigned to, so Time/Stats need people with no tasks too.
  const people = useMemo(() => personOptions(payload, filters.projectSlug, tab), [payload, filters.projectSlug, tab])
  // A refresh or tab switch can leave an assignee the options no longer offer
  // (the select would show Anyone while the filter still applied): reset it.
  useEffect(() => {
    if (!payload || !filters.assigneeId) return
    if (assigneeAfterProjectChange(people, filters.assigneeId, tab) !== filters.assigneeId) setFilters((f) => ({ ...f, assigneeId: null }))
  }, [payload, people, filters.assigneeId, tab])
  const total = visible.reduce((n, p) => n + p.tasks.length, 0)
  const blocked = visible.reduce((n, p) => n + p.tasks.filter((t) => t.isBlocked).length, 0)

  const context: TeamContext = { payload, loading, error, refresh, filters, setFilter, people, timeSelfScoped, setTimeSelfScoped, clock }
  // Only on People, Tasks and Board: Time and Stats follow view_discord_time,
  // not the link, so an unlinked caller still reaches them.
  const showLinkCard = showsLinkCard(payload, tab)
  const viewerText = viewerLine(payload?.viewer)

  // Which of the shared controls apply on this tab. Status is a tasks-list
  // concept; search and Blocked-only act on the tasks payload, which the
  // Time and Stats tabs do not render.
  const taskControls = tab !== 'time' && tab !== 'stats'
  const showAssignee = !(tab === 'time' && timeSelfScoped)

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      {/* The board needs the room: four columns of larger cards do not fit the
          1240px the other tabs read comfortably in. */}
      <div className={c('mx-auto px-4 sm:px-6 lg:px-10 py-8 lg:py-12', tab === 'board' ? 'max-w-[1800px]' : 'max-w-[1240px]')}>
        <Breadcrumb items={['UBS', 'Dev Tools', 'Team']} theme={theme} />
        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="font-extrabold mb-2 screen-title"><AuroraText>Team</AuroraText></h1>
            <p className={c('text-sm font-medium', muted(theme))}>
              {payload?.members.length ?? 0} {payload?.members.length === 1 ? 'person' : 'people'} · {total} task{total === 1 ? '' : 's'} · {blocked} blocked
            </p>
            {viewerText && <p className={c('text-xs font-semibold mt-1 mb-0', muted(theme))}>{viewerText}</p>}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <ClockControl clock={clock} projects={projects} onLinked={async () => { await Promise.all([refresh(), clock.refresh()]) }} />
            {/* The search box filters the shared tasks payload — meaningless
                on the Time and Stats tabs' separately-fetched reports, and on
                the link card, which has no tasks payload to filter. */}
            {taskControls && !showLinkCard && (
              <SearchInput value={filters.query} onChange={(v) => setFilter({ query: v })} placeholder="Search tasks…" width={240} theme={theme} />
            )}
            <button type="button" onClick={() => { void refresh(); void clock.refresh() }} disabled={loading} title="Refresh"
              className={c('h-11 w-11 inline-flex items-center justify-center rounded-xl tr', d ? 'text-white/50 hover:bg-white/6' : 'text-slate-400 hover:bg-slate-100', loading ? 'opacity-50' : '')}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* Tabs are links, not state: each keeps the current query string so a
            project or assignee filter survives the hop between tabs. Always
            shown — an unlinked caller still reaches Time and Stats from here. */}
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

        {/* Filters are dead weight over the link card, which replaces the
            Outlet with nothing to filter; everywhere else they show. */}
        {!showLinkCard && (
          <>
            {/* Project and Assignee apply everywhere; the rest only where the tasks payload is what is on screen. */}
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
              {scopeAppliesOn(tab) && (
                <FilterSelect label="Scope" theme={theme} value={filters.scope} onChange={(v) => setFilter({ scope: parseScopeFilter(v) })}>
                  {SCOPE_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </FilterSelect>
              )}
              {showAssignee && (
                <FilterSelect label="Assignee" theme={theme} value={filters.assigneeId ?? ''} onChange={(v) => setFilter({ assigneeId: v || null })}>
                  <option value="">Anyone</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </FilterSelect>
              )}
              {taskControls && (
                <label className={c('flex items-center gap-2 text-xs font-semibold cursor-pointer', muted(theme))}>
                  <input type="checkbox" checked={filters.blockedOnly} onChange={(e) => setFilter({ blockedOnly: e.target.checked })} /> Blocked only
                </label>
              )}
            </div>
          </>
        )}

        {/* Only about the shared tasks payload — meaningless on the Time and
            Stats tabs, which fetch their own endpoints and show their own
            error banners. */}
        {taskControls && !showLinkCard && error && (
          <div className={c('rounded-xl px-4 py-3 mb-5 text-sm font-medium border', d ? 'bg-red-500/10 border-red-500/25 text-red-300' : 'bg-red-50 border-red-200 text-red-600')}>
            Could not load tasks: {error}
          </div>
        )}

        {showLinkCard ? <LinkCard theme={theme} onLinked={async () => { await refresh(); void clock.refresh() }} /> : <Outlet context={context} />}
      </div>
      {clock.toast && <Toast key={clock.toast.seq} message={clock.toast.message} tone={clock.toast.tone} onClose={clock.dismissToast} />}
    </div>
  )
}
