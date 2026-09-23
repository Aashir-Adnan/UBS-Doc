import { useState } from 'react'
import type { Theme } from '../../../types'
import { linePath, niceMax } from '../statsLogic'
import { CHART, plotW, plotH, gridColor, textColor, xLabelIndexes, shortLabel } from './axes'
import { YGrid, Empty, tooltipFill } from './chartChrome'
import { Legend } from './Bars'

interface Line { name: string; values: number[]; color: string }

// Two running totals on one axis (tasks created vs completed). Hover shows
// both values at that bucket.
export default function CumulativeLines({ labels, a, b, theme, format = (n: number) => String(Math.round(n)), label }: {
  labels: string[]; a: Line; b: Line; theme: Theme; format?: (n: number) => string; label?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const all = [...a.values, ...b.values]
  if (!all.some((v) => v > 0)) return <Empty theme={theme} />
  const max = niceMax(Math.max(...all))
  const n = labels.length
  const step = n > 1 ? plotW / (n - 1) : plotW
  const shown = xLabelIndexes(n)
  const yOf = (v: number) => plotH - (v / max) * plotH
  return (
    <div>
      <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} className="w-full h-auto block" role={label ? 'img' : undefined} aria-label={label} onMouseLeave={() => setHover(null)}>
        <g transform={`translate(${CHART.padL},${CHART.padT})`}>
          <YGrid max={max} format={format} theme={theme} />
          <path d={linePath(a.values, plotW, plotH, max)} fill="none" stroke={a.color} strokeWidth={2} strokeLinejoin="round" />
          <path d={linePath(b.values, plotW, plotH, max)} fill="none" stroke={b.color} strokeWidth={2} strokeLinejoin="round" />
          {labels.map((label, i) => (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={i * step - step / 2} y={0} width={step} height={plotH} fill="transparent" />
              {shown.includes(i) && <text x={i * step} y={plotH + 16} textAnchor="middle" fontSize={10} fill={textColor(theme)}>{shortLabel(label)}</text>}
            </g>
          ))}
          {hover !== null && hover < labels.length && (
            <g style={{ pointerEvents: 'none' }}>
              <line x1={hover * step} x2={hover * step} y1={0} y2={plotH} stroke={gridColor(theme)} strokeDasharray="3 3" />
              <circle cx={hover * step} cy={yOf(a.values[hover] ?? 0)} r={3.5} fill={a.color} />
              <circle cx={hover * step} cy={yOf(b.values[hover] ?? 0)} r={3.5} fill={b.color} />
              <g transform={`translate(${Math.min(plotW - 140, Math.max(0, hover * step - 70))},0)`}>
                <rect x={0} y={0} width={140} height={42} rx={6} fill={tooltipFill(theme)} stroke={gridColor(theme)} />
                <text x={8} y={12} fontSize={10} fontWeight={700} fill={textColor(theme)}>{shortLabel(labels[hover])}</text>
                <text x={8} y={26} fontSize={10} fill={a.color}>{a.name}: {format(a.values[hover] ?? 0)}</text>
                <text x={8} y={38} fontSize={10} fill={b.color}>{b.name}: {format(b.values[hover] ?? 0)}</text>
              </g>
            </g>
          )}
        </g>
      </svg>
      <Legend series={[a, b]} theme={theme} />
    </div>
  )
}
