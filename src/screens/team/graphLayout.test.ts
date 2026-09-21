import { describe, it, expect } from 'vitest'
import { layoutGraph, clipTitle } from './graphLayout'
import type { TaskRow } from '../tasksLogic'

const t = (id: string, status: string, blockedBy: string[] = [], blocks: string[] = [], isBlocked = false): TaskRow => ({
  id, title: `Task ${id}`, type: 'feature', status, implementationStatus: null,
  assignees: [], isBlocked,
  blockedBy: blockedBy.map((b) => ({ id: b, title: `Task ${b}` })),
  blocks: blocks.map((b) => ({ id: b, title: `Task ${b}` })),
  channelUrl: null, createdAt: '', updatedAt: '',
  description: null, scope: null, modules: [], createdBy: null,
  passedApiTests: null, passedQaTests: null, passedAcceptanceCriteria: null,
  projectId: null, projectName: null,
})

describe('layoutGraph', () => {
  it('gives a chain A<-B<-C increasing depths and x positions', () => {
    const tasks = [
      t('A', 'open', [], ['B']),
      t('B', 'open', ['A'], ['C'], true),
      t('C', 'open', ['B']),
    ]
    const { nodes, edges } = layoutGraph(tasks)
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
    expect(byId.A.depth).toBe(0)
    expect(byId.B.depth).toBe(1)
    expect(byId.C.depth).toBe(2)
    expect(byId.A.x).toBeLessThan(byId.B.x)
    expect(byId.B.x).toBeLessThan(byId.C.x)
    expect(byId.B.blocked).toBe(true)
    expect(edges).toEqual(expect.arrayContaining([{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }]))
    expect(nodes).toHaveLength(3)
  })

  it('excludes a task with no edges into the same set', () => {
    const tasks = [t('A', 'open', [], ['B']), t('B', 'open', ['A']), t('D', 'open')]
    const { nodes } = layoutGraph(tasks)
    expect(nodes.map((n) => n.id)).not.toContain('D')
    expect(nodes).toHaveLength(2)
  })

  it('ignores an edge that points outside the given task set', () => {
    const tasks = [t('A', 'open', ['ghost'])]
    const { nodes, edges } = layoutGraph(tasks)
    expect(nodes).toHaveLength(0)
    expect(edges).toHaveLength(0)
  })

  it('terminates on a malformed cycle instead of hanging', () => {
    const tasks = [t('A', 'open', ['B'], ['B']), t('B', 'open', ['A'], ['A'])]
    const start = Date.now()
    const { nodes } = layoutGraph(tasks)
    expect(Date.now() - start).toBeLessThan(2000)
    expect(nodes.map((n) => n.id).sort()).toEqual(['A', 'B'])
  })

  // Relaxation is capped at the number of included nodes, so a cycle cannot
  // push a depth past that count and blow the SVG's width out to thousands of
  // columns; a two-node cycle stays inside two columns.
  it('keeps the depths of a 2-cycle no larger than the node count', () => {
    const tasks = [t('A', 'open', ['B'], ['B']), t('B', 'open', ['A'], ['A'])]
    const { nodes } = layoutGraph(tasks)
    expect(nodes).toHaveLength(2)
    for (const n of nodes) {
      expect(n.depth).toBeGreaterThanOrEqual(0)
      expect(n.depth).toBeLessThanOrEqual(nodes.length)
    }
  })

  it('marks terminal tasks and lays out width/height covering the last node', () => {
    const tasks = [t('A', 'open', [], ['B']), t('B', 'done', ['A'])]
    const { nodes, width, height } = layoutGraph(tasks, { nodeW: 100, nodeH: 40, gapX: 10, gapY: 5 })
    const b = nodes.find((n) => n.id === 'B')!
    expect(b.terminal).toBe(true)
    expect(width).toBe(b.x + 100)
    expect(height).toBeGreaterThanOrEqual(b.y + 40)
  })
})

describe('clipTitle', () => {
  it('leaves a short title unchanged', () => {
    expect(clipTitle('Fix the login bug')).toBe('Fix the login bug')
  })

  it('clips a long title to 28 total characters ending with an ellipsis', () => {
    const title = 'Add pagination to the admin dashboard task list'
    const clipped = clipTitle(title)
    expect(clipped).toHaveLength(28)
    expect(clipped.endsWith('…')).toBe(true)
    expect(clipped).toBe('Add pagination to the admin…')
  })
})
