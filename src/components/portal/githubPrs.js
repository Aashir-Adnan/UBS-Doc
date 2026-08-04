// Read-only pull-request listing for the GitHub workspace's "Pull Requests"
// tab (src/screens/GitHub.tsx).
//
// Deliberately standalone rather than reusing GithubWorkflow.jsx's internal
// `ghFetch`: that helper is module-private and returns raw GitHub payloads,
// while the design's PR card only needs a small, stable projection. Auth is
// the same pattern as GithubWorkflow — the PAT injected onto `window` at
// bootstrap (src/app/env.ts → window.__GIT_PAT__); with no token the request
// still goes out unauthenticated so public repos keep working.

/**
 * @param {string} owner  GitHub org/user
 * @param {string} repo   repository name
 * @param {'open'|'closed'|'all'} [state]
 * @returns {Promise<Array<{number:number,title:string,branch:string,state:string,draft:boolean,user:string,url:string,updatedAt:string}>>}
 */
export async function listPullRequests(owner, repo, state = 'open') {
  const token = typeof window !== 'undefined' ? window.__GIT_PAT__ : null;
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}&per_page=50`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.json())?.message || 'request failed'}`);
  return (await res.json()).map((pr) => ({
    number: pr.number,
    title: pr.title,
    branch: pr.head?.ref,
    state: pr.state,
    draft: pr.draft,
    user: pr.user?.login,
    url: pr.html_url,
    updatedAt: pr.updated_at,
  }));
}
