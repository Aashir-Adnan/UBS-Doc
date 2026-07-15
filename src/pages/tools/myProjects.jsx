import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useAuth } from '@site/src/components/portal/authStore';
import GoogleSignIn from '@site/src/components/portal/GoogleSignIn';
import MyProjects from '@site/src/components/portal/tenantProjects/MyProjects';
import { useActingUrdd } from '@site/src/components/portal/tenantProjects/useActingUrdd';

function MyProjectsContent() {
  const { user, signOut } = useAuth();
  const { activeOrg } = useActingUrdd();

  if (!user) {
    return (
      <section className="portal-hero portal-hero-center">
        <div className="portal-auth-card portal-auth-centered">
          <h2 className="card-title">Sign in</h2>
          <p className="card-subtitle">
            Use your Google account to access your projects.
          </p>
          <GoogleSignIn />
        </div>
      </section>
    );
  }

  const orgLabel = activeOrg?.org_name || 'Personal';

  return (
    <>
      <div className="portal-breadcrumb">
        <Link to="/tools">&larr; Back to Dev Tools</Link>
      </div>

      <section className="portal-hero">
        <div className="portal-hero-text">
          <h2>My Projects</h2>
          <p>
            Projects available under <strong>{orgLabel}</strong>. Signed in as{' '}
            <strong>{user.name || user.email}</strong>.{' '}
            <button type="button" className="portal-signout-link" onClick={signOut}>
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
    <Layout title="My Projects" description="Projects available under your organization">
      <main className="portal-main-wrapper">
        <MyProjectsContent />
      </main>
    </Layout>
  );
}
