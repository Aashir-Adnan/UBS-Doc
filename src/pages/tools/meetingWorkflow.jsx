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

  const handleCreated = useCallback(() => {
    setListKey((k) => k + 1);
  }, []);

  const handleSelectMeeting = useCallback((meeting) => {
    setSelectedMeeting(meeting);
  }, []);

  // Refresh the selected meeting object after a stage completes
  const handleStageComplete = useCallback(() => {
    setListKey((k) => k + 1);
  }, []);

  if (!user) {
    return (
      <section className="portal-hero portal-hero-center">
        <div className="portal-auth-card portal-auth-centered">
          <h2 className="card-title">Sign in</h2>
          <p className="card-subtitle">Use your Google account to access Granjur Dev tools.</p>
          <GoogleSignIn />
          <p className="card-helper">Use your @granjur.com account for full access.</p>
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
            Create meetings, transcribe audio with Whisper, generate AI-powered notes and HTML
            reports with Claude, then sync tasks to GitHub.{' '}
            Signed in as <strong>{user.name || user.email}</strong>.
          </p>
          <p>
            <button type="button" className="portal-signout-link" onClick={signOut}>Sign out</button>
          </p>
        </div>
      </section>

      <section className="portal-section">
        <div className="mw-top-grid">
          <CreateMeeting onCreated={handleCreated} userEmail={user.email} />
          <MeetingList
            key={listKey}
            onSelectMeeting={handleSelectMeeting}
            selectedId={selectedMeeting?.meeting_id}
          />
        </div>

        {selectedMeeting && (
          <WorkflowPanel
            meeting={selectedMeeting}
            onStageComplete={handleStageComplete}
          />
        )}
      </section>
    </>
  );
}

export default function MeetingWorkflowPage() {
  return (
    <Layout title="Meeting Workflow" description="End-to-end meeting-to-delivery workflow with AI">
      <main className="portal-main-wrapper">
        <MeetingWorkflowContent />
      </main>
    </Layout>
  );
}
