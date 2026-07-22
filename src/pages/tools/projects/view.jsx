import React from "react";
import { useLocation } from "react-router-dom";
import Link from "@docusaurus/Link";
import { useAuth } from "@site/src/components/portal/authStore";
import PortalSignIn from "@site/src/components/portal/PortalSignIn";
import { projects, getProjectComponent } from "@site/src/data/projectsConfig";
import { usePortalAccess } from "@site/src/components/portal/usePortalAccess";
import AccessRestricted from "@site/src/components/portal/AccessRestricted";

function useProjectSlug() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  return params.get("project");
}

function ProjectViewContent() {
  const projectSlug = useProjectSlug();
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

  const project = projectSlug
    ? projects.find((p) => p.slug === projectSlug)
    : null;
  const CustomComponent = project ? getProjectComponent(project.slug) : null;

  if (!user) {
    return <PortalSignIn />;
  }

  if (!canAccessPortal) {
    return <AccessRestricted email={user.email} onSignOut={signOut} />;
  }

  if (!project) {
    return (
      <>
        <div className="portal-breadcrumb">
          <Link to="/tools">← Dev Tools</Link>
          <span className="portal-breadcrumb-sep"> / </span>
          <Link to="/tools/projects">Projects</Link>
        </div>
        <section className="portal-hero portal-hero-center">
          <div className="portal-auth-card portal-auth-centered">
            <h2 className="card-title">Project not found</h2>
            <p className="card-subtitle">
              {projectSlug
                ? `No project with slug "${projectSlug}".`
                : "Specify a project with ?project=&lt;slug&gt;."}
            </p>
            <Link to="/tools/projects" className="button button--primary">
              Back to Projects
            </Link>
          </div>
        </section>
      </>
    );
  }

  if (!CustomComponent) {
    return (
      <>
        <div className="portal-breadcrumb">
          <Link to="/tools">← Dev Tools</Link>
          <span className="portal-breadcrumb-sep"> / </span>
          <Link to="/tools/projects">Projects</Link>
        </div>
        <section className="portal-hero portal-hero-center">
          <div className="portal-auth-card portal-auth-centered">
            <h2 className="card-title">{project.name}</h2>
            <p className="card-subtitle">
              This project does not have a custom view yet.
            </p>
            <Link to={project.docPath} className="button button--primary">
              View documentation
            </Link>
            <Link
              to="/tools/projects"
              className="button button--secondary"
              style={{ marginLeft: "0.5rem" }}
            >
              Back to Projects
            </Link>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="portal-breadcrumb">
        <Link to="/tools">← Dev Tools</Link>
        <span className="portal-breadcrumb-sep"> / </span>
        <Link to="/tools/projects">Projects</Link>
        <span className="portal-breadcrumb-sep"> / </span>
        <span>{project.name}</span>
      </div>
      <section className="portal-section project-custom-view">
        <CustomComponent project={project} />
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
