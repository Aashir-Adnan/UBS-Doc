import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { SIDEBAR, flattenSidebar, docLabel, categoryPathFor, type SidebarNode } from './sidebar'

describe('sidebar', () => {
  it('flattens to the doc ids in sidebars.js order', () => {
    const flat = flattenSidebar()
    expect(flat[0]).toBe('init')
    expect(flat[flat.length - 1]).toBe('projects/badar-hms/Opera_Config')
    expect(flat.length).toBeGreaterThan(120)
    expect(flat).toContain('backend/tenancy')
    expect(flat).toContain('hms-documentation/admin-apis/validation-duplicate')
  })

  it('has the seven top-level groups of the ported tutorialSidebar', () => {
    expect(SIDEBAR).toHaveLength(8) // 'init' + 7 categories
    const labels = SIDEBAR.filter(n => typeof n !== 'string').map(n => (n as { label: string }).label)
    expect(labels).toEqual([
      'Framework Introduction',
      'Framework Database',
      'Framework Backend',
      'Framework Frontend',
      'Framework Agents',
      'HMS Documentation',
      'Projects',
    ])
  })

  it('every doc id resolves to a file under docs/', () => {
    // Guards the merge case: a sidebar entry ported without its .md file (or a
    // renamed doc) would 404 in the app. Cheap to check, catches it at CI time.
    const missing = flattenSidebar().filter(
      id => !existsSync(resolve('docs', `${id}.md`)) && !existsSync(resolve('docs', `${id}.mdx`)),
    )
    expect(missing).toEqual([])
  })

  it('contains no duplicate doc ids', () => {
    const flat = flattenSidebar()
    expect(new Set(flat).size).toBe(flat.length)
  })

  it('flattens an arbitrary node list depth-first', () => {
    const nodes: SidebarNode[] = ['a', { label: 'G', items: ['b', { label: 'H', items: ['c'] }] }, 'd']
    expect(flattenSidebar(nodes)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('docLabel', () => {
  it('prettifies the last path segment', () => {
    expect(docLabel('hms-documentation/admin-apis/validation-duplicate')).toBe('validation duplicate')
    expect(docLabel('FRONTEND_TENANT_PROJECT_ACCESS')).toBe('FRONTEND TENANT PROJECT ACCESS')
    expect(docLabel('init')).toBe('init')
  })
})

describe('categoryPathFor', () => {
  it('returns the ancestor category keys of a nested doc', () => {
    const nodes: SidebarNode[] = ['a', { label: 'G', items: ['b', { label: 'H', items: ['c'] }] }]
    expect(categoryPathFor('c', nodes)).toEqual(['1', '1.1'])
    expect(categoryPathFor('b', nodes)).toEqual(['1'])
  })

  it('returns an empty chain for a top-level doc and null for an unknown id', () => {
    const nodes: SidebarNode[] = ['a', { label: 'G', items: ['b'] }]
    expect(categoryPathFor('a', nodes)).toEqual([])
    expect(categoryPathFor('nope', nodes)).toBeNull()
  })

  it('opens every ancestor of a deep real doc id', () => {
    const chain = categoryPathFor('hms-documentation/admin-apis/validation-duplicate')
    expect(chain).not.toBeNull()
    expect(chain!.length).toBe(3) // HMS Documentation > Admin APIs > Validation
  })
})
