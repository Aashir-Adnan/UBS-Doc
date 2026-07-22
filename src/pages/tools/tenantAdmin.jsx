import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@site/src/components/portal/authStore";
import PortalSignIn from "@site/src/components/portal/PortalSignIn";
import { usePortalAccess } from "@site/src/components/portal/usePortalAccess";
import AccessRestricted from "@site/src/components/portal/AccessRestricted";
import { useActingUrdd } from "@site/src/components/portal/tenantProjects/useActingUrdd";
import AssignTenant from "@site/src/components/portal/tenantProjects/AssignTenant";
import GrantProjects from "@site/src/components/portal/tenantProjects/GrantProjects";
import GrantRepos from "@site/src/components/portal/tenantProjects/GrantRepos";
import ProvisionUser from "@site/src/components/portal/tenantProjects/ProvisionUser";
import OrganizationManager from "@site/src/components/portal/tenantProjects/OrganizationManager";
import RoleManager from "@site/src/components/portal/tenantProjects/RoleManager";
import UserPermissions from "@site/src/components/portal/tenantProjects/UserPermissions";

const TABS = [
  { key: "org", label: "Organization" },
  { key: "provision", label: "Provision user" },
  { key: "assign", label: "Assign tenant" },
  { key: "grant", label: "Grant projects" },
  { key: "grantRepos", label: "Grant repos" },
  { key: "roles", label: "Roles" },
  { key: "permissions", label: "Permissions" },
];

function TenantAdminContent() {
  const { user, signOut } = useAuth();
  const { allowed: canAccessPortal, loading: accessLoading } =
    usePortalAccess();
  const { urdd: adminUrdd, refetch } = useActingUrdd();
  const [tab, setTab] = useState("org");

  // Access now depends on a fetch, so there is a window where the answer is
  // unknown. Render neither the console nor a rejection during it.
  if (accessLoading) {
    return (
      <section className="portal-hero portal-hero-center">
        <p>Loading...</p>
      </section>
    );
  }

  if (!user) {
    return <PortalSignIn />;
  }

  if (!canAccessPortal) {
    return <AccessRestricted email={user.email} onSignOut={signOut} />;
  }

  return (
    <>
      <div className="portal-breadcrumb">
        <Link to="/tools">← Back to Dev Tools</Link>
      </div>

      <section className="portal-hero">
        <div className="portal-hero-text">
          <h2>Tenant Admin</h2>
          <p>
            Provision users and manage tenant / project access. Signed in as{" "}
            <strong>{user.name || user.email}</strong>.{" "}
            <button
              type="button"
              className="portal-signout-link"
              onClick={signOut}
            >
              Sign out
            </button>
          </p>
          <p className="tenant-muted">
            These actions are gated by permission, not by role, and enforced on
            the server — without the right permission you receive an error even
            though the screens are visible.
          </p>
        </div>
      </section>

      <section className="portal-section">
        <div className="tenant-admin-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`tenant-tab${tab === t.key ? " tenant-tab-active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="portal-card">
          {tab === "org" && (
            <OrganizationManager email={user.email} onOrgChanged={refetch} />
          )}
          {tab === "provision" && (
            <ProvisionUser
              adminUrdd={adminUrdd}
              actorEmail={user.email}
              onProvisioned={refetch}
            />
          )}
          {tab === "assign" && <AssignTenant adminUrdd={adminUrdd} />}

          {tab === "grant" && <GrantProjects adminUrdd={adminUrdd} />}

          {tab === "grantRepos" && <GrantRepos adminUrdd={adminUrdd} />}

          {tab === "roles" && (
            <RoleManager adminUrdd={adminUrdd} actorEmail={user.email} />
          )}

          {tab === "permissions" && (
            <UserPermissions adminUrdd={adminUrdd} actorEmail={user.email} />
          )}
        </div>
      </section>
    </>
  );
}

export default function TenantAdminPage() {
  return (
    <>
      <main className="portal-main-wrapper">
        <TenantAdminContent />
      </main>
    </>
  );
}
