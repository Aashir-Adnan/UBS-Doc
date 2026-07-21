import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useAuth } from '../../components/portal/authStore';
import PortalSignIn from '../../components/portal/PortalSignIn';
import BugReport from '../../components/portal/BugReport';
import { usePortalAccess } from '@site/src/components/portal/usePortalAccess';
import AccessRestricted from '@site/src/components/portal/AccessRestricted';

function NotifyContent() {
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
          <h2>Notify Maintainer</h2>
          <p>
            Send bug reports or feature requests. Signed in as{' '}
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
        <BugReport />
      </section>
    </>
  );
}

export default function NotifyPage() {
  return (
    <Layout
      title="Notify Maintainer"
      description="Send bug reports and feature requests"
    >
      <main className="portal-main-wrapper">
        <NotifyContent />
      </main>
    </Layout>
  );
}
