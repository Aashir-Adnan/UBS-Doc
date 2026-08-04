import { useState } from 'react'
import { AlertCircle, Check, Lock, Clock, Shield } from 'lucide-react'
import { c, card, txt, muted, divider, inputCls, chipMint, chipAmber, chipRed, chipIndigo, chipViolet, chipGray, Breadcrumb } from '../lib'
import type { Screen, Theme } from '../types'

interface Props { navigate: (s: Screen) => void; theme: Theme; screen: 'tenant-admin' | 'access-restricted' | 'loading-state' | 'pending-state' }

const TABS = ['Organization', 'Provision', 'Assign Tenant', 'Grant Projects', 'Grant Repos', 'Roles', 'Permissions']

const MEMBERS = [
  { name: 'Sarah Martinez', email: 'sarah@granjur.com', role: 'Admin', tenant: 'granjur.com', status: 'Active', joined: '2024-01-15' },
  { name: 'James Rodriguez', email: 'james@granjur.com', role: 'Developer', tenant: 'granjur.com', status: 'Active', joined: '2024-02-20' },
  { name: 'Ana Torres', email: 'ana@granjur.com', role: 'Developer', tenant: 'granjur.com', status: 'Active', joined: '2024-03-10' },
  { name: 'Dev Patel', email: 'dev@granjur.com', role: 'Viewer', tenant: 'granjur.com', status: 'Pending', joined: '2025-07-28' },
  { name: 'Chris Liu', email: 'chris@granjur.com', role: 'Developer', tenant: 'granjur.com', status: 'Active', joined: '2024-06-01' },
]

export default function TenantAdmin({ navigate, theme, screen }: Props) {
  if (screen !== 'tenant-admin') {
    return <AccessStateScreen type={screen} theme={theme} navigate={navigate} />
  }
  return <AdminConsole theme={theme} />
}

function AdminConsole({ theme }: { theme: Theme }) {
  const [activeTab, setActiveTab] = useState(1)
  const [email, setEmail] = useState('')
  const [tenant, setTenant] = useState('granjur.com')
  const [role, setRole] = useState('Developer')
  const [provisioned, setProvisioned] = useState(false)
  const d = theme === 'dark'

  const roleChip = (r: string) =>
    r === 'Admin' ? chipViolet(theme) :
    r === 'Developer' ? chipIndigo(theme) : chipGray(theme)

  const statusChip = (s: string) =>
    s === 'Active' ? chipMint(theme) : chipAmber(theme)

  // Initials avatar colour per role
  const avatarBg: Record<string, string> = {
    Admin: '#4F46E5', Developer: '#0EA5E9', Viewer: '#64748B'
  }

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[1100px] mx-auto px-10 py-10">
        <Breadcrumb items={['UBS', 'Dev Tools', 'Tenant Admin']} theme={theme} />

        {/* Page header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="grad-text font-extrabold mb-1.5" style={{ fontSize: 40, letterSpacing: '-0.025em' }}>
              Admin Console
            </h1>
            <p className={c('text-sm font-medium', muted(theme))}>
              granjur.com &mdash; {MEMBERS.length} members
            </p>
          </div>
          <div className={c(
            'flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold mt-1',
            d ? 'bg-amber-500/10 border border-amber-500/18 text-amber-400'
              : 'bg-amber-50 border border-amber-200 text-amber-700'
          )}>
            <AlertCircle size={13} />
            Actions are permission-gated
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Members', value: '5', sub: '+1 this month' },
            { label: 'Active', value: '4', sub: '80% of seats' },
            { label: 'Pending', value: '1', sub: 'Awaiting provision' },
            { label: 'Tenants', value: '3', sub: 'dev · staging · prod' },
          ].map((s, i) => (
            <div key={i} className={c(card(theme), 'rounded-2xl px-5 py-4')}>
              <p className={c('section-kicker mb-2', d ? 'text-white/28' : 'text-slate-400')}>{s.label}</p>
              <p className={c('font-extrabold text-2xl mb-0.5', txt(theme))}>{s.value}</p>
              <p className={c('text-xs', muted(theme))}>{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div className={c('flex border-b mb-8 overflow-x-auto', d ? 'border-white/8' : 'border-slate-200')}>
          {TABS.map((t, i) => (
            <button key={i} onClick={() => setActiveTab(i)}
              className={c(
                'flex-shrink-0 px-5 py-3 text-sm font-semibold relative tr whitespace-nowrap',
                activeTab === i
                  ? 'text-indigo-500'
                  : d ? 'text-white/35 hover:text-white/65' : 'text-slate-400 hover:text-slate-700'
              )}>
              {t}
              {activeTab === i && (
                <div className="absolute bottom-0 inset-x-0 h-0.5 bg-indigo-500 rounded-t" />
              )}
            </button>
          ))}
        </div>

        {/* ── Provision tab ─────────────────────────────── */}
        {activeTab === 1 && (
          <div className="flex flex-col gap-6">
            {/* Inline provision form */}
            <div className={c(card(theme), 'rounded-2xl p-6')}>
              <p className={c('font-bold text-[15px] mb-5', txt(theme))}>Provision a User</p>

              {!provisioned ? (
                <div className="flex items-end gap-3">
                  <div className="flex-1 min-w-0">
                    <label className={c('section-kicker block mb-2', d ? 'text-white/28' : 'text-slate-400')}>
                      Email Address
                    </label>
                    <input
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="user@granjur.com"
                      className={c(inputCls(theme), 'text-sm')}
                    />
                  </div>
                  <div className="w-48 shrink-0">
                    <label className={c('section-kicker block mb-2', d ? 'text-white/28' : 'text-slate-400')}>
                      Tenant
                    </label>
                    <select
                      value={tenant}
                      onChange={e => setTenant(e.target.value)}
                      className={c(inputCls(theme), 'text-sm')}
                    >
                      <option value="granjur.com">granjur.com</option>
                      <option value="staging.granjur.com">staging</option>
                      <option value="dev.granjur.com">dev</option>
                    </select>
                  </div>
                  <div className="w-36 shrink-0">
                    <label className={c('section-kicker block mb-2', d ? 'text-white/28' : 'text-slate-400')}>
                      Role
                    </label>
                    <select
                      value={role}
                      onChange={e => setRole(e.target.value)}
                      className={c(inputCls(theme), 'text-sm')}
                    >
                      <option>Developer</option>
                      <option>Admin</option>
                      <option>Viewer</option>
                    </select>
                  </div>
                  <button
                    onClick={() => { if (email) setProvisioned(true) }}
                    className="btn-primary px-6 py-2.5 text-sm rounded-xl shrink-0 whitespace-nowrap"
                    style={{ marginBottom: '0' }}
                  >
                    Provision
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className={c(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold flex-1',
                    d ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  )}>
                    <Check size={15} />
                    <span>
                      <span className="font-bold">{email || 'user@granjur.com'}</span> provisioned as{' '}
                      <span className="font-bold">{role}</span> on{' '}
                      <span className="font-bold">{tenant}</span>
                    </span>
                  </div>
                  <button
                    onClick={() => { setProvisioned(false); setEmail('') }}
                    className={c('ml-4 text-xs font-semibold tr shrink-0',
                      d ? 'text-white/30 hover:text-white/60' : 'text-slate-400 hover:text-slate-600')}
                  >
                    Provision another
                  </button>
                </div>
              )}
            </div>

            {/* Members table — full width, generous rows */}
            <div className={c(card(theme), 'overflow-hidden rounded-2xl')}>
              <div className={c('px-6 py-5 border-b flex items-center justify-between', divider(theme))}>
                <p className={c('font-bold text-[15px]', txt(theme))}>Members</p>
                <div className="flex items-center gap-2">
                  <span className={c('chip', d
                    ? 'bg-indigo-500/12 text-indigo-400 border border-indigo-500/20'
                    : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                  )}>
                    {MEMBERS.length} total
                  </span>
                </div>
              </div>

              {/* Column headers */}
              <div className={c(
                'grid px-6 py-3 border-b section-kicker',
                divider(theme),
                d ? 'text-white/22' : 'text-slate-300'
              )} style={{ gridTemplateColumns: '2.5fr 2.5fr 1fr 1fr 100px' }}>
                <span>Member</span>
                <span>Email</span>
                <span>Role</span>
                <span>Status</span>
                <span>Joined</span>
              </div>

              {MEMBERS.map((m, i) => {
                const initials = m.name.split(' ').map(n => n[0]).join('')
                return (
                  <div key={i}
                    className={c(
                      'grid items-center px-6 py-4 border-b last:border-0 tr',
                      divider(theme),
                      d ? 'hover:bg-white/[0.022]' : 'hover:bg-slate-50/60'
                    )}
                    style={{ gridTemplateColumns: '2.5fr 2.5fr 1fr 1fr 100px' }}
                  >
                    {/* Member with avatar */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                        style={{ background: avatarBg[m.role] ?? '#4F46E5' }}
                      >
                        {initials}
                      </div>
                      <span className={c('text-sm font-semibold truncate', txt(theme))}>{m.name}</span>
                    </div>

                    <span className={c('text-xs mono truncate pr-4', muted(theme))}>{m.email}</span>
                    <span className={roleChip(m.role)}>{m.role}</span>
                    <span className={statusChip(m.status)}>{m.status}</span>
                    <span className={c('text-xs mono', muted(theme))}>{m.joined}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Other tabs — locked state */}
        {activeTab !== 1 && (
          <div className="flex flex-col items-center justify-center py-28">
            <div className={c(
              'w-12 h-12 rounded-2xl flex items-center justify-center mb-4',
              d ? 'bg-white/5 border border-white/8' : 'bg-slate-100'
            )}>
              <Lock size={20} className={muted(theme)} />
            </div>
            <p className={c('font-bold text-base mb-1.5', txt(theme))}>{TABS[activeTab]}</p>
            <p className={c('text-sm', muted(theme))}>
              Elevated permissions required to access this section
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function AccessStateScreen({ type, theme, navigate }: { type: string; theme: Theme; navigate: (s: Screen) => void }) {
  const d = theme === 'dark'

  const config = {
    'loading-state': {
      icon: <div className="w-10 h-10 rounded-full border-[3px] border-indigo-500/25 border-t-indigo-500 spin" />,
      title: 'Loading…',
      sub: 'Connecting to UBS Dev Tools. This should only take a moment.',
      action: null,
    },
    'access-restricted': {
      icon: (
        <div className={c('w-12 h-12 rounded-2xl flex items-center justify-center',
          d ? 'bg-red-500/14 border border-red-500/22' : 'bg-red-50 border border-red-200')}>
          <Lock size={22} className={d ? 'text-red-400' : 'text-red-600'} />
        </div>
      ),
      title: 'Access Restricted',
      sub: 'Your account hasn\'t been provisioned for UBS Dev Tools. Contact your administrator to request access.',
      action: (
        <button onClick={() => navigate('signin')}
          className={c('mt-5 text-xs font-semibold tr', d ? 'text-white/30 hover:text-white/60' : 'text-slate-400 hover:text-indigo-600')}>
          Sign out →
        </button>
      ),
    },
    'pending-state': {
      icon: (
        <div className={c('w-12 h-12 rounded-2xl flex items-center justify-center',
          d ? 'bg-amber-500/12 border border-amber-500/22' : 'bg-amber-50 border border-amber-200')}>
          <Clock size={22} className={d ? 'text-amber-400' : 'text-amber-600'} />
        </div>
      ),
      title: 'Access Pending',
      sub: 'You\'re signed in but not yet provisioned. An administrator will approve your access shortly.',
      action: null,
    },
  }

  const cfg = config[type as keyof typeof config]

  return (
    <div className={c('min-h-full flex items-center justify-center p-8', d ? 'aurora-dark' : 'aurora-light')}>
      <div className={c('w-[380px] text-center', card(theme), 'rounded-3xl px-10 py-12')}>
        <div className="flex justify-center mb-5">{cfg.icon}</div>
        <h2 className={c('font-extrabold text-xl mb-2.5', txt(theme))}>{cfg.title}</h2>
        <p className={c('text-sm leading-relaxed', muted(theme))}>{cfg.sub}</p>
        {cfg.action}
      </div>
    </div>
  )
}
