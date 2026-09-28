import type { TeamMember } from '../tasksLogic'

// Who the assignee picker offers: the server's Discord members as the bot keeps
// them (guildmember, synced from Discord), limited to verified staff — pending
// joiners and clients are not people Discord's task commands assign. The task's
// project members come first. Anyone already selected stays in the list so a
// save never silently drops them.

export interface PickerOption {
  discordId: string
  name: string
  username: string | null
  avatarUrl?: string
  selected: boolean
}

export const isAssignable = (m: TeamMember): boolean => m.verified && m.kind !== 'client'

const byName = (a: PickerOption, b: PickerOption) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

export function pickerOptions(members: TeamMember[], projectId: string | null, selected: string[]): { project: PickerOption[]; others: PickerOption[] } {
  const chosen = new Set(selected)
  const project: PickerOption[] = []
  const others: PickerOption[] = []
  for (const m of members) {
    if (!isAssignable(m) && !chosen.has(m.discordId)) continue
    const option: PickerOption = {
      discordId: m.discordId,
      name: m.name,
      username: m.username,
      ...(m.avatarUrl ? { avatarUrl: m.avatarUrl } : {}),
      selected: chosen.has(m.discordId),
    }
    const inProject = Boolean(projectId) && m.projects.some((p) => p.id === projectId)
    ;(inProject ? project : others).push(option)
  }
  return { project: project.sort(byName), others: others.sort(byName) }
}

export function matchesQuery(option: PickerOption, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return option.name.toLowerCase().includes(q) || (option.username ?? '').toLowerCase().includes(q)
}

export function selectedPeople(members: TeamMember[], ids: string[]): { discordId: string; name: string; avatarUrl?: string }[] {
  const byId = new Map(members.map((m) => [m.discordId, m]))
  return ids.map((id) => {
    const m = byId.get(id)
    if (!m) return { discordId: id, name: `Member …${id.slice(-4)}` }
    return { discordId: id, name: m.name, ...(m.avatarUrl ? { avatarUrl: m.avatarUrl } : {}) }
  })
}
