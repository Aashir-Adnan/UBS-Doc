import { useCallback, useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { c, card, txt, muted, Breadcrumb } from '../lib'
import { useTheme } from '../app/ThemeContext'
import { useAuthTyped as useAuth } from '../components/portal/authTypes'
import { useActingUrdd } from '../components/portal/tenantProjects/useActingUrdd'
import AuroraText from '../components/ui/aurora-text'
import { listPortalUsers, listTenants } from '../components/portal/tenantProjects/tenantApi'
import {
  deriveTabs, shouldResetSystemTab, orgLabel, computeMemberStats,
} from './tenantAdminLogic'
import GrantProjects from '../components/portal/tenantProjects/GrantProjects'
import GrantRepos from '../components/portal/tenantProjects/GrantRepos'
import ProvisionUser from '../components/portal/tenantProjects/ProvisionUser'
import OrganizationManager from '../components/portal/tenantProjects/OrganizationManager'
import RoleManager from '../components/portal/tenantProjects/RoleManager'
import UserPermissions from '../components/portal/tenantProjects/UserPermissions'
import SystemPanel from '../components/portal/tenantProjects/SystemPanel'
import type { Theme } from '../types'

// Design chrome from design/UBS Dev Tools Portal (1)/src/screens/TenantAdmin.tsx
// (the AdminConsole variant — its AccessStateScreen was already extracted in
// Task 6 and lives at src/components/guards/AccessState.tsx, mounted by
// ToolGuard route-level). The mock's own tab set, member mock data, and
// "Assign Tenant" top-level tab are NOT used here: the tab list, the
// super-admin gate, and every tab's component + props below are carried
// forward VERBATIM from the pre-migration src/pages/tools/tenantAdmin.jsx —
// see src/screens/tenantAdminLogic.ts for the extracted, tested pure logic.
// "Assign Tenant" is a cross-org action and stays reachable only through the
// System tab's SystemPanel, exactly as it was before this migration.

interface MemberRow {
  is_active?: boolean
  urdd_id?: number | string | null
}

function StatCard({
  label, value, sub, loading, theme,
}: { label: string; value: string; sub: string; loading?: boolean; theme: Theme }) {
  const d = theme === 'dark'
  return (
    <div className={c(card(theme), 'rounded-2xl px-5 py-4 min-w-0')}>
      <p className={c('section-kicker mb-2', d ? 'text-white/28' : 'text-slate-400')}>{label}</p>
      {loading ? (
        <div className="flex items-center gap-1.5" style={{ height: 32 }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={c('w-2 h-2 rounded-full pulse-dot', d ? 'bg-white/30' : 'bg-slate-300')}
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      ) : (
        <p className={c('font-extrabold text-2xl mb-0.5 truncate', txt(theme))}>{value}</p>
      )}
      <p className={c('text-xs truncate', muted(theme))}>{sub}</p>
    </div>
  )
}

export default function TenantAdmin() {
  const { theme } = useTheme()
  const d = theme === 'dark'
  const { user, signOut } = useAuth()
  const { urdd: adminUrdd, activeOrg, refetch, status: orgStatus } = useActingUrdd()
  const [tab, setTab] = useState('org')

  // True while useActingUrdd is still resolving the acting org/URDD (has not
  // reached 'ready' or 'pending' yet) — used below to keep the stat cards in
  // their loading skeleton instead of flashing a fabricated "0" before we
  // actually know whether there is an acting org at all.
  const orgResolving = orgStatus === 'idle' || orgStatus === 'loading'

  const isSuperAdmin = !!activeOrg?.is_super_admin
  const tabs = deriveTabs(isSuperAdmin)
  const activeOrgName = orgLabel(activeOrg)

  // Never leave the super-admin-only tab selected after losing super status
  // (e.g. switching to an org where you are only an org admin). Verbatim from
  // the pre-migration page, just routed through the pure predicate above so it
  // can be unit-tested without mounting this component.
  useEffect(() => {
    if (shouldResetSystemTab(tab, isSuperAdmin)) setTab('org')
  }, [tab, isSuperAdmin])

  // ---- Stat cards: real data, loading skeleton, graceful failure ----------
  const [members, setMembers] = useState<MemberRow[] | null>(null)
  const [membersLoading, setMembersLoading] = useState(true)
  const [membersError, setMembersError] = useState<string | null>(null)

  // Sourced from listPortalUsers(adminUrdd) — the SAME org-scoped call
  // RoleManager.jsx drives its rows from — not listMembers(adminUrdd): that
  // endpoint's rows are URDD rows, where urdd_id is never null and is_active
  // isn't a field at all, so it cannot answer either Active or Pending.
  const loadMembers = useCallback(() => {
    if (adminUrdd == null) {
      // Not necessarily "no members" — useActingUrdd may still be resolving
      // the acting org. Only settle into a real (non-loading) empty state
      // once orgResolving is false, so the cards never flash "0 Total
      // Members" before the org has finished loading.
      setMembers(null)
      setMembersLoading(orgResolving)
      return undefined
    }
    let cancelled = false
    setMembersLoading(true)
    setMembersError(null)
    listPortalUsers(adminUrdd)
      .then((res: any) => {
        if (cancelled) return
        setMembers(Array.isArray(res?.users) ? res.users : [])
      })
      .catch((e: any) => { if (!cancelled) setMembersError(e?.message || 'Failed to load members'); })
      .finally(() => { if (!cancelled) setMembersLoading(false) })
    return () => { cancelled = true }
  }, [adminUrdd, orgResolving])

  useEffect(() => loadMembers(), [loadMembers])

  const [tenantsCount, setTenantsCount] = useState<number | null>(null)
  const [tenantsLoading, setTenantsLoading] = useState(false)
  const [tenantsError, setTenantsError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSuperAdmin || adminUrdd == null) {
      setTenantsCount(null)
      setTenantsError(null)
      return undefined
    }
    let cancelled = false
    setTenantsLoading(true)
    setTenantsError(null)
    listTenants(adminUrdd)
      .then((res: any) => {
        if (cancelled) return
        setTenantsCount(Array.isArray(res?.tenants) ? res.tenants.length : 0)
      })
      .catch((e: any) => { if (!cancelled) setTenantsError(e?.message || 'Failed to load tenants'); })
      .finally(() => { if (!cancelled) setTenantsLoading(false) })
    return () => { cancelled = true }
  }, [isSuperAdmin, adminUrdd])

  const memberStats = computeMemberStats(members)

  const statCards = [
    {
      label: 'Total Members',
      value: membersError ? '—' : String(memberStats?.total ?? 0),
      sub: membersError ? 'Failed to load' : 'in this organization',
      loading: membersLoading,
    },
    {
      label: 'Active',
      value: membersError ? '—' : String(memberStats?.active ?? 0),
      sub: membersError ? 'Failed to load' : 'active accounts',
      loading: membersLoading,
    },
    {
      label: 'Pending',
      value: membersError ? '—' : String(memberStats?.pending ?? 0),
      sub: membersError ? 'Failed to load' : 'awaiting provision',
      loading: membersLoading,
    },
    isSuperAdmin
      ? {
        label: 'Tenants',
        value: tenantsError ? '—' : String(tenantsCount ?? 0),
        sub: tenantsError ? 'Failed to load' : 'across the platform',
        loading: tenantsLoading,
      }
      : {
        label: 'Organization',
        // While the org is still resolving, isSuperAdmin reads false by
        // default (activeOrg is null) — show the skeleton here too rather
        // than a premature "—", which would otherwise flash before we know
        // this branch is even the right one.
        value: activeOrgName || '—',
        sub: 'currently selected',
        loading: orgResolving,
      },
  ]

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[1100px] mx-auto px-10 py-10">
        <Breadcrumb items={['UBS', 'Dev Tools', 'Tenant Admin']} theme={theme} />

        {/* Page header — copy preserved from the pre-migration hero (manage-THIS-org
            framing, super-admin System note, signed-in-as + sign-out) inside the
            design's title + permission-gated amber pill layout. */}
        <div className="flex items-start justify-between gap-6 mb-4">
          <div>
            <h1 className="font-extrabold mb-1.5" style={{ fontSize: 40, letterSpacing: '-0.025em' }}>
              <AuroraText>Organization Admin</AuroraText>
            </h1>
            <p className={c('text-sm font-medium', muted(theme))}>
              Manage{' '}
              {activeOrgName ? <strong className={txt(theme)}>{activeOrgName}</strong> : 'the organization'}
              {' '}— the org currently selected in the switcher. Provision members and
              manage project / repo access for this organization.
            </p>
          </div>
          <div className={c(
            'flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold mt-1 shrink-0 whitespace-nowrap',
            d ? 'bg-amber-500/10 border border-amber-500/18 text-amber-400'
              : 'bg-amber-50 border border-amber-200 text-amber-700',
          )}
          >
            <AlertCircle size={13} />
            Actions are permission-gated
          </div>
        </div>

        <p className={c('text-sm font-medium mb-2', muted(theme))}>
          Signed in as <strong className={txt(theme)}>{user?.name || user?.email}</strong>.{' '}
          <button type="button" className="portal-signout-link" onClick={signOut}>
            Sign out
          </button>
        </p>
        <p className={c('text-xs mb-8', muted(theme))}>
          These actions apply to the active organization and are gated by permission,
          not by role, and enforced on the server — without the right permission you
          receive an error even though the screens are visible.
          {isSuperAdmin && ' Cross-organization tools live under the System tab.'}
        </p>

        {/* Stats row — real listPortalUsers/listTenants data, pulse-dot skeleton
            while loading (including while the acting org itself is still
            resolving), "—" if the fetch fails (never a fabricated number). */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {statCards.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} loading={s.loading} theme={theme} />
          ))}
        </div>

        {/* Tab bar — ORG_TABS always; SYSTEM_TAB appended only for a super admin,
            derived by the same deriveTabs() the unit tests pin down. */}
        <div className={c('flex border-b mb-8 overflow-x-auto', d ? 'border-white/8' : 'border-slate-200')}>
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={c(
                'flex-shrink-0 px-5 py-3 text-sm font-semibold relative tr whitespace-nowrap',
                tab === t.key
                  ? 'text-indigo-500'
                  : d ? 'text-white/35 hover:text-white/65' : 'text-slate-400 hover:text-slate-700',
              )}
            >
              {t.label}
              {tab === t.key && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-indigo-500 rounded-t" />}
            </button>
          ))}
        </div>

        <div className={c(card(theme), 'rounded-2xl p-6')}>
          {tab === 'org' && (
            <OrganizationManager email={user?.email} onOrgChanged={refetch} />
          )}
          {tab === 'provision' && (
            <ProvisionUser
              adminUrdd={adminUrdd}
              actorEmail={user?.email}
              // Verbatim `refetch` (org switcher refresh) from the pre-migration
              // page, plus a reload of the stat-card member list — new here since
              // the old page had no member stats to keep in sync.
              onProvisioned={() => { refetch(); loadMembers(); }}
            />
          )}
          {tab === 'grant' && <GrantProjects adminUrdd={adminUrdd} />}
          {tab === 'grantRepos' && <GrantRepos adminUrdd={adminUrdd} />}
          {tab === 'roles' && (
            <RoleManager adminUrdd={adminUrdd} actorEmail={user?.email} />
          )}
          {tab === 'permissions' && (
            <UserPermissions adminUrdd={adminUrdd} actorEmail={user?.email} />
          )}
          {tab === 'system' && isSuperAdmin && (
            <SystemPanel adminUrdd={adminUrdd} actorEmail={user?.email} />
          )}
        </div>
      </div>
    </div>
  )
}
