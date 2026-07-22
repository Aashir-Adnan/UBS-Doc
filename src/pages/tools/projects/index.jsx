import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@site/src/components/portal/authStore";
import PortalSignIn from "@site/src/components/portal/PortalSignIn";
import { projects } from "@site/src/data/projectsConfig";
import { usePortalAccess } from "@site/src/components/portal/usePortalAccess";
import AccessRestricted from "@site/src/components/portal/AccessRestricted";

function ProjectsContent() {
  const { user, signOut, loading } = useAuth();
  const { allowed: canAccessPortal, loading: accessLoading } =
    usePortalAccess();

  if (loading || accessLoading) {
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
          <h2>Projects</h2>
          <p>
            View documentation and custom dashboards for each project. Signed in
            as <strong>{user.name || user.email}</strong>.{" "}
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
        <div className="projects-grid">
          {projects.map((project) => (
            <div key={project.slug} className="project-card">
              <div className="project-card-face">
                <div className="project-card-face-icon">📁</div>
                <div className="project-card-header">
                  <h3>{project.name}</h3>
                </div>
              </div>
              <div className="project-card-hover-layer">
                {project.description && (
                  <p className="project-card-hover-desc">
                    {project.description}
                  </p>
                )}
                <div className="project-card-actions">
                  <Link
                    to={project.docPath}
                    className="button button--secondary button--sm"
                  >
                    {project.docLabel || "Documentation"}
                  </Link>
                  {project.hasCustomView && (
                    <Link
                      to={`/tools/projects/view?project=${encodeURIComponent(project.slug)}`}
                      className="button button--primary button--sm"
                    >
                      Open view
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default function ProjectsPage() {
  return (
    <>
      <main className="portal-main-wrapper">
        <ProjectsContent />
      </main>
    </>
  );
}
