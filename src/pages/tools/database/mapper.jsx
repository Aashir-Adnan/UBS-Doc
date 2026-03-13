import React from 'react';
import Layout from '@theme/Layout';
import { useAuth } from '../../../components/portal/authStore';
import GoogleSignIn from '../../../components/portal/GoogleSignIn';
import SQLERDVisualizer from '../../../components/portal/SQLERDVisualizer';

function isGranjurEmail(email) {
  const e = (email || '').toLowerCase();
  return (
    e.endsWith('@granjur.com') ||
    e.endsWith('@granjur,com') ||
    e === 'dev.alikhalil@gmail.com'
  );
}

function MapperContent() {
  const { user } = useAuth();
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
