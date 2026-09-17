import { useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { c, muted } from '../../lib'
import type { Theme } from '../../types'
import { layoutGraph, clipTitle, DEFAULT_NODE_W, DEFAULT_NODE_H } from './graphLayout'
import type { TaskRow } from '../tasksLogic'

// Per-project dependency graph (spec §6.5): a left-to-right layered SVG of
// blockedBy/blocks edges, one node per task touched by an edge. layoutGraph
// does all the positioning math; this component only draws it and wires
// clicks through to the task detail route.

const PALETTE: Record<Theme, { bg: string; text: string; edge: string; indigo: string; red: string; terminal: string }> = {
  light: {
    bg: '#F8FAFC', text: '#0F172A', edge: '#CBD5E1',
    indigo: '#4F46E5', red: '#EF4444', terminal: '#CBD5E1',
  },
  dark: {
    bg: 'rgba(255,255,255,0.06)', text: '#F1F5F9', edge: 'rgba(255,255,255,0.28)',
    indigo: '#818CF8', red: '#F87171', terminal: 'rgba(255,255,255,0.28)',
  },
}

export default function DependencyGraph({ tasks, theme }: { tasks: TaskRow[]; theme: Theme }) {
  const navigate = useNavigate()
  const { search } = useLocation()
  const g = useMemo(() => layoutGraph(tasks), [tasks])
  const palette = PALETTE[theme]

  if (g.nodes.length === 0) {
    return <p className={c('text-xs font-medium m-0', muted(theme))}>No dependencies yet.</p>
  }

  const open = (id: string) => navigate(`/tools/team/tasks/${id}${search}`)

  return (
    <div className="overflow-x-auto mb-4">
      <svg width={g.width} height={g.height} role="img" aria-label="Task dependency graph">
        <defs>
          <marker id="dep-arrow" markerWidth={8} markerHeight={8} viewBox="0 0 8 8" refX={8} refY={4} orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill={palette.edge} />
          </marker>
        </defs>
        {g.edges.map((e) => {
          const from = g.nodes.find((n) => n.id === e.from)
          const to = g.nodes.find((n) => n.id === e.to)
          if (!from || !to) return null
          return (
            <line
              key={`${e.from}->${e.to}`}
              x1={from.x + DEFAULT_NODE_W}
              y1={from.y + DEFAULT_NODE_H / 2}
              x2={to.x}
              y2={to.y + DEFAULT_NODE_H / 2}
              stroke={palette.edge}
              strokeWidth={1.5}
              markerEnd="url(#dep-arrow)"
            />
          )
        })}
        {g.nodes.map((n) => {
          const stroke = n.blocked ? palette.red : n.terminal ? palette.terminal : palette.indigo
          return (
            <g
              key={n.id}
              role="link"
              tabIndex={0}
              onClick={() => open(n.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') open(n.id) }}
              style={{ cursor: 'pointer' }}
            >
              <rect x={n.x} y={n.y} width={DEFAULT_NODE_W} height={DEFAULT_NODE_H} rx={8} fill={palette.bg} stroke={stroke} strokeWidth={1.5} />
              <text x={n.x + 12} y={n.y + DEFAULT_NODE_H / 2 + 4} fill={palette.text} fontSize={12} fontWeight={600}>
                {clipTitle(n.title)}
                <title>{n.title}</title>
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
