import { describe, it, expect } from 'vitest'
import { viaLabel } from './activityLogic'

describe('viaLabel', () => {
  it('names the MCP token for a change made through the task MCP', () => {
    expect(viaLabel({ viaSite: false, via: 'mcp', viaToken: 'laptop' })).toBe('via MCP (laptop)')
  })
  it('says "via MCP" alone when the token name is missing', () => {
    expect(viaLabel({ viaSite: false, via: 'mcp' })).toBe('via MCP')
    expect(viaLabel({ viaSite: false, via: 'mcp', viaToken: '' })).toBe('via MCP')
  })
  it('keeps "via the site" for a site change, from viaSite alone (an older backend) or via', () => {
    expect(viaLabel({ viaSite: true })).toBe('via the site')
    expect(viaLabel({ viaSite: true, via: 'site' })).toBe('via the site')
  })
  it('is null for a Discord edit or nothing at all', () => {
    expect(viaLabel({ viaSite: false, via: null })).toBeNull()
    expect(viaLabel({ viaSite: false })).toBeNull()
    expect(viaLabel(null)).toBeNull()
  })
})
