import { linePath } from '../statsLogic'
import type { Theme } from '../../../types'

// A bare trend line for the overview cards: no axes, no labels, no hover.
export default function Sparkline({ values, theme, width = 120, height = 28 }: { values: number[]; theme: Theme; width?: number; height?: number }) {
  const max = Math.max(1, ...values)
  const d = linePath(values, width, height - 2, max)
  const stroke = theme === 'dark' ? '#818CF8' : '#4F46E5'
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="block">
      <g transform="translate(0,1)">
        <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      </g>
    </svg>
  )
}
