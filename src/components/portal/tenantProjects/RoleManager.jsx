import React, { useCallback, useEffect, useState } from 'react';
import { listPortalUsers, setUserRole } from './tenantApi';
import { useActingPermissions } from './useActingPermissions';

// Admin → Roles. Promote/demote portal users (Admin, Repository Manager, Dev...).
//
// Admin is a live database role: flipping it takes effect immediately and
// globally, which is why the endpoint checks the caller server-side and 403s
// otherwise (we surface that message verbatim).
//
// NOTE: that server-side check is defense-in-depth, NOT authentication. These
// endpoints don't verify an access token, so the actor identity we send is
// unauthenticated and cannot be treated as a security boundary. Neither this
// control nor the server check should be relied on as one. Real auth is a
// separate backend workstream.
//
// Two id spaces are in play and must not be mixed:
//   user_id             -> portal_users.id  (from listPortalUsers — the `id` field)
//   actionPerformerURDD -> urdd_id          (the acting admin's URDD)
// This screen is driven ONLY from listPortalUsers, so `id` is always correct.

const ADMIN_ROLE = 'Admin';
// /portal/users/role is gated on this, not on the caller's role name — a Dev who
// has been granted it may change roles, and an Admin who lacks it may not.
const EDIT_USERS_PERM = 'update_portal_users';
// Granting ADMIN specifically needs more: the server accepts it only from a
// role-Admin or a holder of update_permissions.
const EDIT_PERMS_PERM = 'update_permissions';

function sameEmail(a, b) {
  return (a || '').toLowerCase() === (b || '').toLowerCase();
}

function initialOf(u) {
  return (u?.name || u?.email || '?').charAt(0).toUpperCase();
}

export default function RoleManager({ adminUrdd, actorEmail }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listPortalUsers();
      setUsers(Array.isArray(res?.users) ? res.users : []);
      setRoles(Array.isArray(res?.roles) ? res.roles : []);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Editing is gated on the permission the server actually checks, read from the
  // URDD selected in the org switcher. Fails closed while it loads.
  const { has } = useActingPermissions();
  const canEditRoles = has(EDIT_USERS_PERM);

  // Assigning Admin is a stricter case. The caller's own row supplies role-Admin —
  // this is an extra way to qualify, never a fallback for canEditRoles above.
  const meRow = users.find((u) => sameEmail(u.email, actorEmail)) || null;
  const canGrantAdmin = meRow?.role_name === ADMIN_ROLE || has(EDIT_PERMS_PERM);

  const handleChange = async (target, nextRoleId) => {
    setError(null);
    setNotice(null);
    const nextRole = roles.find((r) => String(r.id) === String(nextRoleId));
    if (!nextRole || String(target.role_id) === String(nextRole.id)) return;

    // Self-demotion is immediate and irreversible from this screen — confirm.
    if (sameEmail(target.email, actorEmail) && nextRole.name !== ADMIN_ROLE) {
      const ok = window.confirm(
        'You will lose admin access immediately. Continue?',
      );
      if (!ok) return;
    }

    try {
      setSavingId(target.id);
      // No optimistic update — a 403 is possible, so wait for the response.
      const res = await setUserRole({
        user_id: target.id,
        role_id: nextRole.id,
        actionPerformerURDD: adminUrdd,
        actor_email: actorEmail,
      });
      const updated = res?.user;
      // A role change issues the user a NEW urdd and starts them from the new role's
      // defaults alone, so any per-user permission an admin had granted is cleared.
      // Say so explicitly — otherwise those overrides vanish silently.
      const dropped = res?.permissions?.dropped_manual ?? [];
      setNotice(
        `${updated?.email || target.email} is now ${updated?.role_name || nextRole.name}.`
        + (dropped.length
          ? ` Cleared ${dropped.length === 1 ? 'the manual override' : 'manual overrides'} for `
            + `${dropped.join(', ')} — re-apply in Permissions if still needed.`
          : ''),
      );
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <p className="tenant-muted">Loading portal users…</p>;
  if (loadError) return <p className="tenant-error">Failed to load users: {loadError}</p>;
  if (users.length === 0) return <p className="tenant-muted">No portal users found.</p>;

  return (
    <div>
      {canEditRoles ? (
        <p className="tenant-muted" style={{ marginBottom: '1rem' }}>
          Changing a role takes effect immediately and applies everywhere.
          {!canGrantAdmin && ' Assigning Admin needs the update_permissions permission.'}
        </p>
      ) : (
        <p className="tenant-muted" style={{ marginBottom: '1rem' }}>
          Roles are shown read-only — changing them needs the{' '}
          <code>update_portal_users</code> permission in the organization you are
          acting in.
        </p>
      )}

      {error && <p className="tenant-error">{error}</p>}
      {notice && <p className="tenant-success">{notice}</p>}

      <div className="tenant-members-list">
        {users.map((u) => {
          const isSelf = sameEmail(u.email, actorEmail);
          // Only flag pending when the field is present and explicitly null.
          const isPending = u.urdd_id === null;
          const isAdmin = u.role_name === ADMIN_ROLE;
          return (
            <div key={u.id} className="tenant-member-row">
              <div className="tenant-member-avatar">
                {u.photo_url
                  ? <img src={u.photo_url} alt="" className="tenant-member-img" />
                  : <span className="tenant-member-initial">{initialOf(u)}</span>}
              </div>

              <div className="tenant-member-info">
                <span className="tenant-member-name">
                  {u.name || u.email}
                  {isSelf && <span className="tenant-muted"> (you)</span>}
                </span>
                <span className="tenant-member-email">{u.email}</span>
              </div>

              {!u.is_active && (
                <span className="tenant-member-badge tenant-member-badge-member">
                  inactive
                </span>
              )}

              {isPending && (
                <span
                  className="tenant-member-badge tenant-member-badge-member"
                  title="Not provisioned yet — needs a tenant/URDD. Separate from their role."
                >
                  pending
                </span>
              )}

              {canEditRoles ? (
                <select
                  value={u.role_id ?? ''}
                  disabled={savingId === u.id}
                  onChange={(e) => handleChange(u, e.target.value)}
                  aria-label={`Role for ${u.email}`}
                  style={{
                    flexShrink: 0,
                    borderRadius: '0.5rem',
                    border: '1px solid var(--ifm-color-emphasis-300)',
                    background: 'var(--ifm-background-surface-color)',
                    padding: '0.3rem 0.5rem',
                    fontSize: '0.78rem',
                    fontFamily: 'inherit',
                  }}
                >
                  {u.role_id == null && <option value="">No role</option>}
                  {roles.map((r) => {
                    // Keep Admin listed but unselectable when the server would
                    // reject it, so the current value still renders and the reason
                    // is visible instead of arriving as a 403.
                    const blocked = r.name === ADMIN_ROLE
                      && !canGrantAdmin
                      && String(u.role_id) !== String(r.id);
                    return (
                      <option key={r.id} value={r.id} disabled={blocked}>
                        {r.name}{blocked ? ' (needs update_permissions)' : ''}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <span
                  className={`tenant-member-badge ${
                    isAdmin ? 'tenant-member-badge-owner' : 'tenant-member-badge-member'
                  }`}
                >
                  {u.role_name || 'no role'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
