import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { c, txt, muted, chipGray } from '../../lib'
import type { Theme } from '../../types'
import { STATUS_LABEL, type TaskRow, type TasksPayload } from '../tasksLogic'
import { updateTask, type UpdateTaskResult } from '../../components/discordTasks/api'
import MemberPicker from './MemberPicker'
import {
  IMPLEMENTATION_OPTIONS, STATUS_OPTIONS, blockerCandidates, diffChanges, formFromTask, saveErrorText,
  scopeOptionsFor, validateForm, type EditForm,
} from './taskFormLogic'

// Every field Discord's /update-task and task hub can change, in one form. Save
// sends only what changed; the bot applies it as one update (one activity entry,
// one channel post) or refuses it whole with a sentence shown here.
export default function TaskEditForm({ task, payload, theme, onCancel, onSaved }: {
  task: TaskRow
  payload: TasksPayload
  theme: Theme
  onCancel: () => void
  onSaved: (result: UpdateTaskResult) => void
}) {
  const d = theme === 'dark'
  const [form, setForm] = useState<EditForm>(() => formFromTask(task))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]) => setForm((f) => ({ ...f, [key]: value }))

  const projects = payload.projects.filter((p): p is typeof p & { id: string } => p.id !== null)
  const candidates = useMemo(() => blockerCandidates(payload, task.id, form.blockerIds), [payload, task.id, form.blockerIds])
  const titleOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of payload.projects) for (const t of p.tasks) map.set(t.id, t.title)
    for (const b of task.blockedBy) if (!map.has(b.id)) map.set(b.id, b.title)
    return map
  }, [payload, task.blockedBy])

  async function save() {
    const problem = validateForm(task, form)
    if (problem) { setError(problem); return }
    const changes = diffChanges(task, form)
    if (!Object.keys(changes).length) { onCancel(); return }
    setSaving(true)
    setError(null)
    try {
      onSaved(await updateTask(task.id, changes))
    } catch (err) {
      setError(saveErrorText(err as { status?: number; message?: string }))
      setSaving(false)
    }
  }

  const count = (key: 'passedApiTests' | 'passedQaTests' | 'passedAcceptanceCriteria', label: string) => (
    <Labeled label={label} theme={theme}>
      <input className="input-base" inputMode="numeric" value={form[key]} placeholder="not tracked"
        onChange={(e) => set(key, e.target.value)} disabled={saving} />
    </Labeled>
  )

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save() }} className="flex flex-col gap-5">
      <Labeled label="Title" theme={theme}>
        <input className="input-base" value={form.title} maxLength={200} onChange={(e) => set('title', e.target.value)} disabled={saving} />
      </Labeled>
      <Labeled label="Description" theme={theme}>
        <textarea className="input-base min-h-[120px]" value={form.description} maxLength={2000}
          onChange={(e) => set('description', e.target.value)} disabled={saving} />
      </Labeled>

      <div className="grid gap-4 sm:grid-cols-3">
        <Labeled label="Status" theme={theme}>
          <select className="input-base" value={form.status} onChange={(e) => set('status', e.target.value)} disabled={saving}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
          </select>
        </Labeled>
        <Labeled label="Scope" theme={theme}>
          <select className="input-base" value={form.scope} onChange={(e) => set('scope', e.target.value)} disabled={saving}>
            {scopeOptionsFor(formFromTask(task).scope).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Labeled>
        <Labeled label="Implementation" theme={theme}>
          <select className="input-base" value={form.implementationStatus} onChange={(e) => set('implementationStatus', e.target.value)} disabled={saving}>
            {!form.implementationStatus && <option value="">—</option>}
            {IMPLEMENTATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Labeled>
      </div>

      <Labeled label="Project" theme={theme}>
        <select className="input-base" value={form.projectId} onChange={(e) => set('projectId', e.target.value)} disabled={saving}>
          <option value="">No project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {form.projectId !== formFromTask(task).projectId && (
          <p className={c('text-xs mt-1.5 mb-0', muted(theme))}>The Discord channel does not move by itself; run /project-setup for the new project afterwards.</p>
        )}
      </Labeled>

      <MemberPicker members={payload.members} projectId={form.projectId || null} value={form.holderIds}
        onChange={(ids) => set('holderIds', ids)} theme={theme} label={task.type === 'bug' ? 'Tagged members' : 'Assignees'} disabled={saving} />

      <div className="grid gap-4 sm:grid-cols-4">
        {count('passedApiTests', 'API tests passed')}
        {count('passedQaTests', 'QA tests passed')}
        {count('passedAcceptanceCriteria', 'Acceptance criteria')}
        <Labeled label="Estimate" theme={theme}>
          <input className="input-base" value={form.estimate} placeholder="e.g. 8h 30m" onChange={(e) => set('estimate', e.target.value)} disabled={saving} />
        </Labeled>
      </div>

      <Labeled label="Blocked by" theme={theme}>
        {form.blockerIds.length > 0 && (
          <ul className="list-none p-0 m-0 mb-2 flex flex-col gap-1.5">
            {form.blockerIds.map((id) => (
              <li key={id} className={c('flex items-center gap-2 text-sm rounded-lg px-3 py-1.5', chipGray(theme))}>
                <span className={c('flex-1 truncate font-semibold', txt(theme))}>{titleOf.get(id) ?? id}</span>
                <button type="button" aria-label={`Stop ${titleOf.get(id) ?? id} blocking this task`} disabled={saving}
                  onClick={() => set('blockerIds', form.blockerIds.filter((x) => x !== id))} className="inline-flex opacity-70 hover:opacity-100">
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <select className="input-base" value="" disabled={saving || candidates.length === 0}
          onChange={(e) => { if (e.target.value) set('blockerIds', [...form.blockerIds, e.target.value]) }}>
          <option value="">{candidates.length ? 'Add a blocking task…' : 'No other tasks'}</option>
          {candidates.map((g) => (
            <optgroup key={g.project} label={g.project}>
              {g.tasks.map((t) => <option key={t.id} value={t.id}>{t.title} ({STATUS_LABEL[t.status] ?? t.status})</option>)}
            </optgroup>
          ))}
        </select>
      </Labeled>

      {error && <p role="alert" className="text-sm font-semibold text-red-500 m-0">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary px-5 py-2.5 text-sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={onCancel} disabled={saving}
          className={c('btn-outline-indigo px-5 py-2.5 text-sm', d ? 'dark-variant' : '')}>Cancel</button>
      </div>
    </form>
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
