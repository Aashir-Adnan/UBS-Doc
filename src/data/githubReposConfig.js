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
  { slug: 'framework-node',           name: 'Framework_Node',                   owner: 'UBS-Dev-Org',    repo: 'Framework_Node' },
  { slug: 'edarete-node',             name: 'Edarete_Node',                     owner: 'ITULahore',      repo: 'Edarete_Node' },
  { slug: 'edarete-react',            name: 'Edarete_React',                    owner: 'ITULahore',      repo: 'Edarete_React' },
  { slug: 'frameworkscript',          name: 'FrameworkScript',                  owner: 'UBS-Dev-Org',    repo: 'FrameworkScript' },
  { slug: 'badar-hms-node',           name: 'Badar_HMS_Node',                   owner: 'GranjurTech',    repo: 'Badar_HMS_Node' },
  { slug: 'framework-react',          name: 'Framework_React',                  owner: 'UBS-Dev-Org',    repo: 'Framework_React' },
  { slug: 'ilmversity-aicredits',     name: 'Ilmversity_aicredits_node_v2',     owner: 'ilmversity',     repo: 'Ilmversity_aicredits_node_v2' },
  { slug: 'csaas-backend',            name: 'CSAAS_Backend',                    owner: 'Aashir-Adnan',   repo: 'CSAAS_Backend' },
  { slug: 'ubs-doc',                  name: 'UBS-Doc',                          owner: 'Aashir-Adnan',   repo: 'UBS-Doc' },
  { slug: 'scholarspace-ubs',         name: 'ScholarSpace-UBS-Framework',       owner: 'Aashir-Adnan',   repo: 'ScholarSpace-UBS-Framework' },
];
