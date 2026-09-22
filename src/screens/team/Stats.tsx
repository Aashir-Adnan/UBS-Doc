import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { c, card, txt, muted, chipIndigo, chipAmber, chipRed, chipGray } from '../../lib'
import { useTheme } from '../../app/ThemeContext'
import type { Theme } from '../../types'
import { fetchProjectStats, type ProjectStats, type ProjectStatsPayload } from '../../components/discordTasks/api'
import { applyFilters, DEFAULT_FILTERS, isTerminal, roleLabel, type ProjectGroup, type ProjectMember } from '../tasksLogic'
import { formatDuration } from './timeLogic'
import {
  RANGE_KINDS, type RangeKind, rangeBounds, bucketKeys, rollup, fillSeries, cumulative, stackByMember, memberColor,
  completionPercent, memberBreakdown, estimateSummary, minutesInRange, parseDayKey,
} from './statsLogic'
import Avatar, { AvatarStack } from './Avatar'
import Sparkline from './charts/Sparkline'
import Bars from './charts/Bars'
import StackedBars from './charts/StackedBars'
import CumulativeLines from './charts/CumulativeLines'
import { useTeam } from './TeamLayout'

// The Stats tab. Two sources, deliberately:
//  - snapshot numbers (members, open/done counts, completion %, estimate vs
//    logged) come from the tasks payload TeamLayout already holds, scoped by
//    the Project filter exactly as People does, so they agree with the Tasks
//    tab under the same filter;
//  - time series (created / completed / events per bucket, time per bucket
//    per person), stale tasks and cycle time come from
//    GET /api/discord/projects/stats, fetched here with its own range,
//    loading and error state — the tasks payload caps activity at 15 events
//    per task and carries no per-day time at all.
// With no project selected the tab is an overview grid; clicking a card sets
// the Project filter and the same tab becomes that project's detail.

const STATUS = { open: '#F59E0B', inProgress: '#6366F1', done: '#10B981' }

export default function Stats() {
  const { theme } = useTheme()
  const d = theme === 'dark'
  const { payload, loading, filters, setFilter, setTimeSelfScoped } = useTeam()
  const [kind, setKind] = useState<RangeKind>('30d')
  const [series, setSeries] = useState<ProjectStatsPayload | null>(null)
  const [seriesLoading, setSeriesLoading] = useState(true)
  const [seriesError, setSeriesError] = useState<string | null>(null)

  // `now` is pinned per range change so the effect below and the bucket keys
  // agree on the same instant.
  const bounds = useMemo(() => rangeBounds(kind, new Date()), [kind])

  useEffect(() => {
    let cancelled = false
    setSeriesLoading(true)
    setSeriesError(null)
    fetchProjectStats(bounds.since, bounds.until, filters.projectSlug)
      .then((res) => { if (!cancelled) { setSeries(res); setTimeSelfScoped(res.timeScope === 'self') } })
      .catch((e) => { if (!cancelled) setSeriesError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setSeriesLoading(false) })
    return () => { cancelled = true }
  }, [bounds, filters.projectSlug, payload, setTimeSelfScoped])

  const projects = payload?.projects ?? []
  // Project filter only — never assignee/status/blocked — so the counts match
  // the Tasks tab (the same rule People.tsx applies).
  const scoped = useMemo(() => applyFilters(projects, { ...DEFAULT_FILTERS, projectSlug: filters.projectSlug }), [projects, filters.projectSlug])

  // A response is only "current" when it answers the filter on screen.
  const current = series && (series.project ?? null) === (filters.projectSlug ?? null) ? series : null
  const nameOf = useMemo(() => {
    const m = new Map((payload?.members ?? []).map((x) => [x.discordId, x.name]))
    return (id: string) => m.get(id) ?? `Member …${id.slice(-4)}`
  }, [payload])

  if (loading && !payload) {
    return (
      <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
        <p className={c('text-sm font-medium m-0', muted(theme))}>Loading…</p>
      </div>
    )
  }
  if (!payload) return null

  const selected = filters.projectSlug ? scoped.find((p) => p.docsSlug === filters.projectSlug) ?? null : null

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className={c('text-xs font-semibold m-0', muted(theme))}>
          {selected ? selected.name : `${scoped.length} project${scoped.length === 1 ? '' : 's'}`}
        </p>
        <div className={c('inline-flex rounded-xl p-0.5 border', d ? 'border-white/8 bg-white/4' : 'border-slate-200 bg-slate-50')} role="tablist" aria-label="Range">
          {RANGE_KINDS.map((r) => (
            <button key={r.key} type="button" role="tab" aria-selected={kind === r.key} onClick={() => setKind(r.key)}
              className={c('px-3 py-1.5 text-xs font-semibold rounded-lg tr',
                kind === r.key ? (d ? 'bg-indigo-500/25 text-indigo-200' : 'bg-white text-indigo-600 shadow-sm') : muted(theme))}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {current?.timeScope === 'self' && (
        <p className={c('text-xs font-medium mb-5', muted(theme))}>
          Time figures show your own hours only. Ask an admin for the view_discord_time permission to see the team&rsquo;s.
        </p>
      )}

      {seriesError && (
        <div className={c('rounded-xl px-4 py-3 mb-5 text-sm font-medium border', d ? 'bg-red-500/10 border-red-500/25 text-red-300' : 'bg-red-50 border-red-200 text-red-600')}>
          Could not load activity: {seriesError}
        </div>
      )}

      {filters.projectSlug && !selected ? (
        <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
          <p className={c('text-sm font-medium m-0', muted(theme))}>No tasks for this project yet.</p>
        </div>
      ) : selected ? (
        <ProjectDetail
          project={selected} stats={current?.projects.find((p) => p.id === selected.id) ?? null}
          approximate={current?.approximateCompletion ?? false} bounds={bounds} dim={seriesLoading && !!series}
          assigneeId={filters.assigneeId} nameOf={nameOf} theme={theme}
        />
      ) : scoped.length === 0 ? (
        <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
          <p className={c('text-sm font-medium m-0', muted(theme))}>No projects yet.</p>
        </div>
      ) : (
        <div className={c('grid gap-5 sm:grid-cols-2 xl:grid-cols-3 tr', seriesLoading && series ? 'opacity-50' : '')}>
          {scoped.map((p) => (
            <ProjectCard key={p.id ?? p.name} project={p} stats={current?.projects.find((s) => s.id === p.id) ?? null}
              bounds={bounds} onOpen={p.docsSlug ? () => setFilter({ projectSlug: p.docsSlug }) : null} theme={theme} />
          ))}
        </div>
      )}
    </>
  )
}

// ---- overview ---------------------------------------------------------------

function ProjectCard({ project, stats, bounds, onOpen, theme }: {
  project: ProjectGroup; stats: ProjectStats | null; bounds: ReturnType<typeof rangeBounds>; onOpen: (() => void) | null; theme: Theme
}) {
  const d = theme === 'dark'
  const pct = completionPercent(project.tasks)
  const lead = project.members.find((m) => m.role === 'lead')
  const keys = bucketKeys(bounds.since ?? earliestDay(stats) ?? bounds.until, bounds.until, bounds.bucket)
  const spark = fillSeries(rollup(stats?.events ?? [], bounds.bucket), keys)
  const minutes = stats ? minutesInRange(stats.time) : 0
  const header = (
    <>
      <div className="min-w-0">
        <h2 className={c('font-extrabold text-base m-0 truncate', txt(theme))}>{project.name}</h2>
        <p className={c('text-xs m-0 truncate', muted(theme))}>{lead ? `Lead: ${lead.name}` : `${project.members.length} member${project.members.length === 1 ? '' : 's'}`}</p>
      </div>
      <Ring pct={pct} theme={theme} />
    </>
  )
  const headerCls = 'text-left bg-transparent border-0 p-0 m-0 w-full flex items-start justify-between gap-3'
  return (
    <section className={c(card(theme), 'rounded-2xl p-5 flex flex-col gap-3 relative')}>
      {/* A project without a docsSlug cannot be selected (the filter is
          slug-keyed, the same limit the Project select has), so its header
          is plain rather than a button that does nothing. */}
      {onOpen
        ? <button type="button" onClick={onOpen} className={c(headerCls, 'cursor-pointer')}>{header}</button>
        : <div className={headerCls}>{header}</div>}
      <div className="flex items-center justify-between gap-3">
        <AvatarStack people={project.members} size={24} max={5} theme={theme} />
        <Sparkline values={spark} theme={theme} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className={c('text-[11px] font-semibold px-2.5 py-1 rounded-full', chipAmber(theme))}>{project.counts.open + project.counts.pending} open</span>
        {project.counts.blocked > 0 && <span className={c('text-[11px] font-semibold px-2.5 py-1 rounded-full', chipRed(theme))}>{project.counts.blocked} blocked</span>}
        {minutes > 0 && <span className={c('text-[11px] font-semibold px-2.5 py-1 rounded-full', chipIndigo(theme))}>{formatDuration(minutes)} logged</span>}
      </div>
      {project.docsSlug && (
        <Link to={`/tools/team/tasks?project=${encodeURIComponent(project.docsSlug)}`}
          className={c('text-xs font-semibold inline-flex items-center gap-1 no-underline mt-auto', d ? 'text-indigo-300' : 'text-indigo-600')}>
          View tasks <ArrowUpRight size={12} />
        </Link>
      )}
    </section>
  )
}

// The completion ring: a stroked circle with `pct` of its circumference drawn.
function Ring({ pct, theme, size = 44 }: { pct: number | null; theme: Theme; size?: number }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const track = theme === 'dark' ? 'rgba(255,255,255,0.1)' : '#E2E8F0'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={pct === null ? 'No tasks' : `${pct}% done`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={4} />
        {pct !== null && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={STATUS.done} strokeWidth={4} strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * circ} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
      </svg>
      <span className={c('absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums', pct === null ? muted(theme) : txt(theme))}>
        {pct === null ? '—' : `${pct}%`}
      </span>
    </div>
  )
}

// The first day any series has data — the lower bound for "all time".
function earliestDay(stats: ProjectStats | null): Date | null {
  if (!stats) return null
  const days = [...stats.created, ...stats.completed, ...stats.events].map((p) => p.day).concat(stats.time.map((t) => t.day)).sort()
  return days.length ? parseDayKey(days[0]) : null
}

// ---- detail -----------------------------------------------------------------

function ProjectDetail({ project, stats, approximate, bounds, dim, assigneeId, nameOf, theme }: {
  project: ProjectGroup; stats: ProjectStats | null; approximate: boolean; bounds: ReturnType<typeof rangeBounds>; dim: boolean
  assigneeId: string | null; nameOf: (id: string) => string; theme: Theme
}) {
  const d = theme === 'dark'
  const tasks = project.tasks
  const pct = completionPercent(tasks)
  const est = estimateSummary(tasks)
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length
  const done = tasks.filter((t) => isTerminal(t.status)).length
  const open = tasks.length - inProgress - done
  const blocked = tasks.filter((t) => t.isBlocked && !isTerminal(t.status)).length

  const keys = useMemo(() => bucketKeys(bounds.since ?? earliestDay(stats) ?? bounds.until, bounds.until, bounds.bucket), [bounds, stats])
  const created = cumulative(fillSeries(rollup(stats?.created ?? [], bounds.bucket), keys))
  const completed = cumulative(fillSeries(rollup(stats?.completed ?? [], bounds.bucket), keys))
  const events = fillSeries(rollup(stats?.events ?? [], bounds.bucket), keys)
  const timePoints = (stats?.time ?? []).filter((t) => !assigneeId || t.discordId === assigneeId)
  const stack = stackByMember(timePoints, keys, bounds.bucket, nameOf)

  const members: ProjectMember[] = (assigneeId ? project.members.filter((m) => m.discordId === assigneeId) : project.members)
  const rows = members
    .map((m) => ({ m, b: memberBreakdown(m.discordId, tasks), minutes: stats ? minutesInRange(stats.time, m.discordId) : 0 }))
    .sort((a, b) => b.b.open - a.b.open || a.m.name.localeCompare(b.m.name))

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Completion" value={pct === null ? '—' : `${pct}%`} theme={theme} />
        <Kpi label="Open" value={String(open)} theme={theme} />
        <Kpi label="In progress" value={String(inProgress)} theme={theme} />
        <Kpi label="Blocked" value={String(blocked)} theme={theme} tone={blocked ? 'bad' : undefined} />
        <Kpi label="Done" value={String(done)} theme={theme} />
        <Kpi label="Estimate vs logged" value={est ? `${formatDuration(est.logged)} / ${formatDuration(est.estimate)}` : 'No estimates'} theme={theme}
          tone={est && est.logged > est.estimate ? 'bad' : undefined} />
        <Kpi label="Avg cycle time" value={stats?.cycleMinutes != null ? formatDuration(stats.cycleMinutes) ?? '—' : '—'} theme={theme} />
      </div>

      <Panel title="Members" theme={theme}>
        {rows.length === 0 ? (
          <p className={c('text-xs font-medium m-0 py-3', muted(theme))}>No members on this project.</p>
        ) : (
          <ul className={c('divide-y m-0 p-0 list-none', d ? 'divide-white/6' : 'divide-slate-100')}>
            {rows.map(({ m, b, minutes }) => {
              const total = b.open + b.inProgress + b.done
              return (
                <li key={m.discordId} className="py-3 flex items-center gap-3">
                  <Avatar person={m} size={32} theme={theme} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={c('text-sm font-semibold truncate', txt(theme))}>{m.name}</span>
                      {m.role && <span className={c('text-[10px] font-semibold px-2 py-0.5 rounded-full', chipGray(theme))}>{roleLabel(m.role)}</span>}
                    </div>
                    <div className={c('h-1.5 rounded-full overflow-hidden flex mt-1.5', d ? 'bg-white/8' : 'bg-slate-100')} title={`${b.open} open · ${b.inProgress} in progress · ${b.done} done`}>
                      {total > 0 && (
                        <>
                          <span style={{ width: `${(b.open / total) * 100}%`, background: STATUS.open }} />
                          <span style={{ width: `${(b.inProgress / total) * 100}%`, background: STATUS.inProgress }} />
                          <span style={{ width: `${(b.done / total) * 100}%`, background: STATUS.done }} />
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={c('text-xs font-bold m-0 tabular-nums', txt(theme))}>{b.open} · {b.inProgress} · {b.done}</p>
                    <p className={c('text-[11px] m-0 tabular-nums', muted(theme))}>{minutes > 0 ? formatDuration(minutes) : '0m'} in range</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <div className={c('grid gap-5 lg:grid-cols-2 tr', dim ? 'opacity-50' : '')}>
        <Panel title="Created vs completed" theme={theme}>
          <CumulativeLines labels={keys} theme={theme} label="Tasks created versus completed over time"
            a={{ name: 'Created', values: created, color: STATUS.inProgress }} b={{ name: 'Completed', values: completed, color: STATUS.done }} />
          {approximate && <p className={c('text-[11px] font-medium m-0 mt-2', muted(theme))}>Some completions predate activity logging and are dated by their last update.</p>}
        </Panel>
        <Panel title="Task activity" theme={theme}>
          <Bars labels={keys} values={events} theme={theme} label="Task events per period" />
        </Panel>
        <Panel title="Time logged" theme={theme}>
          <StackedBars labels={keys} rows={stack.rows} theme={theme} format={(n) => formatDuration(n) ?? '0m'} label="Time logged per period by member"
            series={stack.members.map((m, i) => ({ name: m.name, color: memberColor(i) }))} />
        </Panel>
        <Panel title="Load by member" theme={theme}>
          <Bars horizontal theme={theme} labels={rows.map((r) => r.m.name)} labelFormat={(s) => s} label="Open, in progress and done tasks per member"
            groups={[
              { name: 'Open', color: STATUS.open, values: rows.map((r) => r.b.open) },
              { name: 'In progress', color: STATUS.inProgress, values: rows.map((r) => r.b.inProgress) },
              { name: 'Done', color: STATUS.done, values: rows.map((r) => r.b.done) },
            ]} />
        </Panel>
      </div>

      <Panel title="Stale tasks" theme={theme} hint="Open, with no activity for 14 days">
        {!stats || stats.stale.length === 0 ? (
          <p className={c('text-xs font-medium m-0 py-3', muted(theme))}>No stale tasks.</p>
        ) : (
          <ul className={c('divide-y m-0 p-0 list-none', d ? 'divide-white/6' : 'divide-slate-100')}>
            {stats.stale.map((s) => (
              <li key={s.taskId} className="py-2.5 flex items-center gap-3">
                <Link to={`/tools/team/tasks/${s.taskId}`} className={c('text-sm font-semibold flex-1 min-w-0 truncate no-underline', txt(theme))}>{s.title || 'Untitled task'}</Link>
                <span className={c('text-xs tabular-nums', muted(theme))}>{s.lastActivityAt ? `last touched ${new Date(s.lastActivityAt).toLocaleDateString()}` : 'never touched'}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function Kpi({ label, value, theme, tone }: { label: string; value: string; theme: Theme; tone?: 'bad' }) {
  return (
    <div className={c(card(theme), 'rounded-2xl px-4 py-3')}>
      <p className={c('text-[11px] font-semibold m-0 uppercase tracking-wide', muted(theme))}>{label}</p>
      <p className={c('text-lg font-extrabold m-0 mt-0.5 tabular-nums truncate', tone === 'bad' ? (theme === 'dark' ? 'text-red-300' : 'text-red-600') : txt(theme))}>{value}</p>
    </div>
  )
}

function Panel({ title, hint, theme, children }: { title: string; hint?: string; theme: Theme; children: ReactNode }) {
  return (
    <section className={c(card(theme), 'rounded-2xl p-5')}>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className={c('font-extrabold text-sm m-0', txt(theme))}>{title}</h2>
        {hint && <span className={c('text-[11px] font-medium', muted(theme))}>{hint}</span>}
      </div>
      {children}
    </section>
  )
}
