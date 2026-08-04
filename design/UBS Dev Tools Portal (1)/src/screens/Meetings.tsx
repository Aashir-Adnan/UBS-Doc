import { useState } from 'react'
import { Search, Plus, ChevronRight } from 'lucide-react'
import { c, card, txt, muted, sub, divider, Breadcrumb, chipMint, chipAmber, chipIndigo, chipGray } from '../lib'
import type { Screen, Theme } from '../types'

interface Props { navigate: (s: Screen) => void; theme: Theme }

const STAGES = ['Pre-Meeting', 'Transcribe', 'Analyze', 'Tasks', 'Report']

const MEETINGS = [
  { title: 'Sprint Planning — Q3 2025', date: '2025-07-28', time: '09:00 AM', status: 'Completed', followUp: true, stage: 4, attendees: 6 },
  { title: 'Architecture Review · Auth Service Refactor', date: '2025-07-29', time: '02:30 PM', status: 'In Progress', followUp: false, stage: 2, attendees: 4 },
  { title: 'Backend Sync — Tenant Migration Plan', date: '2025-07-30', time: '11:00 AM', status: 'Scheduled', followUp: false, stage: 0, attendees: 5 },
  { title: 'Design System Audit & Component Library', date: '2025-07-31', time: '10:00 AM', status: 'Scheduled', followUp: false, stage: 0, attendees: 3 },
  { title: 'Post-Mortem: API Gateway Outage (P0)', date: '2025-07-25', time: '04:00 PM', status: 'Completed', followUp: true, stage: 4, attendees: 8 },
  { title: 'Q3 OKR Alignment — Engineering', date: '2025-08-01', time: '03:00 PM', status: 'Scheduled', followUp: false, stage: 0, attendees: 12 },
]

export default function Meetings({ navigate, theme }: Props) {
  const [q, setQ] = useState('')
  const d = theme === 'dark'
  const filtered = MEETINGS.filter(m => m.title.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[1240px] mx-auto px-10 py-12">
        <Breadcrumb items={['UBS', 'Dev Tools', 'Meetings']} theme={theme} />

        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="grad-text font-extrabold mb-2" style={{ fontSize: 40, letterSpacing: '-0.025em' }}>
              Meetings
            </h1>
            <p className={c('text-sm font-medium', muted(theme))}>
              {filtered.length} meetings · {MEETINGS.filter(m => m.status === 'Scheduled').length} upcoming
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className={c(
              'flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm',
              d ? 'bg-white/5 border-indigo-500/20 text-white' : 'bg-white border-slate-200 text-slate-700'
            )}>
              <Search size={14} className={muted(theme)} />
              <input value={q} onChange={e => setQ(e.target.value)}
                placeholder="Search meetings…"
                className="bg-transparent outline-none w-52 text-inherit placeholder-inherit text-sm" />
            </div>
            <button onClick={() => navigate('meetings-create')}
              className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm">
              <Plus size={14} /> New Meeting
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {filtered.map((m, i) => (
            <MeetingCard key={i} m={m} theme={theme} navigate={navigate} />
          ))}
        </div>
      </div>
    </div>
  )
}

function MeetingCard({ m, theme, navigate }: { m: typeof MEETINGS[0]; theme: Theme; navigate: (s: Screen) => void }) {
  const d = theme === 'dark'

  const statusChip =
    m.status === 'Completed' ? chipMint(theme) :
    m.status === 'In Progress' ? chipIndigo(theme) :
    chipGray(theme)

  return (
    <div className={c(card(theme), 'overflow-hidden group tr', d ? 'card-hover-dark' : 'card-hover-light')}>
      {/* Color accent top bar */}
      <div className="h-[3px]" style={{
        background: m.status === 'Completed'
          ? '#10B981'
          : m.status === 'In Progress'
            ? '#4F46E5'
            : d ? 'rgba(255,255,255,0.07)' : '#E2E8F0'
      }} />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className={c('font-bold text-sm leading-snug flex-1', txt(theme))}>{m.title}</h3>
          <button onClick={() => navigate('meetings-transcribe')}
            className={c('shrink-0 p-1.5 rounded-lg tr opacity-0 group-hover:opacity-100',
              d ? 'hover:bg-white/8 text-white/50' : 'hover:bg-slate-100 text-slate-400')}>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2.5 mb-4 flex-wrap">
          <span className={c('mono text-[11px] font-medium', muted(theme))}>{m.date} · {m.time}</span>
          <span className={statusChip}>{m.status}</span>
          {m.followUp && <span className={chipAmber(theme)}>Follow-up</span>}
          <span className={c('ml-auto text-[11px] font-medium', muted(theme))}>{m.attendees} attendees</span>
        </div>

        {/* Stage pips */}
        <div className={c('pt-4 border-t', d ? 'border-white/6' : 'border-slate-100')}>
          <div className="flex items-center gap-1">
            {STAGES.map((stage, si) => (
              <div key={si} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5 flex-1">
                  <div className={c('w-2 h-2 rounded-full tr',
                    si < m.stage ? 'bg-emerald-400 pip-mint' :
                    si === m.stage ? 'bg-indigo-500 pip-active' :
                    d ? 'bg-white/14' : 'bg-slate-200'
                  )} />
                  <span className={c('text-[9px] font-semibold leading-none text-center',
                    si < m.stage ? d ? 'text-emerald-400' : 'text-emerald-600' :
                    si === m.stage ? 'text-indigo-500' :
                    d ? 'text-white/22' : 'text-slate-300'
                  )}>
                    {stage}
                  </span>
                </div>
                {si < STAGES.length - 1 && (
                  <div className={c('h-px w-3 mb-4 mx-0.5',
                    si < m.stage ? 'bg-emerald-400/50' : d ? 'bg-white/8' : 'bg-slate-200'
                  )} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
