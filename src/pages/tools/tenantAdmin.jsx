import React, { useEffect, useState } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useAuth } from '@site/src/components/portal/authStore';
import PortalSignIn from '@site/src/components/portal/PortalSignIn';
import { usePortalAccess } from '@site/src/components/portal/usePortalAccess';
import AccessRestricted from '@site/src/components/portal/AccessRestricted';
import { useActingUrdd } from '@site/src/components/portal/tenantProjects/useActingUrdd';
import GrantProjects from '@site/src/components/portal/tenantProjects/GrantProjects';
import GrantRepos from '@site/src/components/portal/tenantProjects/GrantRepos';
import ProvisionUser from '@site/src/components/portal/tenantProjects/ProvisionUser';
import OrganizationManager from '@site/src/components/portal/tenantProjects/OrganizationManager';
import RoleManager from '@site/src/components/portal/tenantProjects/RoleManager';
import UserPermissions from '@site/src/components/portal/tenantProjects/UserPermissions';
import SystemPanel from '@site/src/components/portal/tenantProjects/SystemPanel';

// Org-scoped tabs: any org admin sees these and they act on the ACTIVE org from
// the switcher (the backend scopes their data to that org's tenant). The 'assign'
// tab (moving a URDD between tenants) is a system action and lives under System.
const ORG_TABS = [
  { key: 'org', label: 'Organization' },
  { key: 'provision', label: 'Provision user' },
  { key: 'grant', label: 'Grant projects' },
  { key: 'grantRepos', label: 'Grant repos' },
  { key: 'roles', label: 'Roles' },
  { key: 'permissions', label: 'Permissions' },
];

// Shown only to platform (super) admins.
const SYSTEM_TAB = { key: 'system', label: 'System' };

function orgLabel(activeOrg) {
  return activeOrg?.display_name || activeOrg?.org_name || activeOrg?.tenant_name || null;
}

function TenantAdminContent() {
  const { user, signOut } = useAuth();
  const { allowed: canAccessPortal, loading: accessLoading } = usePortalAccess();
  const { urdd: adminUrdd, activeOrg, refetch } = useActingUrdd();
  const [tab, setTab] = useState('org');

  const isSuperAdmin = !!activeOrg?.is_super_admin;
  const tabs = isSuperAdmin ? [...ORG_TABS, SYSTEM_TAB] : ORG_TABS;
  const activeOrgName = orgLabel(activeOrg);

  // Never leave the super-admin-only tab selected after losing super status
  // (e.g. switching to an org where you are only an org admin).
  useEffect(() => {
    if (tab === 'system' && !isSuperAdmin) setTab('org');
  }, [tab, isSuperAdmin]);

  // Access now depends on a fetch, so there is a window where the answer is
  // unknown. Render neither the console nor a rejection during it.
  if (accessLoading) {
    return <section className="portal-hero portal-hero-center"><p>Loading...</p></section>;
  }

  if (!user) {
    return <PortalSignIn />;
  }

  if (!canAccessPortal) {
    return (
      <AccessRestricted email={user.email} onSignOut={signOut} />
    );
  }

  return (
    <>
      <div className="portal-breadcrumb">
        <Link to="/tools">← Back to Dev Tools</Link>
      </div>

      <section className="portal-hero">
        <div className="portal-hero-text">
          <h2>Organization Admin</h2>
          <p>
            Manage{' '}
            {activeOrgName ? <strong>{activeOrgName}</strong> : 'the organization'}
            {' '}— the org currently selected in the switcher. Provision members and
            manage project / repo access for this organization. Signed in as{' '}
            <strong>{user.name || user.email}</strong>.{' '}
            <button type="button" className="portal-signout-link" onClick={signOut}>
              Sign out
            </button>
          </p>
          <p className="tenant-muted">
            These actions apply to the active organization and are gated by
            permission, not by role, and enforced on the server — without the right
            permission you receive an error even though the screens are visible.
            {isSuperAdmin && ' Cross-organization tools live under the System tab.'}
          </p>
        </div>
      </section>

      <section className="portal-section">
        <div className="tenant-admin-tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`tenant-tab${tab === t.key ? ' tenant-tab-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="portal-card">
          {tab === 'org' && (
            <OrganizationManager
              email={user.email}
              onOrgChanged={refetch}
            />
          )}
          {tab === 'provision' && (
            <ProvisionUser
              adminUrdd={adminUrdd}
              actorEmail={user.email}
              onProvisioned={refetch}
            />
          )}
          {tab === 'grant' && <GrantProjects adminUrdd={adminUrdd} />}
          {tab === 'grantRepos' && <GrantRepos adminUrdd={adminUrdd} />}
          {tab === 'roles' && (
            <RoleManager adminUrdd={adminUrdd} actorEmail={user.email} />
          )}
          {tab === 'permissions' && (
            <UserPermissions adminUrdd={adminUrdd} actorEmail={user.email} />
          )}
          {tab === 'system' && isSuperAdmin && (
            <SystemPanel adminUrdd={adminUrdd} actorEmail={user.email} />
          )}
        </div>
      </section>
    </>
  );
}

export default function TenantAdminPage() {
  return (
    <Layout title="Tenant Admin" description="Provision users and manage tenant/project access">
      <main className="portal-main-wrapper">
        <TenantAdminContent />
      </main>
    </Layout>
  );
}
