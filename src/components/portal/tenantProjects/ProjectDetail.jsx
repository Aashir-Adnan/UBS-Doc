import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useActingUrdd } from "./useActingUrdd";
import { canAccessProject } from "./tenantApi";
import PendingAccess from "./PendingAccess";

// Route guard for a project detail page (§3.2). Before showing any project
// content it asks the server GET /projects/tenant/canaccess and blocks when
// `allowed` is false — this guards deep links and bookmarked URLs.
export default function ProjectDetail() {
  const { search } = useLocation();
  const projectId = new URLSearchParams(search).get("project_id");

  const { status: idStatus, urdd, me, error: idError } = useActingUrdd();
  const [state, setState] = useState({
    status: "idle",
    allowed: false,
    error: null,
  });

  useEffect(() => {
    if (idStatus !== "ready" || urdd == null || !projectId) return;
    let cancelled = false;
    setState({ status: "checking", allowed: false, error: null });
    canAccessProject(urdd, projectId)
      .then((res) => {
        if (cancelled) return;
        setState({
          status: "done",
          allowed: res?.allowed === true,
          error: null,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ status: "error", allowed: false, error: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [idStatus, urdd, projectId]);

  const backLink = (
    <Link to="/tools/myProjects" className="button button--secondary">
      Back to My Projects
    </Link>
  );

  if (!projectId) {
    return (
      <div className="portal-card tenant-empty-card">
        <div className="portal-section-header">
          <h3>No project specified</h3>
          <p>Open a project from your list to view it.</p>
        </div>
        {backLink}
      </div>
    );
  }

  if (idStatus === "loading" || idStatus === "idle") {
    return <p className="tenant-muted">Resolving your access…</p>;
  }
  if (idStatus === "error") {
    return (
      <p className="tenant-error">Could not resolve your access: {idError}</p>
    );
  }
  if (idStatus === "pending") {
    return <PendingAccess email={me?.email} />;
  }

  if (state.status === "checking" || state.status === "idle") {
    return (
      <p className="tenant-muted">Checking access to project #{projectId}…</p>
    );
  }
  if (state.status === "error") {
    return <p className="tenant-error">Access check failed: {state.error}</p>;
  }

  if (!state.allowed) {
    return (
      <div className="portal-card tenant-blocked-card">
        <div className="portal-section-header">
          <h3>Access blocked</h3>
          <p>You don&apos;t have access to this project.</p>
        </div>
        {backLink}
      </div>
    );
  }

  // Access granted. There is no detail-data endpoint in the contract, so this
  // is the guarded shell that real project content would render into.
  return (
    <div className="portal-card">
      <div className="portal-section-header">
        <h3>Project #{projectId}</h3>
        <p>You have access to this project.</p>
      </div>
      {backLink}
    </div>
  );
}
