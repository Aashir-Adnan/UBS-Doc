import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../components/portal/authStore";
import GoogleSignIn from "../../components/portal/GoogleSignIn";
import { isGranjurEmail } from "../../utils/isGranjurEmail";
import { useActingUrdd } from "../../components/portal/tenantProjects/useActingUrdd";
import AssignTenant from "../../components/portal/tenantProjects/AssignTenant";
import GrantProjects from "../../components/portal/tenantProjects/GrantProjects";
import GrantRepos from "../../components/portal/tenantProjects/GrantRepos";
import ProvisionUser from "../../components/portal/tenantProjects/ProvisionUser";
import OrganizationManager from "../../components/portal/tenantProjects/OrganizationManager";

const TABS = [
  { key: "org", label: "Organization" },
  { key: "provision", label: "Provision user" },
  { key: "assign", label: "Assign tenant" },
  { key: "grant", label: "Grant projects" },
  { key: "grantRepos", label: "Grant repos" },
];

function TenantAdminContent() {
  const { user, signOut } = useAuth();
  const canAccessPortal = !!user && isGranjurEmail(user?.email);
  const { urdd: adminUrdd, refetch } = useActingUrdd();
  const [tab, setTab] = useState("org");

  if (!user) {
    return (
      <section className="portal-hero portal-hero-center">
        <div className="portal-auth-card portal-auth-centered">
          <h2 className="card-title">Sign in</h2>
          <p className="card-subtitle">
            Use your Google account to access Granjur Dev tools.
          </p>
          <GoogleSignIn />
          <p className="card-helper">
            Use your organization&apos;s @granjur.com account for full access.
          </p>
        </div>
      </section>
    );
  }

  if (!canAccessPortal) {
    return (
      <section className="portal-hero portal-hero-center">
        <div className="portal-auth-card portal-auth-centered">
          <h2 className="card-title">Access restricted</h2>
          <p className="card-subtitle">
            This portal is limited to @granjur.com accounts.
          </p>
          <p className="card-helper">
            You are currently signed in as <strong>{user.email}</strong>. Please
            sign out and use your Granjur workspace account.
          </p>
        </div>
      </section>
    );
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
            These actions are admin-only and enforced on the server — non-admins
            receive an error even though the screens are visible.
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
