import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Folder, FolderOpen } from 'lucide-react'
import { SIDEBAR, docLabel, categoryPathFor, type SidebarNode } from '../../docs/sidebar'
import { c, card } from '../../lib'
import type { Theme } from '../../types'

// The whole tree is rendered from SIDEBAR; only the categories on the path to
// the active doc start open, so the panel is navigable rather than a 144-row
// wall. Open state is keyed by index path (see categoryPathFor) because
// category labels repeat across the tree.
function openSeed(activeId: string): Record<string, boolean> {
  const seed: Record<string, boolean> = {}
  for (const key of categoryPathFor(activeId) || []) seed[key] = true
  return seed
}

export default function DocsSidebar({ activeId, theme }: { activeId: string; theme: Theme }) {
  const d = theme === 'dark'
  const [open, setOpen] = useState<Record<string, boolean>>(() => openSeed(activeId))

  // Following a prev/next button or an in-prose link changes the active doc
  // without remounting — re-open its ancestors, but keep what the user opened.
  useEffect(() => {
    setOpen(prev => ({ ...prev, ...openSeed(activeId) }))
  }, [activeId])

  const renderNodes = (nodes: SidebarNode[], prefix = '', depth = 0) =>
    nodes.map((node, i) => {
      const key = prefix ? `${prefix}.${i}` : String(i)
      const pad = { paddingLeft: `${0.55 + depth * 0.6}rem` }

      if (typeof node === 'string') {
        const active = node === activeId
        return (
          <Link
            key={key}
            to={`/docs/${node}`}
            style={pad}
            className={c(
              'docs-tree-link capitalize',
              active
                ? (d ? 'bg-indigo-500/15 text-indigo-300 font-semibold' : 'bg-indigo-50 text-indigo-600 font-semibold')
                : (d ? 'text-white/45 hover:text-white/80 hover:bg-white/5' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'),
            )}>
            {docLabel(node)}
          </Link>
        )
      }

      const isOpen = !!open[key]
      return (
        <div key={key}>
          <button
            type="button"
            onClick={() => setOpen(prev => ({ ...prev, [key]: !prev[key] }))}
            style={pad}
            className={c(
              'docs-tree-link docs-tree-cat font-semibold',
              d ? 'text-white/70 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-50',
            )}>
            {isOpen
              ? <FolderOpen size={13} className="shrink-0 text-indigo-400" />
              : <Folder size={13} className={c('shrink-0', d ? 'text-white/40' : 'text-slate-400')} />}
            <span className="min-w-0 flex-1">{node.label}</span>
          </button>
          {isOpen && renderNodes(node.items, key, depth + 1)}
        </div>
      )
    })

  return (
    <aside
      className={c(card(theme), 'docs-tree p-3 shrink-0 self-start sticky overflow-y-auto')}
      style={{ width: 280, top: 24, maxHeight: 'calc(100vh - 48px)' }}>
      <p className={c('section-kicker px-2 pb-2', d ? 'text-white/30' : 'text-slate-400')}>
        Documentation
      </p>
      <nav className="flex flex-col gap-0.5">{renderNodes(SIDEBAR)}</nav>
    </aside>
  )
}
