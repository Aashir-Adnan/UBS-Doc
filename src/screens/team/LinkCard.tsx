import { useState } from 'react'
import { Link2 } from 'lucide-react'
import { c, card, txt, muted } from '../../lib'
import type { Theme } from '../../types'
import { linkDiscord } from '../../components/discordTasks/api'
import { LINK_HELP, codeProblem, linkErrorText, normalizeCode } from './identityLogic'

// Shown instead of the Team tabs while the signed-in account has no Discord link:
// with no link there is nothing the backend will show, so the only useful thing on
// the page is the way to make one.
// `reason` replaces the first sentence where the card is shown for something
// other than an empty Team section (the header's clock, for someone who already
// sees every project).
export default function LinkCard({ theme, onLinked, reason }: { theme: Theme; onLinked: () => Promise<void>; reason?: string }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const normalized = normalizeCode(code)
    const problem = codeProblem(normalized)
    if (problem) { setError(problem); return }
    setBusy(true)
    setError(null)
    try {
      await linkDiscord(normalized)
      await onLinked()
    } catch (err) {
      setError(linkErrorText(err as { status?: number; message?: string }))
      setBusy(false)
    }
  }

  return (
    <div className={c(card(theme), 'rounded-2xl p-6 sm:p-8 max-w-[640px]')}>
      <div className="flex items-center gap-3 mb-3">
        <Link2 size={20} className="text-indigo-500" />
        <h2 className={c('font-extrabold text-lg m-0', txt(theme))}>Link your Discord account</h2>
      </div>
      <p className={c('text-sm mb-2', muted(theme))}>
        {reason ?? 'Your UBS-Doc account is not linked to a Discord member yet, so there are no projects to show you.'}
      </p>
      <p className={c('text-sm mb-5', muted(theme))}>{LINK_HELP}</p>
      <form onSubmit={(e) => { e.preventDefault(); void submit() }} className="flex flex-wrap gap-3 items-center">
        <div className="w-[180px]">
          <input className="input-base font-mono tracking-widest uppercase" value={code} maxLength={9}
            placeholder="ABC234" aria-label="Link code" autoComplete="one-time-code"
            onChange={(e) => setCode(e.target.value)} disabled={busy} />
        </div>
        <button type="submit" className="btn-primary px-5 py-2.5 text-sm" disabled={busy}>{busy ? 'Linking…' : 'Link account'}</button>
      </form>
      {error && <p role="alert" className="text-sm font-semibold text-red-500 mt-3 mb-0">{error}</p>}
    </div>
  )
}
