import { useMemo, useState } from 'react'
import { c, card, txt, muted, chipGray, chipIndigo, chipMint, chipAmber } from '../../lib'
import { useTheme } from '../../app/ThemeContext'
import type { Theme } from '../../types'
import { allTasks, applyFilters, roleLabel, type TaskRow, type TeamMember } from '../tasksLogic'
import { filterMembers, memberWorkload, sortMembers } from './teamLogic'
import { useTeam } from './TeamLayout'
import Avatar from './Avatar'

// The People tab: the guild directory as cards, busiest first. Everything
// comes from the payload TeamLayout fetched — this screen never calls the API.
//
// Scoping rule: when a project filter is active, both the "blocked only"
// narrowing and the workload numbers count tasks inside that project only, so
// the counts agree with what the Tasks tab shows under the same filter. With
// no project filter they cover every project.

export default function People() {
  const { theme } = useTheme()
  const { payload, loading, filters } = useTeam()
  const [openOnly, setOpenOnly] = useState(false)

  const projects = payload?.projects ?? []
  const members = payload?.members ?? []

  // Only the project filter narrows the task corpus the counts are taken from.
  // Status, assignee, blocked-only and the search box are member-side concerns
  // that filterMembers applies to the roster, not to the tasks being counted.
  const scopedProjects = useMemo(
    () => applyFilters(projects, { ...filters, status: 'all', assigneeId: null, blockedOnly: false, query: '' }),
    [projects, filters],
  )
  const scopedTasks = useMemo(() => allTasks(scopedProjects), [scopedProjects])

  const shown = useMemo(() => {
    const matched = filterMembers(members, scopedProjects, {
      projectSlug: filters.projectSlug,
      assigneeId: filters.assigneeId,
      blockedOnly: filters.blockedOnly,
      query: filters.query,
    })
    const sorted = sortMembers(matched, scopedTasks)
    return openOnly ? sorted.filter((m) => memberWorkload(m, scopedTasks).open > 0) : sorted
  }, [members, scopedProjects, scopedTasks, filters, openOnly])

  if (loading && !payload) {
    return (
      <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
        <p className={c('text-sm font-medium m-0', muted(theme))}>Loading…</p>
      </div>
    )
  }
  // Nothing to show and not loading means the fetch failed; the layout owns
  // the single error banner for the section, so this tab stays quiet.
  if (!payload) return null

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <label className={c('flex items-center gap-2 text-xs font-semibold cursor-pointer', muted(theme))}>
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          Only people with open tasks
        </label>
        <p className={c('text-xs font-semibold m-0', muted(theme))}>
          {shown.length} {shown.length === 1 ? 'person' : 'people'}
        </p>
      </div>

      {shown.length === 0 ? (
        <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
          <p className={c('text-sm font-medium m-0', muted(theme))}>
            {members.length ? 'No people match these filters.' : 'No members yet.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((m) => <MemberCard key={m.discordId} m={m} tasks={scopedTasks} theme={theme} />)}
        </div>
      )}
    </>
  )
}

function MemberCard({ m, tasks, theme }: { m: TeamMember; tasks: TaskRow[]; theme: Theme }) {
  const w = memberWorkload(m, tasks)
  return (
    <section className={c(card(theme), 'rounded-2xl p-5 flex flex-col gap-3')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          <Avatar person={m} size={40} theme={theme} />
          <div className="min-w-0">
            <h2 className={c('font-extrabold text-base m-0 truncate', txt(theme))}>{m.name}</h2>
            {m.username && <p className={c('text-xs m-0 truncate', muted(theme))}>@{m.username}</p>}
          </div>
        </div>
        <span className={c('text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0', m.verified ? chipMint(theme) : chipAmber(theme))}>
          {m.verified ? 'Verified' : 'Pending'}
        </span>
      </div>

      {m.roleNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {m.roleNames.map((r) => (
            <span key={r} className={c('text-[11px] font-semibold px-2.5 py-1 rounded-full', chipGray(theme))}>{r}</span>
          ))}
        </div>
      )}

      {m.projects.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {m.projects.map((p) => (
            <span key={p.id} title={roleLabel(p.role)}
              className={c('text-[11px] font-semibold px-2.5 py-1 rounded-full', chipIndigo(theme))}>
              {p.name} · {roleLabel(p.role)}
            </span>
          ))}
        </div>
      )}

      {/* Always rendered, including for a member with nothing assigned: the
          directory should read "0 open · 0 in progress", not leave a gap. */}
      <p className={c('text-xs font-semibold m-0 mt-auto', muted(theme))}>
        {w.open} open · {w.in_progress} in progress{w.blocked ? ` · ${w.blocked} blocked` : ''}
      </p>
    </section>
  )
}
