// Shared shaping of tenant member rows into UserPresenceAvatar's user shape.
// GrantProjects, GrantRepos and UserPermissions all pick a single target user
// out of the same listMembers() rows, and each used to format the option label
// slightly differently; this makes the three pickers read identically.

export function memberDisplayName(m) {
  const full = `${m.first_name || ''} ${m.last_name || ''}`.trim();
  return full || m.username || m.email || `URDD #${m.urdd_id}`;
}

export function membersToPresence(members) {
  return (members || []).map((m) => ({
    // Ids are stringified because the pickers keep their selection as the
    // string a <select> used to hand them, and every call site compares with
    // String(m.urdd_id) === String(selected).
    id: String(m.urdd_id),
    name: memberDisplayName(m),
    subtitle: [
      m.email,
      `URDD #${m.urdd_id}`,
      m.tenant_id != null ? `tenant #${m.tenant_id}` : null,
    ].filter(Boolean).join(' · '),
    photoUrl: m.photo_url || m.picture || null,
  }));
}

// Single-select toggle: clicking the already-selected avatar clears it, which
// is how the pickers' empty "Select a user…" option used to be reached.
export function toggleSingle(current, id) {
  return String(current) === String(id) ? '' : String(id);
}
