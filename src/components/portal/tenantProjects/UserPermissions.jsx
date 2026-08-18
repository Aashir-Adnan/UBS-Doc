import React, { useEffect, useState } from 'react';
import {
  permissionsCatalog,
  getUserPermissions,
  setUserPermission,
  resetUserPermission,
  listMembers,
  getMe,
} from './tenantApi';
import { useActingPermissions } from './useActingPermissions';
import PermissionNotice from './PermissionNotice';

// Admin → Permissions. View and override one portal user's permissions on top of
// their role defaults.
//
// /portal/permissions/* is gated on the caller holding update_permissions — not on
// their role name — so the toggles follow that permission, read from the URDD
// selected in the org switcher. Without it the panel stays readable but inert.
//
// Id spaces differ: the member dropdown (listMembers) is keyed by urdd_id, but
// the permission endpoints need portal_user_id (portal_users.id). Resolve it via
// getMe(email).id before loading/setting permissions.
const EDIT_PERMS_PERM = 'update_permissions';

export default function UserPermissions({ adminUrdd, actorEmail }) {
  // Fails closed: false while the URDDs load, and no role-name fallback.
  const { has } = useActingPermissions();
  const canEdit = has(EDIT_PERMS_PERM);

  // Catalog: all permissions + each role's default group.
  const [catalog, setCatalog] = useState({ permissions: [], groups: [] });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(null);

  // Member picker (with manual-email fallback when the list can't load).
  const [members, setMembers] = useState([]);
  const [selectedUrdd, setSelectedUrdd] = useState('');
  const [manualEmail, setManualEmail] = useState('');

  // Resolved target user + their permissions.
  const [target, setTarget] = useState(null); // { portalUserId, email, pending, permissions }
  const [targetLoading, setTargetLoading] = useState(false);

  const [savingName, setSavingName] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Load the catalog on mount.
  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    permissionsCatalog(actorEmail, adminUrdd)
      .then((res) => {
        if (cancelled) return;
        setCatalog({
          permissions: Array.isArray(res?.permissions) ? res.permissions : [],
          groups: Array.isArray(res?.groups) ? res.groups : [],
        });
      })
      .catch((e) => { if (!cancelled) setCatalogError(e.message); })
      .finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [actorEmail, adminUrdd]);

  // Load members for the dropdown when an admin URDD is available.
  useEffect(() => {
    if (adminUrdd == null) return;
    let cancelled = false;
    listMembers(adminUrdd)
      .then((m) => { if (!cancelled) setMembers(Array.isArray(m?.members) ? m.members : []); })
      .catch(() => { /* fall back to manual email entry */ });
    return () => { cancelled = true; };
  }, [adminUrdd]);

  const selectedMember = members.find((m) => String(m.urdd_id) === String(selectedUrdd));

  // Resolve a target email -> portal_user_id (getMe) -> their permissions.
  const loadTarget = async (email) => {
    setError(null);
    setNotice(null);
    setTarget(null);
    if (!email) return;
    setTargetLoading(true);
    try {
      const me = await getMe(email);
      const portalUserId = me?.id;
      if (portalUserId == null) {
        throw new Error('Could not resolve this user’s portal id (have they signed in?).');
      }
      const res = await getUserPermissions(actorEmail, portalUserId, adminUrdd);
      setTarget({
        portalUserId,
        email,
        pending: !!res?.pending,
        permissions: Array.isArray(res?.permissions) ? res.permissions : [],
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setTargetLoading(false);
    }
  };

  // Auto-load when a member is picked from the dropdown.
  useEffect(() => {
    if (selectedMember) {
      loadTarget(selectedMember.email);
    } else {
      setTarget(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUrdd]);

  // Re-read the target's permissions after a set/reset.
  const reloadTarget = async () => {
    if (!target?.portalUserId) return;
    try {
      const res = await getUserPermissions(actorEmail, target.portalUserId, adminUrdd);
      setTarget((t) => (t ? {
        ...t,
        pending: !!res?.pending,
        permissions: Array.isArray(res?.permissions) ? res.permissions : [],
      } : t));
    } catch (e) {
      setError(e.message);
    }
  };

  const handleToggle = async (permName, nextActive) => {
    if (!target?.portalUserId) return;
    setError(null);
    setNotice(null);
    try {
      setSavingName(permName);
      await setUserPermission(actorEmail, target.portalUserId, permName, nextActive, adminUrdd);
      setNotice(`${permName} ${nextActive ? 'granted' : 'revoked'}.`);
      await reloadTarget();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingName(null);
    }
  };

  const handleReset = async (permName) => {
    if (!target?.portalUserId) return;
    setError(null);
    setNotice(null);
    try {
      setSavingName(permName);
      await resetUserPermission(actorEmail, target.portalUserId, permName, adminUrdd);
      setNotice(`${permName} reset to role default.`);
      await reloadTarget();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingName(null);
    }
  };

  // Index the target's permission rows by name for merging with the catalog.
  const byName = {};
  (target?.permissions || []).forEach((p) => { byName[p.permission_name] = p; });

  // The catalog lists every framework permission (hundreds); only the portal-
  // relevant ones ever appear in a role default group. Scope the toggle list to
  // permissions that are in some role default OR already set on this user (so a
  // manual override outside the defaults still shows). Data-driven — no hardcoded
  // names.
  const relevantNames = new Set();
  catalog.groups.forEach((g) => (g.permissions || []).forEach((n) => relevantNames.add(n)));
  (target?.permissions || []).forEach((p) => relevantNames.add(p.permission_name));
  const shownPermissions = catalog.permissions.filter((c) => relevantNames.has(c.permission_name));

  return (
    <div className="tenant-form">
      {!canEdit && (
        <PermissionNotice
          permission={EDIT_PERMS_PERM}
          action="changing a user's permissions"
        />
      )}

      {/* Role defaults reference */}
      {catalogLoading ? (
        <p className="tenant-muted">Loading permission catalog…</p>
      ) : catalogError ? (
        <p className="tenant-error">Failed to load catalog: {catalogError}</p>
      ) : (
        <div className="up-role-defaults">
          <p className="tenant-muted" style={{ marginBottom: '0.5rem' }}>
            Role default permission sets:
          </p>
          <div className="tenant-permissions-list">
            {catalog.groups.map((g) => (
              <div key={g.role_id ?? g.role_name} className="tenant-perm-card">
                <div className="tenant-perm-header">
                  <strong>{g.role_name}</strong>
                  <span className="tenant-muted" style={{ fontSize: '0.75rem' }}>
                    {(g.permissions || []).length} permissions
                  </span>
                </div>
                <div className="tenant-perm-tags">
                  {(g.permissions || []).map((name) => (
                    <span key={name} className="tenant-perm-tag">{name}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Target picker */}
      {adminUrdd != null && members.length > 0 ? (
        <label className="tenant-field">
          <span>User</span>
          <select value={selectedUrdd} onChange={(e) => setSelectedUrdd(e.target.value)}>
            <option value="">Select a user…</option>
            {members.map((m) => (
              <option key={m.urdd_id} value={m.urdd_id}>
                {(m.first_name || m.last_name)
                  ? `${m.first_name || ''} ${m.last_name || ''}`.trim()
                  : m.username || m.email}
                {m.email ? ` (${m.email})` : ''}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="tenant-field">
          <span>User email</span>
          <div className="up-manual-row">
            <input
              type="email"
              value={manualEmail}
              onChange={(e) => setManualEmail(e.target.value)}
              placeholder="dev@granjur.com"
            />
            <button
              type="button"
              className="tenant-submit"
              disabled={targetLoading || !manualEmail.trim()}
              onClick={() => loadTarget(manualEmail.trim())}
            >
              {targetLoading ? 'Loading…' : 'Load user'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="tenant-error">{error}</p>}
      {notice && <p className="tenant-success">{notice}</p>}

      {targetLoading && <p className="tenant-muted">Loading permissions…</p>}

      {/* Pending user — provisioning is a separate concern from permissions. */}
      {target && !targetLoading && target.pending && (
        <div className="portal-card tenant-pending-card">
          <div className="portal-section-header">
            <h3>User not provisioned yet</h3>
            <p>
              <strong>{target.email}</strong> has no tenant assignment, so per-user
              permissions can&apos;t be set. Provision them first on the{' '}
              <strong>Provision user</strong> tab, then return here.
            </p>
          </div>
        </div>
      )}

      {/* Permission toggles */}
      {target && !targetLoading && !target.pending && (
        <div className="up-perm-list">
          {shownPermissions.map((c) => {
            const entry = byName[c.permission_name];
            const active = entry?.status === 'active';
            const isManual = entry?.source === 'manual';
            const fromRole = entry?.from_role === true || entry?.source === 'group';
            const saving = savingName === c.permission_name;
            return (
              <div key={c.permission_id ?? c.permission_name} className="up-perm-row">
                <label className="up-perm-toggle">
                  <input
                    type="checkbox"
                    checked={active}
                    disabled={saving || !canEdit}
                    onChange={(e) => handleToggle(c.permission_name, e.target.checked)}
                  />
                  <span className="up-perm-name">{c.permission_name}</span>
                </label>

                <div className="up-perm-tags">
                  {isManual ? (
                    <span className={`up-tag up-tag-${active ? 'granted' : 'revoked'}`}>
                      override · {active ? 'granted' : 'revoked'}
                    </span>
                  ) : fromRole ? (
                    <span className="up-tag up-tag-role">role default</span>
                  ) : (
                    <span className="up-tag up-tag-none">not granted</span>
                  )}
                </div>

                {isManual && canEdit && (
                  <button
                    type="button"
                    className="up-reset-btn"
                    disabled={saving}
                    onClick={() => handleReset(c.permission_name)}
                    title="Drop the override and fall back to the role default"
                  >
                    {saving ? '…' : 'Reset'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
