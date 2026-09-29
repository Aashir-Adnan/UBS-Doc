// Pure dependency-graph layout: turns a task list's blockedBy/blocks edges
// into a left-to-right layered graph (DependencyGraph.tsx renders it as SVG).
// No React, no DOM.
import { isTerminal, type TaskRef, type TaskRow } from '../tasksLogic'

export interface GraphNode {
  id: string
  title: string
  x: number
  y: number
  blocked: boolean
  terminal: boolean
  depth: number
  // False for a reference this graph cannot open: a task in another project
  // (the backend marks its ref `hidden`) or, defensively, any id this task
  // set doesn't itself contain (an older backend, or a broken reference).
  // Only a real entry of the given `tasks` list is ever clickable.
  clickable: boolean
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
  const taskById = new Map(tasks.map((t) => [t.id, t]))

  // De-duplicate edges: a blocking relationship is often declared from both
  // ends (A.blocks includes B, B.blockedBy includes A). An edge's far end may
  // be a task this set doesn't contain at all — a cross-project reference the
  // backend sent as a hidden stub, or (defensively) any id with no matching
  // task here — so it still gets an edge and a stub node, just not a real
  // task backing it; `refMeta` remembers that ref's own title/status so the
  // stub node can still be drawn.
  const edgeMap = new Map<string, GraphEdge>()
  const refMeta = new Map<string, { title: string; hidden: boolean; status?: string }>()
  const addEdge = (from: string, to: string, far: TaskRef) => {
    if (from === to) return
    edgeMap.set(`${from}->${to}`, { from, to })
    if (!taskById.has(far.id)) refMeta.set(far.id, { title: far.title, hidden: !!far.hidden, status: far.status })
  }
  for (const task of tasks) {
    for (const blocker of task.blockedBy) addEdge(blocker.id, task.id, blocker)
    for (const blocked of task.blocks) addEdge(task.id, blocked.id, blocked)
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

  // Row = the node's index within its depth column, in a stable order: the
  // given task list's own order first (so a real task's position never
  // shifts because of an external reference), then any stub nodes (ids with
  // no matching task) in the order their edges were first seen.
  const orderedIds = [
    ...tasks.map((t) => t.id).filter((id) => includedIds.has(id)),
    ...[...refMeta.keys()].filter((id) => includedIds.has(id)),
  ]
  const columns = new Map<number, string[]>()
  for (const id of orderedIds) {
    const d = depth.get(id) ?? 0
    if (!columns.has(d)) columns.set(d, [])
    columns.get(d)!.push(id)
  }

  const nodes: GraphNode[] = []
  for (const id of orderedIds) {
    const d = depth.get(id) ?? 0
    const row = columns.get(d)!.indexOf(id)
    const task = taskById.get(id)
    const meta = refMeta.get(id)
    nodes.push({
      id,
      title: task ? task.title : (meta?.title ?? id),
      x: d * (nodeW + gapX),
      y: row * (nodeH + gapY),
      blocked: task ? task.isBlocked : false,
      terminal: task ? isTerminal(task.status) : isTerminal(meta?.status ?? ''),
      depth: d,
      // A stub node (no `task`) stands for a reference this graph can't
      // resolve — a hidden cross-project ref or an id it otherwise doesn't
      // recognize — so it's never clickable regardless of what the ref itself
      // claims.
      clickable: !!task,
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
