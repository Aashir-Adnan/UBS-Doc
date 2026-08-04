import { describe, it, expect } from 'vitest';
import {
  deriveTabs, shouldResetSystemTab, orgLabel, computeMemberStats,
} from './tenantAdminLogic';

// Browser/backend verification is gate-blocked for Task 15 (Tenant Admin
// console). This file is the substitute for it: `deriveTabs` /
// `shouldResetSystemTab` are the exact gate that decides whether a caller sees
// the System tab, so a regression here is a real privilege leak, not a cosmetic
// bug — worth pinning down with tests even without a browser.

describe('deriveTabs', () => {
  it('gives a non-super-admin exactly the 6 org tabs, no System', () => {
    const tabs = deriveTabs(false);
    expect(tabs).toHaveLength(6);
    expect(tabs.map((t) => t.key)).toEqual([
      'org', 'provision', 'grant', 'grantRepos', 'roles', 'permissions',
    ]);
    expect(tabs.some((t) => t.key === 'system')).toBe(false);
  });

  it('gives a super admin all 7 tabs with System last', () => {
    const tabs = deriveTabs(true);
    expect(tabs).toHaveLength(7);
    expect(tabs[tabs.length - 1]).toEqual({ key: 'system', label: 'System' });
    expect(tabs.map((t) => t.key)).toEqual([
      'org', 'provision', 'grant', 'grantRepos', 'roles', 'permissions', 'system',
    ]);
  });

  it('never includes a top-level "assign" tab — Assign Tenant lives only inside SystemPanel', () => {
    expect(deriveTabs(false).some((t) => t.key === 'assign')).toBe(false);
    expect(deriveTabs(true).some((t) => t.key === 'assign')).toBe(false);
  });
});

describe('shouldResetSystemTab', () => {
  it('resets away from system when super-admin status is lost', () => {
    expect(shouldResetSystemTab('system', false)).toBe(true);
  });

  it('does not reset system while still a super admin', () => {
    expect(shouldResetSystemTab('system', true)).toBe(false);
  });

  it('never fires for any other tab, super admin or not', () => {
    for (const tab of ['org', 'provision', 'grant', 'grantRepos', 'roles', 'permissions']) {
      expect(shouldResetSystemTab(tab, false)).toBe(false);
      expect(shouldResetSystemTab(tab, true)).toBe(false);
    }
  });
});

describe('orgLabel', () => {
  it('prefers display_name, then org_name, then tenant_name', () => {
    expect(orgLabel({ display_name: 'D', org_name: 'O', tenant_name: 'T' })).toBe('D');
    expect(orgLabel({ org_name: 'O', tenant_name: 'T' })).toBe('O');
    expect(orgLabel({ tenant_name: 'T' })).toBe('T');
  });

  it('returns null for no org / no labels', () => {
    expect(orgLabel(null)).toBeNull();
    expect(orgLabel(undefined)).toBeNull();
    expect(orgLabel({})).toBeNull();
  });
});

describe('computeMemberStats', () => {
  it('returns null while members have not loaded', () => {
    expect(computeMemberStats(null)).toBeNull();
    expect(computeMemberStats(undefined)).toBeNull();
  });

  it('counts total / active / pending independently, matching RoleManager\'s rules', () => {
    const members = [
      { urdd_id: 1, is_active: true },
      { urdd_id: 2, is_active: false },
      { urdd_id: null, is_active: true }, // pending, still active
      { urdd_id: 3 }, // is_active omitted -> counts as active
    ];
    expect(computeMemberStats(members)).toEqual({ total: 4, active: 3, pending: 1 });
  });

  it('treats an empty list as all-zero, not null', () => {
    expect(computeMemberStats([])).toEqual({ total: 0, active: 0, pending: 0 });
  });
});
