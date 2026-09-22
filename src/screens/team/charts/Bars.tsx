import { useState } from 'react'
import { c, muted } from '../../../lib'
import type { Theme } from '../../../types'
import { niceMax } from '../statsLogic'
import { CHART, plotW, plotH, gridColor, textColor, xLabelIndexes, shortLabel } from './axes'
import { YGrid, Empty, tooltipFill } from './chartChrome'

interface Group { name: string; values: number[]; color: string }

// Vertical bars over time (one series, or grouped series side by side), or —
// with `horizontal` — one row per label, used for the per-member breakdown.
export default function Bars({ labels, values = [], theme, color, format = String, horizontal = false, groups, labelFormat = shortLabel, label }: {
  labels: string[]; values?: number[]; theme: Theme; color?: string; format?: (n: number) => string
  horizontal?: boolean; groups?: Group[]; labelFormat?: (label: string) => string; label?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const series: Group[] = groups ?? [{ name: '', values, color: color ?? (theme === 'dark' ? '#818CF8' : '#4F46E5') }]
  const all = series.flatMap((s) => s.values)
  if (!all.some((v) => v > 0)) return <Empty theme={theme} />
  const max = niceMax(Math.max(...all))

  if (horizontal) {
    const rowH = 22, gap = 6, barH = (rowH - 2) / series.length
    const h = labels.length * (rowH + gap)
    const labelW = 120
    const w = CHART.w
    const pw = w - labelW - 40
    return (
      <div>
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto block" role={label ? 'img' : undefined} aria-label={label}>
          {labels.map((label, i) => (
            <g key={i} transform={`translate(0,${i * (rowH + gap)})`}>
              <text x={labelW - 8} y={rowH / 2 + 4} textAnchor="end" fontSize={11} fontWeight={600} fill={textColor(theme)}>{label}</text>
              {series.map((s, si) => {
                const v = s.values[i] ?? 0
                const bw = (v / max) * pw
                return (
                  <g key={si}>
                    <rect x={labelW} y={1 + si * barH} width={bw} height={barH - 1} rx={2} fill={s.color} />
                    {v > 0 && <text x={labelW + bw + 4} y={1 + si * barH + barH - 2} fontSize={10} fill={textColor(theme)}>{format(v)}</text>}
                  </g>
                )
              })}
            </g>
          ))}
        </svg>
        {groups && <Legend series={series} theme={theme} />}
      </div>
    )
  }

  const n = labels.length
  const slot = plotW / Math.max(1, n)
  const barW = Math.max(2, (slot * 0.7) / series.length)
  const shown = xLabelIndexes(n)
  return (
    <div>
      <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} className="w-full h-auto block" role={label ? 'img' : undefined} aria-label={label} onMouseLeave={() => setHover(null)}>
        <g transform={`translate(${CHART.padL},${CHART.padT})`}>
          <YGrid max={max} format={format} theme={theme} />
          {labels.map((label, i) => (
            <g key={i} transform={`translate(${i * slot},0)`} onMouseEnter={() => setHover(i)}>
              <rect x={0} y={0} width={slot} height={plotH} fill="transparent" />
              {series.map((s, si) => {
                const v = s.values[i] ?? 0
                const bh = (v / max) * plotH
                return <rect key={si} x={slot * 0.15 + si * barW} y={plotH - bh} width={barW} height={bh} rx={2} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.5} />
              })}
              {shown.includes(i) && <text x={slot / 2} y={plotH + 16} textAnchor="middle" fontSize={10} fill={textColor(theme)}>{labelFormat(label)}</text>}
            </g>
          ))}
          {hover !== null && hover < labels.length && (
            <g transform={`translate(${Math.min(plotW - 130, hover * slot)},0)`} style={{ pointerEvents: 'none' }}>
              <rect x={0} y={0} width={130} height={14 + series.length * 14} rx={6} fill={tooltipFill(theme)} stroke={gridColor(theme)} />
              <text x={8} y={12} fontSize={10} fontWeight={700} fill={textColor(theme)}>{labelFormat(labels[hover])}</text>
              {series.map((s, si) => (
                <text key={si} x={8} y={26 + si * 14} fontSize={10} fill={s.color}>{s.name ? `${s.name}: ` : ''}{format(s.values[hover] ?? 0)}</text>
              ))}
            </g>
          )}
        </g>
      </svg>
      {groups && <Legend series={series} theme={theme} />}
    </div>
  )
}

export function Legend({ series, theme }: { series: { name: string; color: string }[]; theme: Theme }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 m-0 p-0 list-none mt-2">
      {series.map((s, i) => (
        <li key={i} className={c('flex items-center gap-1.5 text-[11px] font-semibold', muted(theme))}>
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />{s.name}
        </li>
      ))}
    </ul>
  )
}
