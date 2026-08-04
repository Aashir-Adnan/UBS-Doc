import { useState, useEffect } from 'react'
import { Check, Square, Mic, Clock, StickyNote } from 'lucide-react'
import { c, card, txt, muted, divider, chipMint, chipIndigo, chipRed } from '../lib'
import type { Screen, Theme } from '../types'

interface Props { navigate: (s: Screen) => void; theme: Theme }

const STAGES = ['Pre-Meeting', 'Transcribe', 'Analyze', 'Tasks', 'Report']

const SEGMENTS = [
  { time: '00:00', label: 'Opening remarks', status: 'done', text: "Alright everyone, let's kick off. Today we're covering the Q3 sprint planning session — I'll hand over to Sarah to walk us through the prioritized backlog." },
  { time: '01:00', label: 'Sprint goals overview', status: 'done', text: "Our primary goals this sprint are: completing the tenant migration, shipping the ERD mapper to staging, and closing out the auth service RBAC tickets. James, want to give us your status on OAuth2?" },
  { time: '02:00', label: 'Auth service update', status: 'transcribing', text: "The PKCE flow is about 80% done. Waiting on the token exchange endpoint to be reviewed…" },
  { time: '03:00', label: 'API gateway discussion', status: 'recording', text: '' },
  { time: '04:00', label: 'Database migrations', status: 'recording', text: '' },
]

const NOTES = [
  { t: '00:48', note: 'Q3 sprint goals confirmed by Sarah' },
  { t: '01:22', note: 'Tenant migration is priority #1 this sprint' },
  { t: '01:55', note: 'ERD mapper blocked on DB schema upload feature' },
  { t: '02:18', note: 'James: OAuth2 PKCE flow — ETA Friday EOD' },
]

const SEG_CONFIG = {
  done: { label: 'Done', dot: 'bg-emerald-400', textDot: 'text-emerald-400' },
  transcribing: { label: 'Transcribing…', dot: 'bg-indigo-500 blink', textDot: 'text-indigo-400' },
  recording: { label: 'Recording', dot: 'bg-red-500 pulse-dot', textDot: 'text-red-400' },
  error: { label: 'Error', dot: 'bg-red-600', textDot: 'text-red-400' },
}

export default function MeetingTranscribe({ navigate, theme }: Props) {
  const [elapsed, setElapsed] = useState(185)
  const [recording, setRecording] = useState(true)
  const d = theme === 'dark'

  useEffect(() => {
    if (!recording) return
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [recording])

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[1240px] mx-auto px-10 py-10">
        {/* Stage nav */}
        <div className={c('flex items-center rounded-2xl overflow-hidden mb-8', card(theme))}>
          {STAGES.map((s, i) => (
            <button key={i}
              onClick={() => { if (i === 2) navigate('meetings-analyze') }}
              className={c(
                'flex-1 flex items-center justify-center gap-2 py-4 text-sm font-semibold relative tr',
                i === 1 ? 'text-indigo-500' :
                i < 1 ? d ? 'text-emerald-400' : 'text-emerald-600' :
                d ? 'text-white/22' : 'text-slate-300'
              )}>
              {i < 1 && <Check size={13} />}
              {s}
              {i === 1 && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-indigo-500" />}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_280px] gap-6">
          {/* Main recording area */}
          <div className="flex flex-col gap-5">
            {/* Control panel */}
            <div className={c(card(theme), 'p-6')}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-5">
                  {/* Record dot */}
                  <div className={c('w-4 h-4 rounded-full shrink-0', recording ? 'bg-red-500 pulse-dot' : 'bg-red-500/30')} />
                  <span className={c('mono font-extrabold', d ? 'text-white' : 'text-[#0F172A]')} style={{ fontSize: 34 }}>
                    {fmt(elapsed)}
                  </span>
                  <span className={c('text-sm font-semibold', muted(theme))}>
                    {recording ? 'Live recording' : 'Paused'}
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <button onClick={() => setRecording(r => !r)}
                    className={c(
                      'flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tr',
                      recording
                        ? d ? 'bg-red-500/15 text-red-400 hover:bg-red-500/22' : 'bg-red-50 text-red-600 hover:bg-red-100'
                        : d ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/22' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                    )}>
                    {recording ? <><Square size={11} /> Stop</> : <><Mic size={11} /> Resume</>}
                  </button>
                  <button onClick={() => navigate('meetings-analyze')}
                    className="btn-primary flex items-center gap-2 px-4 py-2 text-xs">
                    Analyze with Claude →
                  </button>
                </div>
              </div>

              {/* Waveform visualizer */}
              {recording && (
                <div className="flex items-end gap-0.5 h-8 mb-1">
                  {Array.from({ length: 48 }, (_, i) => (
                    <div key={i} className="flex-1 rounded-sm bg-indigo-500/60"
                      style={{
                        animation: `waveform ${0.5 + Math.random() * 0.8}s ease-in-out ${i * 0.04}s infinite alternate`,
                        minHeight: '3px',
                        maxHeight: '100%',
                        height: `${20 + Math.sin(i * 0.4) * 15}%`,
                      }} />
                  ))}
                </div>
              )}
            </div>

            {/* Segments */}
            <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-1">
              {SEGMENTS.map((seg, i) => {
                const cfg = SEG_CONFIG[seg.status as keyof typeof SEG_CONFIG]
                const isActive = seg.status === 'transcribing' || seg.status === 'recording'
                return (
                  <div key={i} className={c(
                    'rounded-2xl p-4 border tr',
                    seg.status === 'done'
                      ? d ? 'bg-emerald-500/5 border-emerald-500/18' : 'bg-emerald-50/70 border-emerald-200'
                      : seg.status === 'transcribing'
                        ? d ? 'bg-indigo-500/6 border-indigo-500/22' : 'bg-indigo-50/60 border-indigo-200'
                        : seg.status === 'recording'
                          ? d ? 'bg-red-500/4 border-red-500/18' : 'bg-red-50/50 border-red-200'
                          : d ? 'bg-white/3 border-white/8' : 'bg-slate-50 border-slate-200'
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={c('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
                        <span className={c('mono text-[11px] font-semibold', muted(theme))}>{seg.time}</span>
                        <span className={c('text-xs font-semibold', d ? 'text-white/65' : 'text-slate-600')}>{seg.label}</span>
                      </div>
                      <span className={c('chip text-[10px]',
                        seg.status === 'done' ? chipMint(theme) :
                        seg.status === 'transcribing' ? chipIndigo(theme) :
                        seg.status === 'recording' ? chipRed(theme) : ''
                      )}>{cfg.label}</span>
                    </div>
                    {seg.text && (
                      <p className={c('text-xs leading-relaxed ml-5', muted(theme))}>{seg.text}</p>
                    )}
                    {seg.status === 'recording' && (
                      <div className="ml-5 flex gap-0.5 items-end h-5 mt-1.5">
                        {Array.from({ length: 20 }, (_, j) => (
                          <div key={j} className="w-0.5 rounded-full bg-red-400/60"
                            style={{ animation: `waveform ${0.4 + Math.random() * 0.6}s ease-in-out ${j * 0.06}s infinite alternate`, minHeight: '2px', height: `${30 + Math.sin(j * 0.6) * 50}%` }} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Notes sidebar */}
          <div className={c(card(theme), 'p-5 h-fit')}>
            <div className="flex items-center gap-2 mb-4">
              <StickyNote size={14} className="text-indigo-500" />
              <span className={c('text-sm font-bold', txt(theme))}>Captured Notes</span>
              <span className="chip bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 ml-auto">{NOTES.length}</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {NOTES.map((n, i) => (
                <div key={i} className={c('rounded-xl px-3.5 py-3 border',
                  d ? 'bg-white/[0.032] border-indigo-500/12' : 'bg-slate-50 border-slate-200')}>
                  <span className={c('mono text-[10px] font-semibold block mb-1 text-indigo-500')}>{n.t}</span>
                  <p className={c('text-xs font-medium leading-snug', d ? 'text-white/60' : 'text-slate-600')}>{n.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
