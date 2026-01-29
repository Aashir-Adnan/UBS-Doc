import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useAuth } from '@site/src/components/portal/authStore';
import GoogleSignIn from '@site/src/components/portal/GoogleSignIn';

function isGranjurEmail(email) {
  const e = (email || '').toLowerCase();
  return (
    e.endsWith('@granjur.com') ||
    e.endsWith('@granjur,com') ||
    e === 'dev.alikhalil@gmail.com'
  );
}

function ToolsHub() {
  const { user, signOut } = useAuth();
  console.log('user', user);
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
      <section className="portal-hero">
        <div className="portal-hero-text">
          <h2>Welcome, {user.name || user.email}.</h2>
          <p>
            You are signed in with a Granjur account. Choose a tool below to get
            started.
          </p>
          <p>
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
        <div className="tools-hub-grid">
          <Link to="/tools/database" className="tool-card">
            <div className="tool-card-icon">🗄️</div>
            <h3>Database Tools</h3>
            <p>
              Upload SQL schemas to generate internal resources and automation
              utilities.
            </p>
          </Link>

          <Link to="/tools/lucid" className="tool-card">
            <div className="tool-card-icon">🎨</div>
            <h3>Lucid Sanitize</h3>
            <p>
              Upload and sanitize Lucid chart exports for cleaner diagrams.
            </p>
          </Link>

          <Link to="/tools/notify" className="tool-card">
            <div className="tool-card-icon">✉️</div>
            <h3>Notify Maintainer</h3>
            <p>
              Send quick bug reports or feature requests directly to the
              maintainer.
            </p>
          </Link>

          <Link to="/tools/apiObject" className="tool-card">
            <div className="tool-card-icon">⚙️</div>
            <h3>API Object Builder</h3>
            <p>
              Create custom API objects with flags and pre/post process
              functions. Copy the generated JS file.
            </p>
          </Link>
        </div>
      </section>
    </>
  );
}

export default function ToolsPage() {
  return (
    <Layout
      title="Dev Tools"
      description="Granjur Dev Tools - database and automation utilities"
    >
      <main className="portal-main-wrapper">
        <ToolsHub />
      </main>
    </Layout>
  );
}
