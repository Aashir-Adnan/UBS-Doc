import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { c, card, txt, muted } from '../../lib'
import { useTheme } from '../../app/ThemeContext'
import type { Theme } from '../../types'
import { fetchTimeEntries, fetchTimeReport, type TimeEntriesPayload, type TimeReportPayload } from '../../components/discordTasks/api'
import { csvFilename, entriesByTask, formatDuration, shiftWeek, toCsv, weekRange } from './timeLogic'
import Avatar from './Avatar'
import FilterSelect from './FilterSelect'
import { useTeam } from './TeamLayout'

// The Time tab: its own fetch of GET /api/discord/time/report, entirely
// separate from the shared TasksList/People/Board payload TeamLayout owns —
// the report is keyed by a week range, not by the task filters that apply to
// the other tabs, so it holds its own range/data/loading/error state and
// refetches whenever the range changes. It also refetches whenever the
// shared payload's identity changes, i.e. whenever the header's Refresh
// button is pressed — TimeTab never reads the payload itself.
//
// A second, independent fetch (GET /api/discord/time/entries) backs the
// person filter: selecting someone from the roster pulls their raw entries
// for the same range, for the per-task breakdown, the entries list and the
// CSV export. The person select is local to this tab and reads the roster
// from `useTeam().payload.members` — not `assigneeOptions(projects)` — since
// people log time against general work and against tasks they are not
// assigned to.

const rangeFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

function rangeLabel(range: { since: Date; until: Date }): string {
  // `until` is exclusive (the following Monday), so the last day actually
  // covered is one day earlier.
  const lastDay = new Date(range.until.getFullYear(), range.until.getMonth(), range.until.getDate() - 1)
  return `${rangeFmt.format(range.since)} – ${rangeFmt.format(lastDay)}`
}

// Built in the browser from what is already on screen, so the file can never
// disagree with what the user is looking at, and there is no export endpoint
// to authorise or rate-limit.
function downloadCsv(d: TimeEntriesPayload, range: { since: Date; until: Date }) {
  const rows: Array<Array<string | number | null>> = [
    ['Date', 'Person', 'Project', 'Task', 'Minutes', 'Note', 'Source'],
    ...d.entries.map((e) => {
      const at = new Date(e.clockInAt)
      const stamp = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
      return [stamp, d.person.name, e.projectName, e.taskTitle ?? 'General work', e.minutes, e.note, e.source]
    }),
  ]
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = csvFilename(d.person.name, range.since, range.until)
  a.click()
  URL.revokeObjectURL(url)
}

export default function TimeTab() {
  const { theme } = useTheme()
  const d = theme === 'dark'
  const { payload } = useTeam()
  const [range, setRange] = useState(() => weekRange(new Date()))
  const [data, setData] = useState<TimeReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [personId, setPersonId] = useState<string>('')
  const members = useMemo(
    () => [...(payload?.members ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [payload],
  )
  const [detail, setDetail] = useState<TimeEntriesPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchTimeReport(range.since, range.until)
      .then((report) => { if (!cancelled) setData(report) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [range, payload])

  // Independent of the report fetch above: only runs when a person is
  // selected, and ignores its own out-of-order responses the same way, so a
  // slow request for a previously selected person can't overwrite a newer
  // one's data.
  useEffect(() => {
    if (!personId) { setDetail(null); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchTimeEntries(personId, range.since, range.until)
      .then((detailPayload) => { if (!cancelled) setDetail(detailPayload) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [personId, range, payload])

  if (loading && !data) {
    return (
      <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
        <p className={c('text-sm font-medium m-0', muted(theme))}>Loading…</p>
      </div>
    )
  }

  const people = data?.people ?? []
  const projects = data?.projects ?? []
  const taskRows = detail ? entriesByTask(detail.entries) : []

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

        <div className="flex items-center gap-2 flex-wrap">
          <FilterSelect label="Person" theme={theme} value={personId} onChange={setPersonId}>
            <option value="">Select a person…</option>
            {members.map((m) => <option key={m.discordId} value={m.discordId}>{m.name}</option>)}
          </FilterSelect>
          {personId && (
            <button
              type="button"
              onClick={() => { if (detail) downloadCsv(detail, range) }}
              disabled={!detail || detail.entries.length === 0}
              title="Download CSV"
              className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
            >
              <Download size={14} /> Download CSV
            </button>
          )}
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

      {/* A week-to-week refetch (not the first load, which has its own full-card
          loading state above) dims the numbers in place instead of swapping
          them with no visual feedback while `data` still shows the old week.
          The same dim covers a person-detail refetch, since it shares the
          same `loading` flag. */}
      <div className={c('tr', loading && data ? 'opacity-50' : '')}>
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

        {personId && detail && (
          <div className="mt-5">
            {detail.truncated && (
              <p className={c('text-xs font-medium mb-3', muted(theme))}>
                Showing the first 5000 entries — narrow the range for a complete total.
              </p>
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              <TimeCard title="By task" theme={theme}>
                {taskRows.map((row) => (
                  <li key={row.taskId ?? '__general__'} className="py-2.5">
                    <div className="flex items-center gap-3">
                      <span className={c('text-sm font-semibold flex-1 min-w-0 truncate', txt(theme))}>{row.taskTitle}</span>
                      <span className={c('text-xs font-bold tabular-nums', muted(theme))}>{formatDuration(row.minutes) ?? '0m'}</span>
                    </div>
                    {row.projectName && (
                      <p className={c('text-xs mt-0.5 truncate m-0', muted(theme))}>{row.projectName}</p>
                    )}
                  </li>
                ))}
              </TimeCard>

              <TimeCard title="Entries" theme={theme}>
                {detail.entries.map((e) => (
                  <li key={e.id} className="py-2.5">
                    <div className="flex items-center gap-3">
                      <span className={c('text-sm font-semibold flex-1 min-w-0 truncate', txt(theme))}>{e.taskTitle ?? 'General work'}</span>
                      <span className={c('text-xs font-bold tabular-nums', muted(theme))}>{formatDuration(e.minutes) ?? '0m'}</span>
                    </div>
                    <p className={c('text-xs mt-0.5 truncate m-0', muted(theme))}>
                      {rangeFmt.format(new Date(e.clockInAt))}{e.note ? ` · ${e.note}` : ''}
                    </p>
                  </li>
                ))}
              </TimeCard>
            </div>
          </div>
        )}
      </div>
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
