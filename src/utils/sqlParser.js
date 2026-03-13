/**
 * Parse MySQL/MariaDB dump (CREATE TABLE) into tables with columns, PKs, FKs.
 * Handles backtick-quoted identifiers and common constraint formats.
 */

function unquote(name) {
  if (!name || typeof name !== 'string') return name;
  const t = name.trim();
  if ((t.startsWith('`') && t.endsWith('`')) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  return t;
}

function extractTableName(createBlock) {
  const match = createBlock.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s*\(/i);
  return match ? unquote(match[1].trim()) : null;
}

function parseColumnsAndConstraints(createBlock) {
  const bodyMatch = createBlock.match(/CREATE\s+TABLE[^(]+\(([\s\S]*)\)\s*;?/i);
  const body = bodyMatch ? bodyMatch[1] : '';
  const lines = body.split(/\n/).map((l) => l.trim()).filter(Boolean);

  const columns = [];
  let primaryKey = [];
  const foreignKeys = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upper = line.toUpperCase();

    if (upper.startsWith('PRIMARY KEY')) {
      const pkMatch = line.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkMatch) {
        primaryKey = pkMatch[1].split(',').map((c) => unquote(c.trim().replace(/`/g, '')));
      }
      continue;
    }

    if (upper.includes('FOREIGN KEY') || (upper.includes('REFERENCES') && upper.includes('KEY'))) {
      const fkCol = line.match(/FOREIGN\s+KEY\s*\([`"]?(\w+)[`"]?\)/i);
      const ref = line.match(/REFERENCES\s+[`"]?(\w+)[`"]?\s*\([`"]?(\w+)[`"]?\)/i);
      if (ref) {
        foreignKeys.push({
          column: fkCol ? unquote(fkCol[1]) : unquote(ref[2]),
          refTable: unquote(ref[1]),
          refColumn: unquote(ref[2]),
        });
      }
      continue;
    }

    const colMatch = line.match(/^[`"]?(\w+)[`"]?\s+(\w+(?:\s*\([^)]+\))?)\s*(.*)$/i);
    if (colMatch && !upper.startsWith('KEY ') && !upper.startsWith('UNIQUE ') && !upper.startsWith('INDEX ')) {
      const colName = unquote(colMatch[1]);
      const colType = colMatch[2].trim();
      const rest = (colMatch[3] || '').trim();
      columns.push({
        name: colName,
        type: colType,
        nullable: !/\bNOT\s+NULL\b/i.test(rest),
        default: rest.match(/DEFAULT\s+([^\s,]+)/i)?.[1] ?? null,
        raw: line,
      });
    }
  }

  return { columns, primaryKey, foreignKeys };
}

/**
 * @param {string} sql - Full SQL dump content
 * @returns {{ name: string, columns: Array<{name,type,nullable,default,raw}>, primaryKey: string[], foreignKeys: Array<{column,refTable,refColumn}> }[]}
 */
export function parseSqlDump(sql) {
  if (!sql || typeof sql !== 'string') return [];

  const normalized = sql.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const tableBlocks = normalized.split(/(?=CREATE\s+TABLE\s)/gi).filter((b) => /CREATE\s+TABLE\s/i.test(b));

  const tables = [];
  for (const block of tableBlocks) {
    const name = extractTableName(block);
    if (!name) continue;
    const { columns, primaryKey, foreignKeys } = parseColumnsAndConstraints(block);
    tables.push({
      name,
      columns,
      primaryKey,
      foreignKeys,
    });
  }
  return tables;
}

export default parseSqlDump;
