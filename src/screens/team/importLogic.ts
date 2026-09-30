// Pure logic for the Team section's task import: reading the file, the ordered
// queue of creates, its reducer, the summary sentence and the leftover file.
// No React, no fetch, no DOM.
import type { CreateTaskInput, ImportFields, ImportVerdict } from '../../components/discordTasks/api'
import { plainRuleMessage } from './boardLogic'

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

export const IMPORT_UNAVAILABLE_TEXT = 'Import is not available yet.'

// The Import button's label: `Import 1 task`, `Import 3 tasks`.
export function importButtonLabel(valid: number): string {
  return `Import ${valid} ${valid === 1 ? 'task' : 'tasks'}`
}

// The line above the preview: `2 of 3 tasks can be imported.`
export function checkHeadline(verdicts: ImportVerdict[]): string {
  const valid = verdicts.filter((v) => v.ok).length
  return `${valid} of ${verdicts.length} ${verdicts.length === 1 ? 'task' : 'tasks'} can be imported.`
}

// An older backend has no import-check route (404) or is offline (503).
export function checkFailure(err: { status?: number; message?: string }): string {
  if (err.status === 404 || err.status === 503) return IMPORT_UNAVAILABLE_TEXT
  return plainRuleMessage(err.message ?? '') || 'The check failed.'
}

// The sentence for a step whose request threw.
export function stepFailure(err: { message?: string } | null | undefined): string {
  return plainRuleMessage(err?.message ?? '') || 'The request failed.'
}

export const PARENT_MISSING_TEXT = 'The task was not created.'

export const FORMAT_TASK_FIELDS: { name: string; rule: string }[] = [
  { name: 'type', rule: 'Required. feature or bug.' },
  { name: 'title', rule: 'Required. Up to 200 characters.' },
  { name: 'description', rule: 'Up to 2000 characters.' },
  { name: 'scope', rule: 'backend, frontend, mobile, qa or design.' },
  { name: 'status', rule: 'open (the default), in_progress or done.' },
  { name: 'modules', rule: 'Up to 20 names of up to 100 characters each. Features only.' },
  { name: 'assignees', rule: 'Up to 50 people, each the email they verified in Discord or their Discord name.' },
  { name: 'subtasks', rule: 'Up to 25 subtasks.' },
]

export const FORMAT_SUBTASK_FIELDS: { name: string; rule: string }[] = [
  { name: 'title', rule: 'Required.' },
  { name: 'description', rule: 'Optional.' },
  { name: 'scope', rule: 'Optional.' },
  { name: 'status', rule: 'Optional.' },
  { name: 'assignees', rule: 'Optional.' },
]

export const FORMAT_RULES: string[] = [
  'A file holds at most 50 tasks and 90 KB.',
  'The file names no project: every task goes into the project picked on this screen.',
  'A subtask cannot have subtasks.',
  'A done task is recorded as finished, with no Discord channel and no GitHub issue.',
  'An open or in-progress task gets a Discord channel and, unless Open GitHub issues is unticked, a GitHub issue.',
  'A done task must have every subtask done.',
  'A bug needs a repository for its scope in the project.',
  'A name that matches nobody, or more than one person, makes the task invalid. Use the email instead.',
  'Unknown fields are ignored.',
]

// A row's label for a file entry the backend called invalid (no fields): its
// title when it has one, else its 1-based position.
export function entryTitle(entry: unknown, index: number): string {
  const title = entry && typeof entry === 'object' ? (entry as { title?: unknown }).title : undefined
  return typeof title === 'string' && title.trim() ? title : `Task ${index + 1}`
}
