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
      const match = node.url.match(/^([^#?]+)\.mdx?(#.*)?$/)
      if (!match) return
      const target = match[1]
      // Relative means relative — leave anything rooted, protocol-qualified
      // (http:, mailto:) or protocol-relative (//host) untouched. Bare targets
      // like `agents/agent-issue-format.md` are relative and do get rewritten.
      if (/^(\/|[a-z][a-z0-9+.-]*:)/i.test(target)) return
      const resolved = path.posix.normalize(path.posix.join(dir, target))
      node.url = `/docs/${resolved}${match[2] || ''}`
    })
  }
}
