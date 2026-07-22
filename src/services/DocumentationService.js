import { mwGet } from "../components/meetingWorkflow/api";

export async function getRepositories() {
  return await mwGet("/repositories");
}

export async function getDocument(repoId, slug) {
  return await mwGet(
    `/documentation?repo_id=${repoId}&slug=${encodeURIComponent(slug)}`,
  );
}

export async function getSidebar(repoId) {
  return await mwGet(`/documentation?repo_id=${repoId}&type=sidebar`);
}
