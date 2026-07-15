import React, { useEffect, useState } from 'react';
import { listTenants, provisionUser } from './tenantApi';

// Admin → Provision / approve a portal user (§6 + §7.5). Gives a pending portal
// user a tenant-scoped URDD. This endpoint authorizes by actor_email (the admin's
// Google email), NOT actionPerformerURDD — so it works even before the admin
// themselves has a URDD (bootstrap). Idempotent; re-homing is allowed.
export default function ProvisionUser({ adminUrdd, actorEmail, onProvisioned }) {
  const [tenants, setTenants] = useState([]);
  const [targetEmail, setTargetEmail] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Tenants for the dropdown need an admin URDD; if unavailable, fall back to a
  // manual tenant id entry (the provision endpoint only needs the id).
  useEffect(() => {
    if (adminUrdd == null) return;
    let cancelled = false;
    listTenants(adminUrdd)
      .then((t) => { if (!cancelled) setTenants(Array.isArray(t?.tenants) ? t.tenants : []); })
      .catch(() => { /* fall back to manual entry */ });
    return () => { cancelled = true; };
  }, [adminUrdd]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setResult(null);
    setError(null);
    if (!actorEmail) {
      setError('Your admin email could not be resolved.');
      return;
    }
    if (!targetEmail || !tenantId) {
      setError('Enter the target user email and a tenant.');
      return;
    }
    try {
      setSubmitting(true);
      const res = await provisionUser({
        actor_email: actorEmail,
        email: targetEmail.trim(),
        tenant_id: Number(tenantId),
      });
      setResult(res);
      if (res?.ok && typeof onProvisioned === 'function') onProvisioned();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="tenant-form" onSubmit={handleSubmit}>
      <p className="tenant-muted">
        Provisioning as <strong>{actorEmail || '(unknown)'}</strong>.
      </p>

      <label className="tenant-field">
        <span>Target user email</span>
        <input
          type="email"
          value={targetEmail}
          onChange={(e) => setTargetEmail(e.target.value)}
          placeholder="dev@granjur.com"
        />
      </label>

      <label className="tenant-field">
        <span>Tenant</span>
        {tenants.length > 0 ? (
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            <option value="">Select a tenant…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.organization_name || `Tenant ${t.id}`}
                {` — #${t.id}`}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="number"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="Tenant id (e.g. 5)"
          />
        )}
      </label>

      <button type="submit" className="tenant-submit" disabled={submitting}>
        {submitting ? 'Provisioning…' : 'Provision user'}
      </button>

      {error && <p className="tenant-error">{error}</p>}
      {result?.user && (
        <p className="tenant-success">
          Provisioned {result.user.email} → URDD #{result.user.urdd_id}
          {result.user.tenant_id ? ` in tenant #${result.user.tenant_id}` : ''}.
        </p>
      )}
    </form>
  );
}
