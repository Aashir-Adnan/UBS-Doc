// Whether ANY of the person's URDDs carries a permission — for the Discord-task
// screens only. Discord data is not tied to a portal organisation, and CSAAS
// authorizes those endpoints against any active URDD (requirePermissionOnAnyUrdd),
// so a person whose Dev role lives in another organisation than the one selected in
// the switcher must still be able to move and edit tasks (usman@granjur.com,
// 2026-09-29). Org-scoped screens keep using the active URDD only.
export function anyRoleHas(urdds, name) {
  if (!Array.isArray(urdds)) return false
  return urdds.some((u) => Array.isArray(u?.permissions) && u.permissions.some((p) => p?.permission_name === name))
}
