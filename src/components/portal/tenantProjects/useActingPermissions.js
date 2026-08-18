import { useActingUrdd } from './useActingUrdd';

// Permissions of the acting user, read from the URDD currently selected in the org
// switcher. Backed entirely by the org slice that useActingUrdd already populates
// from /portal/users/urdds — no extra request.
//
// Scoped to the ACTIVE URDD only, never a union across orgs: the same person can be
// an admin in one organization and a plain dev in another, and the server authorizes
// against the URDD they are acting as.
//
// Fails closed. While the URDDs are loading, or if the active URDD carries no
// permissions array, has() returns false for everything. There is deliberately no
// role-name fallback — the server gates on permissions, so the UI must too.
export function useActingPermissions() {
  const { status, activeOrg } = useActingUrdd();

  const list = status === 'ready' && Array.isArray(activeOrg?.permissions)
    ? activeOrg.permissions
    : null;

  // The endpoint returns effective permissions only (revoked ones are absent), so
  // presence of the name is the whole check.
  const has = (name) => !!list && list.some((p) => p.permission_name === name);

  return {
    // false while loading/erroring — callers can distinguish "not allowed" from
    // "don't know yet" for copy, but must not treat unknown as allowed.
    loaded: list !== null,
    permissions: list || [],
    has,
  };
}
