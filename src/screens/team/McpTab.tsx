import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { c, card, txt, muted, inputCls } from '../../lib'
import { useTheme } from '../../app/ThemeContext'
import type { Theme } from '../../types'
import { API_BASE_URL } from '../../components/portal/config'
import { createMcpToken, listMcpTokens, revokeMcpToken } from '../../components/discordTasks/api'
import {
  EXPIRY_CHOICES, NAME_MAX, claudeCommand, cursorConfig, mcpUrl, tokenState, validateTokenName,
  type CreatedMcpToken, type McpToken,
} from './mcpLogic'

// Team → MCP: the caller's personal access tokens for the task MCP. The plain
// token string exists only in the create response, so it is held in state for
// this page view alone (never logged, never stored) and the box that shows it
// says so. Every request disables the buttons until it settles, so a double
// click cannot make two tokens or revoke twice.

const SCOPES: { value: 'read' | 'full'; label: string; hint: string }[] = [
  { value: 'read', label: 'Read only', hint: 'Look things up: projects, tasks, time.' },
  { value: 'full', label: 'Full', hint: 'Also create and update tasks and clock in and out.' },
]

const dateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
const when = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : '—')

export default function McpTab() {
  const { theme } = useTheme()
  const d = theme === 'dark'
  const [tokens, setTokens] = useState<McpToken[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'read' | 'full'>('read')
  const [days, setDays] = useState<number>(90)
  const [nameProblem, setNameProblem] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [revokingId, setRevokingId] = useState<number | null>(null)
  const [created, setCreated] = useState<CreatedMcpToken | null>(null)
  const busy = creating || revokingId !== null
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const reload = useCallback(async () => {
    try {
      const list = await listMcpTokens()
      if (alive.current) { setTokens(list); setError(null) }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => { void reload() }, [reload])

  const create = async () => {
    const problem = validateTokenName(name)
    setNameProblem(problem)
    if (problem) return
    setCreating(true); setError(null)
    try {
      const out = await createMcpToken({ name: name.trim(), scope, days })
      if (!alive.current) return
      setCreated(out)
      setName('')
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e))
      return
    } finally {
      if (alive.current) setCreating(false)
    }
    await reload()
  }

  const revoke = async (t: McpToken) => {
    if (!window.confirm(`Revoke "${t.name}"? Anything using it stops working.`)) return
    setRevokingId(t.id); setError(null)
    try {
      await revokeMcpToken(t.id)
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e))
      if (alive.current) setRevokingId(null)
      return
    }
    if (alive.current) setRevokingId(null)
    await reload()
  }

  const url = mcpUrl(API_BASE_URL)
  const now = new Date()

  return (
    <>
      <section className={c(card(theme), 'rounded-2xl p-5 sm:p-7 mb-5')}>
        <h2 className={c('font-extrabold text-xl m-0 mb-1', txt(theme))}>MCP</h2>
        <p className={c('text-sm font-medium m-0 mb-5', muted(theme))}>Use the task tools from Claude Code or Cursor with a personal token.</p>

        <form onSubmit={(e) => { e.preventDefault(); void create() }} className="flex flex-col gap-5" noValidate>
          <div>
            <label htmlFor="mcp-token-name" className={c('block text-[11px] font-bold uppercase tracking-wide mb-1.5', muted(theme))}>Name</label>
            <input id="mcp-token-name" className={inputCls(theme)} value={name} maxLength={NAME_MAX} placeholder="laptop" disabled={creating}
              aria-invalid={nameProblem ? true : undefined} aria-describedby={nameProblem ? 'mcp-token-name-problem' : undefined}
              onChange={(e) => { setName(e.target.value); if (nameProblem) setNameProblem(null) }} />
            {nameProblem && <p id="mcp-token-name-problem" role="alert" className={c('text-xs font-semibold m-0 mt-1.5', d ? 'text-red-300' : 'text-red-600')}>{nameProblem}</p>}
          </div>

          <div>
            <p id="mcp-scope-label" className={c('text-[11px] font-bold uppercase tracking-wide mb-1.5', muted(theme))}>Access</p>
            <div role="radiogroup" aria-labelledby="mcp-scope-label" className="flex flex-wrap gap-2">
              {SCOPES.map((o) => (
                <button key={o.value} type="button" role="radio" aria-checked={scope === o.value} disabled={creating} title={o.hint}
                  onClick={() => setScope(o.value)}
                  className={c('px-4 py-2 text-sm font-semibold rounded-xl border tr',
                    scope === o.value ? 'bg-indigo-500 border-indigo-500 text-white' : d ? 'border-white/15 text-white/70' : 'border-slate-300 text-slate-600')}>
                  {o.label}
                </button>
              ))}
            </div>
            <p className={c('text-xs font-medium m-0 mt-1.5', muted(theme))}>{SCOPES.find((o) => o.value === scope)?.hint}</p>
          </div>

          <div>
            <label htmlFor="mcp-token-days" className={c('block text-[11px] font-bold uppercase tracking-wide mb-1.5', muted(theme))}>Expires after</label>
            <select id="mcp-token-days" className={inputCls(theme, 'sm:w-48')} value={days} disabled={creating} onChange={(e) => setDays(Number(e.target.value))}>
              {EXPIRY_CHOICES.map((n) => <option key={n} value={n}>{n} days</option>)}
            </select>
          </div>

          <div>
            <button type="submit" disabled={busy} className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm">
              {creating ? 'Creating…' : 'Create token'}
            </button>
          </div>
        </form>
      </section>

      {error && (
        <div role="alert" className={c('rounded-xl px-4 py-3 mb-5 text-sm font-medium border', d ? 'bg-red-500/10 border-red-500/25 text-red-300' : 'bg-red-50 border-red-200 text-red-600')}>
          {error}
        </div>
      )}

      {created && <CreatedBox created={created} url={url} theme={theme} onDismiss={() => setCreated(null)} />}

      <section className={c(card(theme), 'rounded-2xl p-5 sm:p-7')}>
        <h2 className={c('font-extrabold text-sm m-0 mb-3', txt(theme))}>Your tokens</h2>
        {tokens === null ? (
          <p className={c('text-sm font-medium m-0', muted(theme))}>{error ? '' : 'Loading…'}</p>
        ) : tokens.length === 0 ? (
          <p className={c('text-sm font-medium m-0', muted(theme))}>No tokens yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className={c('text-[11px] font-bold uppercase tracking-wide', muted(theme))}>
                  {['Name', 'Token', 'Access', 'Created', 'Expires', 'Last used', 'State', ''].map((h, i) => (
                    <th key={i} scope="col" className="py-2 pr-4 font-bold whitespace-nowrap">{h || <span className="sr-only">Actions</span>}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={c('divide-y', d ? 'divide-white/6' : 'divide-slate-100')}>
                {tokens.map((t) => {
                  const state = tokenState(t, now)
                  return (
                    <tr key={t.id} className={state === 'active' ? '' : 'opacity-60'}>
                      <td className={c('py-2.5 pr-4 font-semibold', txt(theme))}>{t.name}</td>
                      <td className={c('py-2.5 pr-4 font-mono text-xs whitespace-nowrap', muted(theme))}>{t.prefix}…</td>
                      <td className={c('py-2.5 pr-4 whitespace-nowrap', muted(theme))}>{t.scope === 'full' ? 'Full' : 'Read only'}</td>
                      <td className={c('py-2.5 pr-4 whitespace-nowrap', muted(theme))}>{when(t.createdAt)}</td>
                      <td className={c('py-2.5 pr-4 whitespace-nowrap', muted(theme))}>{when(t.expiresAt)}</td>
                      <td className={c('py-2.5 pr-4 whitespace-nowrap', muted(theme))}>{t.lastUsedAt ? when(t.lastUsedAt) : 'Never'}</td>
                      <td className={c('py-2.5 pr-4 whitespace-nowrap font-semibold', state === 'active' ? (d ? 'text-emerald-300' : 'text-emerald-600') : muted(theme))}>
                        {state === 'active' ? 'Active' : state === 'expired' ? 'Expired' : 'Revoked'}
                      </td>
                      <td className="py-2.5 text-right">
                        {state === 'active' && (
                          <button type="button" disabled={busy} onClick={() => void revoke(t)} aria-label={`Revoke ${t.name}`}
                            className={c('px-3 py-1.5 text-xs font-semibold rounded-lg border tr disabled:opacity-50',
                              d ? 'border-red-500/30 text-red-300 hover:bg-red-500/10' : 'border-red-200 text-red-600 hover:bg-red-50')}>
                            {revokingId === t.id ? 'Revoking…' : 'Revoke'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function CreatedBox({ created, url, theme, onDismiss }: { created: CreatedMcpToken; url: string; theme: Theme; onDismiss: () => void }) {
  const d = theme === 'dark'
  return (
    <section aria-label="New token" className={c('rounded-2xl p-5 sm:p-7 mb-5 border', d ? 'bg-indigo-500/8 border-indigo-400/25' : 'bg-indigo-50 border-indigo-200')}>
      <h2 className={c('font-extrabold text-sm m-0 mb-1', txt(theme))}>Token &ldquo;{created.name}&rdquo; created</h2>
      <p className={c('text-xs font-semibold m-0 mb-3', d ? 'text-amber-300' : 'text-amber-700')}>Copy it now — you will not see it again.</p>

      <CodeBlock label="Token" text={created.token} theme={theme} inline />
      <CodeBlock label="Claude Code" text={claudeCommand(url, created.token)} theme={theme} />
      <CodeBlock label="Cursor (mcp.json)" text={cursorConfig(url, created.token)} theme={theme} />

      <button type="button" onClick={onDismiss}
        className={c('mt-1 px-3 py-1.5 text-xs font-semibold rounded-lg border tr', d ? 'border-white/15 text-white/70 hover:bg-white/6' : 'border-slate-300 text-slate-600 hover:bg-white')}>
        I have copied it
      </button>
    </section>
  )
}

function CodeBlock({ label, text, theme, inline }: { label: string; text: string; theme: Theme; inline?: boolean }) {
  const d = theme === 'dark'
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // No clipboard access (insecure context, permission denied): the text is
      // on screen to select by hand.
      setCopied(false)
    }
  }
  const body: ReactNode = inline
    ? <code className="font-mono text-xs break-all flex-1 min-w-0 select-all">{text}</code>
    : <pre className="font-mono text-xs m-0 flex-1 min-w-0 overflow-x-auto whitespace-pre-wrap break-all select-all">{text}</pre>
  return (
    <div className="mb-3">
      <p className={c('text-[11px] font-bold uppercase tracking-wide mb-1.5', muted(theme))}>{label}</p>
      <div className={c('flex items-start gap-3 rounded-xl border px-3 py-2.5', d ? 'bg-black/30 border-white/10 text-white/90' : 'bg-white border-slate-200 text-slate-800')}>
        {body}
        <button type="button" onClick={() => void copy()} aria-label={`Copy ${label}`}
          className={c('flex-shrink-0 px-3 py-1 text-xs font-semibold rounded-lg border tr', d ? 'border-white/15 text-white/70 hover:bg-white/6' : 'border-slate-300 text-slate-600 hover:bg-slate-50')}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
