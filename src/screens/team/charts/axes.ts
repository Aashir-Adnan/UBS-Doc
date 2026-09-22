import type { Theme } from '../../../types'

export const CHART = { w: 560, h: 200, padL: 36, padR: 8, padT: 8, padB: 26 } as const
export const plotW = CHART.w - CHART.padL - CHART.padR
export const plotH = CHART.h - CHART.padT - CHART.padB

export const gridColor = (t: Theme) => (t === 'dark' ? 'rgba(255,255,255,0.08)' : '#E2E8F0')
export const textColor = (t: Theme) => (t === 'dark' ? 'rgba(255,255,255,0.45)' : '#64748B')

// Four y gridlines from 0 to max; and which x labels to print so they never
// overlap (at most ~7 across the width).
export const yTicks = (max: number) => [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
export function xLabelIndexes(count: number, maxLabels = 7): number[] {
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i)
  const step = Math.ceil(count / maxLabels)
  return Array.from({ length: count }, (_, i) => i).filter((i) => i % step === 0)
}
// '2026-09-21' -> '21 Sep'
export function shortLabel(key: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return ''
  const [, m, d] = key.split('-').map(Number)
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`
}
