import { describe, it, expect } from 'vitest'
import { compile } from '@mdx-js/mdx'
import { remarkDocLinks } from './remarkDocLinks'

describe('remarkDocLinks', () => {
  it('rewrites relative .md links to /docs routes', async () => {
    // The vfile's `path` drives resolution — pass value+path as a vfile-compatible object.
    const out = String(await compile(
      { value: '[x](./other-doc.md)', path: '/repo/docs/backend/page.md' },
      { remarkPlugins: [remarkDocLinks] },
    ))
    expect(out).toContain('/docs/backend/other-doc')
  })

  it('leaves absolute and external links alone', async () => {
    const out = String(await compile(
      { value: '[x](https://example.com/a.md) [y](/docs/intro/UBS_Framework_Features)', path: '/repo/docs/backend/page.md' },
      { remarkPlugins: [remarkDocLinks] },
    ))
    expect(out).toContain('https://example.com/a.md')
    expect(out).toContain('/docs/intro/UBS_Framework_Features')
  })

  it('resolves ../ links against the doc directory and keeps the hash', async () => {
    const out = String(await compile(
      { value: '[x](../intro/Node-Advantages.md#why)', path: '/repo/docs/backend/page.md' },
      { remarkPlugins: [remarkDocLinks] },
    ))
    expect(out).toContain('/docs/intro/Node-Advantages#why')
  })

  it('rewrites bare relative links with no ./ prefix', async () => {
    const out = String(await compile(
      { value: '[x](agents/agent-issue-format.md)', path: '/repo/docs/meeting-workflow-flow.md' },
      { remarkPlugins: [remarkDocLinks] },
    ))
    expect(out).toContain('/docs/agents/agent-issue-format')
  })

  it('rewrites a bare sibling link from inside a subdirectory', async () => {
    const out = String(await compile(
      { value: '[x](tenancy.md#scoping)', path: '/repo/docs/backend/page.md' },
      { remarkPlugins: [remarkDocLinks] },
    ))
    expect(out).toContain('/docs/backend/tenancy#scoping')
  })

  it('leaves mailto and protocol-relative links alone', async () => {
    const out = String(await compile(
      { value: '[x](mailto:someone@example.md) [y](//cdn.example.com/a.md)', path: '/repo/docs/backend/page.md' },
      { remarkPlugins: [remarkDocLinks] },
    ))
    expect(out).toContain('mailto:someone@example.md')
    expect(out).toContain('//cdn.example.com/a.md')
  })

  it('handles .mdx targets and nested source dirs', async () => {
    const out = String(await compile(
      { value: '[x](./deep/child.mdx)', path: '/repo/docs/hms-documentation/admin-apis/page.mdx' },
      { remarkPlugins: [remarkDocLinks] },
    ))
    expect(out).toContain('/docs/hms-documentation/admin-apis/deep/child')
  })
})
