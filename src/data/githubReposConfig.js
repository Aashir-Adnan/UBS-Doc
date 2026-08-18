import { API_BASE_URL } from "../components/portal/config";

/**
 * Fetch tracked repos from the backend and normalize them into the shape
 * expected by GithubWorkflow: { slug, name, owner, repo, description? }
 *
 * URL is parsed to extract owner/repo from the GitHub URL.
 */
export async function fetchTrackedRepos() {
  const r = await fetch(`${API_BASE_URL}/api/tracked/repos/list?version=1`);
  if (!r.ok) throw new Error(`Failed to fetch tracked repos: ${r.status}`);
  const json = await r.json();
  const rows = json.payload?.return?.repos ?? json.payload?.repos ?? [];
  return rows.map((row) => {
    const { owner, repo } = parseGithubUrl(row.url);
    return {
      slug: row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: row.name,
      owner,
      repo,
      branch: row.branch || "main",
      id: row.id,
    };
  });
}

function parseGithubUrl(url = "") {
  // Handle https://github.com/owner/repo or https://github.com/owner/repo.git
  const clean = url.replace(/\.git$/, "").replace(/\/$/, "");
  const parts = clean.split("/");
  const repo = parts.pop() || "";
  const owner = parts.pop() || "";
  return { owner, repo };
}
