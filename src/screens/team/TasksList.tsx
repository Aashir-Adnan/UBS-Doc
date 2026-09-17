import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ExternalLink, Ban } from 'lucide-react'
import { c, card, txt, muted, chipRed, chipGray, chipIndigo, chipMint, chipAmber } from '../../lib'
import { useTheme } from '../../app/ThemeContext'
import type { Theme } from '../../types'
import {
  applyFilters, statusTone, roleLabel, unknownProjectSlug, STATUS_LABEL,
  type ProjectGroup, type TaskRow, type Tone,
} from '../tasksLogic'
import { useTeam } from './TeamLayout'

// The Tasks tab of the Team section: project cards with their task rows, all
// from the payload the layout fetched. Filtering is client-side — the corpus is
// a few dozen rows and the endpoint returns every status.

const toneChip: Record<Tone, (t: Theme) => string> = { done: chipMint, active: chipIndigo, idle: chipAmber, bad: chipRed }

export default function TasksList() {
  const { theme } = useTheme()
  const { payload, loading, error, filters, setFilter } = useTeam()
  const { search } = useLocation()
  const projects = payload?.projects ?? []

  const visible = useMemo(() => applyFilters(projects, filters), [projects, filters])
  const unknownSlug = useMemo(() => unknownProjectSlug(projects, filters.projectSlug), [projects, filters.projectSlug])

  return (
    <>
      {!loading && !error && unknownSlug && (
        <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
          <p className={c('text-sm font-medium mb-4', muted(theme))}>
            No project called &ldquo;{unknownSlug}&rdquo; has tasks in Discord yet.
          </p>
          <button type="button" onClick={() => setFilter({ projectSlug: null })} className="btn-primary px-5 py-2.5 text-sm">
            Show all projects
          </button>
        </div>
      )}
      {!loading && !error && !unknownSlug && visible.length === 0 && (
        <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
          <p className={c('text-sm font-medium', muted(theme))}>{projects.length ? 'No tasks match these filters.' : 'No tasks yet.'}</p>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {visible.map((p) => <ProjectCard key={p.id ?? 'none'} p={p} theme={theme} search={search} />)}
      </div>
    </>
  )
}

function ProjectCard({ p, theme, search }: { p: ProjectGroup; theme: Theme; search: string }) {
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
            <span key={m.discordId} title={m.source === 'inferred' ? 'Assigned to tasks here' : (m.role ? roleLabel(m.role) : undefined)}
              className={c('text-[11px] font-semibold px-2.5 py-1 rounded-full', m.source === 'explicit' ? chipIndigo(theme) : chipGray(theme))}>
              {m.name}{m.role ? ` · ${roleLabel(m.role)}` : ''}
            </span>
          ))}
        </div>
      )}
      <ul className={c('divide-y', d ? 'divide-white/6' : 'divide-slate-100')}>
        {p.tasks.map((t) => <TaskLine key={t.id} t={t} theme={theme} search={search} />)}
      </ul>
    </section>
  )
}

function TaskLine({ t, theme, search }: { t: TaskRow; theme: Theme; search: string }) {
  const tone = statusTone(t)
  return (
    <li className="py-3 flex flex-wrap items-start gap-x-3 gap-y-1.5">
      <span className={c('text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0', toneChip[tone](theme))}>{STATUS_LABEL[t.status] ?? t.status}</span>
      <div className="flex-1 min-w-[200px]">
        <p className={c('text-sm font-semibold', txt(theme))}>
          {/* The title opens the detail route; the query string rides along so
              Back returns to the same filtered list. The Discord link stays a
              separate icon so the row still reaches the channel in one click. */}
          <Link to={`/tools/team/tasks/${t.id}${search}`} className={c('no-underline hover:underline', txt(theme))}>{t.title}</Link>
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
        {t.isBlocked && (() => {
          const openBlockers = t.blockedBy.filter((b) => !['closed', 'done', 'resolved'].includes(b.status ?? ''))
          return (
            <p className={c('text-xs font-semibold mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md', chipRed(theme))}>
              <Ban size={11} /> {openBlockers.length ? `Blocked by: ${openBlockers.map((b) => b.title).join(', ')}` : 'Blocked'}
            </p>
          )
        })()}
      </div>
    </li>
  )
}
