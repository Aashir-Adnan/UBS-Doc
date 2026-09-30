// Pure helpers for the site's clock control: elapsed-time math, the task
// picker's choices, which action a task page offers, and the toast sentences.
// No React, no fetch, no DOM.
import type { ClockInResult, ClockOutResult, ClockStatus, ClockedInPerson } from '../../components/discordTasks/api'
import { isTerminal, type ProjectGroup } from '../tasksLogic'
import { formatDuration } from './timeLogic'
import { plainRuleMessage } from './boardLogic'

export const GENERAL_WORK = 'General work'
const MAX_CHOICES = 50

export function formatElapsed(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  return formatDuration(Math.floor(s / 60)) ?? '0m'
}

// The server's elapsedSeconds plus the time since it was fetched. Deliberately
// never derived from `clockInAt`: the viewer's browser clock or timezone may
// disagree with the server's, and only the server's own count is trustworthy.
export function elapsedNow(status: ClockStatus, fetchedAtMs: number, nowMs: number): number {
  if (!status.active) return 0
  const since = Math.max(0, Math.floor((nowMs - fetchedAtMs) / 1000))
  return Math.max(0, (Number.isFinite(status.elapsedSeconds) ? status.elapsedSeconds : 0) + since)
}

export interface ClockChoice { id: string | null; label: string; projectName?: string }

// General work first, then open tasks the payload holds (the payload already
// only contains tasks the viewer may see), narrowed by the search box.
export function clockTaskChoices(projects: ProjectGroup[], query: string): ClockChoice[] {
  const q = query.trim().toLowerCase()
  const out: ClockChoice[] = [{ id: null, label: GENERAL_WORK }]
  for (const p of projects) {
    for (const t of p.tasks) {
      if (out.length > MAX_CHOICES) return out
      if (isTerminal(t.status)) continue
      const project = p.name || t.projectName || ''
      if (q && !t.title.toLowerCase().includes(q) && !project.toLowerCase().includes(q)) continue
      out.push(project ? { id: t.id, label: t.title, projectName: project } : { id: t.id, label: t.title })
    }
  }
  return out
}

// The control reads "unavailable" only when no fetch has ever succeeded
// (`linked` is still null). After that a failed refresh keeps the last good
// status, so a running clock never loses its Clock out button to a blip.
export const isClockUnavailable = (linked: boolean | null, lastFetchFailed: boolean): boolean =>
  lastFetchFailed && linked === null

// What the unavailable pill says. A 4xx other than 404 that carries a sentence
// (e.g. 400 "No staff member matches that Discord account.") is the backend
// telling this person why; a 404 (older backend without the endpoints), a 5xx
// or a network error keeps the bare text.
export const CLOCK_UNAVAILABLE = 'Clock unavailable'
export function clockUnavailableText(error: unknown): string {
  const e = error as { status?: unknown; message?: unknown } | null
  const status = typeof e?.status === 'number' ? e.status : 0
  if (status < 400 || status >= 500 || status === 404) return CLOCK_UNAVAILABLE
  const sentence = typeof e?.message === 'string' ? plainRuleMessage(e.message) : ''
  return sentence || CLOCK_UNAVAILABLE
}

// A task the viewer cannot see arrives as taskTitle 'a task' (taskId null); a
// missing title on a real task id is never shown as General work.
export function clockedInTaskLabel(p: Pick<ClockedInPerson, 'taskId' | 'taskTitle'>): string {
  if (p.taskTitle) return p.taskTitle
  return p.taskId ? 'a task' : GENERAL_WORK
}

export type TaskClockAction = 'clock-in' | 'switch' | 'clock-out'

export function taskClockAction(status: ClockStatus, taskId: string): TaskClockAction {
  if (!status.active) return 'clock-in'
  return status.taskId === taskId ? 'clock-out' : 'switch'
}

const statusTitle = (s: ClockStatus) => (s.active ? s.taskTitle : GENERAL_WORK)

export function clockOutcomeText(result: ClockInResult): string {
  const now = statusTitle(result.status)
  if (result.outcome === 'switched') return `Switched from ${result.stopped?.title ?? GENERAL_WORK} to ${now}.`
  if (result.outcome === 'unchanged') return `Already clocked in on ${now}.`
  return `Clocked in on ${now}.`
}

export function clockOutText(result: ClockOutResult): string {
  return `Clocked out — ${formatDuration(result.minutes) ?? '0m'}.`
}
