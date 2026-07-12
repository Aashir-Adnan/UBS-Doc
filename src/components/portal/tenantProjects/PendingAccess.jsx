import React from 'react';

// Shared "pending access" card shown when the signed-in portal user has no
// urdd_id yet (§6): they can log in but are not provisioned into a tenant, so
// tenant endpoints must not be called. An admin must provision them first.
export default function PendingAccess({ email }) {
  return (
    <div className="portal-card tenant-pending-card">
      <div className="portal-section-header">
        <h3>Access pending approval</h3>
        <p>
          Your account{email ? <> (<strong>{email}</strong>)</> : null} is signed
          in but has not been assigned to a tenant yet. An administrator needs to
          provision your access before you can see any projects.
        </p>
      </div>
      <p className="tenant-muted">
        Once an admin approves you, refresh this page — your projects will appear
        automatically.
      </p>
    </div>
  );
}
