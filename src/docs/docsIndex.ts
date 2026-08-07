import type { ComponentType } from 'react'

export type DocModule = {
  default: ComponentType
  frontmatter?: Record<string, unknown>
}

// Every doc under docs/ is routable, not just the ~144 the sidebar lists —
// unlisted files still resolve by URL, they simply have no tree entry.
// superpowers/ is workflow scaffolding, not documentation, so it is excluded.
const mods = import.meta.glob([
  '/docs/**/*.md',
  '/docs/**/*.mdx',
  '!/docs/superpowers/**',
]) as Record<string, () => Promise<DocModule>>

export const DOC_MODULES: Record<string, () => Promise<DocModule>> = {}
for (const [file, loader] of Object.entries(mods)) {
  const id = file.replace(/^\/docs\//, '').replace(/\.mdx?$/, '')
  DOC_MODULES[id] = loader
}
