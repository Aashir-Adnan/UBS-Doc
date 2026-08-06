import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Folder, FolderOpen } from 'lucide-react'
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
  // Mobile-only: whether the whole tree is expanded (see the aside below).
  const [treeOpen, setTreeOpen] = useState(false)

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
    // Below lg this is a full-width collapsible panel above the article (a
    // 280px sticky rail beside the prose leaves no readable column on a
    // phone); the tree starts collapsed so the doc itself is what you land on.
    // At lg+ it is the sticky rail and `treeOpen` is irrelevant.
    <aside
      className={c(
        card(theme),
        'docs-tree p-3 w-full lg:w-[280px] shrink-0 self-stretch lg:self-start lg:sticky overflow-y-auto',
      )}
      style={{ top: 24 }}>
      <button
        type="button"
        onClick={() => setTreeOpen(o => !o)}
        aria-expanded={treeOpen}
        className={c(
          'lg:hidden w-full flex items-center justify-between gap-2 px-2 py-1 rounded-lg',
          d ? 'text-white/70' : 'text-slate-700',
        )}
      >
        <span className={c('section-kicker', d ? 'text-white/30' : 'text-slate-400')}>
          Documentation
        </span>
        <ChevronRight size={13} className="tr" style={{ transform: treeOpen ? 'rotate(90deg)' : 'none' }} />
      </button>
      <p className={c('section-kicker px-2 pb-2 hidden lg:block', d ? 'text-white/30' : 'text-slate-400')}>
        Documentation
      </p>
      <nav className={c('flex-col gap-0.5', treeOpen ? 'flex pt-2 lg:pt-0' : 'hidden lg:flex')}>
        {renderNodes(SIDEBAR)}
      </nav>
    </aside>
  )
}
