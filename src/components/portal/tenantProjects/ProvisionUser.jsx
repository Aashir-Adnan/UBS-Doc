import React, { useEffect, useState } from 'react';
import { listTenants, provisionUser } from './tenantApi';
import { useActingPermissions } from './useActingPermissions';
import PermissionNotice from './PermissionNotice';

// Admin → Provision / approve a portal user (§6 + §7.5). Gives a pending portal
// user a tenant-scoped URDD. Idempotent; re-homing is allowed.
//
// Gated on update_portal_users, the permission the endpoint itself checks. The
// acting URDD is sent when we have one, with actor_email as the fallback so an
// admin who has no URDD yet can still bootstrap.
const EDIT_USERS_PERM = 'update_portal_users';

export default function ProvisionUser({ adminUrdd, actorEmail, onProvisioned }) {
  const { has } = useActingPermissions();
  const canEdit = has(EDIT_USERS_PERM);
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
    // Belt and braces: a disabled submit button doesn't reliably stop implicit
    // submission (Enter in a field) in every browser.
    if (!canEdit) return;
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
        actionPerformerURDD: adminUrdd,
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
      {canEdit ? (
        <p className="tenant-muted">
          Provisioning as <strong>{actorEmail || '(unknown)'}</strong>.
        </p>
      ) : (
        <PermissionNotice
          permission="update_portal_users"
          action="provisioning a user"
        />
      )}

      <label className="tenant-field">
        <span>Target user email</span>
        <input
          type="email"
          value={targetEmail}
          disabled={!canEdit}
          onChange={(e) => setTargetEmail(e.target.value)}
          placeholder="dev@granjur.com"
        />
      </label>

      <label className="tenant-field">
        <span>Tenant</span>
        {tenants.length > 0 ? (
          <select
            value={tenantId}
            disabled={!canEdit}
            onChange={(e) => setTenantId(e.target.value)}
          >
            <option value="">Select a tenant…</option>
            {tenants.map((t) => (
              <option key={t.tenant_id} value={t.tenant_id}>
                {t.organization_name || t.tenant_name || `Tenant ${t.tenant_id}`}
                {` — #${t.tenant_id}`}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="number"
            value={tenantId}
            disabled={!canEdit}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="Tenant id (e.g. 5)"
          />
        )}
      </label>

      <button type="submit" className="tenant-submit" disabled={submitting || !canEdit}>
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
