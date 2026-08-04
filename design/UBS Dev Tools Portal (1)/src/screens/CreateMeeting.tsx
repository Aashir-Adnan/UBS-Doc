import { useState } from 'react'
import { ChevronLeft, Check, Calendar, Clock } from 'lucide-react'
import { c, card, txt, muted, divider, inputCls, Breadcrumb, Checkbox } from '../lib'
import type { Screen, Theme } from '../types'

interface Props { navigate: (s: Screen) => void; theme: Theme }

const PARTICIPANTS = [
  { name: 'Sarah Martinez', initials: 'SM', color: '#4F46E5', me: true },
  { name: 'James Rodriguez', initials: 'JR', color: '#7C3AED', me: false },
  { name: 'Ana Torres', initials: 'AT', color: '#10B981', me: false },
  { name: 'Dev Patel', initials: 'DP', color: '#F59E0B', me: false },
  { name: 'Chris Liu', initials: 'CL', color: '#3B82F6', me: false },
  { name: 'Mia Kim', initials: 'MK', color: '#EC4899', me: false },
]

const REPOS = ['auth-service', 'api-gateway', 'tenant-admin-ui', 'db-migrations', 'erd-mapper']

const FEATURES: Record<string, string[]> = {
  'auth-service': ['OAuth2 Flow', 'Token Refresh', 'RBAC Middleware', 'Session Mgmt'],
  'api-gateway': ['Rate Limiting', 'Request Routing', 'Circuit Breaker', 'Logging'],
  'tenant-admin-ui': ['Provisioning UI', 'Role Assignment', 'Audit Logs', 'Settings'],
  'db-migrations': ['Schema Versioning', 'Seed Data', 'Rollback Scripts'],
  'erd-mapper': ['Canvas Render', 'Drag & Drop', 'Export SVG'],
}

export default function CreateMeeting({ navigate, theme }: Props) {
  const [title, setTitle] = useState('')
  const [agenda, setAgenda] = useState('')
  const [hour, setHour] = useState(10)
  const [minute, setMinute] = useState(0)
  const [selectedParts, setSelectedParts] = useState(new Set(['Sarah Martinez']))
  const [selectedRepos, setSelectedRepos] = useState(new Set<string>())
  const [selectedFeatures, setSelectedFeatures] = useState(new Set<string>())

  const d = theme === 'dark'

  const toggleParticipant = (name: string) => {
    if (name === 'Sarah Martinez') return
    setSelectedParts(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n })
  }
  const toggleRepo = (r: string) => {
    setSelectedRepos(s => { const n = new Set(s); n.has(r) ? n.delete(r) : n.add(r); return n })
  }
  const toggleFeature = (f: string) => {
    setSelectedFeatures(s => { const n = new Set(s); n.has(f) ? n.delete(f) : n.add(f); return n })
  }

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[1240px] mx-auto px-10 py-12">
        <Breadcrumb items={['UBS', 'Dev Tools', 'Meetings', 'New Meeting']} theme={theme} />

        <h1 className="grad-text font-extrabold mb-9" style={{ fontSize: 40, letterSpacing: '-0.025em' }}>
          New Meeting
        </h1>

        <div className="grid grid-cols-2 gap-8">
          {/* ── Left column ─────────────────────────────────── */}
          <div className="flex flex-col gap-5">
            {/* Title */}
            <FormCard title="Title" theme={theme}>
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Sprint Planning Q3 2025"
                className={c(inputCls(theme), 'text-sm')} />
            </FormCard>

            {/* Date + Time */}
            <FormCard title="Date & Time" theme={theme}>
              <div className="flex items-center justify-center gap-6 mb-5">
                <Spinner value={hour} min={0} max={23} onChange={setHour} theme={theme} label="HR" />
                <div className={c('font-mono text-5xl font-extrabold pb-6', d ? 'text-indigo-500/40' : 'text-indigo-200')}>:</div>
                <Spinner value={minute} min={0} max={59} onChange={setMinute} theme={theme} label="MIN" />
              </div>
              <div className={c('flex items-center gap-2.5 px-4 py-2.5 rounded-xl border tr',
                d ? 'bg-white/5 border-indigo-500/20' : 'bg-white border-slate-200')}>
                <Calendar size={14} className={muted(theme)} />
                <input type="date" defaultValue="2025-07-30"
                  className={c('bg-transparent outline-none text-sm font-mono flex-1', d ? 'text-white' : 'text-slate-700')} />
              </div>
            </FormCard>

            {/* Agenda */}
            <FormCard title="Agenda" theme={theme}>
              <textarea value={agenda} onChange={e => setAgenda(e.target.value)}
                placeholder="Outline the meeting agenda and discussion points…"
                rows={4}
                className={c(inputCls(theme), 'text-sm resize-none')} />
            </FormCard>

            {/* Participants */}
            <FormCard title="Participants" theme={theme}>
              <div className="flex flex-wrap gap-3">
                {PARTICIPANTS.map(p => (
                  <button key={p.name} onClick={() => toggleParticipant(p.name)}
                    className="relative flex flex-col items-center gap-1.5 group/p">
                    <div className={c(
                      'w-11 h-11 rounded-full flex items-center justify-center text-white text-xs font-bold tr relative',
                      selectedParts.has(p.name) ? 'ring-2 ring-offset-2' : 'opacity-38 grayscale'
                    )}
                      style={{ background: p.color, '--tw-ring-color': p.color } as any}>
                      {p.initials}
                      {selectedParts.has(p.name) && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center border-2 border-white">
                          <Check size={8} strokeWidth={3} color="white" />
                        </div>
                      )}
                    </div>
                    <span className={c('text-[9px] font-semibold', muted(theme))}>
                      {p.me ? 'You' : p.name.split(' ')[0]}
                    </span>
                  </button>
                ))}
              </div>
            </FormCard>
          </div>

          {/* ── Right column — Scope ──────────────────────── */}
          <div className={c(card(theme), 'p-6 h-fit')}>
            <p className={c('section-kicker mb-4', d ? 'text-white/30' : 'text-slate-400')}>Scope</p>

            {/* Repos */}
            <div className={c('rounded-xl p-4 mb-4 border', d ? 'bg-white/[0.03] border-indigo-500/15' : 'bg-slate-50 border-slate-200')}>
              <p className={c('text-xs font-bold mb-3', txt(theme))}>Repositories</p>
              <div className="flex flex-col gap-2.5">
                {REPOS.map(r => (
                  <label key={r} className="flex items-center gap-3 cursor-pointer">
                    <Checkbox checked={selectedRepos.has(r)} onChange={() => toggleRepo(r)} theme={theme} />
                    <span className={c('text-xs font-mono font-medium', d ? 'text-white/65' : 'text-slate-600')}>{r}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Features */}
            <div className={c('rounded-xl p-4 border', d ? 'bg-white/[0.03] border-indigo-500/15' : 'bg-slate-50 border-slate-200')}>
              <p className={c('text-xs font-bold mb-3', txt(theme))}>Features</p>
              {selectedRepos.size === 0 ? (
                <p className={c('text-xs italic', muted(theme))}>Select a repository to view features.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {REPOS.filter(r => selectedRepos.has(r)).map(r => (
                    <div key={r}>
                      <p className="section-kicker text-indigo-500 mb-2">{r}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(FEATURES[r] || []).map(f => (
                          <button key={f} onClick={() => toggleFeature(f)}
                            className={c('chip tr',
                              selectedFeatures.has(f)
                                ? 'bg-indigo-600 text-white border border-indigo-500'
                                : d
                                  ? 'bg-white/6 text-white/50 border border-white/8 hover:bg-indigo-500/12 hover:text-indigo-300'
                                  : 'bg-white text-slate-500 border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600'
                            )}>
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CTA */}
        <button onClick={() => navigate('meetings-transcribe')}
          className="btn-primary w-full mt-8 py-4 text-base rounded-2xl">
          Create Meeting
        </button>
      </div>
    </div>
  )
}

function FormCard({ title, theme, children }: { title: string; theme: Theme; children: React.ReactNode }) {
  const d = theme === 'dark'
  return (
    <div className={c(card(theme), 'p-5')}>
      <p className={c('section-kicker mb-3', d ? 'text-white/30' : 'text-slate-400')}>{title}</p>
      {children}
    </div>
  )
}

function Spinner({ value, min, max, onChange, theme, label }: {
  value: number; min: number; max: number; onChange: (v: number) => void; theme: Theme; label: string
}) {
  const d = theme === 'dark'
  return (
    <div className="flex flex-col items-center gap-2">
      <button onClick={() => onChange(value >= max ? min : value + 1)}
        className={c('text-xs font-bold px-3 py-1.5 rounded-lg tr',
          d ? 'text-white/25 hover:text-indigo-300 hover:bg-indigo-500/12' : 'text-slate-300 hover:text-indigo-600 hover:bg-indigo-50')}>
        ▲
      </button>
      <div className={c('rounded-2xl px-5 py-3 text-center',
        d ? 'bg-indigo-500/12 border border-indigo-500/22' : 'bg-indigo-50 border border-indigo-100')}>
        <span className="grad-text font-extrabold mono" style={{ fontSize: 46 }}>
          {String(value).padStart(2, '0')}
        </span>
        <p className={c('text-[9px] font-black tracking-widest mt-1', d ? 'text-white/22' : 'text-slate-300')}>{label}</p>
      </div>
      <button onClick={() => onChange(value <= min ? max : value - 1)}
        className={c('text-xs font-bold px-3 py-1.5 rounded-lg tr',
          d ? 'text-white/25 hover:text-indigo-300 hover:bg-indigo-500/12' : 'text-slate-300 hover:text-indigo-600 hover:bg-indigo-50')}>
        ▼
      </button>
    </div>
  )
}
