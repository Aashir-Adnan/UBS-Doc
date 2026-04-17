import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useAuth } from '@site/src/components/portal/authStore';
import GoogleSignIn from '@site/src/components/portal/GoogleSignIn';
import { isGranjurEmail } from '@site/src/utils/isGranjurEmail';
import GithubWorkflow from '@site/src/components/portal/GithubWorkflow';

function GithubContent() {
  const { user, signOut } = useAuth();
  const canAccess = !!user && isGranjurEmail(user?.email);

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

  if (!canAccess) {
    return (
      <section className="portal-hero portal-hero-center">
        <div className="portal-auth-card portal-auth-centered">
          <h2 className="card-title">Access restricted</h2>
          <p className="card-subtitle">
            This portal is limited to @granjur.com accounts.
          </p>
          <p className="card-helper">
            Signed in as <strong>{user.email}</strong>.{' '}
            <button type="button" className="portal-signout-link" onClick={signOut}>
              Sign out
            </button>
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
          <h2>GitHub Development Workflow</h2>
          <p>
            Browse repositories and dispatch agent tasks as GitHub issues. Signed in as{' '}
            <strong>{user.name || user.email}</strong>.{' '}
            <button type="button" className="portal-signout-link" onClick={signOut}>
              Sign out
            </button>
          </p>
        </div>
      </section>

      <section className="portal-section">
        <GithubWorkflow user={user} />
      </section>
    </>
  );
}

export default function GithubPage() {
  return (
    <Layout
      title="GitHub Development Workflow"
      description="Browse repositories and create agent task issues"
    >
      <main className="portal-main-wrapper">
        <GithubContent />
      </main>
    </Layout>
  );
}
