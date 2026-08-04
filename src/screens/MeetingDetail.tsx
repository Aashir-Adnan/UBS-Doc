import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { c, card, txt, muted } from '../lib'
import { useTheme } from '../app/ThemeContext'
import { useMeetingGate } from './meetingGate'
import { mwGet } from '../components/meetingWorkflow/api'
import WorkflowPanel from '../components/meetingWorkflow/WorkflowPanel'
import type { MeetingRow } from './Meetings'

// Stage chrome reference: design/UBS Dev Tools Portal (1)/src/screens/
// MeetingTranscribe.tsx + MeetingAnalyze.tsx — a breadcrumb strip, then the
// full-width 5-stage nav card, then the stage body. Those mocks carry no page
// H1, and WorkflowPanel already renders the meeting title / schedule / status
// in its own `.mw-panel-header`, so this screen deliberately adds no second
// title: the breadcrumb's trailing crumb carries the name and the panel header
// is restyled into the design's title block via CSS.
//
// WorkflowPanel is rendered COMPLETELY UNMODIFIED — no new props, no edits to
// the file. Its five stages (PreMeeting / LiveTranscribe / Analyze / Tasks /
// Report) stay internal to the panel and are NOT routes: which stages exist and
// which are reachable is data-dependent (current_stage, transcript presence,
// permission flags), so a URL per stage would invent states the backend does
// not model. Only the stage rail's look moves toward the design, via CSS.

// ── How the meeting object is obtained ──────────────────────────────────────
// The old page never fetched it: MeetingList passed the whole row up through
// onSelectMeeting(meeting) and the page held it in `selectedMeeting`. With the
// URL as the source of truth only an id is available, so the row is fetched
// from GET /meeting/workflow/meeting — the same endpoint, same query params
// (meeting_id + actionPerformerURDD), that WorkflowPanel.jsx:933 already calls
// on mount; `data.meeting` is the full meeting row (WorkflowPanel reads
// detail.meeting.status / .transcript / .pre_meeting_notes / .analysis_json
// from it), a superset of the list row the old page passed in.
//
// Tradeoff, accepted deliberately: this means GET /meeting/workflow/meeting is
// issued twice on a detail load — once here to resolve the row, once by the
// panel to load its detail bundle. Avoiding it would require feeding the panel
// a `detail`/`meetingId` prop, i.e. modifying WorkflowPanel, which this task
// forbids. The alternative source — GET /meeting/workflow/list, then find the
// id — was rejected: it fetches every meeting to render one, and it cannot
// surface the per-meeting 403 reason below.

// Mirrors WorkflowPanel.jsx's readBlock() (line 883) so a bookmarked meeting
// outside the actor's tenant lands on the same "Access blocked" message here
// that the panel would have shown. Kept as a local copy because the original is
// not exported and WorkflowPanel.jsx must not be edited.
function readBlock(err: unknown): { blocked: boolean; reason: string | null } {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  let reason: string | null = null
  let is403 = /not in your tenant/i.test(msg)
  try {
    const parsed = JSON.parse(msg)
    if (parsed?.statusCode === 403) is403 = true
    if (parsed?.message) reason = parsed.message
  } catch {
    if (is403) reason = msg
  }
  return { blocked: is403, reason }
}

export default function MeetingDetail() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { meetingId } = useParams<{ meetingId: string }>()
  const d = theme === 'dark'
  const { ready, gateElement, actingUrdd } = useMeetingGate()

  const [meeting, setMeeting] = useState<MeetingRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [blockReason, setBlockReason] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    if (!ready || !meetingId || actingUrdd == null) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setBlocked(false)
    setBlockReason(null)
    setMeeting(null)
    mwGet(`/meeting/workflow/meeting?meeting_id=${meetingId}&actionPerformerURDD=${actingUrdd}`)
      .then((data: { meeting?: MeetingRow }) => {
        if (cancelled) return
        if (data?.meeting) setMeeting(data.meeting)
        else setError('Meeting not found.')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const { blocked: isBlocked, reason } = readBlock(e)
        if (isBlocked) { setBlocked(true); setBlockReason(reason) }
        else setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ready, meetingId, actingUrdd])

  // Old page: handleFollowUpCreated(newMeeting) → bail without an id, otherwise
  // select it and switch to the meeting view. Same guard, navigation instead of
  // local state. WorkflowPanel fires this both for a newly created follow-up and
  // for its "↳ Follow-up to <parent>" link, and both carry a meeting row.
  const handleFollowUpCreated = useCallback((next: MeetingRow | null | undefined) => {
    if (!next?.meeting_id) return
    navigate(`/tools/meetingWorkflow/${next.meeting_id}`)
  }, [navigate])

  // Old page: handleStageComplete bumped `listKey` so the meetings list would
  // refetch on the way back. The list screen now refetches on mount, so there
  // is nothing left to do — but WorkflowPanel's inferred prop type requires the
  // callback, so it stays as an explicit no-op rather than being dropped.
  const handleStageComplete = useCallback(() => {}, [])

  if (!ready) return <>{gateElement}</>

  const title = meeting?.title || (loading ? 'Loading…' : 'Meeting')

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[1240px] mx-auto px-10 py-10">
        <div className="flex items-center justify-between gap-4 mb-6">
          <nav className="flex items-center gap-1.5">
            {['UBS', 'Dev Tools', 'Meetings', title].map((item, i, all) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className={d ? 'text-white/20' : 'text-slate-300'}>/</span>}
                <span className={c('text-xs font-semibold tr',
                  i === all.length - 1
                    ? (d ? 'text-indigo-400' : 'text-indigo-600')
                    : (d ? 'text-white/35' : 'text-slate-400'))}>{item}</span>
              </span>
            ))}
          </nav>
          <button type="button" onClick={() => navigate('/tools/meetingWorkflow')}
            className={c('text-xs font-semibold tr shrink-0',
              d ? 'text-white/30 hover:text-white/60' : 'text-slate-400 hover:text-indigo-600')}>
            &larr; Meetings
          </button>
        </div>

        {loading && (
          <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
            <p className={c('text-sm font-medium m-0', muted(theme))}>Loading meeting…</p>
          </div>
        )}

        {!loading && blocked && (
          <div className={c(card(theme), 'rounded-2xl px-8 py-12 text-center')}>
            <h2 className={c('font-extrabold text-lg mb-2', txt(theme))}>Access blocked</h2>
            <p className={c('text-sm m-0', muted(theme))}>
              {blockReason || "You don't have access to this meeting."}
            </p>
          </div>
        )}

        {!loading && !blocked && error && (
          <div className={c(card(theme), 'rounded-2xl px-8 py-12 text-center')}>
            <h2 className={c('font-extrabold text-lg mb-2', txt(theme))}>Could not open this meeting</h2>
            <p className={c('text-sm m-0', muted(theme))}>{error}</p>
          </div>
        )}

        {meeting && (
          <div className="mw-detail-screen">
            <WorkflowPanel
              meeting={meeting}
              actingUrdd={actingUrdd}
              onStageComplete={handleStageComplete}
              onFollowUpCreated={handleFollowUpCreated}
            />
          </div>
        )}
      </div>
    </div>
  )
}
