import { API_BASE_URL } from '@site/src/components/portal/config';

// Feature-local API helper for the Tenant-Based Project Access feature.
// Mirrors the existing meetingWorkflow api.js pattern: every response is
// unwrapped as `payload.return ?? payload ?? data`. GET endpoints carry their
// params on the query string (the backend accepts query string or body); POST
// endpoints send a JSON body. See docs/FRONTEND_TENANT_PROJECT_ACCESS.md.

const BASE = `${API_BASE_URL}/api`;

function unwrap(data) {
  return data?.payload?.return ?? data?.payload ?? data;
}

// Build a query string, skipping null/undefined values.
function qs(params) {
  const sp = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') sp.append(k, v);
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

function extractError(data, text, statusText) {
  return data?.message || data?.error || data?.payload || text || statusText;
}

async function tGet(path, params) {
  const r = await fetch(`${BASE}${path}${qs(params)}`);
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(text || r.statusText); }
  if (!r.ok) throw new Error(extractError(data, text, r.statusText));
  return unwrap(data);
}

async function tPost(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(text || r.statusText); }
  if (!r.ok) throw new Error(extractError(data, text, r.statusText));
  return unwrap(data);
}

// ---- Identity (§6) -------------------------------------------------------

// Resolve the portal user record (including urdd_id) for a Google email.
// Returns the `user` object: { id, email, name, ..., role_id, urdd_id }.
export async function getMe(email) {
  const res = await tGet('/portal/users/me', { email });
  return res?.user ?? res;
}

// ---- Tenant / project access (§3) ---------------------------------------

// §3.1 — tenant-scoped project list for the acting user.
export function listMyProjects(actionPerformerURDD) {
  return tGet('/projects/tenant/list', { actionPerformerURDD });
}

// §3.2 — can the acting user open this project?
export function canAccessProject(actionPerformerURDD, project_id) {
  return tGet('/projects/tenant/canaccess', { actionPerformerURDD, project_id });
}

// §3.3 — assign a user's URDD to a tenant (admin only, server-enforced 403).
export function assignTenant(actionPerformerURDD, target_urdd_id, tenant_id) {
  return tPost('/projects/tenant/assign', {
    actionPerformerURDD,
    target_urdd_id,
    tenant_id,
  });
}

// §3.4 — grant the allow-list of project ids (admin only).
// Pass a plain array of ids to restrict; pass null/undefined to CLEAR the
// restriction (user then sees all projects in their tenant). The backend owns
// the storage format and drops any id outside the target's tenant.
export function grantProjects(actionPerformerURDD, target_urdd_id, project_ids) {
  const body = { actionPerformerURDD, target_urdd_id };
  if (Array.isArray(project_ids)) body.project_ids = project_ids;
  return tPost('/projects/tenant/grant', body);
}

// ---- Admin read endpoints (§7) ------------------------------------------

// §7.1 — tenants for the "assign tenant" dropdown.
export function listTenants(actionPerformerURDD) {
  return tGet('/tenants/list', { actionPerformerURDD });
}

// §7.2 — members (optionally scoped to a tenant) to pick target_urdd_id.
export function listMembers(actionPerformerURDD, tenant_id) {
  return tGet('/tenants/members', { actionPerformerURDD, tenant_id });
}

// §7.3 — projects available in a tenant (the checkbox list for granting).
export function listAvailableProjects(actionPerformerURDD, tenant_id) {
  return tGet('/projects/tenant/available', { actionPerformerURDD, tenant_id });
}

// §7.4 — a target user's current grants, to pre-check the boxes.
export function getGrants(actionPerformerURDD, target_urdd_id) {
  return tGet('/projects/tenant/grants', { actionPerformerURDD, target_urdd_id });
}

// ---- Repo grants (admin) — mirrors the project grant endpoints ----------

// Repos available in a tenant (the checkbox list for granting to a user).
export function listAvailableRepos(actionPerformerURDD, tenant_id) {
  return tGet('/repos/tenant/available', { actionPerformerURDD, tenant_id });
}

// A target user's current repo grants, to pre-check the boxes.
// Response: { mode: 'all' | 'specific', repo_ids: [...] }.
export function getRepoGrants(actionPerformerURDD, target_urdd_id) {
  return tGet('/repos/tenant/grants', { actionPerformerURDD, target_urdd_id });
}

// Grant the allow-list of repo ids (admin only). Pass a plain array to restrict;
// pass null/undefined to CLEAR the restriction (user then sees all tenant repos).
// The backend drops any id outside the target's tenant and returns the survivors.
export function grantRepos(actionPerformerURDD, target_urdd_id, repo_ids) {
  const body = { actionPerformerURDD, target_urdd_id };
  if (Array.isArray(repo_ids)) body.repo_ids = repo_ids;
  return tPost('/repos/tenant/grant', body);
}

// §7.5 — provision/approve a pending portal user.
// Send the acting URDD when we have one: without it the backend falls back to
// portal_users.urdd_id — the actor's DEFAULT urdd, which for a multi-org user is
// not the one the UI gated on. actor_email stays as the fallback identity for an
// actor who has no urdd yet (bootstrap).
export function provisionUser({
  actor_email, email, portal_user_id, tenant_id, actionPerformerURDD,
}) {
  const body = { actor_email, tenant_id };
  if (actionPerformerURDD != null) body.actionPerformerURDD = actionPerformerURDD;
  if (portal_user_id !== undefined && portal_user_id !== null) {
    body.portal_user_id = portal_user_id;
  } else {
    body.email = email;
  }
  return tPost('/portal/users/provision', body);
}

// ---- Portal user roles (admin) ----------------------------------------------

// List portal users plus the roles that exist. This is the ONLY list the role
// screen is driven from — its `id` is portal_users.id, a different id space from
// the urdd_id returned by /tenants/members.
// Response: { users: [{ id, email, name, photo_url, is_active, last_sign_in,
//   created_at, role_id, role_name, urdd_id }], roles: [{ id, name }] }.
// `urdd_id === null` means the user is pending (not provisioned).
export function listPortalUsers() {
  return tGet('/portal/users/list');
}

// Set a portal user's role. The server checks for admin and 403s otherwise —
// note that check is defense-in-depth, not authentication: the actor identity
// below is not verified against an access token.
//   user_id             — the TARGET's portal_users.id (from listPortalUsers)
//   role_id             — the new role id (from the `roles` array)
//   actionPerformerURDD — the acting ADMIN's urdd_id (the actor, not the target)
//   actor_email         — the acting admin's email; accepted in place of the URDD,
//                         and the only identity a not-yet-provisioned admin has.
// Response: { user: { id, email, name, role_name } }.
export function setUserRole({ user_id, role_id, actionPerformerURDD, actor_email }) {
  const body = { user_id, role_id };
  if (actionPerformerURDD != null) body.actionPerformerURDD = actionPerformerURDD;
  if (actor_email) body.actor_email = actor_email;
  return tPost('/portal/users/role', body);
}

// ---- Portal permissions (admin) ---------------------------------------------
// Gated on the caller holding update_permissions. Each call carries the acting
// URDD when available, with actor_email as the fallback for a caller that has no
// urdd yet — sending only the email makes the backend authorize against the
// actor's DEFAULT urdd instead of the one the UI is acting as. Transport-only:
// the endpoints are unencrypted and need no access token, same as the other
// portal calls — do NOT add platformCrypto or runtime-keys logic here.

// All permissions + each role's default group.
// Response: { permissions: [{permission_id, permission_name}],
//   groups: [{role_id, role_name, permissions: [name...]}] }.
export function permissionsCatalog(actor_email, actionPerformerURDD) {
  const params = { actor_email };
  if (actionPerformerURDD != null) params.actionPerformerURDD = actionPerformerURDD;
  return tGet('/portal/permissions/catalog', params);
}

// One user's effective permissions. `portal_user_id` is portal_users.id (NOT a
// urdd_id). Response: { user, pending, permissions: [{permission_id,
//   permission_name, source, status, from_role}] }. If pending is true the user
// has no assignment yet.
export function getUserPermissions(actor_email, portal_user_id, actionPerformerURDD) {
  const params = { actor_email, portal_user_id };
  if (actionPerformerURDD != null) params.actionPerformerURDD = actionPerformerURDD;
  return tGet('/portal/permissions/user', params);
}

// Grant (active:true) or revoke (active:false) one permission — written as a
// source=manual override that survives later role changes.
export function setUserPermission(
  actor_email, portal_user_id, permission_name, active, actionPerformerURDD,
) {
  const body = { actor_email, portal_user_id, permission_name, active };
  if (actionPerformerURDD != null) body.actionPerformerURDD = actionPerformerURDD;
  return tPost('/portal/permissions/set', body);
}

// Drop the manual override and fall back to the role default.
export function resetUserPermission(
  actor_email, portal_user_id, permission_name, actionPerformerURDD,
) {
  const body = { actor_email, portal_user_id, permission_name };
  if (actionPerformerURDD != null) body.actionPerformerURDD = actionPerformerURDD;
  return tPost('/portal/permissions/reset', body);
}

// ---- Organization management ------------------------------------------------

// Create a new organization. Each user may create at most one.
export function createOrganization(email, organization_name, passcode) {
  return tPost('/portal/org/create', { email, organization_name, passcode });
}

// Join an existing organization by name + passcode.
export function joinOrganization(email, organization_name, passcode) {
  return tPost('/portal/org/join', { email, organization_name, passcode });
}

// Get the user's owned and joined organizations.
export function getMyOrganization(email) {
  return tGet('/portal/org/mine', { email });
}

// ---- Multi-URDD / org switching ---------------------------------------------

// Fetch all URDDs for a user, each with tenant/org info and permissions.
// Called on load to populate the org switcher.
export function getUserUrdds(email) {
  return tGet('/portal/users/urdds', { email });
}

// Add a project to an organization (sets project.tenant_id, updates member perms).
export function addProjectToOrg(email, org_id, project_id) {
  return tPost('/portal/org/addproject', { email, org_id, project_id });
}

// Update organization name.
export function updateOrganization(email, org_id, organization_name) {
  return tPost('/portal/org/update', { email, org_id, organization_name });
}

// Add a member to an organization by their email.
export function addOrgMember(email, org_id, member_email) {
  return tPost('/portal/org/addmember', { email, org_id, member_email });
}

// List members of an organization.
export function getOrgMembers(email, org_id) {
  return tGet('/portal/org/members', { email, org_id });
}

// Add a repo to an organization.
export function addRepoToOrg(email, org_id, repo_id) {
  return tPost('/portal/org/addrepo', { email, org_id, repo_id });
}

// List repos (all + which are in the org).
export function getOrgRepos(email, org_id) {
  return tGet('/portal/org/repos', { email, org_id });
}
