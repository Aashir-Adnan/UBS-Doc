import { describe, it, expect } from 'vitest'
import { resolveTaskRepo, repoReasonText, projectRepoList, issueTargetText, bugRepoChoices } from './repoLogic'
import type { RepoRef, ProjectRepoLink } from '../tasksLogic'

// Mirrors the bot's rule tests (bot/src/services/taskRepo.test.js) — same
// three rules, same reasons, so the create page and the bot never disagree
// about where a task's GitHub issue goes.

const R1: RepoRef = { id: 'r1', name: 'Framework_Node', url: 'https://github.com/ubs-dev-org/Framework_Node' }
const R2: RepoRef = { id: 'r2', name: 'Framework_React', url: 'https://github.com/ubs-dev-org/Framework_React' }
const repositories = [R1, R2]
const link = (repositoryId: string, scope: string | null = null, projectId = 'p1'): ProjectRepoLink => ({ projectId, repositoryId, scope })

describe('resolveTaskRepo', () => {
  it('rule 1: the link with the task scope', () => {
    const out = resolveTaskRepo({ projectId: 'p1', scope: 'frontend' }, { projectRepos: [link('r1', 'backend'), link('r2', 'frontend')], repositories })
    expect(out).toEqual({ repository: R2, reason: 'scope' })
  })

  it('rule 2: the only link, when it has no scope', () => {
    expect(resolveTaskRepo({ projectId: 'p1', scope: 'qa' }, { projectRepos: [link('r1')], repositories })).toEqual({ repository: R1, reason: 'only-repo' })
    expect(resolveTaskRepo({ projectId: 'p1', scope: null }, { projectRepos: [link('r1')], repositories })).toEqual({ repository: R1, reason: 'only-repo' })
  })

  it('a single link tagged with another scope is not used', () => {
    expect(resolveTaskRepo({ projectId: 'p1', scope: 'frontend' }, { projectRepos: [link('r1', 'backend')], repositories })).toEqual({ repository: null, reason: 'no-repo-for-scope' })
  })

  it('two links, neither with the scope: none (never "the first")', () => {
    expect(resolveTaskRepo({ projectId: 'p1', scope: 'design' }, { projectRepos: [link('r1'), link('r2')], repositories })).toEqual({ repository: null, reason: 'no-repo-for-scope' })
  })

  it('no project, or no scope with several links', () => {
    expect(resolveTaskRepo({ projectId: null, scope: 'backend' }, { projectRepos: [], repositories })).toEqual({ repository: null, reason: 'no-project' })
    expect(resolveTaskRepo({ projectId: 'p1', scope: null }, { projectRepos: [link('r1', 'backend'), link('r2')], repositories })).toEqual({ repository: null, reason: 'no-scope' })
  })

  it('links of other projects and links to deleted repositories are ignored', () => {
    expect(resolveTaskRepo({ projectId: 'p1', scope: 'backend' }, { projectRepos: [link('r1', 'backend', 'p2'), link('gone', 'backend')], repositories })).toEqual({ repository: null, reason: 'no-repo-for-scope' })
  })

  it('defaults projectRepos/repositories to empty when omitted', () => {
    expect(resolveTaskRepo({ projectId: 'p1', scope: 'backend' }, {})).toEqual({ repository: null, reason: 'no-repo-for-scope' })
  })
})

describe('repoReasonText', () => {
  it('matches the bot\'s reason texts exactly', () => {
    expect(repoReasonText('no-project')).toBe('the task has no project')
    expect(repoReasonText('no-scope')).toBe('the task has no scope')
    expect(repoReasonText('no-repo-for-scope')).toBe('the project has no repository for this scope')
  })
})

describe('issueTargetText', () => {
  // Mirrors the bot's repositoryFieldText test (create-task.test.js): the
  // scope parenthetical appears only when the scope rule (reason 'scope')
  // is what chose the repository, never for the rule-2 'only-repo' fallback,
  // regardless of whether the task itself carries a scope.
  it('adds the scope only when the scope rule chose the repository', () => {
    expect(issueTargetText({ repository: R1, reason: 'scope' }, 'frontend')).toBe('Issue goes to Framework_Node (Frontend)')
  })

  it('the only-repo fallback shows the bare name, whether or not the task has a scope', () => {
    expect(issueTargetText({ repository: R1, reason: 'only-repo' }, 'frontend')).toBe('Issue goes to Framework_Node')
    expect(issueTargetText({ repository: R1, reason: 'only-repo' }, null)).toBe('Issue goes to Framework_Node')
  })

  it('no repository resolved: the refusal line, regardless of reason', () => {
    expect(issueTargetText({ repository: null, reason: 'no-repo-for-scope' }, 'frontend')).toBe('No repository for this project and scope — no issue')
    expect(issueTargetText({ repository: null, reason: 'no-scope' }, null)).toBe('No repository for this project and scope — no issue')
    expect(issueTargetText({ repository: null, reason: 'no-project' }, null)).toBe('No repository for this project and scope — no issue')
  })
})

describe('projectRepoList', () => {
  const projectRepos: ProjectRepoLink[] = [
    { projectId: 'p1', repositoryId: 'r2', scope: 'frontend' },
    { projectId: 'p1', repositoryId: 'r1', scope: 'backend' },
    { projectId: 'p2', repositoryId: 'r1', scope: 'backend' },
  ]

  it('sorts by scope order then name, for the project asked about only', () => {
    expect(projectRepoList('p1', projectRepos, repositories)).toEqual([
      { name: 'Framework_Node', scope: 'backend' },
      { name: 'Framework_React', scope: 'frontend' },
    ])
  })

  it('puts untagged links last, after every fixed scope', () => {
    const links: ProjectRepoLink[] = [
      { projectId: 'p1', repositoryId: 'r1', scope: null },
      { projectId: 'p1', repositoryId: 'r2', scope: 'backend' },
    ]
    expect(projectRepoList('p1', links, repositories)).toEqual([
      { name: 'Framework_React', scope: 'backend' },
      { name: 'Framework_Node', scope: null },
    ])
  })

  it('drops a link to a deleted repository', () => {
    const links: ProjectRepoLink[] = [{ projectId: 'p1', repositoryId: 'gone', scope: 'backend' }]
    expect(projectRepoList('p1', links, repositories)).toEqual([])
  })

  it('returns [] for a project with no links, and for a null project id', () => {
    expect(projectRepoList('p3', projectRepos, repositories)).toEqual([])
    expect(projectRepoList(null, projectRepos, repositories)).toEqual([])
  })
})

// F5 (final review, 2026-09-30): the bug fallback picker's options (spec §5).
describe('bugRepoChoices', () => {
  const R3: RepoRef = { id: 'r3', name: 'Alpha_Docs', url: 'https://github.com/ubs-dev-org/Alpha_Docs' }
  const all = [R1, R2, R3]

  it("offers every repository linked to the project, in the project cards' order", () => {
    const links: ProjectRepoLink[] = [link('r2', 'frontend'), link('r1', 'backend'), link('r3', 'backend', 'p2')]
    expect(bugRepoChoices('p1', links, all)).toEqual([R1, R2])
  })

  it('offers every repository when the project has no links', () => {
    expect(bugRepoChoices('p1', [link('r1', 'backend', 'p2')], all)).toEqual([R3, R1, R2])
    expect(bugRepoChoices('p1', undefined, all)).toEqual([R3, R1, R2])
  })

  it('offers nothing only when there are no repositories at all, or no project', () => {
    expect(bugRepoChoices('p1', [], [])).toEqual([])
    expect(bugRepoChoices('p1', undefined, undefined)).toEqual([])
    expect(bugRepoChoices(null, [link('r1')], all)).toEqual([])
  })

  it('ignores a link to a deleted repository (falls back to all when that was the only one)', () => {
    expect(bugRepoChoices('p1', [link('gone', 'backend')], all)).toEqual([R3, R1, R2])
  })
})
