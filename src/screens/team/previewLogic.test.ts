import { describe, it, expect } from 'vitest'
import { popoverPosition } from './previewLogic'

const vp = { width: 1000, height: 800 }
const pop = { width: 320, height: 300 }

describe('popoverPosition', () => {
  it('opens below the anchor, right-aligned to it', () => {
    expect(popoverPosition({ left: 600, right: 620, top: 100, bottom: 120 }, vp, pop)).toEqual({ top: 128, left: 300 })
  })
  it('is pulled back inside the left edge', () => {
    expect(popoverPosition({ left: 10, right: 30, top: 100, bottom: 120 }, vp, pop).left).toBe(8)
  })
  it('is pulled back inside the right edge', () => {
    expect(popoverPosition({ left: 990, right: 1010, top: 100, bottom: 120 }, vp, pop).left).toBe(1000 - 320 - 8)
  })
  it('flips above the anchor when there is no room below and more above', () => {
    expect(popoverPosition({ left: 600, right: 620, top: 700, bottom: 720 }, vp, pop)).toEqual({ top: 700 - 8 - 300, left: 300 })
  })
  it('stays below when neither side fits but below has more room', () => {
    const tall = { width: 320, height: 900 }
    expect(popoverPosition({ left: 600, right: 620, top: 100, bottom: 120 }, vp, tall).top).toBe(128)
  })
  it('never goes above the top margin when flipped', () => {
    const tall = { width: 320, height: 900 }
    expect(popoverPosition({ left: 600, right: 620, top: 500, bottom: 520 }, vp, tall).top).toBeGreaterThanOrEqual(8)
  })
})
