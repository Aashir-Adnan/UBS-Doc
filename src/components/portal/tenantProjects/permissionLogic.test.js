import { describe, it, expect } from 'vitest'
import { anyRoleHas } from './permissionLogic'

const urdd = (id, names) => ({ urdd_id: id, permissions: names.map((n) => ({ permission_name: n })) })

describe('anyRoleHas', () => {
  it('finds a permission held on a role other than the first', () => {
    const urdds = [urdd(21, ['view_repos']), urdd(32, ['update_discord_tasks'])]
    expect(anyRoleHas(urdds, 'update_discord_tasks')).toBe(true)
  })
  it('is false when no role holds it, and fails closed on odd input', () => {
    expect(anyRoleHas([urdd(21, ['view_repos'])], 'update_discord_tasks')).toBe(false)
    expect(anyRoleHas(null, 'update_discord_tasks')).toBe(false)
    expect(anyRoleHas([{ urdd_id: 1 }], 'update_discord_tasks')).toBe(false)
  })
})
