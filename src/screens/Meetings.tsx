import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, ChevronRight, RefreshCw } from 'lucide-react'
import { c, card, txt, muted, Breadcrumb, chipMint, chipAmber, chipIndigo, chipRed, chipGray } from '../lib'
import { useTheme } from '../app/ThemeContext'
import type { Theme } from '../types'
import { useMeetingGate } from './meetingGate'
import { mwGet } from '../components/meetingWorkflow/api'

// Design markup from design/UBS Dev Tools Portal (1)/src/screens/Meetings.tsx,
// fed by the REAL meeting rows instead of the mock's MEETINGS array.
//
// The fetch is lifted out of src/components/meetingWorkflow/MeetingList.jsx
// rather than rendering that component: the design card needs
// {title, date/time, status, followUp, stage, attendees} laid out very
// differently from MeetingList's `.mw-meeting-card` markup, and its
// `onSelectMeeting(meeting)` callback contract belongs to the old page's local
// `view` state machine, which URLs replace here. The GET is byte-identical to
// MeetingList.jsx:26 — same path, same actionPerformerURDD query param, same
// `data.meetings || Array || data.return` unwrapping.
//
// MeetingList.jsx is left completely untouched (the pre-migration Docusaurus
// page still imports it), so its two label maps are re-declared below.
// Source of truth: src/components/meetingWorkflow/MeetingList.jsx lines 4-15.

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  transcribed: 'Transcribed',
  analyzed: 'Analyzed',
  tasks_generated: 'Tasks',
  approved: 'Approved',
  rejected: 'Rejected',
  report_ready: 'Report Ready',
  completed: 'Completed',
}

const STAGE_LABELS = ['Pre-Meeting', 'Transcribe', 'Analyze', 'Tasks', 'Report']

export interface MeetingRow {
  meeting_id: number | string
  title?: string | null
  status?: string | null
  scheduled_at?: string | null
  current_stage?: number | null
  parent_meeting_id?: number | string | null
  // Attendee count is the one design-card field with no guaranteed column on
  // the list row — rendered only when the backend actually sends one of these.
  participant_count?: number | null
  participants?: unknown
}

/* ── Field mapping: design mock → real row ────────────────────────────────────
   title      ← m.title
   date/time  ← m.scheduled_at (split into a mono date + time, mock had both)
   status     ← STATUS_LABEL[m.status] (mock's 3 statuses → the real 8)
   followUp   ← !!m.parent_meeting_id  (same signal MeetingList.jsx:97 uses)
   stage      ← m.current_stage ?? 0   (0-4, indexes STAGE_LABELS)
   attendees  ← participant_count / participants.length when present, else hidden
   The mock's `accent bar colour` derives from the mapped status group below.  */

type StatusTone = 'done' | 'active' | 'idle' | 'bad'

function statusTone(status?: string | null): StatusTone {
  switch (status) {
    case 'completed':
    case 'report_ready':
    case 'approved':
      return 'done'
    case 'transcribed':
    case 'analyzed':
    case 'tasks_generated':
      return 'active'
    case 'rejected':
      return 'bad'
    default:
      return 'idle'
  }
}

function attendeeCount(m: MeetingRow): number | null {
  if (typeof m.participant_count === 'number') return m.participant_count
  if (Array.isArray(m.participants)) return m.participants.length
  if (typeof m.participants === 'string') {
    try {
      const parsed = JSON.parse(m.participants)
      return Array.isArray(parsed) ? parsed.length : null
    } catch {
      return null
    }
  }
  return null
}

function formatWhen(scheduledAt?: string | null): { date: string; time: string } | null {
  if (!scheduledAt) return null
  const d = new Date(scheduledAt)
  if (Number.isNaN(d.getTime())) return null
  return {
    date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  }
}

export default function Meetings() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const d = theme === 'dark'
  const { ready, gateElement, actingUrdd, canCreate } = useMeetingGate()

  const [meetings, setMeetings] = useState<MeetingRow[]>([])
  // Starts true: the first paint happens before the fetch effect runs, and a
  // false here would flash the "No meetings yet" empty state on every visit.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  // Same call as MeetingList.jsx's refresh(). The old page force-remounted the
  // list (`listKey`) after create / stage completion; navigating back to this
  // route remounts the screen, so this effect is the replacement.
  const refresh = useCallback(async () => {
    // `ready` implies a resolved URDD, so this is the shouldn't-happen branch —
    // but `loading` defaults to true, so returning without clearing it would
    // leave the grid permanently blank (no cards, no empty state, no error).
    // Terminate the loading state and let the normal empty state render.
    if (actingUrdd == null) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const data = await mwGet(`/meeting/workflow/list?actionPerformerURDD=${actingUrdd}`)
      const list = data.meetings || (Array.isArray(data) ? data : data.return || [])
      setMeetings(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [actingUrdd])

  useEffect(() => { if (ready) void refresh() }, [ready, refresh])

  if (!ready) return <>{gateElement}</>

  const needle = q.trim().toLowerCase()
  const filtered = needle
    ? meetings.filter((m) => (m.title || '').toLowerCase().includes(needle))
    : meetings
  // Mock counted status === 'Scheduled'; the real equivalent is a meeting that
  // has not moved past stage 0 yet. Derived from `filtered`, not `meetings`, so
  // both halves of the count line always describe the same set — the mock mixed
  // a filtered total with an unfiltered breakdown, which reads as a bug once the
  // search box has anything in it.
  const upcoming = filtered.filter((m) => (m.current_stage ?? 0) === 0).length

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[1240px] mx-auto px-10 py-12">
        <Breadcrumb items={['UBS', 'Dev Tools', 'Meetings']} theme={theme} />

        <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h1 className="grad-text font-extrabold mb-2" style={{ fontSize: 40, letterSpacing: '-0.025em' }}>
              Meetings
            </h1>
            <p className={c('text-sm font-medium', muted(theme))}>
              {filtered.length} meeting{filtered.length === 1 ? '' : 's'} · {upcoming} upcoming
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className={c(
              'flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm',
              d ? 'bg-white/5 border-indigo-500/20 text-white' : 'bg-white border-slate-200 text-slate-700',
            )}>
              <Search size={14} className={muted(theme)} />
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search meetings…"
                className="bg-transparent outline-none w-52 text-inherit placeholder-inherit text-sm" />
            </div>
            <button type="button" onClick={() => void refresh()} disabled={loading}
              title="Refresh"
              className={c('p-2.5 rounded-xl tr',
                d ? 'text-white/50 hover:bg-white/6' : 'text-slate-400 hover:bg-slate-100',
                loading ? 'opacity-50' : '')}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
            <button type="button"
              onClick={() => navigate('/tools/meetingWorkflow/create')}
              disabled={!canCreate}
              title={canCreate ? undefined : "You need the 'add_meetings' permission to create meetings."}
              className={c('btn-primary flex items-center gap-2 px-5 py-2.5 text-sm',
                canCreate ? '' : 'opacity-50 cursor-not-allowed')}>
              <Plus size={14} /> New Meeting
            </button>
          </div>
        </div>

        {error && (
          <div className={c('rounded-xl px-4 py-3 mb-5 text-sm font-medium border',
            d ? 'bg-red-500/10 border-red-500/25 text-red-300' : 'bg-red-50 border-red-200 text-red-600')}>
            {error}
          </div>
        )}

        {filtered.length === 0 && !loading && (
          <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
            <p className={c('text-sm font-medium mb-4', muted(theme))}>
              {q ? 'No meetings match your search.' : 'No meetings yet.'}
            </p>
            {!q && (
              <button type="button"
                onClick={() => navigate('/tools/meetingWorkflow/create')}
                disabled={!canCreate}
                title={canCreate ? undefined : "You need the 'add_meetings' permission to create meetings."}
                className={c('btn-primary px-5 py-2.5 text-sm', canCreate ? '' : 'opacity-50 cursor-not-allowed')}>
                Schedule your first meeting
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((m) => (
            <MeetingCard key={String(m.meeting_id)} m={m} theme={theme}
              onOpen={() => navigate(`/tools/meetingWorkflow/${m.meeting_id}`)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function MeetingCard({ m, theme, onOpen }: { m: MeetingRow; theme: Theme; onOpen: () => void }) {
  const d = theme === 'dark'
  const tone = statusTone(m.status)
  const stage = m.current_stage ?? 0
  const when = formatWhen(m.scheduled_at)
  const attendees = attendeeCount(m)

  const statusChip =
    tone === 'done' ? chipMint(theme) :
    tone === 'active' ? chipIndigo(theme) :
    tone === 'bad' ? chipRed(theme) :
    chipGray(theme)

  const accent =
    tone === 'done' ? '#10B981' :
    tone === 'active' ? '#4F46E5' :
    tone === 'bad' ? '#EF4444' :
    d ? 'rgba(255,255,255,0.07)' : '#E2E8F0'

  return (
    <div role="button" tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      className={c(card(theme), 'overflow-hidden group tr cursor-pointer',
        d ? 'card-hover-dark' : 'card-hover-light')}>
      {/* Colour accent top bar — driven by the mapped status group. */}
      <div className="h-[3px]" style={{ background: accent }} />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className={c('font-bold text-sm leading-snug flex-1', txt(theme))}>
            {m.title || 'Untitled meeting'}
          </h3>
          <span className={c('shrink-0 p-1.5 rounded-lg tr opacity-0 group-hover:opacity-100',
            d ? 'text-white/50' : 'text-slate-400')}>
            <ChevronRight size={14} />
          </span>
        </div>

        <div className="flex items-center gap-2.5 mb-4 flex-wrap">
          {when && (
            <span className={c('mono text-[11px] font-medium', muted(theme))}>
              {when.date} · {when.time}
            </span>
          )}
          <span className={statusChip}>{STATUS_LABEL[m.status || ''] || m.status || 'pending'}</span>
          {!!m.parent_meeting_id && <span className={chipAmber(theme)}>Follow-up</span>}
          {attendees != null && (
            <span className={c('ml-auto text-[11px] font-medium', muted(theme))}>
              {attendees} attendee{attendees === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {/* Stage rail — 5 pips, identical labels/order to WorkflowPanel's STAGES. */}
        <div className={c('pt-4 border-t', d ? 'border-white/6' : 'border-slate-100')}>
          <div className="flex items-center gap-1">
            {STAGE_LABELS.map((label, si) => (
              <div key={label} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5 flex-1">
                  <div className={c('w-2 h-2 rounded-full tr',
                    si < stage ? 'bg-emerald-400 pip-mint' :
                    si === stage ? 'bg-indigo-500 pip-active' :
                    d ? 'bg-white/14' : 'bg-slate-200',
                  )} />
                  <span className={c('text-[9px] font-semibold leading-none text-center',
                    si < stage ? (d ? 'text-emerald-400' : 'text-emerald-600') :
                    si === stage ? 'text-indigo-500' :
                    d ? 'text-white/22' : 'text-slate-300',
                  )}>{label}</span>
                </div>
                {si < STAGE_LABELS.length - 1 && (
                  <div className={c('h-px w-3 mb-4 mx-0.5',
                    si < stage ? 'bg-emerald-400/50' : d ? 'bg-white/8' : 'bg-slate-200',
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
