// Task hierarchy on the site: pure helpers for the checklist, the nested list and
// the "finish the subtasks first" rule. The bot enforces the rule; these keep the
// UI honest so it does not offer a move that will be refused. No React, no DOM.
import { isTerminal, type TaskRow, type TaskSubtask } from '../tasksLogic'

export const isSubtask = (t: Pick<TaskRow, 'parent'>): boolean => Boolean(t.parent)

// Tasks with no parent — what the board shows (each with its progress chip).
export const topLevel = (tasks: TaskRow[]): TaskRow[] => tasks.filter((t) => !t.parent)

export const openSubtasks = (t: Pick<TaskRow, 'subtasks'>): TaskSubtask[] =>
  (t.subtasks ?? []).filter((s) => !isTerminal(s.status))

// "3/5", or null when the task has no subtasks.
export function progressText(t: Pick<TaskRow, 'subtaskProgress'>): string | null {
  const p = t.subtaskProgress
  return p && p.total > 0 ? `${p.done}/${p.total}` : null
}

// 0–100, for the progress bar. No subtasks reads as 0.
export function progressPercent(t: Pick<TaskRow, 'subtaskProgress'>): number {
  const p = t.subtaskProgress
  return p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0
}

// Ticking an open subtask finishes it; ticking a finished one reopens it.
export const nextSubtaskStatus = (sub: Pick<TaskSubtask, 'status'>): 'done' | 'open' =>
  isTerminal(sub.status) ? 'open' : 'done'

// Why a task cannot be moved to a finished status right now, or null when it can.
export function finishBlockedReason(t: Pick<TaskRow, 'subtasks'>): string | null {
  const open = openSubtasks(t)
  if (!open.length) return null
  const names = open.slice(0, 3).map((s) => s.title).join(', ')
  return `Finish its subtasks first (${open.length} open: ${names}${open.length > 3 ? ', …' : ''}).`
}

export interface HierarchyGroup { task: TaskRow; children: TaskRow[] }

// The Tasks list: each parent followed by its subtasks. A subtask whose parent is
// not in `tasks` (filtered out, or in another project) stays a top-level row, so
// a filter can never make a task disappear. Order is the input's, with a
// parent's subtasks in the order the parent lists them.
export function groupHierarchy(tasks: TaskRow[]): HierarchyGroup[] {
  const present = new Set(tasks.map((t) => t.id))
  const childrenOf = new Map<string, TaskRow[]>()
  const groups: HierarchyGroup[] = []
  for (const t of tasks) {
    if (t.parent && present.has(t.parent.id)) {
      const list = childrenOf.get(t.parent.id) ?? []
      list.push(t)
      childrenOf.set(t.parent.id, list)
    } else groups.push({ task: t, children: [] })
  }
  for (const g of groups) {
    const kids = childrenOf.get(g.task.id) ?? []
    const order = new Map((g.task.subtasks ?? []).map((s, i) => [s.id, i]))
    g.children = [...kids].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
  }
  return groups
}
