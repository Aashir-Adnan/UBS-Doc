import React, { useEffect, useState } from 'react';
import { listTenants } from './tenantApi';
import AssignTenant from './AssignTenant';
import RoleManager from './RoleManager';
import GrantProjects from './GrantProjects';
import GrantRepos from './GrantRepos';
import UserPermissions from './UserPermissions';

// System (super-admin only). The cross-org surface that org admins never see.
//
// Rendering is already gated by the caller (tenantAdmin.jsx only mounts this when
// activeOrg.is_super_admin), and every action is re-checked server-side. For a
// super admin the org-scoped admin reads (listPortalUsers / listMembers / …) are
// NOT tenant-filtered, so the components below give a full cross-org view.
//
// MVP: an org picker + AssignTenant (moving a URDD between tenants — the core
// system action), plus inner access to the existing admin tools driven against
// every org. The picker preselects AssignTenant's destination tenant today; it is
// the anchor for growing per-org scoping into the other tools.

const SUB_TABS = [
  { key: 'assign', label: 'Assign tenant' },
  { key: 'roles', label: 'Roles' },
  { key: 'grant', label: 'Grant projects' },
  { key: 'grantRepos', label: 'Grant repos' },
  { key: 'permissions', label: 'Permissions' },
];

export default function SystemPanel({ adminUrdd, actorEmail }) {
  const [tenants, setTenants] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [focusTenant, setFocusTenant] = useState('');
  const [sub, setSub] = useState('assign');

  useEffect(() => {
    if (adminUrdd == null) return;
    let cancelled = false;
    listTenants(adminUrdd)
      .then((t) => { if (!cancelled) setTenants(Array.isArray(t?.tenants) ? t.tenants : []); })
      .catch((e) => { if (!cancelled) setLoadError(e.message); });
    return () => { cancelled = true; };
  }, [adminUrdd]);

  const focusId = focusTenant ? Number(focusTenant) : undefined;

  return (
    <div className="tenant-form">
      <div className="tenant-info-box">
        <strong>System administration</strong>
        <p className="tenant-muted" style={{ margin: '0.35rem 0 0' }}>
          Platform-wide tools that reach across every organization. Only platform
          admins see this tab.
        </p>
      </div>

      <label className="tenant-field" style={{ maxWidth: 360 }}>
        <span>Organization / tenant</span>
        <select value={focusTenant} onChange={(e) => setFocusTenant(e.target.value)}>
          <option value="">All organizations</option>
          {tenants.map((t) => (
            <option key={t.tenant_id} value={t.tenant_id}>
              {t.tenant_name || t.tenant_slug || `Tenant ${t.tenant_id}`}
              {` — #${t.tenant_id}`}
            </option>
          ))}
        </select>
      </label>
      {loadError && <p className="tenant-error">Failed to load organizations: {loadError}</p>}

      <div className="tenant-admin-tabs">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tenant-tab${sub === t.key ? ' tenant-tab-active' : ''}`}
            onClick={() => setSub(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {sub === 'assign' && <AssignTenant adminUrdd={adminUrdd} defaultTenantId={focusId} />}
        {sub === 'roles' && <RoleManager adminUrdd={adminUrdd} actorEmail={actorEmail} />}
        {sub === 'grant' && <GrantProjects adminUrdd={adminUrdd} />}
        {sub === 'grantRepos' && <GrantRepos adminUrdd={adminUrdd} />}
        {sub === 'permissions' && <UserPermissions adminUrdd={adminUrdd} actorEmail={actorEmail} />}
      </div>
    </div>
  );
}
