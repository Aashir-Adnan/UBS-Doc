import { useMemo, useState } from 'react'
import { Copy, Check, HelpCircle } from 'lucide-react'
import { c, card, txt, muted, Breadcrumb, Checkbox } from '../lib'
import { useTheme } from '../app/ThemeContext'
import AuroraText from '../components/ui/aurora-text'
import {
  buildOutput,
  urlToObjectName,
  DEFAULT_STATE,
  extractFunctionNames,
  extractSingleFunctionName,
} from '../utils/apiObjectTemplate'

// Design markup from design/UBS Dev Tools Portal (1)/src/screens/APIBuilder.tsx,
// wired to the real generator extracted verbatim from the pre-migration page
// (src/pages/tools/apiObject.jsx → src/utils/apiObjectTemplate.js) so the
// emitted `global.<Name>_object` string is byte-identical to what that page
// produced for the same inputs. See task-9-report.md for the field mapping.
export default function APIBuilder() {
  const { theme } = useTheme()
  const [tab, setTab] = useState<'configure' | 'output'>('configure')
  const [state, setState] = useState(DEFAULT_STATE)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const d = theme === 'dark'

  const update = (key: keyof typeof DEFAULT_STATE, value: unknown) =>
    setState((s) => ({ ...s, [key]: value }))
  const toggle = (key: keyof typeof DEFAULT_STATE) =>
    setState((s) => ({ ...s, [key]: !s[key] }))

  const name = urlToObjectName(state.url)
  const outputJs = useMemo(() => buildOutput(state), [state])

  const handleCopy = () => {
    navigator.clipboard.writeText(outputJs).then(
      () => setCopyState('copied'),
      () => setCopyState('failed'),
    )
    setTimeout(() => setCopyState('idle'), 2000)
  }

  const inputBase = c('input-base px-4 py-2.5 text-sm', d ? 'input-dark' : 'input-light')

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className={c(card(theme), 'p-5 mb-4')}>
      <p className={c('section-kicker mb-4', d ? 'text-white/28' : 'text-slate-400')}>{title}</p>
      {children}
    </div>
  )

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[860px] mx-auto px-10 py-12">
        <Breadcrumb items={['UBS', 'Dev Tools', 'API Object Builder']} theme={theme} />
        <h1 className="font-extrabold mb-6" style={{ fontSize: 40, letterSpacing: '-0.025em' }}>
          <AuroraText>API Object Builder</AuroraText>
        </h1>

        {/* Segment control */}
        <div className={c('inline-flex p-1 rounded-2xl mb-7', d ? 'bg-white/5' : 'bg-slate-100')}>
          {(['configure', 'output'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={c(
                'px-6 py-2 rounded-xl text-sm font-bold tr',
                tab === t
                  ? d
                    ? 'bg-indigo-500/30 text-indigo-300 shadow-sm'
                    : 'bg-white text-indigo-600 shadow-sm'
                  : d
                    ? 'text-white/38'
                    : 'text-slate-500'
              )}
            >
              {t === 'configure' ? 'Configure' : 'Output (JS)'}
            </button>
          ))}
        </div>

        {tab === 'configure' && (
          <div>
            {/* URL path */}
            <Section title="API Endpoint">
              <div className="flex items-center gap-3">
                <input
                  value={state.url}
                  onChange={(e) => update('url', e.target.value)}
                  placeholder="/test/api"
                  className={c(inputBase, 'flex-1 mono')}
                />
                {name && (
                  <span
                    className={c(
                      'chip mono shrink-0',
                      d
                        ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/22'
                        : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                    )}
                  >
                    {name}
                  </span>
                )}
              </div>
            </Section>

            {/* Features */}
            <Section title="Features">
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    { key: 'multistep', label: 'Multistep' },
                    { key: 'parameters', label: 'Parameters' },
                    { key: 'pagination', label: 'Pagination' },
                  ] as const
                ).map((f) => (
                  <label key={f.key} className="flex items-center gap-3 cursor-pointer">
                    <Checkbox checked={Boolean(state[f.key])} onChange={() => toggle(f.key)} theme={theme} />
                    <span className={c('text-sm font-medium', d ? 'text-white/65' : 'text-slate-600')}>{f.label}</span>
                  </label>
                ))}
              </div>
            </Section>

            {/* Communication */}
            <Section title="Communication">
              <label className="flex items-center gap-3 cursor-pointer mb-3">
                <Checkbox checked={state.encryption} onChange={() => toggle('encryption')} theme={theme} />
                <span className={c('text-sm font-semibold', txt(theme))}>Encryption</span>
              </label>
              {state.encryption && (
                <div className={c('ml-4 pl-4 border-l flex flex-col gap-2', d ? 'border-indigo-500/20' : 'border-indigo-200')}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox checked={state.encryptionAccessToken} onChange={() => toggle('encryptionAccessToken')} theme={theme} />
                    <span className={c('text-sm font-medium', d ? 'text-white/65' : 'text-slate-600')}>accessToken</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox checked={state.encryptionPlatformEncryption} onChange={() => toggle('encryptionPlatformEncryption')} theme={theme} />
                    <span className={c('text-sm font-medium', d ? 'text-white/65' : 'text-slate-600')}>platformEncryption</span>
                  </label>
                  {!state.encryptionAccessToken && !state.encryptionPlatformEncryption && (
                    <div
                      className={c(
                        'flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium',
                        d ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400' : 'bg-amber-50 border border-amber-200 text-amber-700'
                      )}
                    >
                      ⚠ At least one of accessToken or platformEncryption should be true.
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* Verification */}
            <Section title="Verification">
              <div className="flex flex-col gap-3">
                {(
                  [
                    { key: 'otp', label: 'OTP (One-Time Password)', sub: 'Require OTP verification for this API.' },
                    { key: 'accessToken', label: 'Access Token', sub: 'Require access token verification.' },
                  ] as const
                ).map((row) => (
                  <label key={row.key} className="flex items-center gap-3 cursor-pointer">
                    <Checkbox checked={Boolean(state[row.key])} onChange={() => toggle(row.key)} theme={theme} />
                    <div>
                      <p className={c('text-sm font-semibold', txt(theme))}>{row.label}</p>
                      <p className={c('text-xs', muted(theme))}>{row.sub}</p>
                    </div>
                  </label>
                ))}
              </div>
            </Section>

            {/* Request metadata */}
            <Section title="Request Configuration">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <label className={c('section-kicker block mb-1.5', d ? 'text-white/25' : 'text-slate-300')}>Method</label>
                  <select value={state.requestMethod} onChange={(e) => update('requestMethod', e.target.value)} className={inputBase}>
                    {['POST', 'GET', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={c('section-kicker block mb-1.5', d ? 'text-white/25' : 'text-slate-300')}>Permission</label>
                  <input
                    value={state.permission}
                    onChange={(e) => update('permission', e.target.value)}
                    placeholder="null"
                    className={inputBase}
                  />
                </div>
                <div>
                  <label className={c('section-kicker block mb-1.5', d ? 'text-white/25' : 'text-slate-300')}>Page Size</label>
                  <input
                    type="number"
                    min={1}
                    value={state.pageSize}
                    onChange={(e) => update('pageSize', e.target.value)}
                    className={c(inputBase, 'mono')}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={c('section-kicker block mb-1.5', d ? 'text-white/25' : 'text-slate-300')}>Success message</label>
                  <input
                    value={state.successMessage}
                    onChange={(e) => update('successMessage', e.target.value)}
                    className={inputBase}
                  />
                </div>
                <div>
                  <label className={c('section-kicker block mb-1.5', d ? 'text-white/25' : 'text-slate-300')}>Error message</label>
                  <input
                    value={state.errorMessage}
                    onChange={(e) => update('errorMessage', e.target.value)}
                    className={inputBase}
                  />
                </div>
              </div>
            </Section>

            {/* Pre/Post process */}
            <Section title="Processing Functions">
              {(
                [
                  {
                    key: 'preProcessDefinitions' as const,
                    label: 'Pre-Process definitions',
                    tip: 'Write one or more full function definitions (e.g. async function func1(req, decryptedPayload) { }). The return is added to decryptedPayload under the key of the function name.',
                    placeholder:
                      'async function func1(req, decryptedPayload) {\n  // ...\n}\nasync function func2(req, decryptedPayload) {\n  // ...\n}',
                    rows: 6,
                  },
                  {
                    key: 'postProcessDefinition' as const,
                    label: 'Post-Process definition',
                    tip: 'Write a single full function definition. The return is assigned to response.',
                    placeholder: 'async function ubs_init_wrapper(req, decryptedPayload) {\n  // ...\n}',
                    rows: 4,
                  },
                ]
              ).map((fn) => (
                <div key={fn.key} className="mb-4 last:mb-0">
                  <div className="flex items-center gap-2 mb-2">
                    <label className={c('section-kicker', d ? 'text-white/28' : 'text-slate-400')}>{fn.label}</label>
                    <div className="relative group/tip">
                      <HelpCircle size={12} className={muted(theme)} />
                      <div
                        className={c(
                          'absolute left-5 top-0 z-20 w-52 px-3 py-2.5 rounded-xl text-xs leading-relaxed pointer-events-none',
                          'opacity-0 group-hover/tip:opacity-100 tr',
                          d ? 'bg-[#151C30] border border-indigo-500/25 text-white/60' : 'bg-white border border-slate-200 text-slate-500 shadow-lg'
                        )}
                      >
                        {fn.tip}
                      </div>
                    </div>
                  </div>
                  <textarea
                    value={state[fn.key]}
                    onChange={(e) => update(fn.key, e.target.value)}
                    placeholder={fn.placeholder}
                    rows={fn.rows}
                    spellCheck={false}
                    className={c(
                      'input-base px-4 py-3 w-full text-xs mono resize-none',
                      d ? 'bg-[#06090F] border border-indigo-500/18 text-indigo-200/70' : 'bg-slate-50 border border-slate-200 text-slate-600'
                    )}
                  />
                  {String(state[fn.key]).trim() &&
                    (fn.key === 'preProcessDefinitions'
                      ? extractFunctionNames(state[fn.key]).length > 0 && (
                          <span className={c('text-xs font-medium mt-1.5 block', muted(theme))}>
                            → Referenced as: [{extractFunctionNames(state[fn.key]).join(', ')}]
                          </span>
                        )
                      : extractSingleFunctionName(state[fn.key]) && (
                          <span className={c('text-xs font-medium mt-1.5 block', muted(theme))}>
                            → Referenced as: {extractSingleFunctionName(state[fn.key])}
                          </span>
                        ))}
                </div>
              ))}
              <div>
                <label className={c('section-kicker block mb-1.5', d ? 'text-white/25' : 'text-slate-300')}>Query</label>
                <input value={state.query} onChange={(e) => update('query', e.target.value)} placeholder="null" className={c(inputBase, 'mono')} />
              </div>
            </Section>

            {/* Parameters fields */}
            <Section title="Parameters">
              <div className="flex items-center gap-2 mb-2">
                <label className={c('section-kicker', d ? 'text-white/28' : 'text-slate-400')}>Fields (JSON array)</label>
                <div className="relative group/tip">
                  <HelpCircle size={12} className={muted(theme)} />
                  <div
                    className={c(
                      'absolute left-5 top-0 z-20 w-56 px-3 py-2.5 rounded-xl text-xs leading-relaxed pointer-events-none',
                      'opacity-0 group-hover/tip:opacity-100 tr',
                      d ? 'bg-[#151C30] border border-indigo-500/25 text-white/60' : 'bg-white border border-slate-200 text-slate-500 shadow-lg'
                    )}
                  >
                    JSON array of field definitions. Each field: name, validations (array), required (bool), source (e.g. req.body).
                  </div>
                </div>
              </div>
              <textarea
                value={state.fieldsJson}
                onChange={(e) => update('fieldsJson', e.target.value)}
                placeholder={'[\n  {\n    "name": "actionPerformerURDD",\n    "required": false,\n    "source": "req.body"\n  }\n]'}
                rows={6}
                className={c(
                  'input-base px-4 py-3 w-full text-xs mono resize-none',
                  d ? 'bg-[#06090F] border border-indigo-500/18 text-indigo-200/70' : 'bg-slate-50 border border-slate-200 text-slate-600'
                )}
              />
            </Section>

            <button onClick={() => setTab('output')} className="btn-primary w-full py-3.5 rounded-2xl text-sm">
              Generate Output →
            </button>
          </div>
        )}

        {tab === 'output' && (
          <div className="rounded-2xl overflow-hidden" style={{ border: d ? '1px solid rgba(79,70,229,0.2)' : '1px solid #E2E8F0' }}>
            <div className={c('flex items-center justify-between px-5 py-3 border-b', d ? 'bg-[#06090F] border-indigo-500/15' : 'bg-slate-50 border-slate-200')}>
              <span className={c('mono text-xs font-semibold', muted(theme))}>{name || 'Api_object'}.js</span>
              <button
                onClick={handleCopy}
                className={c(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border tr',
                  copyState === 'copied'
                    ? d
                      ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/8'
                      : 'border-emerald-400 text-emerald-600 bg-emerald-50'
                    : copyState === 'failed'
                      ? d
                        ? 'border-red-500/30 text-red-400 bg-red-500/8'
                        : 'border-red-400 text-red-600 bg-red-50'
                      : d
                        ? 'border-indigo-500/22 text-white/45 hover:text-white'
                        : 'border-slate-200 text-slate-500 hover:text-slate-700'
                )}
              >
                {copyState === 'copied' ? (
                  <>
                    <Check size={12} /> Copied
                  </>
                ) : copyState === 'failed' ? (
                  <>
                    <Copy size={12} /> Copy failed
                  </>
                ) : (
                  <>
                    <Copy size={12} /> Copy
                  </>
                )}
              </button>
            </div>
            <pre className="code-panel p-6 text-[12.5px] leading-relaxed overflow-x-auto">
              <code className="text-indigo-200/80">{outputJs}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
