import React, { useEffect, useState } from 'react';
import Link from '@docusaurus/Link';
import { useActingUrdd } from './useActingUrdd';
import { listMyProjects } from './tenantApi';
import PendingAccess from './PendingAccess';

// "My Projects" dashboard (§3.1). Renders exactly what the backend returns for
// the acting URDD — tenant-scoped and allow/block-narrowed. Empty state when
// total is 0 (never a "show all" fallback).
export default function MyProjects() {
  const { status: idStatus, urdd, me, error: idError } = useActingUrdd();

  const [state, setState] = useState({ status: 'idle', projects: [], total: 0, error: null });

  useEffect(() => {
    if (idStatus !== 'ready' || urdd == null) return;
    let cancelled = false;
    setState({ status: 'loading', projects: [], total: 0, error: null });
    listMyProjects(urdd)
      .then((res) => {
        if (cancelled) return;
        setState({
          status: 'ready',
          projects: Array.isArray(res?.projects) ? res.projects : [],
          total: res?.total ?? 0,
          error: null,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ status: 'error', projects: [], total: 0, error: e.message });
      });
    return () => { cancelled = true; };
  }, [idStatus, urdd]);

  if (idStatus === 'loading' || idStatus === 'idle') {
    return <p className="tenant-muted">Resolving your access…</p>;
  }
  if (idStatus === 'error') {
    return <p className="tenant-error">Could not resolve your access: {idError}</p>;
  }
  if (idStatus === 'pending') {
    return <PendingAccess email={me?.email} />;
  }

  // idStatus === 'ready'
  if (state.status === 'loading' || state.status === 'idle') {
    return <p className="tenant-muted">Loading your projects…</p>;
  }
  if (state.status === 'error') {
    return <p className="tenant-error">Failed to load projects: {state.error}</p>;
  }

  if (state.total === 0 || state.projects.length === 0) {
    return (
      <div className="portal-card tenant-empty-card">
        <div className="portal-section-header">
          <h3>No projects yet</h3>
          <p>There are no projects available to your account under your tenant.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tenant-project-grid">
      {state.projects.map((p) => (
        <Link
          key={p.project_id}
          to={`/tools/myProjects/view?project_id=${p.project_id}`}
          className="tenant-project-card"
        >
          <div className="tenant-project-card-head">
            <h3>{p.project_name || `Project ${p.project_id}`}</h3>
            {p.deployment_status ? (
              <span className={`tenant-status-pill tenant-status-${String(p.deployment_status).toLowerCase()}`}>
                {p.deployment_status}
              </span>
            ) : null}
          </div>
          <p className="tenant-muted">
            Tenant #{p.tenant_id} · Project #{p.project_id}
          </p>
        </Link>
      ))}
    </div>
  );
}
