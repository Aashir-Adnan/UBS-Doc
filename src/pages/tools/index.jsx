import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useAuth } from '@site/src/components/portal/authStore';
import GoogleSignIn from '@site/src/components/portal/GoogleSignIn';
import { isGranjurEmail } from '@site/src/utils/isGranjurEmail';

function ToolsHub() {
  const { user, signOut, loading } = useAuth();
  const canAccessPortal = !!user && isGranjurEmail(user?.email);

  if (loading) {
    return <section className="portal-hero portal-hero-center"><p>Loading...</p></section>;
  }

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
          {[
            { to: '/tools/database', icon: '🗄️', label: 'Database Tools', desc: 'Upload SQL schemas to generate internal resources and automation utilities.' },
            { to: '/tools/lucid', icon: '🎨', label: 'Lucid Sanitize', desc: 'Upload and sanitize Lucid chart exports for cleaner diagrams.' },
            { to: '/tools/notify', icon: '✉️', label: 'Notify Maintainer', desc: 'Send quick bug reports or feature requests directly to the maintainer.' },
            { to: '/tools/apiObject', icon: '⚙️', label: 'API Object Builder', desc: 'Create custom API objects with flags and pre/post process functions.' },
            { to: '/tools/projects', icon: '📁', label: 'Projects', desc: 'Browse project documentation and open custom project views and dashboards.' },
            { to: '/tools/github', icon: '🐙', label: 'GitHub Dev Workflow', desc: 'Browse repositories and dispatch agent tasks as GitHub issues.' },
            { to: '/tools/meetingWorkflow', icon: '🎙️', label: 'Meeting Workflow', desc: 'Create meetings, transcribe recordings, generate AI-powered notes and sync to GitHub.' },
            { to: '/tools/repos', icon: '📂', label: 'Tracked Repositories', desc: 'Add, remove, and pull GitHub repos monitored by the agent pipeline.' },
            { to: '/tools/myProjects', icon: '📌', label: 'My Projects', desc: 'View the projects available to your account under your tenant.' },
            { to: '/tools/tenantAdmin', icon: '🛡️', label: 'Tenant Admin', desc: 'Provision users and manage tenant and project access (admin only).' },
          ].map(({ to, icon, label, desc }) => (
            <Link key={to} to={to} className="tool-card">
              <div className="tool-card-face">
                <div className="tool-card-icon">{icon}</div>
                <h3>{label}</h3>
              </div>
              <div className="tool-card-desc-layer">
                <p>{desc}</p>
              </div>
            </Link>
          ))}
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
