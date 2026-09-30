import { useState } from 'react'
import { Plus } from 'lucide-react'
import { c, muted, inputCls } from '../../lib'
import type { Theme } from '../../types'
import type { TaskRow, TasksPayload } from '../tasksLogic'
import { addSubtask } from '../../components/discordTasks/api'
import MemberPicker from './MemberPicker'
import { saveErrorText } from './taskFormLogic'
import { useTeam } from './TeamLayout'

// Add a subtask under this task, saved at once (a subtask is its own task).
// The bot makes it exactly as the task hub's Add-subtask does: in the parent's
// project, no channel of its own, the parent reopened if it was finished.
export default function AddSubtask({ task, payload, theme }: { task: TaskRow; payload: TasksPayload; theme: Theme }) {
  const { refresh } = useTeam()
  const [title, setTitle] = useState('')
  const [holderIds, setHolderIds] = useState<string[]>([])
  const [showPeople, setShowPeople] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add() {
    const t = title.trim()
    if (!t) { setError('A subtask needs a title.'); return }
    if (t.length > 200) { setError('The title can be at most 200 characters.'); return }
    setBusy(true)
    setError(null)
    try {
      await addSubtask(task.id, t, holderIds)
      setTitle('')
      setHolderIds([])
      setShowPeople(false)
      await refresh()
    } catch (err) {
      setError(saveErrorText(err as { status?: number; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3">
      <form onSubmit={(e) => { e.preventDefault(); void add() }} className="flex flex-wrap gap-2 items-center">
        <div className="flex-1 min-w-[200px]">
          <input className={inputCls(theme)} placeholder="Add a subtask…" value={title} maxLength={200}
            onChange={(e) => setTitle(e.target.value)} disabled={busy} aria-label="New subtask title" />
        </div>
        <button type="submit" className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-1.5" disabled={busy}>
          <Plus size={14} /> {busy ? 'Adding…' : 'Add'}
        </button>
        <button type="button" onClick={() => setShowPeople((v) => !v)} disabled={busy}
          className={c('text-xs font-semibold underline-offset-2 hover:underline', muted(theme))}>
          {showPeople ? 'Hide assignees' : holderIds.length ? `Assignees (${holderIds.length})` : 'Assign…'}
        </button>
      </form>
      {showPeople && (
        <div className="mt-2">
          <MemberPicker members={payload.members} projectId={task.projectId} value={holderIds} onChange={setHolderIds} theme={theme} label="Subtask assignees" disabled={busy} />
        </div>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-red-500 mt-2 mb-0">{error}</p>}
    </div>
  )
}
