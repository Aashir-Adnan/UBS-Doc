// Pure time-tracking helpers for the site: formatting, estimate math, week
// boundaries for the report, and contributor rollups. No React, no fetch, no
// DOM. `formatDuration` mirrors the bot's own utility exactly, except it
// returns `null` (not an em dash) for nothing to show, so callers decide what
// to render.
export function formatDuration(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(Number(minutes))) return null
  const total = Math.max(0, Math.round(Number(minutes)))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!h) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}

// 0–100 for a progress bar, capped at 100 even when over the estimate — pair
// with `isOverEstimate` when the caller also needs to flag "over". Null (not
// a divide-by-zero) when there is no usable estimate to measure against.
export function estimatePercent(logged: number, estimate: number | null | undefined): number | null {
  if (estimate === null || estimate === undefined || estimate <= 0) return null
  return Math.min(100, Math.round((logged / estimate) * 100))
}

// True only once logged time exceeds a positive estimate; an estimate that is
// null, undefined or zero never counts as "over".
export function isOverEstimate(logged: number, estimate: number | null | undefined): boolean {
  return typeof estimate === 'number' && estimate > 0 && logged > estimate
}

// Monday 00:00 through the following Monday 00:00 (exclusive), in the
// browser's own local time — no timezone parameter, no UTC getters. `since`
// is the most recent Monday at/before `date`.
export function weekRange(date: Date): { since: Date; until: Date } {
  const day = date.getDay() // 0 = Sunday .. 6 = Saturday
  const sinceMonday = (day + 6) % 7 // Monday -> 0, Tuesday -> 1, ..., Sunday -> 6
  const since = new Date(date.getFullYear(), date.getMonth(), date.getDate() - sinceMonday, 0, 0, 0, 0)
  const until = new Date(since.getFullYear(), since.getMonth(), since.getDate() + 7, 0, 0, 0, 0)
  return { since, until }
}

// Both ends of `range` shifted by `n` weeks (n may be negative).
export function shiftWeek(range: { since: Date; until: Date }, n: number): { since: Date; until: Date } {
  const days = n * 7
  const shift = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds())
  return { since: shift(range.since), until: shift(range.until) }
}

// The first `max` entries unchanged (same references), then — only when more
// remain — one synthetic trailing "N others" row summing their minutes.
// `list` is assumed already sorted descending by the caller; this never
// re-sorts it.
export function topContributors<T extends { name: string; minutes: number }>(
  list: T[],
  max: number,
): Array<T | { name: string; minutes: number }> {
  if (max >= list.length) return list
  const head = list.slice(0, max)
  const rest = list.slice(max)
  const minutes = rest.reduce((sum, x) => sum + x.minutes, 0)
  return [...head, { name: `${rest.length} others`, minutes }]
}

// The small duration chip drawn on a task row: null when there is nothing
// logged (0, undefined or missing), the formatted duration otherwise. This is
// deliberately different from `formatDuration(0) === '0m'`, which a Time
// section's total display does want to show.
export function timeChip(task: { timeLogged?: number }): string | null {
  return task.timeLogged && task.timeLogged > 0 ? formatDuration(task.timeLogged) : null
}
