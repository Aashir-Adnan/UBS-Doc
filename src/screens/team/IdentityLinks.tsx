import { useCallback, useEffect, useState } from 'react'
import { c, card, txt, muted, chipGray } from '../../lib'
import type { Theme } from '../../types'
import { fetchIdentityLinks, unlinkDiscord, type IdentityLink } from '../../components/discordTasks/api'
import { linkErrorText } from './identityLogic'

// Site admins only: every stored account ↔ Discord link, with Unlink so a person
// who linked the wrong Discord account can link again.
export default function IdentityLinks({ theme }: { theme: Theme }) {
  const [links, setLinks] = useState<IdentityLink[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLinks((await fetchIdentityLinks()).links)
      setError(null)
    } catch (err) {
      setError(linkErrorText(err as { status?: number; message?: string }))
    }
  }, [])
  useEffect(() => { void load() }, [load])

  async function remove(l: IdentityLink) {
    const who = l.name || l.email || `user ${l.userId}`
    if (!window.confirm(`Unlink ${who} from ${l.discordName || l.discordId}? They will need a /link code from Discord to link again.`)) return
    const key = `${l.userId}:${l.guildConfigId}`
    setBusy(key)
    try {
      await unlinkDiscord(l.userId, l.guildConfigId)
      await load()
    } catch (err) {
      setError(linkErrorText(err as { status?: number; message?: string }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={c(card(theme), 'rounded-2xl p-5 mb-6')}>
      <h2 className={c('font-extrabold text-base m-0 mb-1', txt(theme))}>Account links</h2>
      <p className={c('text-xs mb-4', muted(theme))}>UBS-Doc accounts and the Discord members they are linked to. Only site admins see this.</p>
      {error && <p role="alert" className="text-sm font-semibold text-red-500 mb-3">{error}</p>}
      {links === null && !error && <p className={c('text-sm m-0', muted(theme))}>Loading…</p>}
      {links && links.length === 0 && <p className={c('text-sm m-0', muted(theme))}>No accounts are linked yet.</p>}
      {links && links.length > 0 && (
        <ul className="list-none p-0 m-0 flex flex-col gap-2">
          {links.map((l) => {
            const key = `${l.userId}:${l.guildConfigId}`
            return (
              <li key={key} className="flex flex-wrap items-center gap-3 text-sm">
                <span className={c('font-semibold', txt(theme))}>{l.name || l.email || `user ${l.userId}`}</span>
                {l.email && l.name && <span className={muted(theme)}>{l.email}</span>}
                <span className={muted(theme)}>↔</span>
                <span className={c('font-semibold', txt(theme))}>{l.discordName || l.discordId}</span>
                <span className={c('text-[11px] font-semibold px-2 py-0.5 rounded-full', chipGray(theme))}>{l.via}</span>
                <button type="button" onClick={() => void remove(l)} disabled={busy === key}
                  className={c('ml-auto text-xs font-semibold text-red-500 hover:underline', busy === key ? 'opacity-50' : '')}>
                  {busy === key ? 'Unlinking…' : 'Unlink'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
