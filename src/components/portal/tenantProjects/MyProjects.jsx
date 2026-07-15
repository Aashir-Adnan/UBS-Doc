import React, { useEffect, useState } from 'react';
import Link from '@docusaurus/Link';
import { useActingUrdd } from './useActingUrdd';
import { listMyProjects } from './tenantApi';
import PendingAccess from './PendingAccess';

export default function MyProjects() {
  const { status: idStatus, urdd, activeOrg, me, error: idError } = useActingUrdd();

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
    return <p className="tenant-muted">Resolving your access...</p>;
  }
  if (idStatus === 'error') {
    return (
      <div className="portal-card tenant-empty-card">
        <div className="portal-section-header">
          <h3>Unable to load access</h3>
          <p>We could not verify your access right now. Please try refreshing the page.</p>
        </div>
      </div>
    );
  }
  if (idStatus === 'pending') {
    return <PendingAccess email={me?.email} />;
  }

  const orgLabel = activeOrg?.display_name || activeOrg?.org_name || 'Personal';

  if (state.status === 'loading' || state.status === 'idle') {
    return <p className="tenant-muted">Loading projects for {orgLabel}...</p>;
  }
  if (state.status === 'error') {
    return (
      <div className="portal-card tenant-empty-card">
        <div className="portal-section-header">
          <h3>Could not load projects</h3>
          <p>Something went wrong loading your projects. Please try again later.</p>
        </div>
      </div>
    );
  }

  if (state.total === 0 || state.projects.length === 0) {
    return (
      <div className="portal-card tenant-empty-card">
        <div className="portal-section-header">
          <h3>No projects yet</h3>
          <p>
            There are no projects available under <strong>{orgLabel}</strong>.
            {activeOrg?.org_name
              ? ' Ask your organization admin to add projects, or switch organizations using the sidebar.'
              : ' Join or create an organization to get started.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="tenant-muted" style={{ marginBottom: '1rem' }}>
        Showing projects for <strong>{orgLabel}</strong>
      </p>
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
              {orgLabel} &middot; Project #{p.project_id}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
