import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../components/portal/authStore";
import GoogleSignIn from "../../../components/portal/GoogleSignIn";
import { isGranjurEmail } from "../../../utils/isGranjurEmail";
import ProjectDetail from "../../../components/portal/tenantProjects/ProjectDetail";

function ProjectViewContent() {
  const { user } = useAuth();
  const canAccessPortal = !!user && isGranjurEmail(user?.email);

  if (!user) {
    return (
      <section className="portal-hero portal-hero-center">
        <div className="portal-auth-card portal-auth-centered">
          <h2 className="card-title">Sign in</h2>
          <p className="card-subtitle">
            Use your Google account to access Granjur Dev tools.
          </p>
          <GoogleSignIn />
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
        </div>
      </section>
    );
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
