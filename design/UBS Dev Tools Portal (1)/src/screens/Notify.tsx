import { useState } from 'react'
import { Check, Upload, Download, X } from 'lucide-react'
import AuroraText from '../components/ui/aurora-text'
import { c, card, txt, muted, inputCls, Breadcrumb } from '../lib'
import type { Theme } from '../types'

interface Props { theme: Theme; screen: 'notify' | 'lucid-sanitize' }

export default function NotifyScreen({ theme, screen }: Props) {
  return screen === 'notify'
    ? <NotifyCard theme={theme} />
    : <LucidCard theme={theme} />
}

function NotifyCard({ theme }: { theme: Theme }) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const d = theme === 'dark'

  return (
    <div className={c('min-h-full flex items-center justify-center p-8', d ? 'aurora-dark' : 'aurora-light')}>
      <div className={c('w-full max-w-[520px]', card(theme), 'rounded-3xl p-9')}>
        <div className="mb-7">
          <p className="section-kicker text-indigo-500 mb-2">Dev Tools / Notify</p>
          <h1 className="font-extrabold mb-1" style={{ fontSize: 34, letterSpacing: '-0.025em' }}><AuroraText>Report a Bug</AuroraText></h1>
          <p className={c('text-sm font-medium', muted(theme))}>Or request a new feature for the UBS Dev Tools Portal.</p>
        </div>

        {!sent ? (
          <div className="flex flex-col gap-4">
            <div>
              <label className={c('section-kicker block mb-2', d ? 'text-white/28' : 'text-slate-400')}>Subject</label>
              <input value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="Brief description of the issue or request"
                className={c(inputCls(theme), 'text-sm')} />
            </div>
            <div>
              <label className={c('section-kicker block mb-2', d ? 'text-white/28' : 'text-slate-400')}>Message</label>
              <textarea value={message} onChange={e => setMessage(e.target.value)}
                placeholder="Describe the bug or feature request in detail. Include steps to reproduce if applicable…"
                rows={6}
                className={c(inputCls(theme), 'resize-none text-sm')} />
            </div>
            <button onClick={() => setSent(true)}
              className="btn-primary w-full py-3.5 rounded-2xl text-sm mt-1">
              Send Report
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center py-10">
            <div className={c('w-14 h-14 rounded-2xl flex items-center justify-center mb-4',
              d ? 'bg-emerald-500/15 border border-emerald-500/25' : 'bg-emerald-50 border border-emerald-200')}>
              <Check size={26} className="text-emerald-500" />
            </div>
            <p className={c('font-extrabold text-xl mb-2', txt(theme))}>Sent!</p>
            <p className={c('text-sm text-center leading-relaxed mb-6', muted(theme))}>
              We'll follow up via your @granjur.com address within one business day.
            </p>
            <button onClick={() => { setSent(false); setSubject(''); setMessage('') }}
              className={c('text-xs font-semibold tr', d ? 'text-white/30 hover:text-white/60' : 'text-slate-400 hover:text-indigo-600')}>
              Submit another report
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function LucidCard({ theme }: { theme: Theme }) {
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'processing' | 'done'>('idle')
  const d = theme === 'dark'

  const handleSanitize = () => {
    setStatus('processing')
    setTimeout(() => setStatus('done'), 2200)
  }

  return (
    <div className={c('min-h-full flex items-center justify-center p-8', d ? 'aurora-dark' : 'aurora-light')}>
      <div className={c('w-full max-w-[520px]', card(theme), 'rounded-3xl p-9')}>
        <div className="mb-7">
          <p className="section-kicker text-indigo-500 mb-2">Dev Tools / Lucid Sanitize</p>
          <h1 className="font-extrabold mb-1" style={{ fontSize: 34, letterSpacing: '-0.025em' }}><AuroraText>Lucid Sanitize</AuroraText></h1>
          <p className={c('text-sm font-medium', muted(theme))}>Clean and sanitize Lucidchart export files.</p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); setFile('diagram_export.xml') }}
          onClick={() => !file && setFile('diagram_export.xml')}
          className={c(
            'rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer tr mb-5',
            dragOver
              ? 'border-indigo-500 bg-indigo-500/8'
              : file
                ? d ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-emerald-400 bg-emerald-50'
                : d ? 'border-indigo-500/25 hover:border-indigo-500/50 hover:bg-indigo-500/4' : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30'
          )}>
          {file ? (
            <div className="flex items-center justify-center gap-4">
              <div className={c('w-10 h-10 rounded-xl flex items-center justify-center',
                d ? 'bg-emerald-500/12' : 'bg-emerald-50')}>
                <Upload size={18} className="text-emerald-500" />
              </div>
              <div className="text-left">
                <p className={c('font-bold text-sm', d ? 'text-emerald-400' : 'text-emerald-600')}>{file}</p>
                <button onClick={e => { e.stopPropagation(); setFile(null); setStatus('idle') }}
                  className={c('text-xs flex items-center gap-1 mt-0.5 tr', muted(theme))}>
                  <X size={10} /> Remove
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className={c('w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3',
                d ? 'bg-indigo-500/12' : 'bg-indigo-50')}>
                <Upload size={22} className="text-indigo-500" />
              </div>
              <p className={c('text-sm font-semibold mb-1', txt(theme))}>Drop your Lucid export</p>
              <p className={c('text-xs', muted(theme))}>.xml · .csv · .xlsx · .lucid</p>
            </>
          )}
        </div>

        {file && status !== 'done' && (
          <button onClick={handleSanitize} disabled={status === 'processing'}
            className={c('btn-primary w-full py-3.5 rounded-2xl text-sm mb-4', status === 'processing' ? 'opacity-70 cursor-wait' : '')}>
            {status === 'processing' ? (
              <span className="flex items-center justify-center gap-2.5">
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent spin" />
                Sanitizing…
              </span>
            ) : 'Sanitize'}
          </button>
        )}

        {status === 'done' && (
          <div className={c('rounded-2xl p-5', d ? 'bg-emerald-500/8 border border-emerald-500/20' : 'bg-emerald-50 border border-emerald-200')}>
            <div className="flex items-center gap-2 mb-4">
              <Check size={15} className="text-emerald-500" />
              <p className={c('text-sm font-bold', d ? 'text-emerald-400' : 'text-emerald-700')}>
                Sanitization complete — 14 issues resolved
              </p>
            </div>
            <button className="btn-primary w-full py-3 text-sm rounded-xl flex items-center justify-center gap-2"
              style={{ background: '#10B981', boxShadow: '0 1px 3px rgba(16,185,129,0.25), 0 4px 12px rgba(16,185,129,0.2)' }}>
              <Download size={15} /> Download sanitized file
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
