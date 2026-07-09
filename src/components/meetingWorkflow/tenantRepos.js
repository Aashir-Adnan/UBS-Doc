import { mwGet } from './api';

// Tenant-scoped repo list for the meeting-workflow repo picker (§3 of
// docs/FRONTEND_REPOS_MEETINGS_TENANCY.md). Reuses the existing mwGet helper
// (unwraps payload.return); actionPerformerURDD goes on the query string.
// Returns the repos array (fail-closed empty when the backend returns none).
export async function listTenantRepos(actingUrdd) {
  const data = await mwGet(`/repos/tenant/list?actionPerformerURDD=${actingUrdd}`);
  return data?.repos || [];
}
