// Pure helpers behind the Avatar component: which picture URL is safe to load,
// and what to draw when there is none. No React, no DOM.

const DISCORD_CDN = 'https://cdn.discordapp.com/'

// The URL goes straight into an <img src>, so only Discord's own CDN over https
// is accepted. Anything else (or nothing) means "draw initials instead".
export function safeAvatarUrl(url: string | null | undefined): string | null {
  return typeof url === 'string' && url.startsWith(DISCORD_CDN) ? url : null
}

// "Aashir Adnan" -> "AA", "afaq" -> "A", "Member …u3" -> "M…". Two letters at most.
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const first = Array.from(words[0])[0]
  const second = words.length > 1 ? Array.from(words[words.length - 1])[0] : ''
  return `${first}${second}`.toUpperCase()
}

// How many faces to draw in a row before collapsing the rest into "+N".
export function stackSplit<T>(people: T[], max: number): { shown: T[]; hidden: number } {
  const n = Math.max(1, max)
  return { shown: people.slice(0, n), hidden: Math.max(0, people.length - n) }
}
