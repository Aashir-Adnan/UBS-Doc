import React from 'react';
import Link from '@docusaurus/Link';
import OperaDiagrams from './opera/OperaDiagrams';

/**
 * Custom project view for Badar HMS.
 * Rendered at /tools/projects/view?project=badar-hms inside the standard Layout (header/footer).
 * Includes interactive Opera integration diagrams (persisted in localStorage).
 */
export default function BadarHMSView({ project }) {
  return (
    <div className="project-view-badar-hms">
      <div className="portal-section-header">
        <h2>{project?.name ?? 'Badar HMS'}</h2>
        <p>
          Hotel Management System – documentation and integration overview.
        </p>
      </div>

      <div className="project-view-grid">
        <Link to="/docs/projects/badar-hms/Opera_Integration" className="project-view-card">
          <div className="project-view-card-icon">📄</div>
          <h3>Opera Integration</h3>
          <p>
            Secure hybrid SaaS integration for OPERA PMS: architecture options,
            read-only and read/write solutions, comparison matrix.
          </p>
        </Link>
      </div>

      {/* Interactive Opera architecture diagrams – drag, add nodes/links/annotations; edits stored in browser */}
      <OperaDiagrams />
    </div>
  );
}
