import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { c, card, txt, muted } from '../../lib'
import { useTheme } from '../../app/ThemeContext'
import type { Theme } from '../../types'
import { fetchTimeReport, type TimeReportPayload } from '../../components/discordTasks/api'
import { formatDuration, shiftWeek, weekRange } from './timeLogic'
import Avatar from './Avatar'

// The Time tab: its own fetch of GET /api/discord/time/report, entirely
// separate from the shared TasksList/People/Board payload TeamLayout owns —
// the report is keyed by a week range, not by the task filters that apply to
// the other tabs, so it holds its own range/data/loading/error state and
// refetches whenever the range changes.

const rangeFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

function rangeLabel(range: { since: Date; until: Date }): string {
  // `until` is exclusive (the following Monday), so the last day actually
  // covered is one day earlier.
  const lastDay = new Date(range.until.getFullYear(), range.until.getMonth(), range.until.getDate() - 1)
  return `${rangeFmt.format(range.since)} – ${rangeFmt.format(lastDay)}`
}

export default function TimeTab() {
  const { theme } = useTheme()
  const d = theme === 'dark'
  const [range, setRange] = useState(() => weekRange(new Date()))
  const [data, setData] = useState<TimeReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchTimeReport(range.since, range.until)
      .then((payload) => { if (!cancelled) setData(payload) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [range])

  if (loading && !data) {
    return (
      <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
        <p className={c('text-sm font-medium m-0', muted(theme))}>Loading…</p>
      </div>
    )
  }

  const people = data?.people ?? []
  const projects = data?.projects ?? []

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setRange((r) => shiftWeek(r, -1))} title="Previous week"
            className={c('h-9 w-9 inline-flex items-center justify-center rounded-xl tr', d ? 'text-white/50 hover:bg-white/6' : 'text-slate-400 hover:bg-slate-100')}>
            <ChevronLeft size={16} />
          </button>
          <p className={c('text-sm font-bold m-0 tabular-nums', txt(theme))}>{rangeLabel(range)}</p>
          <button type="button" onClick={() => setRange((r) => shiftWeek(r, 1))} title="Next week"
            className={c('h-9 w-9 inline-flex items-center justify-center rounded-xl tr', d ? 'text-white/50 hover:bg-white/6' : 'text-slate-400 hover:bg-slate-100')}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className={c('rounded-xl px-4 py-3 mb-5 text-sm font-medium border', d ? 'bg-red-500/10 border-red-500/25 text-red-300' : 'bg-red-50 border-red-200 text-red-600')}>
          Could not load the time report: {error}
        </div>
      )}

      {data?.scope === 'self' && (
        <p className={c('text-xs font-medium mb-5', muted(theme))}>
          Showing your own time. Ask an admin for the view_discord_time permission to see the team&rsquo;s.
        </p>
      )}

      {!loading && !error && people.length === 0 && projects.length === 0 ? (
        <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
          <p className={c('text-sm font-medium m-0', muted(theme))}>No time logged this week.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <TimeCard title="By person" theme={theme}>
            {people.map((p) => (
              <li key={p.discordId} className="py-2.5 flex items-center gap-3">
                <Avatar person={p} size={22} theme={theme} />
                <span className={c('text-sm font-semibold flex-1 min-w-0 truncate', txt(theme))}>{p.name}</span>
                <span className={c('text-xs font-bold tabular-nums', muted(theme))}>{formatDuration(p.minutes) ?? '0m'}</span>
              </li>
            ))}
          </TimeCard>

          <TimeCard title="By project" theme={theme}>
            {projects.map((p) => (
              <li key={p.id ?? 'none'} className="py-2.5 flex items-center gap-3">
                <span className={c('text-sm font-semibold flex-1 min-w-0 truncate', txt(theme))}>{p.name}</span>
                <span className={c('text-xs font-bold tabular-nums', muted(theme))}>{formatDuration(p.minutes) ?? '0m'}</span>
              </li>
            ))}
          </TimeCard>
        </div>
      )}
    </>
  )
}

function TimeCard({ title, theme, children }: { title: string; theme: Theme; children: ReactNode }) {
  const d = theme === 'dark'
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <section className={c(card(theme), 'rounded-2xl p-5')}>
      <h2 className={c('font-extrabold text-sm m-0 mb-1', txt(theme))}>{title}</h2>
      {hasRows ? (
        <ul className={c('divide-y m-0 p-0 list-none', d ? 'divide-white/6' : 'divide-slate-100')}>{children}</ul>
      ) : (
        <p className={c('text-xs font-medium m-0 py-3', muted(theme))}>Nothing here for this range.</p>
      )}
    </section>
  )
}
