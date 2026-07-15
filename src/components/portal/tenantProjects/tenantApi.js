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

// §7.5 — provision/approve a pending portal user (admin authorized by email).
// This endpoint intentionally does NOT take actionPerformerURDD.
export function provisionUser({ actor_email, email, portal_user_id, tenant_id }) {
  const body = { actor_email, tenant_id };
  if (portal_user_id !== undefined && portal_user_id !== null) {
    body.portal_user_id = portal_user_id;
  } else {
    body.email = email;
  }
  return tPost('/portal/users/provision', body);
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
