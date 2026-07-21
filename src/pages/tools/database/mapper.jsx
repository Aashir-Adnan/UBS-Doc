import React from 'react';
import Layout from '@theme/Layout';
import { useAuth } from '../../../components/portal/authStore';
import PortalSignIn from '../../../components/portal/PortalSignIn';
import SQLERDVisualizer from '../../../components/portal/SQLERDVisualizer';
import { usePortalAccess } from '@site/src/components/portal/usePortalAccess';
import AccessRestricted from '@site/src/components/portal/AccessRestricted';

function MapperContent() {
  const { user, loading } = useAuth();
  const { allowed: canAccessPortal, loading: accessLoading } = usePortalAccess();

  if (loading || accessLoading) {
    return <section className="portal-hero portal-hero-center"><p>Loading...</p></section>;
  }

  if (!user) {
    return <PortalSignIn />;
  }

  if (!canAccessPortal) {
    return (
      <AccessRestricted email={user.email} />
    );
  }

  return (
    <section className="mapper-visualizer-shell">
      <SQLERDVisualizer />
    </section>
  );
}

export default function MapperPage() {
  return (
    <Layout
      title="Project DB Mapper"
      description="Upload SQL and visualize ERD in orthogonal layout"
    >
      <main className="portal-main-wrapper mapper-visualizer-main">
        <MapperContent />
      </main>
    </Layout>
  );
}
