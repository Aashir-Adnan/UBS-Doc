import React, { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@site/src/components/portal/authStore";
import PortalSignIn from "@site/src/components/portal/PortalSignIn";
import { usePortalAccess } from "@site/src/components/portal/usePortalAccess";
import AccessRestricted from "@site/src/components/portal/AccessRestricted";
import MeetingList from "@site/src/components/meetingWorkflow/MeetingList";
import CreateMeeting from "@site/src/components/meetingWorkflow/CreateMeeting";
import WorkflowPanel from "@site/src/components/meetingWorkflow/WorkflowPanel";
import { useActingUrdd } from "@site/src/components/portal/tenantProjects/useActingUrdd";
import { useActingPermissions } from "@site/src/components/portal/tenantProjects/useActingPermissions";
import PendingAccess from "@site/src/components/portal/tenantProjects/PendingAccess";

// Three views: 'list' | 'create' | 'meeting'
function MeetingWorkflowContent() {
  const { user, signOut, loading } = useAuth();
  const { allowed: canAccess, loading: accessLoading } = usePortalAccess();
  // Tenant scoping: resolve the acting URDD once and thread it to the children.
  const {
    status: idStatus,
    urdd: actingUrdd,
    me,
    error: idError,
  } = useActingUrdd();

  // UI gating mirrors server permissions
  const { has, loaded: permsLoaded } = useActingPermissions();
  const canCreate = !permsLoaded || has("add_meetings");

  const [view, setView] = useState("list");
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [listKey, setListKey] = useState(0);

  const handleCreated = useCallback(() => {
    setListKey((k) => k + 1);
    setView("list");
  }, []);

  const handleSelectMeeting = useCallback((meeting) => {
    setSelectedMeeting(meeting);
    setView("meeting");
  }, []);

  const handleStageComplete = useCallback(() => {
    setListKey((k) => k + 1);
  }, []);

  function handleFollowUpCreated(newMeeting) {
    if (!newMeeting?.meeting_id) return;
    setSelectedMeeting(newMeeting);
    setView("meeting");
  }

  if (loading || accessLoading) {
    return (
      <section className="portal-hero portal-hero-center">
        <p>Loading...</p>
      </section>
    );
  }

  if (!user) {
    return <PortalSignIn />;
  }

  if (!canAccess) {
    return <AccessRestricted email={user.email} onSignOut={signOut} />;
  }

  // Tenant gate: resolve identity before showing the (now tenant-scoped) tool.
  if (idStatus === "loading" || idStatus === "idle") {
    return (
      <section className="portal-section">
        <p className="tenant-muted">Resolving your access…</p>
      </section>
    );
  }
  if (idStatus === "error") {
    return (
      <section className="portal-section">
        <p className="tenant-error">Could not resolve your access: {idError}</p>
      </section>
    );
  }
  if (idStatus === "pending") {
    return (
      <section className="portal-section">
        <PendingAccess email={me?.email} />
      </section>
    );
  }

  return (
    <>
      {/* ── Header bar ── */}
      <div className="mw-page-header">
        <div className="mw-page-header-left">
          <Link to="/tools" className="mw-back-link">
            ← Dev Tools
          </Link>
          {view !== "list" && (
            <button
              type="button"
              className="mw-back-link mw-back-btn"
              onClick={() => setView("list")}
            >
              ← Meetings
            </button>
          )}
          <h1 className="mw-page-title">
            {view === "list" && "Meetings"}
            {view === "create" && "Schedule a Meeting"}
            {view === "meeting" && (selectedMeeting?.title || "Meeting")}
          </h1>
        </div>
        <div className="mw-page-header-right">
          <span className="mw-user-pill">
            {user.photoURL && (
              <img src={user.photoURL} className="mw-user-avatar" alt="" />
            )}
            {user.name || user.email}
          </span>
          <button
            type="button"
            className="mw-btn mw-btn--ghost mw-btn--sm"
            onClick={signOut}
          >
            Sign out
          </button>
          {view === "list" && (
            <button
              type="button"
              className="mw-btn mw-btn--primary mw-btn--sm"
              onClick={() => setView("create")}
              disabled={!canCreate}
              title={
                canCreate
                  ? undefined
                  : "You need the 'add_meetings' permission to create meetings."
              }
            >
              + New Meeting
            </button>
          )}
        </div>
      </div>

      {/* ── Views ── */}
      <section className="portal-section mw-page-body">
        {view === "list" && (
          <MeetingList
            key={listKey}
            actingUrdd={actingUrdd}
            onSelectMeeting={handleSelectMeeting}
            selectedId={selectedMeeting?.meeting_id}
            onCreateClick={() => setView("create")}
            canCreate={canCreate}
          />
        )}

        {view === "create" && (
          <CreateMeeting
            actingUrdd={actingUrdd}
            onCreated={handleCreated}
            onCancel={() => setView("list")}
            userEmail={user.email}
            canCreate={canCreate}
          />
        )}

        {view === "meeting" && selectedMeeting && (
          <WorkflowPanel
            meeting={selectedMeeting}
            actingUrdd={actingUrdd}
            onStageComplete={handleStageComplete}
            onFollowUpCreated={handleFollowUpCreated}
          />
        )}
      </section>
    </>
  );
}

export default function MeetingWorkflowPage() {
  return (
    <>
      <main className="portal-main-wrapper">
        <MeetingWorkflowContent />
      </main>
    </>
  );
}
