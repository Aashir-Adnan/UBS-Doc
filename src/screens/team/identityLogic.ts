import type { TasksPayload, Viewer } from '../tasksLogic'
import type { TeamTabKey } from './teamNav'

// The link card and the "signed in as" line (identity link, 2026-09-28). The
// backend decides who is linked; this only turns its `viewer` into what to show.

export const LINK_HELP =
  'We link your UBS-Doc account to your Discord member automatically when the email you sign in with matches the one you verified in Discord. If they differ, run /link in the Discord server and enter the code here.'

const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/

export function needsLink(payload: TasksPayload | null | undefined): boolean {
  const v = payload?.viewer
  return !!v && !v.linked && !v.seesAll
}

// Only the tabs built on the tasks payload (People, Tasks, Board) need a
// link. Time and Stats follow view_discord_time, not the link, so they stay
// reachable while unlinked (the card never replaces them).
const LINKED_TABS: ReadonlySet<TeamTabKey> = new Set<TeamTabKey>(['people', 'tasks', 'board'])

export function showsLinkCard(payload: TasksPayload | null | undefined, tab: TeamTabKey): boolean {
  return needsLink(payload) && LINKED_TABS.has(tab)
}

export function viewerLine(viewer: Viewer | undefined): string | null {
  if (!viewer) return null
  const who = viewer.linked ? (viewer.name ? `Signed in as ${viewer.name}` : 'Signed in with your Discord account') : null
  if (viewer.seesAll) return who ? `${who} · viewing every project` : 'Viewing every project'
  return who
}

export function normalizeCode(raw: string): string {
  return String(raw ?? '').replace(/[\s-]/g, '').toUpperCase()
}

export function codeProblem(code: string): string | null {
  if (!code) return 'Enter the 6-character code from /link.'
  if (!CODE_RE.test(code)) return 'Codes are 6 letters and digits, like ABC234.'
  return null
}

export function linkErrorText(err: { status?: number; message?: string }): string {
  const status = err?.status
  const message = (err?.message ?? '').trim()
  if (status === 401) return 'Sign in again, then link your account.'
  if ((status === 400 || status === 403 || status === 429 || status === 503) && message) return message
  return 'The server did not answer. Try again in a moment.'
}
