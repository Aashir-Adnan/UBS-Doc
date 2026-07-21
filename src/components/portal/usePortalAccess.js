import { useAuth } from '@site/src/components/portal/authStore';
import { useActingUrdd } from '@site/src/components/portal/tenantProjects/useActingUrdd';

// Who may see the portal.
//
// This replaces the old isGranjurEmail() allow-list, which was a hardcoded set of
// addresses in a source file. That list contradicted the access model: an admin
// could provision someone into a tenant, give them a role, a URDD and a full
// permission set through Tenant Admin, and they would still be refused because a
// developer had not edited a constant and redeployed.
//
// Access is granted by PROVISIONING. The corporate domain stays as an additional
// allow so staff are never locked out by a slow or failing lookup.
//
//   allowed = @granjur.com address
//             OR at least one URDD with a non-null tenant_id
//
// Why "a URDD with a tenant" and not something simpler:
//   * portal_users.is_active defaults to 1 and POST /portal/users/signin creates a
//     row for ANY Google account that signs in — gating on it admits everyone.
//   * sign-in also mints a URDD with tenant_id = NULL for every new account, so
//     "has a URDD" is equally meaningless.
// A URDD carrying a tenant is the one thing only an admin action produces.
//
// This is a client-side gate and always was — it decides what to render, nothing
// more. Enforcement is the backend's tenancy and permission checks.

const CORPORATE_DOMAIN = '@granjur.com';

export function isCorporateEmail(email) {
  return (email || '').toLowerCase().trim().endsWith(CORPORATE_DOMAIN);
}

// The whole decision, as a pure function of the identity + org state, so it can
// be exercised directly with a faked org slice.
//
// Returns { allowed, loading }. `loading` is true only while the answer is
// genuinely unknown; callers must render neither the content nor the restricted
// screen during it. Flashing "Access restricted" at a provisioned user on every
// page load would be a worse bug than the one this fixes.
export function evaluatePortalAccess({ email, status, urdds }) {
  // Staff resolve synchronously and never wait on, or fail with, the lookup.
  if (isCorporateEmail(email)) return { allowed: true, loading: false };

  // Signed out. The pages render their sign-in card from `user` before ever
  // consulting this, so this is not a rejection.
  if (!email) return { allowed: false, loading: false };

  // 'ready' = URDDs loaded, 'pending' = loaded and there are none. Everything
  // else ('idle' before the dispatch lands, 'loading', and 'error' — which
  // useActingUrdd retries) means we do not know yet.
  const resolved = status === 'ready' || status === 'pending';
  if (!resolved) return { allowed: false, loading: true };

  const provisioned = (urdds || []).some(
    (u) => u?.tenant_id !== null && u?.tenant_id !== undefined,
  );
  return { allowed: provisioned, loading: false };
}

export function usePortalAccess() {
  const { user } = useAuth();
  // Reads the org slice useActingUrdd already populates from /portal/users/urdds
  // (and dispatches the fetch on first mount) — no extra request.
  const { status, urdds } = useActingUrdd();

  return evaluatePortalAccess({ email: user?.email || '', status, urdds });
}
