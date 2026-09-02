import type { ReactNode } from 'react'
import { c, card, txt, muted } from '../lib'
import { useTheme } from '../app/ThemeContext'
import { useAuthTyped } from '../components/portal/authTypes'
import AccessState from '../components/guards/AccessState'
import { useActingUrdd } from '../components/portal/tenantProjects/useActingUrdd'
import { useActingPermissions } from '../components/portal/tenantProjects/useActingPermissions'

// Shared gate for the three Meetings screens, extracted verbatim from the old
// page's guard sequence (src/pages/tools/meetingWorkflow.jsx lines 50-85).
//
// That page ran five layers in order:
//   1. auth loading / portal-access loading  → "Loading…"
//   2. !user                                 → PortalSignIn
//   3. !canAccess                            → AccessRestricted
//   4. idStatus loading|idle / error / pending
//   5. content
//
// Layers 1-3 are now route-level: every /tools/* route in src/app/routes.tsx is
// wrapped in <ToolGuard> (auth + usePortalAccess → AccessState loading /
// restricted), which sits under <SiteGate> (the sign-in wall). This hook owns
// ONLY layer 4 — the URDD resolution the route guard does not cover — plus the
// `canCreate` permission read the old page threaded into MeetingList /
// CreateMeeting.
//
// The old page's inline `.portal-section` markup for the three URDD states is
// replaced by the design's AccessState card (loading / pending) and a matching
// glass error card, so the gate looks like the rest of the revamped shell. The
// state machine itself — which status maps to which screen — is unchanged.
export interface MeetingGate {
  /** true only when a URDD is resolved and the screen may render its content. */
  ready: boolean
  /** What to render instead of the content while !ready. null once ready. */
  gateElement: ReactNode
  /** Active URDD id, threaded into every backend call as actionPerformerURDD. */
  actingUrdd: number | null
  /**
   * Mirrors the old page exactly: `!permsLoaded || has('add_meetings')`.
   * Fails OPEN while permissions are still loading so nothing flickers
   * disabled; the server's 403 remains the real enforcement.
   */
  canCreate: boolean
  /** Signed-in user's email — CreateMeeting's `userEmail` prop. */
  userEmail: string | null
}

// useActingUrdd.js re-exports the auth context's `user` as `me`, and authStore's
// createContext(null) makes tsc infer that as `null` (the same inference problem
// authTypes.ts documents). Re-typed here to the real runtime shape.
interface ActingUrddResult {
  status: 'idle' | 'loading' | 'ready' | 'pending' | 'error'
  urdd: number | null
  me: { email?: string | null } | null
  error: string | null
}

export function useMeetingGate(): MeetingGate {
  const { theme } = useTheme()
  const { user } = useAuthTyped()
  const { status: idStatus, urdd: actingUrdd, me, error: idError } =
    useActingUrdd() as ActingUrddResult
  const { has, loaded: permsLoaded } = useActingPermissions()

  const canCreate = !permsLoaded || has('add_meetings')
  const userEmail = user?.email ?? null

  let gateElement: ReactNode = null
  if (idStatus === 'loading' || idStatus === 'idle') {
    // Old: <section className="portal-section"><p className="tenant-muted">Resolving your access…</p></section>
    gateElement = <AccessState kind="loading" />
  } else if (idStatus === 'error') {
    // Old: <p className="tenant-error">Could not resolve your access: {idError}</p>
    gateElement = (
      <div className={c('min-h-full flex items-center justify-center p-8',
        theme === 'dark' ? 'aurora-dark' : 'aurora-light')}>
        <div className={c('w-[380px] text-center', card(theme), 'rounded-3xl px-4 sm:px-6 lg:px-10 py-8 lg:py-12')}>
          <h2 className={c('font-extrabold text-xl mb-2.5', txt(theme))}>Could not resolve your access</h2>
          <p className={c('text-sm leading-relaxed', muted(theme))}>{String(idError ?? '')}</p>
        </div>
      </div>
    )
  } else if (idStatus === 'pending') {
    // Old: <PendingAccess email={me?.email} /> — same copy, design card.
    gateElement = <AccessState kind="pending" email={me?.email ?? undefined} />
  }

  return {
    ready: gateElement === null,
    gateElement,
    actingUrdd: actingUrdd ?? null,
    canCreate,
    userEmail,
  }
}
