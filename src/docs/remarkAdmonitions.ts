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
const FENCE = /^\s*(`{3,}|~{3,})(.*)$/

export function normalizeAdmonitionTitles(source: string): string {
  // CommonMark fence rules, because a naive toggle desyncs on nested fences:
  // a ```js block inside a ````md wrapper would otherwise be read as the
  // wrapper's closer, exposing the sample's contents to rewriting. A fence
  // only closes on the same character, a run at least as long as the opener,
  // and no info string.
  let fenceChar = ''
  let fenceLen = 0

  return source.split('\n').map(raw => {
    // Keep any trailing \r so CRLF files round-trip unchanged.
    const cr = raw.endsWith('\r') ? '\r' : ''
    const line = cr ? raw.slice(0, -1) : raw

    const f = FENCE.exec(line)
    if (f) {
      const marker = f[1]
      if (!fenceChar) {
        fenceChar = marker[0]
        fenceLen = marker.length
      } else if (marker[0] === fenceChar && marker.length >= fenceLen && f[2].trim() === '') {
        fenceChar = ''
        fenceLen = 0
      }
      return raw
    }
    if (fenceChar) return raw

    const m = OPENER.exec(line)
    const name = m?.[2].toLowerCase()
    if (!m || !name || !TYPES.has(name)) return raw
    // Lowercase the name on the way out: TYPES lookups in the remark plugin
    // are case-sensitive, so `:::NOTE` would parse but never match.
    return `${m[1]}${name}[${m[3]}]${cr}`
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
