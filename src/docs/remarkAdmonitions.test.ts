import { describe, it, expect } from 'vitest'
import { compile } from '@mdx-js/mdx'
import remarkDirective from 'remark-directive'
import { remarkAdmonitions, normalizeAdmonitionTitles } from './remarkAdmonitions'

describe('remarkAdmonitions', () => {
  it('maps :::note blocks to admonition divs', async () => {
    const out = String(await compile(':::note\nhello\n:::', {
      remarkPlugins: [remarkDirective, remarkAdmonitions],
    }))
    expect(out).toContain('admonition')
    expect(out).toContain('admonition-note')
  })

  it('uses the directive label as the title when present', async () => {
    const out = String(await compile(':::tip[Pro tip]\nbody text\n:::', {
      remarkPlugins: [remarkDirective, remarkAdmonitions],
    }))
    expect(out).toContain('admonition-tip')
    expect(out).toContain('Pro tip')
    expect(out).toContain('admonition-title')
    expect(out).toContain('body text')
  })

  it('falls back to the uppercased directive name as the title', async () => {
    const out = String(await compile(':::warning\ncareful\n:::', {
      remarkPlugins: [remarkDirective, remarkAdmonitions],
    }))
    expect(out).toContain('admonition-warning')
    expect(out).toContain('WARNING')
  })

  it('leaves unknown container directives untouched', async () => {
    const out = String(await compile(':::something\nplain\n:::', {
      remarkPlugins: [remarkDirective, remarkAdmonitions],
    }))
    expect(out).not.toContain('admonition')
  })
})

describe('normalizeAdmonitionTitles', () => {
  it('brackets a legacy space-separated title', () => {
    expect(normalizeAdmonitionTitles(':::caution Frontend Gate Required\nbody\n:::'))
      .toBe(':::caution[Frontend Gate Required]\nbody\n:::')
  })

  it('leaves bare and already-bracketed openers alone', () => {
    expect(normalizeAdmonitionTitles(':::note\nx\n:::')).toBe(':::note\nx\n:::')
    expect(normalizeAdmonitionTitles(':::tip[Done]\nx\n:::')).toBe(':::tip[Done]\nx\n:::')
  })

  it('ignores non-admonition directives and closing fences', () => {
    expect(normalizeAdmonitionTitles(':::mermaid graph\nx\n:::')).toBe(':::mermaid graph\nx\n:::')
    expect(normalizeAdmonitionTitles(':::\n')).toBe(':::\n')
  })

  it('does not touch admonition-looking lines inside fenced code', () => {
    const src = '```md\n:::note Example\n```\n:::tip Real\nbody\n:::'
    expect(normalizeAdmonitionTitles(src))
      .toBe('```md\n:::note Example\n```\n:::tip[Real]\nbody\n:::')
  })

  it('preserves CRLF line endings', () => {
    expect(normalizeAdmonitionTitles(':::warning Careful\r\nbody\r\n:::\r\n'))
      .toBe(':::warning[Careful]\r\nbody\r\n:::\r\n')
  })

  it('produces a real admonition once normalized', async () => {
    const out = String(await compile(
      normalizeAdmonitionTitles(':::caution Frontend Gate Required\nbody\n:::'),
      { remarkPlugins: [remarkDirective, remarkAdmonitions] },
    ))
    expect(out).toContain('admonition-caution')
    expect(out).toContain('Frontend Gate Required')
  })
})
