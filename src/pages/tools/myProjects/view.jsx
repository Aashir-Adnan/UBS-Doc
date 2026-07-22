import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@site/src/components/portal/authStore";
import PortalSignIn from "@site/src/components/portal/PortalSignIn";
import { usePortalAccess } from "@site/src/components/portal/usePortalAccess";
import AccessRestricted from "@site/src/components/portal/AccessRestricted";
import ProjectDetail from "@site/src/components/portal/tenantProjects/ProjectDetail";

function ProjectViewContent() {
  const { user } = useAuth();
  const { allowed: canAccessPortal, loading: accessLoading } =
    usePortalAccess();

  // Access now depends on a fetch, so there is a window where the answer is
  // unknown. Render neither the project nor a rejection during it.
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
    return <AccessRestricted email={user.email} />;
  }

  return (
    <>
      <div className="portal-breadcrumb">
        <Link to="/tools">← Dev Tools</Link>
        <span className="portal-breadcrumb-sep"> / </span>
        <Link to="/tools/myProjects">My Projects</Link>
      </div>

      <section className="portal-section">
        <ProjectDetail />
      </section>
    </>
  );
}

export default function ProjectViewPage() {
  return (
    <>
      <main className="portal-main-wrapper">
        <ProjectViewContent />
      </main>
    </>
  );
}
