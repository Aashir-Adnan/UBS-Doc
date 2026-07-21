import React, { useEffect, useState } from 'react';
import { listMembers, listAvailableProjects, getGrants, grantProjects } from './tenantApi';
import { useActingPermissions } from './useActingPermissions';
import PermissionNotice from './PermissionNotice';

// Admin → Grant projects (§3.4 + §7.3/§7.4). Pick a target user, show the
// projects available in *their* tenant as a checkbox list pre-checked from their
// current grants, and write a plain project_ids array. Turning the restriction
// off clears the allow-list (user then sees ALL projects in their tenant).
//
// Writing is gated on update_portal_users (what /projects/tenant/grant checks).
// Without it the boxes still show who has what — they just can't be changed.
const EDIT_USERS_PERM = 'update_portal_users';

export default function GrantProjects({ adminUrdd }) {
  const { has } = useActingPermissions();
  const canEdit = has(EDIT_USERS_PERM);
  const [members, setMembers] = useState([]);
  const [loadError, setLoadError] = useState(null);

  const [targetUrdd, setTargetUrdd] = useState('');
  const [available, setAvailable] = useState([]);
  const [restrict, setRestrict] = useState(false);
  const [checked, setChecked] = useState(() => new Set());
  const [loadingTarget, setLoadingTarget] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (adminUrdd == null) return;
    let cancelled = false;
    listMembers(adminUrdd)
      .then((m) => { if (!cancelled) setMembers(Array.isArray(m?.members) ? m.members : []); })
      .catch((e) => { if (!cancelled) setLoadError(e.message); });
    return () => { cancelled = true; };
  }, [adminUrdd]);

  const selectedMember = members.find((m) => String(m.urdd_id) === String(targetUrdd));

  // When a target is chosen, load their tenant's available projects + current grants.
  useEffect(() => {
    setError(null);
    setNotice(null);
    if (!selectedMember || adminUrdd == null) {
      setAvailable([]);
      setChecked(new Set());
      setRestrict(false);
      return;
    }
    const tenantId = selectedMember.tenant_id;
    const target = selectedMember.urdd_id;
    let cancelled = false;
    setLoadingTarget(true);
    Promise.all([
      listAvailableProjects(adminUrdd, tenantId),
      getGrants(adminUrdd, target),
    ])
      .then(([avail, grants]) => {
        if (cancelled) return;
        setAvailable(Array.isArray(avail?.projects) ? avail.projects : []);
        const isSpecific = grants?.mode === 'specific';
        setRestrict(isSpecific);
        setChecked(new Set(isSpecific ? (grants?.project_ids || []).map(Number) : []));
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoadingTarget(false); });
    return () => { cancelled = true; };
  }, [selectedMember, adminUrdd]);

  const toggle = (id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    // Belt and braces: a disabled submit button doesn't reliably stop implicit
    // submission (Enter in a field) in every browser.
    if (!canEdit) return;
    if (!selectedMember) {
      setError('Pick a user first.');
      return;
    }
    const target = selectedMember.urdd_id;

    let sent;
    if (!restrict) {
      // Clear the restriction → user sees all projects in their tenant.
      sent = null;
    } else {
      sent = Array.from(checked).map(Number);
      if (sent.length === 0) {
        const ok = window.confirm(
          'No projects are checked. This will leave the user with an EMPTY ' +
          'allow-list — they will see zero projects. Continue?',
        );
        if (!ok) return;
      }
    }

    try {
      setSubmitting(true);
      const res = await grantProjects(adminUrdd, target, sent);
      const returned = Array.isArray(res?.project_ids) ? res.project_ids : [];
      // The response is the source of truth; the backend drops cross-tenant ids.
      if (sent === null) {
        setNotice('Restriction cleared — the user now sees all projects in their tenant.');
        setRestrict(false);
        setChecked(new Set());
      } else {
        setChecked(new Set(returned.map(Number)));
        if (returned.length < sent.length) {
          setNotice(
            `Saved ${returned.length} project(s). Some projects were outside the ` +
            `user's tenant and were skipped.`,
          );
        } else if (returned.length === 0) {
          setNotice('Saved. The user now has an empty allow-list (sees zero projects).');
        } else {
          setNotice(`Saved ${returned.length} project(s).`);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (adminUrdd == null) {
    return (
      <p className="tenant-muted">
        Your admin account is not yet provisioned into a tenant, so the member
        list cannot be loaded. Provision your own account first.
      </p>
    );
  }

  return (
    <form className="tenant-form" onSubmit={handleSubmit}>
      {!canEdit && (
        <PermissionNotice
          permission={EDIT_USERS_PERM}
          action="changing a user's project grants"
        />
      )}

      {loadError && <p className="tenant-error">Failed to load members: {loadError}</p>}

      <label className="tenant-field">
        <span>User</span>
        <select value={targetUrdd} onChange={(e) => setTargetUrdd(e.target.value)}>
          <option value="">Select a user…</option>
          {members.map((m) => (
            <option key={m.urdd_id} value={m.urdd_id}>
              {(m.first_name || m.last_name)
                ? `${m.first_name || ''} ${m.last_name || ''}`.trim()
                : m.username || m.email}
              {` — URDD #${m.urdd_id} · tenant #${m.tenant_id}`}
            </option>
          ))}
        </select>
      </label>

      {selectedMember && (
        <>
          <label className="tenant-checkbox-row tenant-restrict-toggle">
            <input
              type="checkbox"
              checked={restrict}
              disabled={!canEdit}
              onChange={(e) => setRestrict(e.target.checked)}
            />
            <span>
              Restrict to specific projects
              <em className="tenant-muted">
                {' '}(unchecked = user sees all projects in their tenant)
              </em>
            </span>
          </label>

          {loadingTarget ? (
            <p className="tenant-muted">Loading this user&apos;s tenant projects…</p>
          ) : restrict ? (
            available.length === 0 ? (
              <p className="tenant-muted">No projects available in this tenant.</p>
            ) : (
              <div className="tenant-checkbox-list">
                {available.map((p) => (
                  <label key={p.project_id} className="tenant-checkbox-row">
                    <input
                      type="checkbox"
                      checked={checked.has(Number(p.project_id))}
                      disabled={!canEdit}
                      onChange={() => toggle(Number(p.project_id))}
                    />
                    <span>
                      {p.project_name || `Project ${p.project_id}`}
                      <em className="tenant-muted"> · #{p.project_id}</em>
                    </span>
                  </label>
                ))}
              </div>
            )
          ) : (
            <p className="tenant-muted">
              This user will see all projects in their tenant.
            </p>
          )}
        </>
      )}

      <button
        type="submit"
        className="tenant-submit"
        disabled={submitting || !selectedMember || !canEdit}
      >
        {submitting ? 'Saving…' : 'Save grants'}
      </button>

      {error && <p className="tenant-error">{error}</p>}
      {notice && <p className="tenant-success">{notice}</p>}
    </form>
  );
}
