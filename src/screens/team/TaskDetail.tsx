import type { ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { c, card, txt, muted, chipGray, chipIndigo } from '../../lib'
import { useTheme } from '../../app/ThemeContext'
import type { Theme } from '../../types'
import { findTask, statusTone, STATUS_LABEL, type TaskRef } from '../tasksLogic'
import { fmtDate, refLabel, refTone, testCount } from './detailLogic'
import { toneChip } from './chips'
import { useTeam } from './TeamLayout'
import Avatar from './Avatar'
import ScopeBadge from './ScopeBadge'

// One task, in full. The payload is the section's — this screen never fetches,
// so a deep link into it renders once TeamLayout's single request lands.

export default function TaskDetail() {
  const { theme } = useTheme()
  const d = theme === 'dark'
  const { taskId } = useParams()
  const { payload, loading } = useTeam()
  // Back goes to the list the visitor came from, filters and all.
  const { search } = useLocation()
  const backTo = `/tools/team/tasks${search}`

  if (loading && !payload) {
    return (
      <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
        <p className={c('text-sm font-medium m-0', muted(theme))}>Loading…</p>
      </div>
    )
  }
  // The layout renders the section's one error banner; nothing to add here.
  if (!payload) return null

  const found = taskId ? findTask(payload, taskId) : null
  if (!found) {
    return (
      <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
        <p className={c('text-sm font-medium mb-4', muted(theme))}>Task not found.</p>
        <Link to="/tools/team/tasks" className="btn-primary px-5 py-2.5 text-sm no-underline">Back to tasks</Link>
      </div>
    )
  }

  const { task, project } = found
  const tone = statusTone(task)
  const created = fmtDate(task.createdAt)
  const updated = fmtDate(task.updatedAt)
  const projectName = project.name || task.projectName

  return (
    <>
      <Link to={backTo} className={c('inline-block text-sm font-semibold no-underline mb-4 tr',
        d ? 'text-white/40 hover:text-white/70' : 'text-slate-400 hover:text-indigo-600')}>
        &larr; Back to tasks
      </Link>

      <article className={c(card(theme), 'rounded-2xl p-5 sm:p-7')}>
        <div className="flex flex-wrap items-start gap-3 mb-2">
          <span className={c('text-[11px] font-bold px-2 py-0.5 rounded-md mt-1.5 shrink-0', toneChip[tone](theme))}>
            {STATUS_LABEL[task.status] ?? task.status}
          </span>
          {/* h2, not h1: TeamLayout's "Team" heading is the page's h1. */}
          <h2 className={c('font-extrabold text-xl sm:text-2xl m-0 flex-1 min-w-[200px]', txt(theme))}>{task.title}</h2>
        </div>

        <p className={c('text-xs font-semibold mb-6', muted(theme))}>
          {task.type}
          {projectName && (
            <>
              {' · '}
              {project.docsSlug
                ? <Link to={`/tools/team/tasks?project=${encodeURIComponent(project.docsSlug)}`} className="text-indigo-500 no-underline hover:underline">{projectName}</Link>
                : projectName}
            </>
          )}
          {task.implementationStatus ? ` · ${task.implementationStatus}` : ''}
        </p>

        <Field label="Description" theme={theme}>
          {task.description
            ? <p className={c('text-sm whitespace-pre-wrap m-0', txt(theme))}>{task.description}</p>
            : <p className={c('text-sm m-0', muted(theme))}>No description</p>}
        </Field>

        {task.scope && (
          <Field label="Scope" theme={theme}>
            <ScopeBadge scope={task.scope} theme={theme} />
          </Field>
        )}

        {task.modules.length > 0 && (
          <Field label="Modules" theme={theme}>
            <div className="flex flex-wrap gap-1.5">
              {task.modules.map((m) => (
                <span key={m} className={c('text-[11px] font-semibold px-2.5 py-1 rounded-full', chipGray(theme))}>{m}</span>
              ))}
            </div>
          </Field>
        )}

        <Field label="Tests" theme={theme}>
          <div className="flex flex-wrap gap-3">
            <Stat label="API tests" value={testCount(task.passedApiTests)} theme={theme} />
            <Stat label="QA tests" value={testCount(task.passedQaTests)} theme={theme} />
            <Stat label="Acceptance criteria" value={testCount(task.passedAcceptanceCriteria)} theme={theme} />
          </div>
        </Field>

        <Field label="Assignees" theme={theme}>
          {task.assignees.length ? (
            <div className="flex flex-wrap gap-1.5">
              {task.assignees.map((a) => (
                <span key={a.discordId} className={c('text-[11px] font-semibold px-2.5 py-1 rounded-full', chipIndigo(theme))}>
                  <Avatar person={a} size={18} theme={theme} />
                  {a.name}
                </span>
              ))}
            </div>
          ) : <p className={c('text-sm m-0', muted(theme))}>Unassigned</p>}
        </Field>

        {task.blockedBy.length > 0 && (
          <Field label="Blocked by" theme={theme}>
            <RefList refs={task.blockedBy} theme={theme} search={search} />
          </Field>
        )}

        {task.blocks.length > 0 && (
          <Field label="Blocks" theme={theme}>
            <RefList refs={task.blocks} theme={theme} search={search} />
          </Field>
        )}

        <p className={c('text-xs font-medium mt-6 mb-0', muted(theme))}>
          {task.createdBy ? `Created by ${task.createdBy.name}` : 'Created'}{created ? ` on ${created}` : ''}
          {updated ? ` · Updated ${updated}` : ''}
        </p>

        {task.channelUrl && (
          <a href={task.channelUrl} target="_blank" rel="noreferrer"
            className={c('btn-outline-indigo inline-flex items-center gap-2 px-5 py-2.5 text-sm mt-5 no-underline', d ? 'dark-variant' : '')}>
            <ExternalLink size={14} /> Open the Discord channel
          </a>
        )}
      </article>
    </>
  )
}

function Field({ label, theme, children }: { label: string; theme: Theme; children: ReactNode }) {
  return (
    <div className="mb-5">
      <p className={c('text-[11px] font-bold uppercase tracking-wide mb-1.5', muted(theme))}>{label}</p>
      {children}
    </div>
  )
}

function Stat({ label, value, theme }: { label: string; value: string; theme: Theme }) {
  const d = theme === 'dark'
  return (
    <div className={c('rounded-xl px-4 py-2.5 border min-w-[112px]', d ? 'border-white/8 bg-white/4' : 'border-slate-200 bg-slate-50')}>
      <p className={c('text-lg font-extrabold m-0 leading-tight', txt(theme))}>{value}</p>
      <p className={c('text-[11px] font-semibold m-0', muted(theme))}>{label}</p>
    </div>
  )
}

// Dependency entries carry an id, a title and (optionally) a status — enough
// for a chip and a link to that task's own detail page. The link carries the
// current `search` like every other in-section link, so stepping through a
// dependency chain keeps the filters the visitor arrived with (and Back still
// returns to the same filtered list).
function RefList({ refs, theme, search }: { refs: TaskRef[]; theme: Theme; search: string }) {
  return (
    <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
      {refs.map((r) => (
        <li key={r.id} className="flex items-center gap-2">
          <span className={c('text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0', toneChip[refTone(r.status)](theme))}>
            {refLabel(r.status)}
          </span>
          <Link to={`/tools/team/tasks/${r.id}${search}`} className={c('text-sm font-semibold no-underline hover:underline', txt(theme))}>{r.title}</Link>
        </li>
      ))}
    </ul>
  )
}
