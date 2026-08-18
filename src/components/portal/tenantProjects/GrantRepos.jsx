import React, { useEffect, useState } from 'react';
import { listMembers, listAvailableRepos, getRepoGrants, grantRepos } from './tenantApi';

// Admin → Grant repos. Mirrors GrantProjects but targets the repo endpoints.
// Pick a target user, show the repos available in *their* tenant as a checkbox
// list pre-checked from their current grants, and write a plain repo_ids array.
// Turning the restriction off clears the allow-list (user then sees ALL repos in
// their tenant). Admin-only; enforced server-side (403 for non-admins).
export default function GrantRepos({ adminUrdd }) {
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

  // When a target is chosen, load their tenant's available repos + current grants.
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
      listAvailableRepos(adminUrdd, tenantId),
      getRepoGrants(adminUrdd, target),
    ])
      .then(([avail, grants]) => {
        if (cancelled) return;
        setAvailable(Array.isArray(avail?.repos) ? avail.repos : []);
        const isSpecific = grants?.mode === 'specific';
        setRestrict(isSpecific);
        setChecked(new Set(isSpecific ? (grants?.repo_ids || []).map(Number) : []));
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
    if (!selectedMember) {
      setError('Pick a user first.');
      return;
    }
    const target = selectedMember.urdd_id;

    let sent;
    if (!restrict) {
      // Clear the restriction → user sees all repos in their tenant.
      sent = null;
    } else {
      sent = Array.from(checked).map(Number);
      if (sent.length === 0) {
        const ok = window.confirm(
          'No repos are checked. This will leave the user with an EMPTY ' +
          'allow-list — they will see zero repos. Continue?',
        );
        if (!ok) return;
      }
    }

    try {
      setSubmitting(true);
      const res = await grantRepos(adminUrdd, target, sent);
      const returned = Array.isArray(res?.repo_ids) ? res.repo_ids : [];
      // The response is the source of truth; the backend drops cross-tenant ids.
      if (sent === null) {
        setNotice('Restriction cleared — the user now sees all repos in their tenant.');
        setRestrict(false);
        setChecked(new Set());
      } else {
        setChecked(new Set(returned.map(Number)));
        if (returned.length < sent.length) {
          setNotice(
            `Saved ${returned.length} repo(s). Some repos were outside the user's ` +
            `tenant and were skipped.`,
          );
        } else if (returned.length === 0) {
          setNotice('Saved. The user now has an empty allow-list (sees zero repos).');
        } else {
          setNotice(`Saved ${returned.length} repo(s).`);
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
              onChange={(e) => setRestrict(e.target.checked)}
            />
            <span>
              Restrict to specific repos
              <em className="tenant-muted">
                {' '}(unchecked = user sees all repos in their tenant)
              </em>
            </span>
          </label>

          {loadingTarget ? (
            <p className="tenant-muted">Loading this user&apos;s tenant repos…</p>
          ) : restrict ? (
            available.length === 0 ? (
              <p className="tenant-muted">No repos available in this tenant.</p>
            ) : (
              <div className="tenant-checkbox-list">
                {available.map((r) => (
                  <label key={r.id} className="tenant-checkbox-row">
                    <input
                      type="checkbox"
                      checked={checked.has(Number(r.id))}
                      onChange={() => toggle(Number(r.id))}
                    />
                    <span>
                      {r.name || `Repo ${r.id}`}
                      <em className="tenant-muted"> · #{r.id}{r.branch ? ` · ${r.branch}` : ''}</em>
                    </span>
                  </label>
                ))}
              </div>
            )
          ) : (
            <p className="tenant-muted">
              This user will see all repos in their tenant.
            </p>
          )}
        </>
      )}

      <button type="submit" className="tenant-submit" disabled={submitting || !selectedMember}>
        {submitting ? 'Saving…' : 'Save grants'}
      </button>

      {error && <p className="tenant-error">{error}</p>}
      {notice && <p className="tenant-success">{notice}</p>}
    </form>
  );
}
