// Pure mapping from parseSqlDump() output to the design blueprint canvas's
// TableNode[] shape, extracted so the grid-placement math is unit-testable
// without mounting the screen. See DatabaseTools.tsx for how this feeds the
// ERD canvas.
import { parseSqlDump } from '../utils/sqlParser'

export interface ErdColumn {
  name: string
  type: string
  pk?: boolean
  fk?: boolean
}

export interface TableNode {
  name: string
  x: number
  y: number
  cols: ErdColumn[]
}

export interface TableRelation {
  from: string
  to: string
}

export interface ErdLayout {
  tables: TableNode[]
  relations: TableRelation[]
}

// Grid placement formula from the task brief: 4 columns, 260px column pitch,
// 220px row pitch, 40px origin offset.
export function gridPosition(index: number): { x: number; y: number } {
  return {
    x: 40 + (index % 4) * 260,
    y: 40 + Math.floor(index / 4) * 220,
  }
}

export type ParsedTable = ReturnType<typeof parseSqlDump>[number]

export function parsedTablesToLayout(parsed: ParsedTable[]): ErdLayout {
  const tables: TableNode[] = parsed.map((t, i) => {
    const pkSet = new Set(t.primaryKey || [])
    const fkCols = new Set((t.foreignKeys || []).map((fk) => fk.column))
    const { x, y } = gridPosition(i)
    return {
      name: t.name,
      x,
      y,
      cols: (t.columns || []).map((c) => ({
        name: c.name,
        type: c.type,
        pk: pkSet.has(c.name),
        fk: fkCols.has(c.name),
      })),
    }
  })

  const relations: TableRelation[] = []
  parsed.forEach((t) => {
    ;(t.foreignKeys || []).forEach((fk) => {
      if (fk.refTable) relations.push({ from: t.name, to: fk.refTable })
    })
  })

  return { tables, relations }
}

// Convenience: parse a raw SQL dump straight into the ERD layout.
export function buildErdLayout(sql: string): ErdLayout {
  return parsedTablesToLayout(parseSqlDump(sql))
}
