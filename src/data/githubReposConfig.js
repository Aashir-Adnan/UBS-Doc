/**
 * GitHub repositories registry for the Dev Workflow tool.
 *
 * Each entry maps a display name to a GitHub repo (owner/repo).
 * The PAT and username are injected at build time via portalPlugin
 * and exposed as window.__GIT_USERNAME__ / window.__GIT_PAT__.
 *
 * @type {{ slug: string; name: string; owner: string; repo: string; description?: string }[]}
 */
export const githubRepos = [
  {
    slug: 'ubs-doc',
    name: 'UBS Doc',
    owner: 'Aashir-Adnan',
    repo: 'UBS_Doc',
    description: 'UBS Framework documentation and dev tools portal.',
  },
  // Add more repos here — same owner/repo as they appear on GitHub.
  // {
  //   slug: 'badar-hms',
  //   name: 'Badar HMS',
  //   owner: 'Aashir-Adnan',
  //   repo: 'Badar_HMS',
  //   description: 'Hotel Management System with Opera PMS integration.',
  // },
];
