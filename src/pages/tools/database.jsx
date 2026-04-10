import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useAuth } from '../../components/portal/authStore';
import GoogleSignIn from '../../components/portal/GoogleSignIn';
import FileUpload from '../../components/portal/FileUpload';
import { isGranjurEmail } from '@site/src/utils/isGranjurEmail';

function DatabaseToolsContent() {
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
          <h2>Database Tools</h2>
          <p>
            Upload a SQL schema to generate internal resources. Signed in as{' '}
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
          <h3>Upload SQL Schema</h3>
          <p>Mount a database schema to generate internal resources.</p>
        </div>
        <div className="portal-card portal-card-hover">
          <FileUpload />
        </div>

        <div className="portal-section-header" style={{ marginTop: '2rem' }}>
          <h3>Project DB → Base DB Mapper</h3>
          <p>
            Map a project database (uploaded SQL) onto the base database
            (server). Generate a single merged SQL with table mappings and
            user→URDD FK rewrites.
          </p>
        </div>
        <div className="portal-card portal-card-hover">
          <Link to="/tools/database/mapper" className="tool-card">
            <div className="tool-card-icon">🗺️</div>
            <h4>Project DB Mapper</h4>
            <p>
              ERD-style doc, API outline, and usage. Base DB on server; project
              DB SQL uploaded.
            </p>
          </Link>
        </div>
      </section>
    </>
  );
}

export default function DatabaseToolsPage() {
  return (
    <Layout
      title="Database Tools"
      description="Upload SQL schemas to generate resources"
    >
      <main className="portal-main-wrapper">
        <DatabaseToolsContent />
      </main>
    </Layout>
  );
}
