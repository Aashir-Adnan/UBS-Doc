// Pure logic for the Team section's task import: reading the file, the ordered
// queue of creates, its reducer, the summary sentence and the leftover file.
// No React, no fetch, no DOM.
import type { CreateTaskInput, ImportFields, ImportVerdict } from '../../components/discordTasks/api'

export const MAX_IMPORT_TASKS = 50
export const MAX_IMPORT_BYTES = 90 * 1024

// Entries are returned as-is: the backend validates them.
export function parseImportFile(text: string): { tasks: unknown[] } | { error: string } {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) return { error: 'The file is too large — 90 KB at most.' }
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^﻿/, ''))
  } catch (e) {
    return { error: `This is not valid JSON: ${e instanceof Error ? e.message : String(e)}` }
  }
  const needsList = { error: 'The file needs a "tasks" list.' }
  let tasks: unknown
  if (Array.isArray(data)) tasks = data
  else if (data && typeof data === 'object') tasks = (data as { tasks?: unknown }).tasks
  else return needsList
  if (!Array.isArray(tasks)) return needsList
  if (tasks.length === 0) return { error: 'The file has no tasks.' }
  if (tasks.length > MAX_IMPORT_TASKS) return { error: `A file can hold at most ${MAX_IMPORT_TASKS} tasks — this one has ${tasks.length}.` }
  return { tasks }
}

export interface ImportStep { key: string; kind: 'task' | 'subtask'; taskIndex: number; subIndex?: number; title: string }
export type StepState = 'pending' | 'running' | 'created' | 'failed' | 'skipped'
export type ImportRun = Record<string, { state: StepState; message?: string; taskId?: string }>
export type StepResult = { ok: true; taskId: string } | { ok: false; message: string }

// Valid tasks only, in file order: each task, then its subtasks.
export function importSteps(verdicts: ImportVerdict[]): ImportStep[] {
  const steps: ImportStep[] = []
  for (const v of verdicts) {
    if (!v.ok || !v.fields) continue
    steps.push({ key: `t${v.index}`, kind: 'task', taskIndex: v.index, title: v.fields.title })
    v.fields.subtasks.forEach((s, subIndex) => {
      steps.push({ key: `t${v.index}.s${subIndex}`, kind: 'subtask', taskIndex: v.index, subIndex, title: s.title })
    })
  }
  return steps
}

export function initialRun(steps: ImportStep[]): ImportRun {
  const run: ImportRun = {}
  for (const s of steps) run[s.key] = { state: 'pending' }
  return run
}

export function applyStepResult(run: ImportRun, steps: ImportStep[], key: string, result: StepResult): ImportRun {
  const next: ImportRun = { ...run }
  if (result.ok) {
    next[key] = { state: 'created', taskId: result.taskId }
    return next
  }
  next[key] = { state: 'failed', message: result.message }
  const step = steps.find((s) => s.key === key)
  if (step?.kind === 'task') {
    for (const s of steps) {
      if (s.kind === 'subtask' && s.taskIndex === step.taskIndex) next[s.key] = { state: 'skipped', message: 'The task was not created.' }
    }
  }
  return next
}

export function nextStep(run: ImportRun, steps: ImportStep[]): ImportStep | null {
  return steps.find((s) => run[s.key]?.state === 'pending') ?? null
}

// The created task id for a subtask step's parent, or null.
export function parentTaskIdFor(run: ImportRun, step: ImportStep): string | null {
  if (step.kind !== 'subtask') return null
  return run[`t${step.taskIndex}`]?.taskId ?? null
}

export function importSummary(verdicts: ImportVerdict[], run: ImportRun, steps: ImportStep[]): string {
  const total = verdicts.length
  const taskSteps = steps.filter((s) => s.kind === 'task')
  const imported = taskSteps.filter((s) => run[s.key]?.state === 'created').length
  const failed = taskSteps.filter((s) => run[s.key]?.state === 'failed').length
  const invalid = verdicts.filter((v) => !v.ok).length
  const subFailed = steps.filter((s) => s.kind === 'subtask' && run[s.key]?.state === 'failed').length

  let text = `Imported ${imported} of ${total} ${total === 1 ? 'task' : 'tasks'}.`
  const parts: string[] = []
  if (invalid) parts.push(`${invalid} ${invalid === 1 ? 'was' : 'were'} invalid`)
  if (failed) parts.push(`${failed} failed`)
  if (parts.length) text += ` ${parts.join(' and ')}.`
  if (subFailed) text += ` ${subFailed} ${subFailed === 1 ? 'subtask' : 'subtasks'} failed.`
  return text
}

// The original entries that were invalid or whose task failed, unchanged and in
// file order. A created task with failed subtasks is not included: it exists.
export function leftoverFile(originalTasks: unknown[], verdicts: ImportVerdict[], run: ImportRun, _steps: ImportStep[]): { tasks: unknown[] } {
  const tasks: unknown[] = []
  for (const v of verdicts) {
    if (!v.ok || run[`t${v.index}`]?.state === 'failed') tasks.push(originalTasks[v.index])
  }
  return { tasks }
}

export function importSampleFile(): { tasks: unknown[] } {
  return {
    tasks: [
      {
        type: 'feature',
        title: 'Patient search by CNIC',
        description: 'Staff can find a patient by typing a CNIC number.',
        scope: 'backend',
        status: 'in_progress',
        modules: ['Patients', 'Search'],
        assignees: ['ali@example.com', 'Sara Khan'],
        subtasks: [
          { title: 'Search API endpoint', description: 'Returns matching patients.', scope: 'backend', status: 'done', assignees: ['ali@example.com'] },
          { title: 'Search screen', scope: 'frontend', assignees: ['Sara Khan'] },
        ],
      },
    ],
  }
}

// A verdict's fields as the create wrapper's input. repositoryIds and tracks
// are not sent: the bot resolves the repository and applies the defaults.
export function createInputFor(fields: ImportFields, projectId: string, createIssue: boolean): CreateTaskInput {
  return {
    type: fields.type,
    title: fields.title,
    description: fields.description,
    project_id: projectId,
    scope: fields.scope,
    modules: fields.modules,
    holder_ids: fields.holderIds,
    create_issue: createIssue,
    status: fields.status,
  }
}
