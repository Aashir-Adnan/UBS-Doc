import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useAuth } from '../../components/portal/authStore';
import GoogleSignIn from '../../components/portal/GoogleSignIn';
import LucidSanitize from '../../components/portal/LucidSanitize';

function isGranjurEmail(email) {
  const e = (email || '').toLowerCase();
  return e.endsWith('@granjur.com') || e.endsWith('@granjur,com');
}

function LucidToolContent() {
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
          <h2>Lucid Sanitize</h2>
          <p>
            Sanitize Lucid chart exports. Signed in as{' '}
            <strong>{user.name || user.email}</strong>.{' '}
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
        <div className="portal-section-header">
          <h3>Upload Lucid Chart Export</h3>
          <p>Upload a Lucid chart export file to sanitize it.</p>
        </div>
        <div className="portal-card portal-card-hover">
          <LucidSanitize />
        </div>
      </section>
    </>
  );
}

export default function LucidToolPage() {
  return (
    <Layout
      title="Lucid Sanitize"
      description="Sanitize Lucid chart exports"
    >
      <main className="portal-main-wrapper">
        <LucidToolContent />
      </main>
    </Layout>
  );
}
