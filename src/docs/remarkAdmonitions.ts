import { visit } from 'unist-util-visit'
import type { Root } from 'mdast'

// Docusaurus admonition syntax (`:::note … :::`) is parsed by remark-directive
// into containerDirective nodes; this maps the ones we support onto the
// `.admonition` / `.admonition-<type>` markup that src/styles/docs.css styles.
const TYPES = new Set(['note', 'tip', 'info', 'warning', 'caution', 'danger'])

// Docusaurus accepts a bare title after the type (`:::tip Heads up`), but
// remark-directive only recognises the bracketed form (`:::tip[Heads up]`) —
// an unbracketed opener is not parsed as a directive at all and leaks into the
// page as literal ':::tip Heads up' text. Most of this corpus uses the legacy
// form, so the source is normalised before it reaches the MDX parser.
const OPENER = /^(:{3,}\s*)([a-z]+)[ \t]+([^[\r\n][^\r\n]*?)[ \t]*$/i

export function normalizeAdmonitionTitles(source: string): string {
  let inFence = false
  return source.split('\n').map(raw => {
    // Keep any trailing \r so CRLF files round-trip unchanged.
    const cr = raw.endsWith('\r') ? '\r' : ''
    const line = cr ? raw.slice(0, -1) : raw

    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      return raw
    }
    if (inFence) return raw

    const m = OPENER.exec(line)
    if (!m || !TYPES.has(m[2].toLowerCase())) return raw
    return `${m[1]}${m[2]}[${m[3]}]${cr}`
  }).join('\n')
}

export function remarkAdmonitions() {
  return (tree: Root) => {
    visit(tree, (node: any) => {
      if (node.type !== 'containerDirective' || !TYPES.has(node.name)) return
      const data = node.data || (node.data = {})
      data.hName = 'div'
      data.hProperties = { className: ['admonition', `admonition-${node.name}`] }
      const label = node.children?.find((c: any) => c.data?.directiveLabel)
      const title = label
        ? label.children?.map((c: any) => c.value).join('')
        : node.name.toUpperCase()
      node.children = [
        {
          type: 'paragraph',
          data: { hName: 'p', hProperties: { className: ['admonition-title'] } },
          children: [{ type: 'text', value: title }],
        },
        ...(node.children || []).filter((c: any) => !c.data?.directiveLabel),
      ]
    })
  }
}
