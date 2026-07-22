import React from "react";
import Link from "@docusaurus/Link";
import { useAuth } from "@site/src/components/portal/authStore";
import PortalSignIn from "@site/src/components/portal/PortalSignIn";
import { usePortalAccess } from "@site/src/components/portal/usePortalAccess";
import AccessRestricted from "@site/src/components/portal/AccessRestricted";
import MyProjects from "@site/src/components/portal/tenantProjects/MyProjects";
import { useActingUrdd } from "@site/src/components/portal/tenantProjects/useActingUrdd";

function MyProjectsContent() {
  const { user, signOut } = useAuth();
  const { allowed: canAccessPortal, loading: accessLoading } =
    usePortalAccess();
  const { activeOrg } = useActingUrdd();

  // This page never had the portal gate — it checked only that someone was
  // signed in, which any Google account satisfies. The listing itself is
  // tenant-scoped server-side, but the shell should not render either.
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

  const orgLabel = activeOrg?.display_name || activeOrg?.org_name || "Personal";

  return (
    <>
      <div className="portal-breadcrumb">
        <Link to="/tools">&larr; Back to Dev Tools</Link>
      </div>

      <section className="portal-hero">
        <div className="portal-hero-text">
          <h2>My Projects</h2>
          <p>
            Projects available under <strong>{orgLabel}</strong>. Signed in as{" "}
            <strong>{user.name || user.email}</strong>.{" "}
            <button
              type="button"
              className="portal-signout-link"
              onClick={signOut}
            >
              Sign out
            </button>
          </p>
        </div>
      </section>

      <section className="portal-section">
        <MyProjects />
      </section>
    </>
  );
}

export default function MyProjectsPage() {
  return (
    <>
      <main className="portal-main-wrapper">
        <MyProjectsContent />
      </main>
    </>
  );
}
