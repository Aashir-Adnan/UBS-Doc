import { useState } from 'react'
import { Copy, Check, HelpCircle } from 'lucide-react'
import AuroraText from '../components/ui/aurora-text'
import { c, card, txt, muted, divider, Breadcrumb, Checkbox, Toggle } from '../lib'
import type { Theme } from '../types'

interface Props { theme: Theme }

function toObjName(path: string) {
  return path.split('/').filter(p => p && !p.startsWith(':') && !p.startsWith('{'))
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase()))
    .join('') || 'Api'
}

export default function APIBuilder({ theme }: Props) {
  const [tab, setTab] = useState<'configure' | 'output'>('configure')
  const [urlPath, setUrlPath] = useState('/api/v2/meetings')
  const [features, setFeatures] = useState({ multistep: true, parameters: true, pagination: false })
  const [encryption, setEncryption] = useState(false)
  const [encType, setEncType] = useState<'AES-256' | 'RSA-2048'>('AES-256')
  const [otp, setOtp] = useState(false)
  const [accessToken, setAccessToken] = useState(true)
  const [method, setMethod] = useState('GET')
  const [permission, setPermission] = useState('tenant')
  const [pageSize, setPageSize] = useState('25')
  const [preFn, setPreFn] = useState(`function preProcess(params) {\n  // Validate and transform input\n  return { ...params, timestamp: Date.now() };\n}`)
  const [postFn, setPostFn] = useState(`function postProcess(response) {\n  // Transform and filter response\n  return response.data ?? response;\n}`)
  const [copied, setCopied] = useState(false)
  const d = theme === 'dark'

  const name = toObjName(urlPath)

  const code = `global.${name}_object = {
  url: "${urlPath}",
  method: "${method}",
  name: "${name}",
  permission: "${permission}",${features.pagination ? `\n  pagination: { pageSize: ${pageSize} },` : ''}${features.multistep ? '\n  multistep: true,' : ''}${features.parameters ? '\n  parameters: true,' : ''}${accessToken ? '\n  auth: { type: "bearer", token: process.env.API_TOKEN },' : ''}${encryption ? `\n  encryption: { algorithm: "${encType}", key: process.env.ENCRYPT_KEY },` : ''}${otp ? '\n  otp: { required: true, digits: 6 },' : ''}

  preProcess: ${preFn},

  postProcess: ${postFn},
};`

  const handleCopy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  const inputBase = c(
    'input-base px-4 py-2.5 text-sm',
    d ? 'input-dark' : 'input-light'
  )

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
          {(['configure', 'output'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={c('px-6 py-2 rounded-xl text-sm font-bold tr',
                tab === t
                  ? d ? 'bg-indigo-500/30 text-indigo-300 shadow-sm' : 'bg-white text-indigo-600 shadow-sm'
                  : d ? 'text-white/38' : 'text-slate-500'
              )}>
              {t === 'configure' ? 'Configure' : 'Output (JS)'}
            </button>
          ))}
        </div>

        {tab === 'configure' && (
          <div>
            {/* URL path */}
            <Section title="API Endpoint">
              <div className="flex items-center gap-3">
                <input value={urlPath} onChange={e => setUrlPath(e.target.value)}
                  placeholder="/api/v2/resource"
                  className={c(inputBase, 'flex-1 mono')} />
                {name && (
                  <span className={c('chip mono shrink-0', d ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/22' : 'bg-indigo-50 text-indigo-600 border border-indigo-100')}>
                    {name}_object
                  </span>
                )}
              </div>
            </Section>

            {/* Features */}
            <Section title="Features">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'multistep', label: 'Multistep' },
                  { key: 'parameters', label: 'Parameters' },
                  { key: 'pagination', label: 'Pagination' },
                ].map(f => (
                  <label key={f.key} className="flex items-center gap-3 cursor-pointer">
                    <Checkbox checked={features[f.key as keyof typeof features]}
                      onChange={() => setFeatures(prev => ({ ...prev, [f.key]: !prev[f.key as keyof typeof features] }))}
                      theme={theme} />
                    <span className={c('text-sm font-medium', d ? 'text-white/65' : 'text-slate-600')}>{f.label}</span>
                  </label>
                ))}
              </div>
            </Section>

            {/* Communication */}
            <Section title="Communication">
              <div className="flex items-center justify-between mb-3">
                <span className={c('text-sm font-semibold', txt(theme))}>Encryption</span>
                <Toggle checked={encryption} onChange={() => setEncryption(v => !v)} />
              </div>
              {encryption && (
                <div className={c('ml-4 pl-4 border-l', d ? 'border-indigo-500/20' : 'border-indigo-200')}>
                  <div className="flex gap-2 mb-3">
                    {(['AES-256', 'RSA-2048'] as const).map(t => (
                      <button key={t} onClick={() => setEncType(t)}
                        className={c('px-3 py-1.5 rounded-xl text-xs font-bold tr',
                          encType === t ? 'bg-indigo-600 text-white' : d ? 'bg-white/6 text-white/40 hover:text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-700')}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className={c('flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium',
                    d ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400' : 'bg-amber-50 border border-amber-200 text-amber-700')}>
                    ⚠ Ensure <span className="mono font-semibold mx-1">ENCRYPT_KEY</span> is set in your environment before deploying.
                  </div>
                </div>
              )}
            </Section>

            {/* Verification */}
            <Section title="Verification">
              <div className="flex flex-col gap-3">
                {[
                  { key: 'otp', val: otp, set: () => setOtp(v => !v), label: 'OTP (One-Time Password)', sub: 'Require a 6-digit OTP for each request' },
                  { key: 'token', val: accessToken, set: () => setAccessToken(v => !v), label: 'Access Token (Bearer)', sub: 'Attach JWT bearer token from env' },
                ].map(row => (
                  <label key={row.key} className="flex items-center gap-3 cursor-pointer">
                    <Checkbox checked={row.val} onChange={row.set} theme={theme} />
                    <div>
                      <p className={c('text-sm font-semibold', txt(theme))}>{row.label}</p>
                      <p className={c('text-xs', muted(theme))}>{row.sub}</p>
                    </div>
                  </label>
                ))}
              </div>
            </Section>

            {/* Config */}
            <Section title="Request Configuration">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={c('section-kicker block mb-1.5', d ? 'text-white/25' : 'text-slate-300')}>Method</label>
                  <select value={method} onChange={e => setMethod(e.target.value)} className={inputBase}>
                    {['GET','POST','PUT','PATCH','DELETE'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className={c('section-kicker block mb-1.5', d ? 'text-white/25' : 'text-slate-300')}>Permission</label>
                  <select value={permission} onChange={e => setPermission(e.target.value)} className={inputBase}>
                    <option value="tenant">tenant</option>
                    <option value="admin">admin</option>
                    <option value="public">public</option>
                  </select>
                </div>
                <div>
                  <label className={c('section-kicker block mb-1.5', d ? 'text-white/25' : 'text-slate-300')}>Page Size</label>
                  <input type="number" value={pageSize} onChange={e => setPageSize(e.target.value)} className={c(inputBase, 'mono')} />
                </div>
              </div>
            </Section>

            {/* Pre/Post process */}
            <Section title="Processing Functions">
              {[
                { label: 'Pre-Process', val: preFn, set: setPreFn, tip: 'Runs before the API call. Validate and transform input parameters.' },
                { label: 'Post-Process', val: postFn, set: setPostFn, tip: 'Runs after the API response. Transform or filter the returned data.' },
              ].map(fn => (
                <div key={fn.label} className="mb-4 last:mb-0">
                  <div className="flex items-center gap-2 mb-2">
                    <label className={c('section-kicker', d ? 'text-white/28' : 'text-slate-400')}>{fn.label}</label>
                    <div className="relative group/tip">
                      <HelpCircle size={12} className={muted(theme)} />
                      <div className={c(
                        'absolute left-5 top-0 z-20 w-52 px-3 py-2.5 rounded-xl text-xs leading-relaxed pointer-events-none',
                        'opacity-0 group-hover/tip:opacity-100 tr',
                        d ? 'bg-[#151C30] border border-indigo-500/25 text-white/60' : 'bg-white border border-slate-200 text-slate-500 shadow-lg'
                      )}>
                        {fn.tip}
                      </div>
                    </div>
                  </div>
                  <textarea value={fn.val} onChange={e => fn.set(e.target.value)} rows={5}
                    className={c(
                      'input-base px-4 py-3 w-full text-xs mono resize-none',
                      d ? 'bg-[#06090F] border border-indigo-500/18 text-indigo-200/70' : 'bg-slate-50 border border-slate-200 text-slate-600'
                    )} />
                </div>
              ))}
            </Section>

            <button onClick={() => setTab('output')}
              className="btn-primary w-full py-3.5 rounded-2xl text-sm">
              Generate Output →
            </button>
          </div>
        )}

        {tab === 'output' && (
          <div className="rounded-2xl overflow-hidden" style={{ border: d ? '1px solid rgba(79,70,229,0.2)' : '1px solid #E2E8F0' }}>
            <div className={c(
              'flex items-center justify-between px-5 py-3 border-b',
              d ? 'bg-[#06090F] border-indigo-500/15' : 'bg-slate-50 border-slate-200'
            )}>
              <span className={c('mono text-xs font-semibold', muted(theme))}>
                global.{name}_object.js
              </span>
              <button onClick={handleCopy}
                className={c('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border tr',
                  copied
                    ? d ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/8' : 'border-emerald-400 text-emerald-600 bg-emerald-50'
                    : d ? 'border-indigo-500/22 text-white/45 hover:text-white' : 'border-slate-200 text-slate-500 hover:text-slate-700'
                )}>
                {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>
            <pre className="code-panel p-6 text-[12.5px] leading-relaxed overflow-x-auto">
              <code className="text-indigo-200/80">{code}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
