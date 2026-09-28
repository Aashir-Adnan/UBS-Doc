import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { c, card, txt, muted } from '../../lib'
import { useTheme } from '../../app/ThemeContext'
import type { Theme } from '../../types'
import { createTask } from '../../components/discordTasks/api'
import { useActingPermissions } from '../../components/portal/tenantProjects/useActingPermissions'
import { useTeam } from './TeamLayout'
import MemberPicker from './MemberPicker'
import { SCOPE_OPTIONS, createPayload, emptyCreateForm, saveErrorText, validateCreateForm, type CreateForm } from './taskFormLogic'

// A new Feature or Bug, made by the Discord bot exactly as /create-task makes
// it: the row, its ticket doc, the bug's GitHub issue, and its channel in the
// project's Discord section. The project is required here.
export default function TaskCreate() {
  const { theme } = useTheme()
  const d = theme === 'dark'
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { payload, loading, refresh } = useTeam()
  const { has, loaded } = useActingPermissions()
  const [form, setForm] = useState<CreateForm>(() => emptyCreateForm(params.get('projectId') ?? ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof CreateForm>(key: K, value: CreateForm[K]) => setForm((f) => ({ ...f, [key]: value }))

  const projects = (payload?.projects ?? []).filter((p): p is typeof p & { id: string } => p.id !== null)
  const repositories = payload?.repositories ?? []

  // `?project=<docsSlug>` (the Tasks list's filter) preselects once the payload has the slugs.
  useEffect(() => {
    if (form.projectId || !payload) return
    const slug = params.get('project')
    const match = slug ? payload.projects.find((p) => p.docsSlug === slug && p.id) : null
    if (match?.id) set('projectId', match.id)
  }, [payload, params, form.projectId])

  if (!loaded || (loading && !payload)) {
    return <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}><p className={c('text-sm font-medium m-0', muted(theme))}>Loading…</p></div>
  }
  if (!has('update_discord_tasks')) {
    return (
      <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
        <p className={c('text-sm font-medium mb-4', muted(theme))}>You need the update_discord_tasks permission to create tasks. Ask an admin.</p>
        <Link to="/tools/team/tasks" className="btn-primary px-5 py-2.5 text-sm no-underline">Back to tasks</Link>
      </div>
    )
  }
  if (!payload) return null

  async function submit() {
    const problem = validateCreateForm(form)
    if (problem) { setError(problem); return }
    setSaving(true)
    setError(null)
    try {
      const result = await createTask(createPayload(form))
      await refresh()
      navigate(`/tools/team/tasks/${result.task.id}`, { state: { notice: result.note || 'Task created. Its Discord channel is ready.' } })
    } catch (err) {
      setError(saveErrorText(err as { status?: number; message?: string }))
      setSaving(false)
    }
  }

  const isBug = form.type === 'bug'
  const toggleRepo = (id: string) => {
    if (isBug) set('repositoryIds', form.repositoryIds[0] === id ? [] : [id])
    else set('repositoryIds', form.repositoryIds.includes(id) ? form.repositoryIds.filter((x) => x !== id) : [...form.repositoryIds, id])
  }

  return (
    <>
      <Link to="/tools/team/tasks" className={c('inline-block text-sm font-semibold no-underline mb-4 tr',
        d ? 'text-white/40 hover:text-white/70' : 'text-slate-400 hover:text-indigo-600')}>&larr; Back to tasks</Link>
      <article className={c(card(theme), 'rounded-2xl p-5 sm:p-7')}>
        <h2 className={c('font-extrabold text-xl sm:text-2xl m-0 mb-5', txt(theme))}>New task</h2>
        <form onSubmit={(e) => { e.preventDefault(); void submit() }} className="flex flex-col gap-5">
          <div role="radiogroup" aria-label="Task type" className="flex gap-2">
            {(['feature', 'bug'] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={form.type === t} disabled={saving}
                onClick={() => setForm((f) => ({ ...f, type: t, repositoryIds: t === 'bug' ? f.repositoryIds.slice(0, 1) : f.repositoryIds }))}
                className={c('px-4 py-2 text-sm font-semibold rounded-xl border tr',
                  form.type === t ? 'bg-indigo-500 border-indigo-500 text-white' : d ? 'border-white/15 text-white/70' : 'border-slate-300 text-slate-600')}>
                {t === 'feature' ? 'Feature' : 'Bug'}
              </button>
            ))}
          </div>

          <Labeled label="Title" theme={theme}>
            <input className="input-base" value={form.title} maxLength={200} onChange={(e) => set('title', e.target.value)} disabled={saving} />
          </Labeled>
          <Labeled label="Description" theme={theme}>
            <textarea className="input-base min-h-[120px]" value={form.description} maxLength={2000} onChange={(e) => set('description', e.target.value)} disabled={saving} />
          </Labeled>

          <div className="grid gap-4 sm:grid-cols-2">
            <Labeled label="Project" theme={theme}>
              <select className="input-base" value={form.projectId} onChange={(e) => set('projectId', e.target.value)} disabled={saving}>
                <option value="">Pick a project…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Labeled>
            <Labeled label="Scope" theme={theme}>
              <select className="input-base" value={form.scope} onChange={(e) => set('scope', e.target.value)} disabled={saving}>
                <option value="">None</option>
                {SCOPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Labeled>
          </div>

          <MemberPicker members={payload.members} projectId={form.projectId || null} value={form.holderIds}
            onChange={(ids) => set('holderIds', ids)} theme={theme} label={isBug ? 'Tagged members' : 'Assignees'} disabled={saving} />

          {!isBug && (
            <Labeled label="Modules (comma-separated)" theme={theme}>
              <input className="input-base" value={form.modules} placeholder="auth, billing" onChange={(e) => set('modules', e.target.value)} disabled={saving} />
            </Labeled>
          )}

          <Labeled label={isBug ? 'Repository (opens a GitHub issue)' : 'Repositories'} theme={theme}>
            {repositories.length === 0
              ? <p className={c('text-sm m-0', muted(theme))}>No repositories are registered with the bot.</p>
              : (
                <div className="flex flex-wrap gap-2">
                  {repositories.map((r) => {
                    const on = form.repositoryIds.includes(r.id)
                    return (
                      <button key={r.id} type="button" aria-pressed={on} disabled={saving} onClick={() => toggleRepo(r.id)} title={r.url}
                        className={c('px-3 py-1.5 text-xs font-semibold rounded-full border tr',
                          on ? 'bg-indigo-500 border-indigo-500 text-white' : d ? 'border-white/15 text-white/70' : 'border-slate-300 text-slate-600')}>
                        {r.name}
                      </button>
                    )
                  })}
                </div>
              )}
          </Labeled>

          <fieldset className="border-0 p-0 m-0">
            <legend className={c('text-[11px] font-bold uppercase tracking-wide mb-1.5', muted(theme))}>Track</legend>
            <div className="flex flex-wrap gap-4">
              {([['tracksApi', 'API tests'], ['tracksQa', 'QA tests'], ['tracksAc', 'Acceptance criteria']] as const).map(([key, label]) => (
                <label key={key} className={c('inline-flex items-center gap-2 text-sm', txt(theme))}>
                  <input type="checkbox" checked={form[key]} onChange={(e) => set(key, e.target.checked)} disabled={saving} /> {label}
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p role="alert" className="text-sm font-semibold text-red-500 m-0">{error}</p>}

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn-primary px-5 py-2.5 text-sm" disabled={saving}>{saving ? 'Creating…' : 'Create task'}</button>
            <Link to="/tools/team/tasks" className={c('btn-outline-indigo px-5 py-2.5 text-sm no-underline', d ? 'dark-variant' : '')}>Cancel</Link>
          </div>
        </form>
      </article>
    </>
  )
}

function Labeled({ label, theme, children }: { label: string; theme: Theme; children: ReactNode }) {
  return (
    <div>
      <p className={c('text-[11px] font-bold uppercase tracking-wide mb-1.5', muted(theme))}>{label}</p>
      {children}
    </div>
  )
}
