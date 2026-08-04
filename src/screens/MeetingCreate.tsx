import { useNavigate } from 'react-router-dom'
import { c, muted, Breadcrumb } from '../lib'
import { useTheme } from '../app/ThemeContext'
import { useMeetingGate } from './meetingGate'
import CreateMeeting from '../components/meetingWorkflow/CreateMeeting'

// Design chrome from design/UBS Dev Tools Portal (1)/src/screens/CreateMeeting.tsx
// (aurora background, breadcrumb, gradient "New Meeting" H1, two-column body)
// wrapped around the REAL, UNMODIFIED CreateMeeting component.
//
// The mock's three interactive pieces are close cousins of the real ones —
// hour/minute spinners ≈ DigitalClock, avatar row ≈ ParticipantsPicker,
// repo checkboxes + feature chips ≈ ScopePicker — but the real component is
// backed by live data (GET /portal/users/list, GET /tracked/repos/features/list,
// GET /repos/tenant/list via listTenantRepos) and by the tenant-filtering
// behaviour on POST /meeting/workflow/create, where a partially-dropped repo
// scope produces a notice instead of a navigation. Rebuilding that from the
// mock would mean re-deriving those flows, so the component is mounted as-is
// and pushed toward the design purely through the "Meetings design overrides
// (Task 14)" section in src/styles/portal-compat.css. No logic edits.
//
// onCreated: CreateMeeting.jsx calls `onCreated?.()` with NO argument (line 420,
// and again from the "Go to meetings" button at line 473) — the new meeting's id
// is never handed back — so this navigates to the list, exactly like the old
// page's handleCreated did (setView('list')). The list refetches on mount,
// which replaces the old page's `listKey` force-remount.
export default function MeetingCreate() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const d = theme === 'dark'
  const { ready, gateElement, actingUrdd, canCreate, userEmail } = useMeetingGate()

  if (!ready) return <>{gateElement}</>

  const toList = () => navigate('/tools/meetingWorkflow')

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[1240px] mx-auto px-10 py-12">
        <Breadcrumb items={['UBS', 'Dev Tools', 'Meetings', 'New Meeting']} theme={theme} />

        <div className="flex items-end justify-between gap-4 mb-9 flex-wrap">
          <div>
            <h1 className="grad-text font-extrabold mb-2" style={{ fontSize: 40, letterSpacing: '-0.025em' }}>
              New Meeting
            </h1>
            <p className={c('text-sm font-medium', muted(theme))}>
              Schedule a meeting and pick the repositories and features it covers.
            </p>
          </div>
          <button type="button" onClick={toList}
            className={c('text-xs font-semibold tr',
              d ? 'text-white/30 hover:text-white/60' : 'text-slate-400 hover:text-indigo-600')}>
            &larr; Meetings
          </button>
        </div>

        <div className="mw-create-screen">
          <CreateMeeting
            actingUrdd={actingUrdd}
            onCreated={toList}
            onCancel={toList}
            userEmail={userEmail}
            canCreate={canCreate}
          />
        </div>
      </div>
    </div>
  )
}
