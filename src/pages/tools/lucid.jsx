import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useAuth } from '../../components/portal/authStore';
import PortalSignIn from '../../components/portal/PortalSignIn';
import LucidSanitize from '../../components/portal/LucidSanitize';
import { usePortalAccess } from '@site/src/components/portal/usePortalAccess';
import AccessRestricted from '@site/src/components/portal/AccessRestricted';

function LucidToolContent() {
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
