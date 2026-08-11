// Pure derivations for the Tenant Admin screen, pulled out of TenantAdmin.tsx so
// the security-critical tab-visibility rule can be exercised directly by a
// vitest test without mounting React (browser/backend verification is
// gate-blocked for this task — see task-15-report.md).
//
// SECURITY-CRITICAL: `deriveTabs` / `shouldResetSystemTab` are the ONLY gate
// standing between a plain org admin and the System tab (cross-org tools,
// including AssignTenant). Keep this file's logic byte-for-byte equivalent to
// the pre-migration src/pages/tools/tenantAdmin.jsx: ORG_TABS is fixed,
// SYSTEM_TAB is appended only when isSuperAdmin is true, and it is always last.

export interface OrgTab {
  key: string;
  label: string;
}

// Org-scoped tabs: any org admin sees these and they act on the ACTIVE org from
// the switcher (the backend scopes their data to that org's tenant). The
// 'assign' action (moving a URDD between tenants) is a system action and lives
// under System — it is NOT one of these and must never be added here.
export const ORG_TABS: OrgTab[] = [
  { key: 'org', label: 'Organization' },
  { key: 'provision', label: 'Provision user' },
  { key: 'grant', label: 'Grant projects' },
  { key: 'grantRepos', label: 'Grant repos' },
  { key: 'roles', label: 'Roles' },
  { key: 'permissions', label: 'Permissions' },
];

// Shown only to platform (super) admins.
export const SYSTEM_TAB: OrgTab = { key: 'system', label: 'System' };

// The whole tab-visibility decision, as a pure function of `isSuperAdmin`
// (== !!activeOrg?.is_super_admin) — non-super-admins must NEVER see System.
// Always returns a FRESH array (never the shared ORG_TABS reference) so a
// caller mutating its result (e.g. sort/push) can never corrupt what the next
// call — for a different acting user/org — sees.
export function deriveTabs(isSuperAdmin: boolean): OrgTab[] {
  return isSuperAdmin ? [...ORG_TABS, SYSTEM_TAB] : [...ORG_TABS];
}

// Mirrors the reset useEffect: never leave the super-admin-only tab selected
// after losing super status (e.g. switching to an org where the acting user is
// only an org admin). Returns true when the screen must fall back to 'org'.
export function shouldResetSystemTab(tab: string, isSuperAdmin: boolean): boolean {
  return tab === 'system' && !isSuperAdmin;
}

interface OrgLike {
  display_name?: string | null;
  org_name?: string | null;
  tenant_name?: string | null;
}

export function orgLabel(activeOrg: OrgLike | null | undefined): string | null {
  return activeOrg?.display_name || activeOrg?.org_name || activeOrg?.tenant_name || null;
}

// ---- Stat cards -----------------------------------------------------------

interface MemberLike {
  is_active?: boolean;
  urdd_id?: number | string | null;
}

export interface MemberStats {
  total: number;
  active: number;
  pending: number;
}

// Total / Active / Pending counts from a listPortalUsers(adminUrdd) response's
// `users` array — the SAME org-scoped call RoleManager.jsx drives its rows
// from. (listMembers(adminUrdd)'s rows are URDD rows: urdd_id is never null
// there and is_active isn't a field at all, so it cannot answer either of
// these — that mismatch was caught in review and is why this reads from
// listPortalUsers instead.)
//
// `active` mirrors RoleManager's own inactive badge exactly: it renders
// "inactive" whenever `!u.is_active`, i.e. is_active must be truthy to count
// as active — undefined/0/false/null all count against it, same as there.
// `pending` mirrors RoleManager's `urdd_id === null` check verbatim (an
// explicit null, not "falsy" — 0 is a valid urdd_id and must not count).
export function computeMemberStats(members: MemberLike[] | null | undefined): MemberStats | null {
  if (!members) return null;
  return {
    total: members.length,
    active: members.filter((m) => !!m.is_active).length,
    pending: members.filter((m) => m.urdd_id === null).length,
  };
}
