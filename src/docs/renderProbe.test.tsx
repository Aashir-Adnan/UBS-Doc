import { describe, it, expect } from 'vitest'
import { evaluate } from '@mdx-js/mdx'
import * as runtime from 'react/jsx-runtime'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import fs from 'node:fs'
import path from 'node:path'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import remarkDirective from 'remark-directive'
import { remarkAdmonitions, normalizeAdmonitionTitles } from './remarkAdmonitions'
import { remarkDocLinks } from './remarkDocLinks'

const OPTIONS = {
  format: 'mdx' as const,
  remarkPlugins: [
    remarkGfm, remarkFrontmatter, remarkMdxFrontmatter,
    remarkDirective, remarkAdmonitions, remarkDocLinks,
  ],
}

const DOCS = path.resolve(process.cwd(), 'docs')

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === 'superpowers' ? [] : walk(full)
    return /\.mdx?$/.test(e.name) ? [full] : []
  })
}

describe('docs corpus runtime', () => {
  it('every doc RENDERS (not just compiles)', async () => {
    const failures: string[] = []
    for (const file of walk(DOCS)) {
      const rel = path.relative(DOCS, file).replace(/\\/g, '/')
      try {
        const value = normalizeAdmonitionTitles(fs.readFileSync(file, 'utf8'))
        const mod = await evaluate({ value, path: file }, { ...runtime, ...OPTIONS })
        renderToString(createElement(mod.default))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message.split('\n')[0] : String(err)
        failures.push(`${rel} — ${msg}`)
      }
    }
    expect(failures).toEqual([])
  }, 240_000)
})
