import { describe, it, expect } from 'vitest'
import { safeAvatarUrl, initialsOf, stackSplit } from './avatarLogic'

describe('safeAvatarUrl', () => {
  it('accepts Discord CDN urls', () => {
    const u = 'https://cdn.discordapp.com/avatars/1/abc.png?size=64'
    expect(safeAvatarUrl(u)).toBe(u)
  })
  it('refuses any other host, scheme or a missing value', () => {
    expect(safeAvatarUrl('https://evil.example/a.png')).toBeNull()
    expect(safeAvatarUrl('http://cdn.discordapp.com/a.png')).toBeNull()
    expect(safeAvatarUrl('https://cdn.discordapp.com.evil.example/a.png')).toBeNull()
    expect(safeAvatarUrl('javascript:alert(1)')).toBeNull()
    expect(safeAvatarUrl(null)).toBeNull()
    expect(safeAvatarUrl(undefined)).toBeNull()
    expect(safeAvatarUrl('')).toBeNull()
  })
})

describe('initialsOf', () => {
  it('uses the first and last word', () => {
    expect(initialsOf('Aashir Adnan')).toBe('AA')
    expect(initialsOf('Muhammad Ali Khan')).toBe('MK')
  })
  it('uses one letter for a single word, upper-cased', () => {
    expect(initialsOf('afaq')).toBe('A')
  })
  it('falls back to ? when there is no name', () => {
    expect(initialsOf('')).toBe('?')
    expect(initialsOf('   ')).toBe('?')
    expect(initialsOf(null)).toBe('?')
  })
  it('does not split an astral character in half', () => {
    expect(initialsOf('😀 Smile')).toBe('😀S')
  })
})

describe('stackSplit', () => {
  it('shows everyone when they fit', () => {
    expect(stackSplit(['a', 'b'], 3)).toEqual({ shown: ['a', 'b'], hidden: 0 })
  })
  it('collapses the rest into a count', () => {
    expect(stackSplit(['a', 'b', 'c', 'd', 'e'], 3)).toEqual({ shown: ['a', 'b', 'c'], hidden: 2 })
  })
  it('handles nobody, and never shows fewer than one slot', () => {
    expect(stackSplit([], 3)).toEqual({ shown: [], hidden: 0 })
    expect(stackSplit(['a', 'b'], 0)).toEqual({ shown: ['a'], hidden: 1 })
  })
})
