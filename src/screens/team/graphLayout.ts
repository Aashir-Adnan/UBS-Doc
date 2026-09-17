// Pure dependency-graph layout: turns a task list's blockedBy/blocks edges
// into a left-to-right layered graph (DependencyGraph.tsx renders it as SVG).
// No React, no DOM.
import { isTerminal, type TaskRow } from '../tasksLogic'

export interface GraphNode {
  id: string
  title: string
  x: number
  y: number
  blocked: boolean
  terminal: boolean
  depth: number
}

export interface GraphEdge { from: string; to: string }

export interface GraphLayoutOptions { nodeW?: number; nodeH?: number; gapX?: number; gapY?: number }

export interface GraphLayout { nodes: GraphNode[]; edges: GraphEdge[]; width: number; height: number }

// Default node/gap sizing, exported so DependencyGraph.tsx can position its
// SVG edges against the same numbers layoutGraph used rather than duplicating
// them.
export const DEFAULT_NODE_W = 180
export const DEFAULT_NODE_H = 44
export const DEFAULT_GAP_X = 60
export const DEFAULT_GAP_Y = 16


export function layoutGraph(tasks: TaskRow[], options: GraphLayoutOptions = {}): GraphLayout {
  const { nodeW = DEFAULT_NODE_W, nodeH = DEFAULT_NODE_H, gapX = DEFAULT_GAP_X, gapY = DEFAULT_GAP_Y } = options
  const ids = new Set(tasks.map((t) => t.id))

  // De-duplicate edges: a blocking relationship is often declared from both
  // ends (A.blocks includes B, B.blockedBy includes A) and only edges wholly
  // inside the given task set count.
  const edgeMap = new Map<string, GraphEdge>()
  const addEdge = (from: string, to: string) => {
    if (from === to || !ids.has(from) || !ids.has(to)) return
    edgeMap.set(`${from}->${to}`, { from, to })
  }
  for (const task of tasks) {
    for (const blocker of task.blockedBy) addEdge(blocker.id, task.id)
    for (const blocked of task.blocks) addEdge(task.id, blocked.id)
  }
  const edges = [...edgeMap.values()]

  // Only tasks touched by at least one in-set edge appear as nodes.
  const includedIds = new Set<string>()
  for (const edge of edges) {
    includedIds.add(edge.from)
    includedIds.add(edge.to)
  }

  // depth = longest path from a node with no in-set blocker, found by
  // relaxing every edge repeatedly (Bellman-Ford style). The bot refuses
  // cycles at write time, but a malformed/imported graph could still contain
  // one, and relaxation around a cycle grows depth forever — so the passes
  // are capped. A DAG's longest path spans at most n-1 edges, so n passes
  // always reach the stable answer with one to spare; a cycle is simply cut
  // off there. The cap is the node count rather than a flat 1000 so a cycle
  // can never produce a depth (and therefore an SVG width) out of proportion
  // to the graph being drawn.
  const maxPasses = includedIds.size
  const depth = new Map<string, number>()
  for (const id of includedIds) depth.set(id, 0)
  for (let pass = 0; pass < maxPasses; pass++) {
    // Each pass relaxes against the previous pass's depths, not the ones it
    // is writing, so a single pass can raise any depth by at most 1. That is
    // what makes the pass cap a depth cap too: after n passes nothing can
    // exceed n, however the edges happen to be ordered.
    const prev = new Map(depth)
    let changed = false
    for (const edge of edges) {
      const candidate = (prev.get(edge.from) ?? 0) + 1
      if (candidate > (depth.get(edge.to) ?? 0)) {
        depth.set(edge.to, candidate)
        changed = true
      }
    }
    if (!changed) break
  }

  // Row = the node's index within its depth column, in the original task
  // order (stable, deterministic layout across re-renders).
  const columns = new Map<number, string[]>()
  for (const task of tasks) {
    if (!includedIds.has(task.id)) continue
    const d = depth.get(task.id) ?? 0
    if (!columns.has(d)) columns.set(d, [])
    columns.get(d)!.push(task.id)
  }

  const nodes: GraphNode[] = []
  for (const task of tasks) {
    if (!includedIds.has(task.id)) continue
    const d = depth.get(task.id) ?? 0
    const row = columns.get(d)!.indexOf(task.id)
    nodes.push({
      id: task.id,
      title: task.title,
      x: d * (nodeW + gapX),
      y: row * (nodeH + gapY),
      blocked: task.isBlocked,
      terminal: isTerminal(task.status),
      depth: d,
    })
  }

  const width = nodes.length ? Math.max(...nodes.map((n) => n.x)) + nodeW : 0
  const height = nodes.length ? Math.max(...nodes.map((n) => n.y)) + nodeH : 0

  return { nodes, edges, width, height }
}

// Node titles run long; the graph's boxes are fixed-width, so a title beyond
// `max` characters (ellipsis included) is clipped. The full title still
// reaches the reader via the SVG <title> tooltip DependencyGraph renders.
export function clipTitle(title: string, max = 28): string {
  if (title.length <= max) return title
  return `${title.slice(0, max - 1)}…`
}
