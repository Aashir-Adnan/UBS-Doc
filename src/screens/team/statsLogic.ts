// Pure math for the Stats tab: range bounds, day/week bucketing, series
// filling and stacking, snapshot counts from the tasks payload, and the
// scale helpers the SVG charts draw with. No React, no DOM, no fetch.
import type { DayPoint, TimePoint } from '../../components/discordTasks/api'
import { isTerminal, type TaskRow } from '../tasksLogic'
import { weekRange } from './timeLogic'

export type RangeKind = '30d' | '90d' | 'all'
export type Bucket = 'day' | 'week'
export const RANGE_KINDS: { key: RangeKind; label: string }[] = [
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'all', label: 'All time' },
]

const pad = (n: number) => String(n).padStart(2, '0')
export const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// 30 days reads day by day; anything longer is bucketed by week so the chart
// stays legible. `since` is local midnight N days back; null means all time.
export function rangeBounds(kind: RangeKind, now: Date): { since: Date | null; until: Date; bucket: Bucket } {
  if (kind === 'all') return { since: null, until: now, bucket: 'week' }
  const days = kind === '30d' ? 30 : 90
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 0, 0, 0, 0)
  return { since, until: now, bucket: kind === '30d' ? 'day' : 'week' }
}

// The Monday that starts the week a day belongs to, as a day key.
export const weekKeyOf = (key: string): string => dayKey(weekRange(parseDayKey(key)).since)

// Every day key from `since` (at local midnight) up to `until`, exclusive —
// the day containing `until` is included only once `until` has moved past
// its own midnight; or every Monday key for the weeks those days fall in.
export function bucketKeys(since: Date, until: Date, bucket: Bucket): string[] {
  const keys: string[] = []
  for (
    let d = new Date(since.getFullYear(), since.getMonth(), since.getDate());
    d.getTime() < until.getTime();
    d.setDate(d.getDate() + 1)
  ) {
    const k = dayKey(d)
    keys.push(bucket === 'week' ? weekKeyOf(k) : k)
  }
  return [...new Set(keys)]
}

export function rollup(points: DayPoint[], bucket: Bucket): DayPoint[] {
  if (bucket === 'day') return points
  const acc = new Map<string, number>()
  for (const p of points) {
    const k = weekKeyOf(p.day)
    acc.set(k, (acc.get(k) ?? 0) + p.n)
  }
  return [...acc.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, n]) => ({ day, n }))
}

export function fillSeries(points: DayPoint[], keys: string[]): number[] {
  const byKey = new Map(points.map((p) => [p.day, p.n]))
  return keys.map((k) => byKey.get(k) ?? 0)
}

export function cumulative(values: number[]): number[] {
  let total = 0
  return values.map((v) => (total += v))
}

// rows[keyIndex][memberIndex] = minutes. Members appear in the order they are
// first seen in the points, so the legend and the stack colours agree.
export function stackByMember(
  points: TimePoint[], keys: string[], bucket: Bucket, nameOf: (discordId: string) => string,
): { members: { discordId: string; name: string }[]; rows: number[][] } {
  const members: { discordId: string; name: string }[] = []
  const index = new Map<string, number>()
  const keyIndex = new Map(keys.map((k, i) => [k, i]))
  const rows = keys.map(() => [] as number[])
  for (const p of points) {
    if (!index.has(p.discordId)) { index.set(p.discordId, members.length); members.push({ discordId: p.discordId, name: nameOf(p.discordId) }) }
    const ki = keyIndex.get(bucket === 'week' ? weekKeyOf(p.day) : p.day)
    if (ki === undefined) continue
    const mi = index.get(p.discordId)!
    rows[ki][mi] = (rows[ki][mi] ?? 0) + p.minutes
  }
  for (const row of rows) for (let i = 0; i < members.length; i += 1) row[i] = row[i] ?? 0
  return { members, rows }
}

// Eight distinguishable hues that read on both the dark and light themes.
export const MEMBER_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#0EA5E9', '#F43F5E', '#8B5CF6', '#14B8A6', '#F97316']
export const memberColor = (i: number): string => MEMBER_COLORS[i % MEMBER_COLORS.length]

export function minutesInRange(points: TimePoint[], discordId?: string | null): number {
  return points.reduce((n, p) => (discordId && p.discordId !== discordId ? n : n + p.minutes), 0)
}

export function completionPercent(tasks: TaskRow[]): number | null {
  if (!tasks.length) return null
  const done = tasks.filter((t) => isTerminal(t.status)).length
  return Math.round((done / tasks.length) * 100)
}

// "open" is everything that is neither in progress nor finished — open and
// pending both read as waiting to be picked up.
export function memberBreakdown(discordId: string, tasks: TaskRow[]): { open: number; inProgress: number; done: number } {
  const out = { open: 0, inProgress: 0, done: 0 }
  for (const t of tasks) {
    if (!t.assignees.some((a) => a.discordId === discordId)) continue
    if (isTerminal(t.status)) out.done += 1
    else if (t.status === 'in_progress') out.inProgress += 1
    else out.open += 1
  }
  return out
}

export function estimateSummary(tasks: TaskRow[]): { logged: number; estimate: number } | null {
  const withEstimate = tasks.filter((t) => typeof t.estimateMinutes === 'number' && t.estimateMinutes > 0)
  if (!withEstimate.length) return null
  return {
    logged: withEstimate.reduce((n, t) => n + (t.timeLogged ?? 0), 0),
    estimate: withEstimate.reduce((n, t) => n + (t.estimateMinutes ?? 0), 0),
  }
}

// A friendly axis ceiling: 1-1.5-2-2.5-3-4-5-6-8-10 steps, never 0.
export function niceMax(n: number): number {
  if (n <= 0) return 1
  const exp = Math.floor(Math.log10(n))
  const base = 10 ** exp
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * base >= n) return m * base
  return 10 * base
}

// Values spread evenly across `w`, y inverted so `max` is the top. A single
// value draws a flat line across the full width.
export function linePath(values: number[], w: number, h: number, max: number): string {
  if (!values.length) return ''
  const step = values.length > 1 ? w / (values.length - 1) : w
  const pt = (v: number, i: number) => `${values.length > 1 ? Math.round(i * step * 100) / 100 : i * w},${Math.round((h - (v / max) * h) * 100) / 100}`
  if (values.length === 1) return `M0,${pt(values[0], 0).split(',')[1]} L${w},${pt(values[0], 0).split(',')[1]}`
  return values.map((v, i) => `${i === 0 ? 'M' : 'L'}${pt(v, i)}`).join(' ')
}
