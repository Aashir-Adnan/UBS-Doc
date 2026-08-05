import { useState, useRef } from 'react'
import { Upload, ZoomIn, ZoomOut, Maximize2, Check, ArrowRight } from 'lucide-react'
import AuroraText from '../components/ui/aurora-text'
import { c, card, txt, muted, Breadcrumb } from '../lib'
import type { Theme } from '../types'

interface Props { theme: Theme }
interface TableNode { name: string; x: number; y: number; cols: { name: string; type: string; pk?: boolean; fk?: boolean }[] }

const W = 228

const INIT_TABLES: TableNode[] = [
  { name: 'tenants', x: 60, y: 60, cols: [
    { name: 'id', type: 'UUID', pk: true },
    { name: 'name', type: 'VARCHAR(255)' },
    { name: 'domain', type: 'VARCHAR(255)' },
    { name: 'created_at', type: 'TIMESTAMP' },
    { name: 'plan', type: 'VARCHAR(50)' },
  ]},
  { name: 'users', x: 380, y: 60, cols: [
    { name: 'id', type: 'UUID', pk: true },
    { name: 'tenant_id', type: 'UUID', fk: true },
    { name: 'email', type: 'VARCHAR(255)' },
    { name: 'role', type: 'VARCHAR(50)' },
    { name: 'provisioned_at', type: 'TIMESTAMP' },
  ]},
  { name: 'projects', x: 700, y: 60, cols: [
    { name: 'id', type: 'UUID', pk: true },
    { name: 'tenant_id', type: 'UUID', fk: true },
    { name: 'name', type: 'VARCHAR(255)' },
    { name: 'status', type: 'VARCHAR(50)' },
  ]},
  { name: 'meetings', x: 200, y: 320, cols: [
    { name: 'id', type: 'UUID', pk: true },
    { name: 'user_id', type: 'UUID', fk: true },
    { name: 'title', type: 'VARCHAR(255)' },
    { name: 'scheduled_at', type: 'TIMESTAMP' },
    { name: 'status', type: 'VARCHAR(50)' },
  ]},
  { name: 'repositories', x: 550, y: 320, cols: [
    { name: 'id', type: 'UUID', pk: true },
    { name: 'project_id', type: 'UUID', fk: true },
    { name: 'name', type: 'VARCHAR(255)' },
    { name: 'framework', type: 'VARCHAR(100)' },
    { name: 'branch', type: 'VARCHAR(100)' },
  ]},
]

const RELATIONS = [
  { from: 'tenants', to: 'users' },
  { from: 'tenants', to: 'projects' },
  { from: 'users', to: 'meetings' },
  { from: 'projects', to: 'repositories' },
]

function tableCenter(t: TableNode) {
  return { x: t.x + W / 2, y: t.y + 22 }
}

export default function DatabaseTools({ theme }: Props) {
  const [view, setView] = useState<'upload' | 'erd'>('upload')
  const [dragOver, setDragOver] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [tables, setTables] = useState(INIT_TABLES)
  const [zoom, setZoom] = useState(1)
  const dragging = useRef<{ idx: number; ox: number; oy: number } | null>(null)
  const d = theme === 'dark'

  const onMouseDown = (e: React.MouseEvent, idx: number) => {
    e.preventDefault()
    dragging.current = { idx, ox: e.clientX - tables[idx].x, oy: e.clientY - tables[idx].y }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return
    const { idx, ox, oy } = dragging.current
    setTables(ts => ts.map((t, i) => i === idx ? { ...t, x: e.clientX - ox, y: e.clientY - oy } : t))
  }

  if (view === 'erd') {
    return (
      <div className="flex flex-col" style={{ height: '100vh' }}>
        {/* Toolbar */}
        <div className={c('flex items-center justify-between px-6 py-3 border-b shrink-0',
          d ? 'bg-[#080D1A] border-indigo-500/15' : 'bg-white border-slate-200')}>
          <div>
            <p className="section-kicker text-indigo-500 mb-0.5">Database / ERD Mapper</p>
            <h2 className={c('font-extrabold text-lg', txt(theme))} style={{ letterSpacing: '-0.02em' }}>
              Entity Relationship Diagram
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button className={c('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border tr',
              d ? 'border-indigo-500/22 text-white/45 hover:text-white hover:border-indigo-500/40' : 'border-slate-200 text-slate-500 hover:text-slate-700')}>
              <Upload size={12} /> Upload
            </button>
            <div className={c('flex items-center rounded-xl overflow-hidden border',
              d ? 'border-indigo-500/20' : 'border-slate-200')}>
              <button onClick={() => setZoom(z => Math.max(0.35, z - 0.1))}
                className={c('px-2.5 py-1.5 tr', d ? 'text-white/50 hover:bg-white/5 hover:text-white' : 'text-slate-500 hover:bg-slate-50')}>
                <ZoomOut size={13} />
              </button>
              <span className={c('px-2 mono text-xs font-semibold', d ? 'text-white/40' : 'text-slate-400')}>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(2.5, z + 0.1))}
                className={c('px-2.5 py-1.5 tr', d ? 'text-white/50 hover:bg-white/5 hover:text-white' : 'text-slate-500 hover:bg-slate-50')}>
                <ZoomIn size={13} />
              </button>
            </div>
            <button onClick={() => setZoom(1)}
              className={c('p-1.5 rounded-xl border tr', d ? 'border-indigo-500/20 text-white/50 hover:text-white hover:bg-white/5' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}>
              <Maximize2 size={13} />
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div
          className="flex-1 blueprint relative overflow-hidden"
          onMouseMove={onMouseMove}
          onMouseUp={() => { dragging.current = null }}
          onMouseLeave={() => { dragging.current = null }}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: '60px 60px', position: 'absolute', inset: 0 }}>
            {/* SVG arrows */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="rgba(79,70,229,0.6)" />
                </marker>
              </defs>
              {RELATIONS.map((rel, i) => {
                const fromT = tables.find(t => t.name === rel.from)
                const toT = tables.find(t => t.name === rel.to)
                if (!fromT || !toT) return null
                const f = tableCenter(fromT)
                const t = tableCenter(toT)
                const mx = (f.x + t.x) / 2
                return (
                  <g key={i}>
                    <path
                      d={`M${f.x},${f.y} C${mx},${f.y} ${mx},${t.y} ${t.x},${t.y}`}
                      fill="none"
                      stroke="rgba(79,70,229,0.45)"
                      strokeWidth="1.5"
                      strokeDasharray="7 4"
                      markerEnd="url(#arrowhead)"
                    />
                  </g>
                )
              })}
            </svg>

            {/* Table nodes */}
            {tables.map((tbl, idx) => (
              <div
                key={idx}
                onMouseDown={e => onMouseDown(e, idx)}
                className="absolute rounded-2xl overflow-hidden select-none cursor-grab active:cursor-grabbing"
                style={{
                  left: tbl.x, top: tbl.y, width: W,
                  border: '1px solid rgba(79,70,229,0.35)',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.4), 0 0 20px rgba(79,70,229,0.1)',
                  zIndex: 2,
                }}>
                <div className="px-3.5 py-2.5 font-bold text-sm text-white"
                  style={{ background: '#4F46E5' }}>
                  {tbl.name}
                </div>
                {tbl.cols.map((col, ci) => (
                  <div key={ci}
                    className="flex items-center justify-between px-3.5 py-1.5 text-xs border-t"
                    style={{ background: '#0A0F1E', borderColor: 'rgba(79,70,229,0.15)' }}>
                    <div className="flex items-center gap-2">
                      {col.pk && <span className="font-bold text-amber-400 text-[9px]">PK</span>}
                      {col.fk && <span className="font-bold text-teal-400 text-[9px]">FK</span>}
                      <span className={c('mono', col.pk ? 'text-amber-300' : col.fk ? 'text-teal-300' : 'text-white/70')}>
                        {col.name}
                      </span>
                    </div>
                    <span className="mono text-[10px] text-white/30">{col.type}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Upload view
  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[900px] mx-auto px-10 py-12">
        <Breadcrumb items={['UBS', 'Dev Tools', 'Database']} theme={theme} />
        <h1 className="font-extrabold mb-8" style={{ fontSize: 40, letterSpacing: '-0.025em' }}><AuroraText>Database Tools</AuroraText></h1>

        <div className="grid grid-cols-2 gap-6">
          {/* Upload card */}
          <div className={c(card(theme), 'p-6')}>
            <p className={c('font-bold text-[15px] mb-4', txt(theme))}>Upload SQL Schema</p>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); setUploaded(true) }}
              onClick={() => setUploaded(v => !v)}
              className={c(
                'rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer tr mb-4',
                dragOver
                  ? 'border-indigo-500 bg-indigo-500/8'
                  : uploaded
                    ? d ? 'border-emerald-500/50 bg-emerald-500/6' : 'border-emerald-400 bg-emerald-50'
                    : d ? 'border-indigo-500/25 hover:border-indigo-500/50 hover:bg-indigo-500/4' : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40'
              )}>
              {uploaded ? (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-3">
                    <Check size={22} className="text-emerald-400" />
                  </div>
                  <p className={c('text-sm font-bold mb-1', d ? 'text-emerald-400' : 'text-emerald-600')}>schema.sql uploaded</p>
                  <p className={c('text-xs', muted(theme))}>12 tables · 47 columns · 8 relationships</p>
                </>
              ) : (
                <>
                  <div className={c('w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3',
                    d ? 'bg-indigo-500/12' : 'bg-indigo-50')}>
                    <Upload size={22} className="text-indigo-500" />
                  </div>
                  <p className={c('text-sm font-semibold mb-1', txt(theme))}>Drop your SQL schema</p>
                  <p className={c('text-xs', muted(theme))}>.sql · .ddl files supported</p>
                </>
              )}
            </div>
            {uploaded && (
              <p className={c('text-xs text-center', muted(theme))}>
                Schema parsed successfully — ready for ERD mapping
              </p>
            )}
          </div>

          {/* ERD link card */}
          <button onClick={() => setView('erd')}
            className={c(card(theme), 'p-6 text-left group tr rounded-2xl', d ? 'card-hover-dark' : 'card-hover-light')}>
            <div className="flex items-center justify-between mb-4">
              <p className={c('font-bold text-[15px]', txt(theme))}>ERD Mapper</p>
              <ArrowRight size={17} className={c('tr', d ? 'text-indigo-500/40 group-hover:text-indigo-400 group-hover:translate-x-0.5' : 'text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5')} />
            </div>

            {/* Mini ERD preview */}
            <div className="rounded-xl overflow-hidden mb-4" style={{ height: 160, position: 'relative', background: '#08101E' }}>
              <div className="absolute inset-0" style={{
                backgroundImage: 'radial-gradient(circle, rgba(79,70,229,0.15) 1px, transparent 1px)',
                backgroundSize: '16px 16px'
              }} />
              {INIT_TABLES.slice(0, 3).map((t, i) => (
                <div key={i}
                  className="absolute rounded-xl overflow-hidden"
                  style={{ left: `${12 + i * 30}%`, top: `${14 + (i % 2) * 38}%`, width: 80, border: '1px solid rgba(79,70,229,0.4)', boxShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
                  <div className="px-2 py-1 text-[8px] font-bold text-white"
                    style={{ background: '#4F46E5' }}>{t.name}</div>
                  {t.cols.slice(0, 2).map((col, ci) => (
                    <div key={ci} className="px-2 py-0.5 text-[7px] mono text-white/45 bg-[#0A0F1E] border-t border-indigo-500/15">{col.name}</div>
                  ))}
                </div>
              ))}
            </div>

            <p className={c('text-sm', muted(theme))}>
              Visualize your database schema as an interactive entity-relationship diagram with draggable table nodes.
            </p>
          </button>
        </div>
      </div>
    </div>
  )
}
