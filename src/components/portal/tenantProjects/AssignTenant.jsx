import React, { useEffect, useState } from 'react';
import { listMembers, listTenants, assignTenant } from './tenantApi';

// Admin → Assign tenant (§3.3). Pick a user (target_urdd_id) and a tenant, then
// POST /projects/tenant/assign. Admin authorization is enforced server-side
// (a non-admin actor gets HTTP 403); this UI guard is cosmetic.
export default function AssignTenant({ adminUrdd }) {
  const [members, setMembers] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loadError, setLoadError] = useState(null);

  const [targetUrdd, setTargetUrdd] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (adminUrdd == null) return;
    let cancelled = false;
    Promise.all([listMembers(adminUrdd), listTenants(adminUrdd)])
      .then(([m, t]) => {
        if (cancelled) return;
        setMembers(Array.isArray(m?.members) ? m.members : []);
        setTenants(Array.isArray(t?.tenants) ? t.tenants : []);
      })
      .catch((e) => { if (!cancelled) setLoadError(e.message); });
    return () => { cancelled = true; };
  }, [adminUrdd]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setResult(null);
    setError(null);
    if (!targetUrdd || !tenantId) {
      setError('Pick a user and a tenant.');
      return;
    }
    try {
      setSubmitting(true);
      const res = await assignTenant(adminUrdd, Number(targetUrdd), Number(tenantId));
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (adminUrdd == null) {
    return (
      <p className="tenant-muted">
        Your admin account is not yet provisioned into a tenant, so member and
        tenant lists cannot be loaded. Provision your own account first.
      </p>
    );
  }

  return (
    <form className="tenant-form" onSubmit={handleSubmit}>
      {loadError && <p className="tenant-error">Failed to load lists: {loadError}</p>}

      <label className="tenant-field">
        <span>User</span>
        <select value={targetUrdd} onChange={(e) => setTargetUrdd(e.target.value)}>
          <option value="">Select a user…</option>
          {members.map((m) => (
            <option key={m.urdd_id} value={m.urdd_id}>
              {(m.first_name || m.last_name)
                ? `${m.first_name || ''} ${m.last_name || ''}`.trim()
                : m.username || m.email}
              {` — URDD #${m.urdd_id}`}
              {m.email ? ` (${m.email})` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="tenant-field">
        <span>Tenant</span>
        <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
          <option value="">Select a tenant…</option>
          {tenants.map((t) => (
            <option key={t.tenant_id} value={t.tenant_id}>
              {t.tenant_name || t.tenant_slug || `Tenant ${t.tenant_id}`}
              {` — #${t.tenant_id}`}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" className="tenant-submit" disabled={submitting}>
        {submitting ? 'Assigning…' : 'Assign tenant'}
      </button>

      {error && <p className="tenant-error">{error}</p>}
      {result?.ok && (
        <p className="tenant-success">
          Assigned URDD #{result.target_urdd_id} to tenant #{result.tenant_id}.
        </p>
      )}
    </form>
  );
}
