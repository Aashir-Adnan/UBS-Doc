import type { ProjectRepoLink, RepoRef } from '../tasksLogic'
import { SCOPE_LABEL, scopeLabel } from '../tasksLogic'

// Which repository a task's GitHub issue goes to — the site's half of the
// same rule the bot applies (bot/src/services/taskRepo.js, roadmap sub-project
// 4, 2026-09-30). One rule everywhere so the create page's preview line never
// disagrees with what the bot actually does:
//   1. the project's link carrying the task's scope;
//   2. else the project's ONE untagged link — it takes every scope no tagged
//      link claims (a single-repository project keeps working until it is
//      tagged; a repository holding backend AND frontend stays untagged beside
//      a tagged mobile one, since a link carries one scope);
//   3. else none — never "the first of several" untagged links.

export type RepoReason = 'scope' | 'only-repo' | 'no-project' | 'no-scope' | 'no-repo-for-scope'

const REASONS: Partial<Record<RepoReason, string>> = {
  'no-project': 'the task has no project',
  'no-scope': 'the task has no scope',
  'no-repo-for-scope': 'the project has no repository for this scope',
}

export function repoReasonText(reason: RepoReason): string {
  return REASONS[reason] ?? 'no repository was found'
}

export function resolveTaskRepo(
  { projectId, scope }: { projectId: string | null; scope: string | null },
  { projectRepos = [], repositories = [] }: { projectRepos?: ProjectRepoLink[]; repositories?: RepoRef[] },
): { repository: RepoRef | null; reason: RepoReason } {
  if (!projectId) return { repository: null, reason: 'no-project' }
  const byId = new Map(repositories.map((r) => [String(r.id), r]))
  const mine = projectRepos.filter((l) => String(l.projectId) === String(projectId) && byId.has(String(l.repositoryId)))
  if (scope) {
    const hit = mine.find((l) => l.scope === scope)
    if (hit) return { repository: byId.get(String(hit.repositoryId))!, reason: 'scope' }
  }
  const untagged = mine.filter((l) => !l.scope)
  if (untagged.length === 1) return { repository: byId.get(String(untagged[0].repositoryId))!, reason: 'only-repo' }
  return { repository: null, reason: scope ? 'no-repo-for-scope' : 'no-scope' }
}

/**
 * The create page's "Issue goes to …" line, mirroring the bot's confirm-step
 * text (bot/src/commands/create-task.js `repositoryFieldText`): the scope
 * parenthetical is shown only when `reason === 'scope'` actually chose the
 * repository by scope — the rule-2 fallback ('only-repo') found it because
 * it was the project's only, untagged link, which says nothing about the
 * task's own scope, so showing that scope next to it would imply routing
 * that did not happen.
 */
export function issueTargetText(
  result: { repository: RepoRef | null; reason: RepoReason },
  scope: string | null | undefined,
): string {
  if (!result.repository) return 'No repository for this project and scope — no issue'
  const label = result.reason === 'scope' ? scopeLabel(scope) : null
  return label ? `Issue goes to ${result.repository.name} (${label})` : `Issue goes to ${result.repository.name}`
}

/**
 * The bug fallback picker's options (spec §5): when the rule finds no
 * repository for a bug, the site lets the visitor pick one and sends it as
 * `repository_ids[0]` — the bot accepts it only in that case. Every repository
 * linked to the project (in the project cards' order), or, when the project
 * has no usable link, every repository (by name). Empty only when there are no
 * repositories at all (or no project) — the one case the form still refuses.
 */
export function bugRepoChoices(
  projectId: string | null,
  projectRepos: ProjectRepoLink[] | undefined,
  repositories: RepoRef[] | undefined,
): RepoRef[] {
  if (!projectId) return []
  const all = repositories ?? []
  const byId = new Map(all.map((r) => [String(r.id), r]))
  const scopeOrder = Object.keys(SCOPE_LABEL)
  const rank = (scope: string | null) => (scope ? scopeOrder.indexOf(scope) : scopeOrder.length)
  const seen = new Set<string>()
  const linked = (projectRepos ?? [])
    .filter((l) => String(l.projectId) === String(projectId) && byId.has(String(l.repositoryId)))
    .sort((a, b) => rank(a.scope) - rank(b.scope) || byId.get(String(a.repositoryId))!.name.localeCompare(byId.get(String(b.repositoryId))!.name))
    .map((l) => byId.get(String(l.repositoryId))!)
    .filter((r) => (seen.has(String(r.id)) ? false : (seen.add(String(r.id)), true)))
  if (linked.length) return linked
  return [...all].sort((a, b) => a.name.localeCompare(b.name))
}

// One project's links as `{ name, scope }[]`, sorted by scope display order
// (the fixed scopes, in SCOPE_LABEL's order) then repository name, with an
// untagged link last. Feeds the project cards' "Repositories: …" line.
export function projectRepoList(
  projectId: string | null,
  projectRepos: ProjectRepoLink[] | undefined,
  repositories: RepoRef[] | undefined,
): { name: string; scope: string | null }[] {
  if (!projectId) return []
  const byId = new Map((repositories ?? []).map((r) => [String(r.id), r]))
  const scopeOrder = Object.keys(SCOPE_LABEL)
  return (projectRepos ?? [])
    .filter((l) => String(l.projectId) === String(projectId) && byId.has(String(l.repositoryId)))
    .map((l) => ({ name: byId.get(String(l.repositoryId))!.name, scope: l.scope }))
    .sort((a, b) => {
      const ai = a.scope ? scopeOrder.indexOf(a.scope) : scopeOrder.length
      const bi = b.scope ? scopeOrder.indexOf(b.scope) : scopeOrder.length
      if (ai !== bi) return ai - bi
      return a.name.localeCompare(b.name)
    })
}
