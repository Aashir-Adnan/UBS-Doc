import { useState } from 'react'
import { c, muted } from '../../../lib'
import type { Theme } from '../../../types'
import { niceMax } from '../statsLogic'
import { CHART, plotW, plotH, gridColor, textColor, yTicks, xLabelIndexes, shortLabel } from './axes'
import { Legend } from './Bars'

// One bar per bucket, segmented by series (time per day, stacked by member).
// rows[bucket][series] = value.
export default function StackedBars({ labels, rows, series, theme, format = String }: {
  labels: string[]; rows: number[][]; series: { name: string; color: string }[]; theme: Theme; format?: (n: number) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const totals = rows.map((r) => r.reduce((n, v) => n + v, 0))
  if (!totals.some((v) => v > 0)) return <p className={c('text-xs font-medium m-0 py-6 text-center', muted(theme))}>Nothing in this range</p>
  const max = niceMax(Math.max(...totals))
  const n = labels.length
  const slot = plotW / Math.max(1, n)
  const barW = Math.max(2, slot * 0.7)
  const shown = xLabelIndexes(n)
  return (
    <div>
      <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} className="w-full h-auto block" role="img" onMouseLeave={() => setHover(null)}>
        <g transform={`translate(${CHART.padL},${CHART.padT})`}>
          {yTicks(max).map((t) => (
            <g key={t}>
              <line x1={0} x2={plotW} y1={plotH - (t / max) * plotH} y2={plotH - (t / max) * plotH} stroke={gridColor(theme)} />
              <text x={-6} y={plotH - (t / max) * plotH + 3} textAnchor="end" fontSize={10} fill={textColor(theme)}>{format(t)}</text>
            </g>
          ))}
          {labels.map((label, i) => {
            let y = plotH
            return (
              <g key={label} transform={`translate(${i * slot},0)`} onMouseEnter={() => setHover(i)}>
                <rect x={0} y={0} width={slot} height={plotH} fill="transparent" />
                {series.map((s, si) => {
                  const v = rows[i]?.[si] ?? 0
                  const h = (v / max) * plotH
                  y -= h
                  return <rect key={s.name} x={slot * 0.15} y={y} width={barW} height={h} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.5} />
                })}
                {shown.includes(i) && <text x={slot / 2} y={plotH + 16} textAnchor="middle" fontSize={10} fill={textColor(theme)}>{shortLabel(label)}</text>}
              </g>
            )
          })}
          {hover !== null && (
            <g transform={`translate(${Math.min(plotW - 150, hover * slot)},0)`}>
              <rect x={0} y={0} width={150} height={28 + series.filter((_, si) => (rows[hover]?.[si] ?? 0) > 0).length * 14} rx={6} fill={theme === 'dark' ? '#0b1020' : '#fff'} stroke={gridColor(theme)} />
              <text x={8} y={12} fontSize={10} fontWeight={700} fill={textColor(theme)}>{shortLabel(labels[hover])} · {format(totals[hover])}</text>
              {series.filter((_, si) => (rows[hover]?.[si] ?? 0) > 0).map((s, k) => (
                <text key={s.name} x={8} y={26 + k * 14} fontSize={10} fill={s.color}>{s.name}: {format(rows[hover][series.indexOf(s)])}</text>
              ))}
            </g>
          )}
        </g>
      </svg>
      <Legend series={series} theme={theme} />
    </div>
  )
}
