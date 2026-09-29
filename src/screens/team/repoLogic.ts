import type { ProjectRepoLink, RepoRef } from '../tasksLogic'
import { SCOPE_LABEL, scopeLabel } from '../tasksLogic'

// Which repository a task's GitHub issue goes to — the site's half of the
// same rule the bot applies (bot/src/services/taskRepo.js, roadmap sub-project
// 4, 2026-09-30). One rule everywhere so the create page's preview line never
// disagrees with what the bot actually does:
//   1. the project's link carrying the task's scope;
//   2. else the project's ONLY link, when that link has no scope yet (a
//      single-repository project keeps working until it is tagged);
//   3. else none — never "the first of several".

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
  if (mine.length === 1 && !mine[0].scope) return { repository: byId.get(String(mine[0].repositoryId))!, reason: 'only-repo' }
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
