import { useLayoutEffect, useRef, useState } from 'react'
import { c } from '../../lib'

// Port of animate-ui's community `user-presence-avatar` (by arhamkhnz): two
// pill-shaped groups of overlapping avatars — "present" in full colour and
// "absent" greyscaled — where clicking an avatar moves it between the groups
// and it animates across on a shared-layout transition.
//
// Two deliberate differences from the upstream file:
//
//  1. It is data-driven instead of hard-coding a six-person USERS array, so the
//     same component serves meeting participants and the tenant-admin user
//     pickers.
//  2. The shared-layout animation is a hand-rolled FLIP on the Web Animations
//     API rather than motion/react's <LayoutGroup>/layoutId. Upstream's version
//     is the only thing in this repo that would pull in `motion` (~50 kB), and
//     the rest of the design revamp animates with plain CSS keyframes and rAF
//     (see text-animate.tsx, number-ticker.tsx). Visually this is the same
//     move: measure before, measure after, invert, play.

export interface PresenceUser {
  id: string | number
  name: string
  /** Shown under the name in the hover tooltip — e.g. the email. */
  subtitle?: string
  photoUrl?: string | null
  /** Rendered but not clickable (e.g. "you", who is always a participant). */
  locked?: boolean
  lockedHint?: string
}

interface Props {
  users: PresenceUser[]
  /** Ids in the "present" group; everything else is greyscaled. */
  activeIds: Array<string | number>
  onToggle?: (user: PresenceUser) => void
  activeLabel?: string
  inactiveLabel?: string
  /** Shown in place of the present group while it is empty. */
  emptyActiveLabel?: string
  /** Avatar diameter in px. */
  size?: number
  className?: string
}

const FLIP_MS = 420
const FLIP_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

function initialsOf(name: string) {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function UserPresenceAvatar({
  users,
  activeIds,
  onToggle,
  activeLabel = 'Online',
  inactiveLabel = 'Offline',
  emptyActiveLabel,
  size = 44,
  className,
}: Props) {
  const active = new Set(activeIds.map(String))
  const present = users.filter((u) => active.has(String(u.id)))
  const absent = users.filter((u) => !active.has(String(u.id)))

  // Mirrors upstream's `togglingGroup`: the group an avatar is leaving drops
  // below the other one so it travels *under* the destination pill.
  const [leaving, setLeaving] = useState<'active' | 'inactive' | null>(null)

  // ---- FLIP -----------------------------------------------------------------
  // Every animated node registers itself here. The click handler snapshots all
  // boxes *before* it changes the selection, then the layout effect measures
  // again after the commit and plays the delta backwards.
  //
  // The snapshot is taken on click rather than on every commit on purpose: a
  // per-commit snapshot would still hold the boxes from mount by the time of
  // the first interaction, and those are measured before webfonts settle — so
  // the first avatar you clicked flew in from a phantom offset. Snapshotting on
  // click also means selection changes that come from outside (a search filter
  // narrowing the list) reflow silently instead of animating.
  const nodes = useRef(new Map<string, HTMLElement>())
  const pending = useRef<Map<string, DOMRect> | null>(null)

  const register = (key: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(key, el)
    else nodes.current.delete(key)
  }

  useLayoutEffect(() => {
    const before = pending.current
    if (!before) return
    pending.current = null

    nodes.current.forEach((el, key) => {
      const prev = before.get(key)
      if (!prev) return
      const rect = el.getBoundingClientRect()

      const dx = prev.left - rect.left
      const dy = prev.top - rect.top
      const dw = prev.width - rect.width
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(dw) < 1) return

      // Group pills also change width as avatars enter/leave them, so their
      // keyframes carry width; avatars only ever translate.
      const isGroup = key.startsWith('group:')
      el.animate(
        isGroup
          ? [
            { transform: `translate(${dx}px, ${dy}px)`, width: `${prev.width}px` },
            { transform: 'translate(0px, 0px)', width: `${rect.width}px` },
          ]
          : [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: 'translate(0px, 0px)' },
          ],
        { duration: FLIP_MS, easing: FLIP_EASE },
      )
    })
  })

  const handle = (user: PresenceUser, from: 'active' | 'inactive') => {
    if (user.locked || !onToggle) return
    const still = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!still) {
      const snap = new Map<string, DOMRect>()
      nodes.current.forEach((el, key) => snap.set(key, el.getBoundingClientRect()))
      pending.current = snap
    }
    setLeaving(from)
    onToggle(user)
    window.setTimeout(() => setLeaving(null), FLIP_MS + 60)
  }

  const renderGroup = (
    group: PresenceUser[],
    kind: 'active' | 'inactive',
    label: string,
  ) => {
    if (group.length === 0) return null
    return (
      <div className="upa-group-wrap">
        <span className="upa-group-label">{label}</span>
        <div
          ref={register(`group:${kind}`)}
          className={c('upa-group', leaving === kind && 'upa-group--leaving')}
        >
          <div className="upa-row" style={{ marginRight: -Math.round(size * 0.22) }}>
            {group.map((user) => {
              const interactive = !!onToggle && !user.locked
              return (
                <button
                  key={user.id}
                  ref={register(`user:${user.id}`)}
                  type="button"
                  className={c(
                    'upa-avatar',
                    kind === 'inactive' && 'upa-avatar--muted',
                    !interactive && 'upa-avatar--locked',
                  )}
                  // z-index stays in CSS so :hover can lift the avatar above
                  // its overlapping neighbours — an inline value would win.
                  style={{
                    width: size,
                    height: size,
                    marginRight: Math.round(size * 0.22),
                  }}
                  onClick={() => handle(user, kind)}
                  disabled={!interactive}
                  aria-pressed={kind === 'active'}
                  aria-label={
                    user.locked
                      ? `${user.name}${user.lockedHint ? ` — ${user.lockedHint}` : ''}`
                      : `${user.name} — ${kind === 'active' ? label : `add to ${activeLabel}`}`
                  }
                >
                  {user.photoUrl
                    ? <img className="upa-img" src={user.photoUrl} alt="" />
                    : <span className="upa-initials">{initialsOf(user.name)}</span>}
                  <span className="upa-tip" role="presentation">
                    <span className="upa-tip-name">{user.name}</span>
                    {user.subtitle && <span className="upa-tip-sub">{user.subtitle}</span>}
                    {user.locked && user.lockedHint && (
                      <span className="upa-tip-sub">{user.lockedHint}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={c('upa-root', className)}>
      {present.length === 0 && emptyActiveLabel ? (
        <div className="upa-group-wrap">
          <span className="upa-group-label">{activeLabel}</span>
          <div className="upa-empty" style={{ height: size + 4 }}>{emptyActiveLabel}</div>
        </div>
      ) : (
        renderGroup(present, 'active', activeLabel)
      )}
      {renderGroup(absent, 'inactive', inactiveLabel)}
    </div>
  )
}
