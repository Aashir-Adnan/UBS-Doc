import { describe, it, expect } from 'vitest'
import { docComponent } from './DocsPage'
import { flattenSidebar } from '../docs/sidebar'

// Regression: docs navigation hung forever because a fresh lazy() component
// was manufactured on every render retry inside a suspended router transition.
// The invariant that fixes it: the SAME doc id must always yield the SAME
// component instance, so React can resolve the suspension it started.
describe('docComponent', () => {
  const [a, b] = flattenSidebar()

  it('returns a stable instance per id', () => {
    expect(docComponent(a)).toBe(docComponent(a))
  })

  it('returns distinct instances for distinct ids', () => {
    expect(docComponent(a)).not.toBe(docComponent(b))
  })

  it('returns null for unknown ids', () => {
    expect(docComponent('nope/never-a-doc')).toBeNull()
  })
})
