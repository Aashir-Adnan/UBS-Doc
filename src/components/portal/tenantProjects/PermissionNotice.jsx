import React from 'react';

// The read-only banner shown when the acting user lacks the permission a screen's
// mutating controls need. Keeps the wording identical across the admin tabs and
// keeps it about the permission, not the role — matching what the server checks.
//
// `action` completes the sentence: "…needs the X permission to <action>".
export default function PermissionNotice({ permission, action }) {
  return (
    <p className="tenant-muted">
      Read-only — {action} needs the <code>{permission}</code> permission in the
      organization you are acting in.
    </p>
  );
}
