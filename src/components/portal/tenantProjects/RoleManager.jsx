import React, { useCallback, useEffect, useState } from 'react';
import { listPortalUsers, setUserRole } from './tenantApi';

// Admin → Roles. Promote/demote portal users (Admin, Repository Manager, Dev...).
//
// Admin is a live database role: flipping it takes effect immediately and
// globally, which is why the endpoint checks for admin server-side and 403s
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

  // The signed-in user's own row is the source of truth for admin-ness — so a
  // self-demotion hides these controls as soon as the list refetches.
  const meRow = users.find((u) => sameEmail(u.email, actorEmail)) || null;
  const meIsAdmin = meRow?.role_name === ADMIN_ROLE;

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
      setNotice(
        `${updated?.email || target.email} is now ${updated?.role_name || nextRole.name}.`,
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
      {meIsAdmin ? (
        <p className="tenant-muted" style={{ marginBottom: '1rem' }}>
          Changing a role takes effect immediately and applies everywhere.
        </p>
      ) : (
        <p className="tenant-muted" style={{ marginBottom: '1rem' }}>
          Roles are shown read-only — only an Admin can change them.
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

              {meIsAdmin ? (
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
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
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
