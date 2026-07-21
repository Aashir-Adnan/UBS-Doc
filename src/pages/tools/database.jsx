import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useAuth } from '../../components/portal/authStore';
import PortalSignIn from '../../components/portal/PortalSignIn';
import FileUpload from '../../components/portal/FileUpload';
import { usePortalAccess } from '@site/src/components/portal/usePortalAccess';
import AccessRestricted from '@site/src/components/portal/AccessRestricted';

function DatabaseToolsContent() {
  const { user, signOut, loading } = useAuth();
  const { allowed: canAccessPortal, loading: accessLoading } = usePortalAccess();

  if (loading || accessLoading) {
    return <section className="portal-hero portal-hero-center"><p>Loading...</p></section>;
  }

  if (!user) {
    return <PortalSignIn />;
  }

  if (!canAccessPortal) {
    return (
      <AccessRestricted email={user.email} onSignOut={signOut} />
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
