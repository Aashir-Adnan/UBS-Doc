import React, { useState, useCallback } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useAuth } from '@site/src/components/portal/authStore';
import GoogleSignIn from '@site/src/components/portal/GoogleSignIn';
import { isGranjurEmail } from '@site/src/utils/isGranjurEmail';
import MeetingList from '@site/src/components/meetingWorkflow/MeetingList';
import CreateMeeting from '@site/src/components/meetingWorkflow/CreateMeeting';
import WorkflowPanel from '@site/src/components/meetingWorkflow/WorkflowPanel';

function MeetingWorkflowContent() {
  const { user, signOut } = useAuth();
  const canAccess = !!user && isGranjurEmail(user?.email);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [listKey, setListKey] = useState(0);

  const handleCreated = useCallback(() => setListKey((k) => k + 1), []);

  if (!user) {
    return (
      <section className="portal-hero portal-hero-center">
        <div className="portal-auth-card portal-auth-centered">
          <h2 className="card-title">Sign in</h2>
          <p className="card-subtitle">Use your Google account to access Granjur Dev tools.</p>
          <GoogleSignIn />
          <p className="card-helper">Use your organization&apos;s @granjur.com account for full access.</p>
        </div>
      </section>
    );
  }

  if (!canAccess) {
    return (
      <section className="portal-hero portal-hero-center">
        <div className="portal-auth-card portal-auth-centered">
          <h2 className="card-title">Access restricted</h2>
          <p className="card-subtitle">This portal is limited to @granjur.com accounts.</p>
          <p className="card-helper">
            Signed in as <strong>{user.email}</strong>. Please sign out and use your Granjur workspace account.
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
          <h2>Meeting Workflow</h2>
          <p>
            Create meetings, transcribe audio, generate tasks, approve and push to GitHub.
            Signed in as <strong>{user.name || user.email}</strong>.{' '}
            <button type="button" className="portal-signout-link" onClick={signOut}>Sign out</button>
          </p>
        </div>
      </section>

      <section className="portal-section">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <CreateMeeting onCreated={handleCreated} />
          <MeetingList key={listKey} onSelectMeeting={setSelectedMeeting} />
        </div>

        {selectedMeeting && <WorkflowPanel meeting={selectedMeeting} />}
      </section>
    </>
  );
}

export default function MeetingWorkflowPage() {
  return (
    <Layout title="Meeting Workflow" description="Meeting-to-delivery workflow tool">
      <main className="portal-main-wrapper">
        <MeetingWorkflowContent />
      </main>
    </Layout>
  );
}
