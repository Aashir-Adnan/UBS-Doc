import { visit } from 'unist-util-visit'
import type { Root } from 'mdast'
import path from 'node:path'

// Docusaurus rewrote relative `./other.md` links to their route; plain MDX
// leaves them as literal file paths that 404. This resolves them against the
// source file's directory under docs/ and emits `/docs/<id>` instead.
export function remarkDocLinks() {
  return (tree: Root, file: { path?: string }) => {
    const p = (file.path || '').replace(/\\/g, '/')
    const m = p.match(/\/docs\/(.+)\.mdx?$/)
    if (!m) return
    const dir = path.posix.dirname(m[1])
    visit(tree, 'link', (node: { url: string }) => {
      const match = node.url.match(/^(\.{1,2}\/[^#?]*)\.mdx?(#.*)?$/)
      if (!match) return
      const resolved = path.posix.normalize(path.posix.join(dir, match[1]))
      node.url = `/docs/${resolved}${match[2] || ''}`
    })
  }
}
