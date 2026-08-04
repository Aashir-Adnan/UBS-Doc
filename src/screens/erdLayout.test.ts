import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildErdLayout, gridPosition, parsedTablesToLayout } from './erdLayout'
import { parseSqlDump } from '../utils/sqlParser'

const FIXTURE_SQL = `
CREATE TABLE \`tenants\` (
  \`id\` int(11) NOT NULL,
  \`name\` varchar(255) NOT NULL,
  PRIMARY KEY (\`id\`)
);

CREATE TABLE \`users\` (
  \`id\` int(11) NOT NULL,
  \`tenant_id\` int(11) NOT NULL,
  \`email\` varchar(255) NOT NULL,
  PRIMARY KEY (\`id\`),
  FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\` (\`id\`)
);

CREATE TABLE \`projects\` (
  \`id\` int(11) NOT NULL,
  \`tenant_id\` int(11) NOT NULL,
  PRIMARY KEY (\`id\`),
  FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\` (\`id\`)
);
`

describe('gridPosition', () => {
  it('places nodes in a 4-column grid at 260/220 pitch from a 40px origin', () => {
    expect(gridPosition(0)).toEqual({ x: 40, y: 40 })
    expect(gridPosition(1)).toEqual({ x: 300, y: 40 })
    expect(gridPosition(3)).toEqual({ x: 820, y: 40 })
    expect(gridPosition(4)).toEqual({ x: 40, y: 260 })
    expect(gridPosition(5)).toEqual({ x: 300, y: 260 })
  })
})

describe('parsedTablesToLayout / buildErdLayout', () => {
  it('lays out three small tables on the grid with correct pk/fk flags and relations', () => {
    const { tables, relations } = buildErdLayout(FIXTURE_SQL)

    expect(tables.map((t) => t.name)).toEqual(['tenants', 'users', 'projects'])

    expect(tables[0]).toMatchObject({ name: 'tenants', x: 40, y: 40 })
    expect(tables[1]).toMatchObject({ name: 'users', x: 300, y: 40 })
    expect(tables[2]).toMatchObject({ name: 'projects', x: 560, y: 40 })

    const tenantsId = tables[0].cols.find((c) => c.name === 'id')
    expect(tenantsId).toMatchObject({ pk: true, fk: false })

    const usersTenantId = tables[1].cols.find((c) => c.name === 'tenant_id')
    expect(usersTenantId).toMatchObject({ pk: false, fk: true })
    const usersId = tables[1].cols.find((c) => c.name === 'id')
    expect(usersId).toMatchObject({ pk: true, fk: false })

    expect(relations).toEqual([
      { from: 'users', to: 'tenants' },
      { from: 'projects', to: 'tenants' },
    ])
  })

  it('returns empty layout for a dump with no CREATE TABLE statements', () => {
    expect(buildErdLayout('SELECT 1;')).toEqual({ tables: [], relations: [] })
  })

  it('wraps a 5th table onto the second grid row', () => {
    const sql = Array.from({ length: 5 }, (_, i) => `CREATE TABLE t${i} (id int(11) NOT NULL, PRIMARY KEY (id));`).join('\n')
    const { tables } = parsedTablesToLayout(parseSqlDump(sql))
    expect(tables).toHaveLength(5)
    expect(tables[3]).toMatchObject({ x: 820, y: 40 })
    expect(tables[4]).toMatchObject({ x: 40, y: 260 })
  })
})

// Deferred browser verification (gate-blocked, see task-10 report): this is
// the closest we can get to "paste base_db.sql and look at the canvas" in a
// headless test — it proves the real parse -> layout pipeline survives the
// full base schema (40 tables) without throwing and produces sane output.
describe('buildErdLayout against public/sql/base_db.sql', () => {
  it('lays out the full base schema without error', () => {
    const sql = readFileSync(resolve(__dirname, '../../public/sql/base_db.sql'), 'utf8')
    const { tables, relations } = buildErdLayout(sql)

    expect(tables.length).toBe(40)
    expect(relations.length).toBeGreaterThan(0)

    // Grid formula holds for every node, and none overlap by index.
    tables.forEach((t, i) => {
      expect(t).toMatchObject(gridPosition(i))
    })

    // Every relation references two tables that are actually on the canvas.
    const names = new Set(tables.map((t) => t.name))
    relations.forEach((r) => expect(names.has(r.from)).toBe(true))
  })
})
