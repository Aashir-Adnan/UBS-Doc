import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useAuth } from '@site/src/components/portal/authStore';
import GoogleSignIn from '@site/src/components/portal/GoogleSignIn';
import { projects } from '@site/src/data/projectsConfig';
import { isGranjurEmail } from '@site/src/utils/isGranjurEmail';

function ProjectsContent() {
  const { user, signOut } = useAuth();
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
          <h2>Projects</h2>
          <p>
            View documentation and custom dashboards for each project. Signed in
            as <strong>{user.name || user.email}</strong>.{' '}
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
              <div className="project-card-header">
                <h3>{project.name}</h3>
                {project.description && (
                  <p className="project-card-desc">{project.description}</p>
                )}
              </div>
              <div className="project-card-actions">
                <Link
                  to={project.docPath}
                  className="button button--secondary button--sm"
                >
                  {project.docLabel || 'Documentation'}
                </Link>
                {project.hasCustomView && (
                  <Link
                    to={`/tools/projects/view?project=${encodeURIComponent(project.slug)}`}
                    className="button button--primary button--sm"
                  >
                    Open project view
                  </Link>
                )}
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
    <Layout
      title="Projects"
      description="Project documentation and custom views"
    >
      <main className="portal-main-wrapper">
        <ProjectsContent />
      </main>
    </Layout>
  );
}
