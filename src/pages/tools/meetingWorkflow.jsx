import React, { useState, useCallback } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useAuth } from '@site/src/components/portal/authStore';
import GoogleSignIn from '@site/src/components/portal/GoogleSignIn';
import { isGranjurEmail } from '@site/src/utils/isGranjurEmail';
import MeetingList from '@site/src/components/meetingWorkflow/MeetingList';
import CreateMeeting from '@site/src/components/meetingWorkflow/CreateMeeting';
import WorkflowPanel from '@site/src/components/meetingWorkflow/WorkflowPanel';

// Three views: 'list' | 'create' | 'meeting'
function MeetingWorkflowContent() {
  const { user, signOut } = useAuth();
  const canAccess = !!user && isGranjurEmail(user?.email);
  const [view, setView] = useState('list');          // 'list' | 'create' | 'meeting'
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [listKey, setListKey] = useState(0);

  const handleCreated = useCallback(() => {
    setListKey((k) => k + 1);
    setView('list');
  }, []);

  const handleSelectMeeting = useCallback((meeting) => {
    setSelectedMeeting(meeting);
    setView('meeting');
  }, []);

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
      {/* ── Header bar ── */}
      <div className="mw-page-header">
        <div className="mw-page-header-left">
          <Link to="/tools" className="mw-back-link">← Dev Tools</Link>
          {view !== 'list' && (
            <button type="button" className="mw-back-link mw-back-btn" onClick={() => setView('list')}>
              ← Meetings
            </button>
          )}
          <h1 className="mw-page-title">
            {view === 'list' && 'Meetings'}
            {view === 'create' && 'Schedule a Meeting'}
            {view === 'meeting' && (selectedMeeting?.title || 'Meeting')}
          </h1>
        </div>
        <div className="mw-page-header-right">
          <span className="mw-user-pill">
            {user.photoURL && <img src={user.photoURL} className="mw-user-avatar" alt="" />}
            {user.name || user.email}
          </span>
          <button type="button" className="mw-btn mw-btn--ghost mw-btn--sm" onClick={signOut}>Sign out</button>
          {view === 'list' && (
            <button type="button" className="mw-btn mw-btn--primary mw-btn--sm" onClick={() => setView('create')}>
              + New Meeting
            </button>
          )}
        </div>
      </div>

      {/* ── Views ── */}
      <section className="portal-section mw-page-body">
        {view === 'list' && (
          <MeetingList
            key={listKey}
            onSelectMeeting={handleSelectMeeting}
            selectedId={selectedMeeting?.meeting_id}
            onCreateClick={() => setView('create')}
          />
        )}

        {view === 'create' && (
          <CreateMeeting
            onCreated={handleCreated}
            onCancel={() => setView('list')}
            userEmail={user.email}
          />
        )}

        {view === 'meeting' && selectedMeeting && (
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
