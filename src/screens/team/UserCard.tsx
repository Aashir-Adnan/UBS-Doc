import { c, txt, muted } from '../../lib'
import type { Theme } from '../../types'
import type { TaskActor } from '../tasksLogic'
import Avatar from './Avatar'
import { actorName } from './activityLogic'

// A small person card: picture, name, @username and an optional caption line
// (a date, "via the site"). An id the bot could not resolve is drawn as "Former
// member" — never the raw id — and someone who is not a Discord member (a site
// edit that could not be matched) shows their name alone.
export default function UserCard({ actor, caption, theme, size = 36 }: {
  actor: TaskActor | null | undefined
  caption?: string | null
  theme: Theme
  size?: number
}) {
  if (!actor) return <span className={c('text-sm', muted(theme))}>—</span>
  const name = actorName(actor)
  const secondary = actor.unknown ? 'No longer in the server' : actor.username ? `@${actor.username}` : null
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Avatar person={{ name: actor.unknown ? '?' : actor.name, avatarUrl: actor.avatarUrl }} size={size} theme={theme} />
      <div className="min-w-0">
        <p className={c('text-sm font-semibold m-0 truncate leading-tight', txt(theme))}>{name}</p>
        {secondary && <p className={c('text-xs m-0 truncate leading-tight', muted(theme))}>{secondary}</p>}
        {caption && <p className={c('text-xs m-0 leading-tight', muted(theme))}>{caption}</p>}
      </div>
    </div>
  )
}
