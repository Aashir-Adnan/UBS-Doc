import { describe, it, expect } from 'vitest'
import { compile } from '@mdx-js/mdx'
import fs from 'node:fs'
import path from 'node:path'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import remarkDirective from 'remark-directive'
import { remarkAdmonitions, normalizeAdmonitionTitles } from './remarkAdmonitions'
import { remarkDocLinks } from './remarkDocLinks'

// Mirrors the MDX options in vite.config.ts so a doc that would break
// `npm run build` fails here first, naming the file and line.
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

describe('docs corpus', () => {
  it('every doc compiles as MDX', async () => {
    const failures: string[] = []
    for (const file of walk(DOCS)) {
      try {
        const value = normalizeAdmonitionTitles(fs.readFileSync(file, 'utf8'))
        await compile({ value, path: file }, OPTIONS)
      } catch (err: any) {
        const rel = path.relative(DOCS, file).replace(/\\/g, '/')
        failures.push(`${rel}:${err.line ?? '?'}:${err.column ?? '?'} — ${err.reason || err.message}`)
      }
    }
    expect(failures).toEqual([])
  }, 120_000)
})
