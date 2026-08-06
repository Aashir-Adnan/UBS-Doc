import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, ZoomIn, ZoomOut, Maximize2, Check, ArrowRight, AlertCircle } from 'lucide-react'
import { c, card, txt, muted, Breadcrumb } from '../lib'
import { useTheme } from '../app/ThemeContext'
import AuroraText from '../components/ui/aurora-text'
import { API_BASE_URL } from '../components/portal/config'
import SQLERDVisualizer from '../components/portal/SQLERDVisualizer'
import { parseSqlDump } from '../utils/sqlParser'
import { buildErdLayout, type TableNode, type TableRelation } from './erdLayout'
import type { Theme } from '../types'

interface Props { view: 'upload' | 'mapper' }

// Design markup from design/UBS Dev Tools Portal (1)/src/screens/DatabaseTools.tsx,
// split across two routes (the mock's internal `view` state becomes real
// navigation). Two independent real flows replace the mock's fake toggles:
//
// - Upload view (/tools/database): the design dropzone now runs a REAL
//   client-side parse (parseSqlDump, same as everywhere else in the portal)
//   the moment a file is picked, so the success line shows actual counts.
//   The "Upload & Mount DB" submit is FileUpload.jsx's handleSubmit ported
//   verbatim (same endpoint, same admin_email query param, same zip/text
//   handling) — see src/components/portal/FileUpload.jsx.
//
// - ERD Mapper view (/tools/database/mapper): the design blueprint canvas
//   (drag nodes, zoom toolbar, SVG bezier relations) is fed TableNode[] from
//   parseSqlDump() via src/screens/erdLayout.ts's grid-placement formula,
//   with its own upload/drop entry point. SQLERDVisualizer.jsx — the real,
//   pre-existing "Project DB Mapper" tool (own upload, own parser, own
//   drag/pan/zoom, orthogonal-layout ERD) — is mounted BELOW it, completely
//   unmodified, inside a design card() panel. The two are intentionally
//   decoupled: SQLERDVisualizer keeps its own internal state (it doesn't
//   expose it via props/callbacks, and adding that would mean editing
//   "untouched" logic), so the new canvas above is an additional, real,
//   testable visualization rather than a shared-state view onto the old
//   one. Its chrome renders via the .sql-erd-* / .file-upload-* rules
//   already carried over into src/styles/portal-compat.css.
export default function DatabaseTools({ view }: Props) {
  const { theme } = useTheme()
  return view === 'mapper' ? <MapperView theme={theme} /> : <UploadView theme={theme} />
}

// ---------------------------------------------------------------------------
// Upload view
// ---------------------------------------------------------------------------

const PREVIEW_TABLES = [
  { name: 'tenants', cols: ['id', 'name'] },
  { name: 'users', cols: ['id', 'tenant_id'] },
  { name: 'projects', cols: ['id', 'name'] },
]

function UploadView({ theme }: { theme: Theme }) {
  const navigate = useNavigate()
  const d = theme === 'dark'

  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<{ tables: number; cols: number; fks: number } | null>(null)
  const [parseError, setParseError] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploadResult, setUploadResult] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const pickFile = useCallback((f: File | null | undefined) => {
    setParsed(null)
    setParseError('')
    setUploadResult('')
    setFile(f ?? null)
    if (!f) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result || '')
        const tables = parseSqlDump(text)
        if (!tables.length) {
          setParseError('No CREATE TABLE statements found in this file.')
          return
        }
        const cols = tables.reduce((s, t) => s + (t.columns?.length || 0), 0)
        const fks = tables.reduce((s, t) => s + (t.foreignKeys?.length || 0), 0)
        setParsed({ tables: tables.length, cols, fks })
      } catch (err) {
        setParseError('Failed to parse SQL: ' + (err instanceof Error ? err.message : String(err)))
      }
    }
    reader.readAsText(f)
  }, [])

  // Verbatim from FileUpload.jsx's handleSubmit: same endpoint, same
  // admin_email query param, same zip/text content-type handling.
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setUploadResult('Select a file first')
      return
    }
    const formData = new FormData()
    formData.append('sqlFile', file)
    try {
      setLoading(true)
      setUploadResult('')
      const res = await fetch(`${API_BASE_URL}/api/gen/objects?admin_email=aashiradnan99@gmail.com`, {
        method: 'POST',
        body: formData,
      })
      const contentType = res.headers.get('content-type')
      if (contentType?.includes('application/zip')) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'GenOutput.zip'
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
        setUploadResult('ZIP downloaded successfully!')
      } else {
        const text = await res.text()
        setUploadResult(text)
      }
    } catch (err) {
      setUploadResult('Error: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[900px] mx-auto px-4 sm:px-6 lg:px-10 py-8 lg:py-12">
        <Breadcrumb items={['UBS', 'Dev Tools', 'Database']} theme={theme} />
        <h1 className="font-extrabold mb-8 screen-title"><AuroraText>Database Tools</AuroraText></h1>

        <div className="grid grid-cols-2 gap-6">
          {/* Upload card */}
          <div className={c(card(theme), 'p-6')}>
            <p className={c('font-bold text-[15px] mb-4', txt(theme))}>Upload SQL Schema</p>

            <input
              ref={inputRef}
              type="file"
              accept=".sql,.ddl"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]) }}
              onClick={() => inputRef.current?.click()}
              className={c(
                'rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer tr mb-4',
                dragOver
                  ? 'border-indigo-500 bg-indigo-500/8'
                  : parsed
                    ? d ? 'border-emerald-500/50 bg-emerald-500/6' : 'border-emerald-400 bg-emerald-50'
                    : parseError
                      ? d ? 'border-red-500/50 bg-red-500/6' : 'border-red-400 bg-red-50'
                      : d ? 'border-indigo-500/25 hover:border-indigo-500/50 hover:bg-indigo-500/4' : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40'
              )}>
              {parsed ? (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-3">
                    <Check size={22} className="text-emerald-400" />
                  </div>
                  <p className={c('text-sm font-bold mb-1', d ? 'text-emerald-400' : 'text-emerald-600')}>{file?.name} uploaded</p>
                  <p className={c('text-xs', muted(theme))}>{parsed.tables} tables · {parsed.cols} columns · {parsed.fks} relationships</p>
                </>
              ) : parseError ? (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-3">
                    <AlertCircle size={22} className="text-red-400" />
                  </div>
                  <p className={c('text-sm font-bold mb-1', d ? 'text-red-400' : 'text-red-600')}>{file?.name}</p>
                  <p className={c('text-xs', muted(theme))}>{parseError}</p>
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

            {parsed && (
              <p className={c('text-xs text-center mb-4', muted(theme))}>
                Schema parsed successfully — ready for ERD mapping
              </p>
            )}

            {file && (
              <form onSubmit={handleUpload} className="flex flex-col gap-3">
                <button type="submit" disabled={loading}
                  className={c('btn-primary w-full py-3 rounded-2xl text-sm', loading ? 'opacity-70 cursor-wait' : '')}>
                  {loading ? (
                    <span className="flex items-center justify-center gap-2.5">
                      <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent spin" />
                      Uploading &amp; mounting…
                    </span>
                  ) : 'Upload & Mount DB'}
                </button>
                {uploadResult && <pre className="file-upload-output">{uploadResult}</pre>}
              </form>
            )}
          </div>

          {/* ERD link card */}
          <button onClick={() => navigate('/tools/database/mapper')}
            className={c(card(theme), 'p-6 text-left group tr rounded-2xl', d ? 'card-hover-dark' : 'card-hover-light')}>
            <div className="flex items-center justify-between mb-4">
              <p className={c('font-bold text-[15px]', txt(theme))}>ERD Mapper</p>
              <ArrowRight size={17} className={c('tr', d ? 'text-indigo-500/40 group-hover:text-indigo-400 group-hover:translate-x-0.5' : 'text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5')} />
            </div>

            {/* Mini ERD preview (decorative only — the real canvas parses your schema) */}
            <div className="rounded-xl overflow-hidden mb-4" style={{ height: 160, position: 'relative', background: '#08101E' }}>
              <div className="absolute inset-0" style={{
                backgroundImage: 'radial-gradient(circle, rgba(79,70,229,0.15) 1px, transparent 1px)',
                backgroundSize: '16px 16px'
              }} />
              {PREVIEW_TABLES.map((t, i) => (
                <div key={i}
                  className="absolute rounded-xl overflow-hidden"
                  style={{ left: `${12 + i * 30}%`, top: `${14 + (i % 2) * 38}%`, width: 80, border: '1px solid rgba(79,70,229,0.4)', boxShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
                  <div className="px-2 py-1 text-[8px] font-bold text-white"
                    style={{ background: '#4F46E5' }}>{t.name}</div>
                  {t.cols.map((col, ci) => (
                    <div key={ci} className="px-2 py-0.5 text-[7px] mono text-white/45 bg-[#0A0F1E] border-t border-indigo-500/15">{col}</div>
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

// ---------------------------------------------------------------------------
// ERD Mapper view
// ---------------------------------------------------------------------------

const NODE_W = 228

function tableCenter(t: TableNode) {
  return { x: t.x + NODE_W / 2, y: t.y + 22 }
}

function MapperView({ theme }: { theme: Theme }) {
  const d = theme === 'dark'
  const [tables, setTables] = useState<TableNode[]>([])
  const [relations, setRelations] = useState<TableRelation[]>([])
  const [zoom, setZoom] = useState(1)
  const [parseError, setParseError] = useState('')
  const dragging = useRef<{ idx: number; ox: number; oy: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadSql = useCallback((text: string) => {
    try {
      const layout = buildErdLayout(text)
      if (!layout.tables.length) {
        setParseError('No CREATE TABLE statements found.')
        return
      }
      setTables(layout.tables)
      setRelations(layout.relations)
      setParseError('')
    } catch (err) {
      setParseError('Failed to parse SQL: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [])

  const pickFile = useCallback((f: File | null | undefined) => {
    if (!f) return
    const reader = new FileReader()
    reader.onload = (e) => loadSql(String(e.target?.result || ''))
    reader.readAsText(f)
  }, [loadSql])

  const onMouseDown = (e: React.MouseEvent, idx: number) => {
    e.preventDefault()
    dragging.current = { idx, ox: e.clientX - tables[idx].x, oy: e.clientY - tables[idx].y }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return
    const { idx, ox, oy } = dragging.current
    setTables((ts) => ts.map((t, i) => i === idx ? { ...t, x: e.clientX - ox, y: e.clientY - oy } : t))
  }

  return (
    <div className="flex flex-col" style={{ minHeight: '100vh' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".sql,.ddl,.txt"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0])}
      />

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
          <button onClick={() => fileInputRef.current?.click()}
            className={c('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border tr',
              d ? 'border-indigo-500/22 text-white/45 hover:text-white hover:border-indigo-500/40' : 'border-slate-200 text-slate-500 hover:text-slate-700')}>
            <Upload size={12} /> Upload
          </button>
          <div className={c('flex items-center rounded-xl overflow-hidden border',
            d ? 'border-indigo-500/20' : 'border-slate-200')}>
            <button onClick={() => setZoom((z) => Math.max(0.35, z - 0.1))}
              className={c('px-2.5 py-1.5 tr', d ? 'text-white/50 hover:bg-white/5 hover:text-white' : 'text-slate-500 hover:bg-slate-50')}>
              <ZoomOut size={13} />
            </button>
            <span className={c('px-2 mono text-xs font-semibold', d ? 'text-white/40' : 'text-slate-400')}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}
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

      {/* Canvas — real TableNode[] parsed from an uploaded/dropped schema via
          erdLayout.ts (parseSqlDump + grid placement), not the design's 5
          hardcoded tables. */}
      <div
        className="blueprint relative overflow-hidden"
        style={{ height: '62vh' }}
        onMouseMove={onMouseMove}
        onMouseUp={() => { dragging.current = null }}
        onMouseLeave={() => { dragging.current = null }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]) }}>
        {tables.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="text-center">
              <p className={c('text-sm font-semibold mb-1', d ? 'text-white/60' : 'text-slate-500')}>
                Drop a SQL schema here, or click Upload
              </p>
              {parseError && <p className="text-xs text-red-400 mt-1">{parseError}</p>}
            </div>
          </div>
        )}
        <div style={{ transform: `scale(${zoom})`, transformOrigin: '60px 60px', position: 'absolute', inset: 0 }}>
          {/* SVG arrows */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="rgba(79,70,229,0.6)" />
              </marker>
            </defs>
            {relations.map((rel, i) => {
              const fromT = tables.find((t) => t.name === rel.from)
              const toT = tables.find((t) => t.name === rel.to)
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
              key={tbl.name}
              onMouseDown={(e) => onMouseDown(e, idx)}
              className="absolute rounded-2xl overflow-hidden select-none cursor-grab active:cursor-grabbing"
              style={{
                left: tbl.x, top: tbl.y, width: NODE_W,
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

      {/* Existing Project DB Mapper (SQLERDVisualizer) — logic untouched,
          own upload/parse/drag/zoom/orthogonal-layout ERD, chrome via
          portal-compat.css (.sql-erd-*, ported verbatim from custom.css). */}
      <div className={c('p-6', d ? 'bg-[#080D1A]' : 'bg-slate-50')}>
        <div className={c(card(theme), 'p-5')}>
          <p className={c('font-bold text-[15px] mb-1', txt(theme))}>Project DB Mapper</p>
          <p className={c('text-xs mb-4', muted(theme))}>
            Upload a project schema to visualize it with the original drag/pan/zoom, orthogonal-layout ERD tool.
          </p>
          <div style={{ height: 560 }}>
            <SQLERDVisualizer />
          </div>
        </div>
      </div>
    </div>
  )
}
