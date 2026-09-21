import { useCallback, useState } from 'react'
import { c, muted } from '../../lib'
import type { Theme } from '../../types'
import type { TaskRow } from '../tasksLogic'
import { useActingPermissions } from '../../components/portal/tenantProjects/useActingPermissions'
import { setTaskStatus } from '../../components/discordTasks/api'
import { classifyDropError } from './boardLogic'
import { nextSubtaskStatus } from './hierarchyLogic'
import SubtaskChecklist from './SubtaskChecklist'
import Toast, { type ToastTone } from './Toast'
import { useTeam } from './TeamLayout'

// The checklist plus what ticking a box does: one status call for that subtask
// (the bot completes or reopens the parent by itself), then a refetch so the
// whole page — progress, the parent's status, the history — reflects it.
//
// A component of its own because TaskDetail returns early before it knows which
// task it is showing, and hooks cannot live below an early return.
interface ToastState { message: string; tone: ToastTone; seq: number }

export default function SubtasksSection({ task, theme, search }: { task: TaskRow; theme: Theme; search: string }) {
  const { refresh } = useTeam()
  const { has, loaded } = useActingPermissions()
  const canToggle = has('update_discord_tasks')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)

  const closeToast = useCallback(() => setToast(null), [])
  const show = useCallback((message: string, tone: ToastTone) => {
    setToast((prev) => ({ message, tone, seq: (prev?.seq ?? 0) + 1 }))
  }, [])

  const onToggle = useCallback(async (subtaskId: string) => {
    const sub = (task.subtasks ?? []).find((s) => s.id === subtaskId)
    if (!sub || busyId) return
    setBusyId(subtaskId)
    try {
      const result = await setTaskStatus(subtaskId, nextSubtaskStatus(sub))
      if (result?.warning) show(result.warning, 'info')
      await refresh()
    } catch (err) {
      show(classifyDropError(err as { status?: number; message?: string }).text, 'error')
      void refresh()
    } finally {
      setBusyId(null)
    }
  }, [task.subtasks, busyId, refresh, show])

  return (
    <>
      <SubtaskChecklist task={task} theme={theme} search={search} canToggle={canToggle} busyId={busyId} onToggle={(id) => void onToggle(id)} />
      {loaded && !canToggle && (
        <p className={c('text-xs font-medium mt-2 mb-0', muted(theme))}>
          Ask an admin for the update_discord_tasks permission to tick subtasks here.
        </p>
      )}
      {toast && <Toast key={toast.seq} message={toast.message} tone={toast.tone} onClose={closeToast} />}
    </>
  )
}
