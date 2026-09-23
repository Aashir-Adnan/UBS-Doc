import { c, muted } from '../../../lib'
import type { Theme } from '../../../types'
import { plotW, plotH, gridColor, textColor, yTicks } from './axes'

// Shared axis-chart chrome: the y-gridlines, the zero-data empty state, and
// the tooltip box fill. Pulled out of Bars/StackedBars/CumulativeLines so the
// three don't drift from each other.

// Five y gridlines from 0 to max, skipping a tick whose formatted label
// duplicates the previous one (e.g. small integer axes rounding to 0,1,1,2,2).
export function YGrid({ max, format, theme }: { max: number; format: (n: number) => string; theme: Theme }) {
  const ticks = yTicks(max)
  let prevLabel: string | null = null
  return (
    <>
      {ticks.map((t, i) => {
        const label = format(t)
        const dup = prevLabel !== null && label === prevLabel
        prevLabel = label
        if (dup) return null
        return (
          <g key={i}>
            <line x1={0} x2={plotW} y1={plotH - (t / max) * plotH} y2={plotH - (t / max) * plotH} stroke={gridColor(theme)} />
            <text x={-6} y={plotH - (t / max) * plotH + 3} textAnchor="end" fontSize={10} fill={textColor(theme)}>{label}</text>
          </g>
        )
      })}
    </>
  )
}

export function Empty({ theme }: { theme: Theme }) {
  return <p className={c('text-xs font-medium m-0 py-6 text-center', muted(theme))}>Nothing in this range</p>
}

export const tooltipFill = (theme: Theme) => (theme === 'dark' ? '#0b1020' : '#fff')
