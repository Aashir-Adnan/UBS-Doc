/**
 * Apply mapping config: merge project schema into base and output merged SQL.
 * - Mapped tables: ALTER TABLE base ADD COLUMN ... ; ADD CONSTRAINT with URDD rewrites.
 * - New tables: CREATE TABLE with FK rewrites to URDD where applicable.
 */

const URDD_TABLE = 'user_roles_designations_department';
const URDD_COLUMN = 'user_role_designation_department_id';

function isUserReference(refTable, refColumn) {
  const t = (refTable || '').toLowerCase();
  const c = (refColumn || '').toLowerCase();
  return (
    t === 'users' || t === 'user' || c === 'user_id' || c === 'users_id'
  );
}

function escapeName(n) {
  return '`' + String(n).replace(/`/g, '``') + '`';
}

function columnDef(c) {
  let def = `${escapeName(c.name)} ${c.type}`;
  if (!c.nullable) def += ' NOT NULL';
  if (c.default != null) def += ' DEFAULT ' + c.default;
  return def;
}

/**
 * @param {{ name: string, columns: any[], primaryKey: string[], foreignKeys: any[] }[]} baseTables
 * @param {{ name: string, columns: any[], primaryKey: string[], foreignKeys: any[] }[]} projectTables
 * @param {{ tableMappings: Record<string, string|null>, fkRewrites: any[] }} config
 * @param {string} baseSql - Optional raw base SQL to prepend (CREATE TABLEs for base). If not provided we only output ALTER/CREATE for project.
 */
export function applyMapping(baseTables, projectTables, config, baseSql = '') {
  const baseByName = new Map((baseTables || []).map((t) => [t.name, t]));
  const projectByName = new Map((projectTables || []).map((t) => [t.name, t]));
  const { tableMappings = {}, fkRewrites = [] } = config;
  const rewriteSet = new Set(
    fkRewrites.map((r) => `${r.sourceTable}.${r.sourceColumn}`)
  );

  const out = [];

  if (baseSql && baseSql.trim()) {
    out.push('-- Base schema');
    out.push(baseSql.trim());
    out.push('');
  }

  for (const [projectTableName, baseTableName] of Object.entries(tableMappings)) {
    const pt = projectByName.get(projectTableName);
    if (!pt) continue;

    if (baseTableName != null && baseTableName !== '') {
      const baseTable = baseByName.get(baseTableName);
      const baseColNames = new Set((baseTable?.columns || []).map((c) => c.name));
      const pkSet = new Set(pt.primaryKey || []);

      const colsToAdd = (pt.columns || []).filter(
        (c) => !baseColNames.has(c.name) && !pkSet.has(c.name)
      );
      if (colsToAdd.length > 0) {
        out.push(`-- Merge project table ${projectTableName} into base ${baseTableName}`);
        for (const c of colsToAdd) {
          out.push(`ALTER TABLE ${escapeName(baseTableName)} ADD COLUMN ${columnDef(c)};`);
        }
        const fksToAdd = (pt.foreignKeys || []).filter((fk) =>
          colsToAdd.some((c) => c.name === fk.column)
        );
        for (const fk of fksToAdd) {
          const refTable = rewriteSet.has(`${pt.name}.${fk.column}`)
            ? URDD_TABLE
            : fk.refTable;
          const refCol = rewriteSet.has(`${pt.name}.${fk.column}`)
            ? URDD_COLUMN
            : fk.refColumn;
          const constraintName = `fk_${baseTableName}_${fk.column}`;
          out.push(
            `ALTER TABLE ${escapeName(baseTableName)} ADD CONSTRAINT ${escapeName(constraintName)} FOREIGN KEY (${escapeName(fk.column)}) REFERENCES ${escapeName(refTable)}(${escapeName(refCol)});`
          );
        }
        out.push('');
      }
    } else {
      out.push(`-- New table from project: ${projectTableName}`);
      const colDefs = (pt.columns || []).map((c) => columnDef(c));
      const pk = (pt.primaryKey || []).length
        ? `, PRIMARY KEY (${(pt.primaryKey || []).map(escapeName).join(', ')})`
        : '';
      const fkDefs = (pt.foreignKeys || []).map((fk) => {
        const refTable = rewriteSet.has(`${pt.name}.${fk.column}`)
          ? URDD_TABLE
          : fk.refTable;
        const refCol = rewriteSet.has(`${pt.name}.${fk.column}`)
          ? URDD_COLUMN
          : fk.refColumn;
        return `, CONSTRAINT ${escapeName('fk_' + pt.name + '_' + fk.column)} FOREIGN KEY (${escapeName(fk.column)}) REFERENCES ${escapeName(refTable)}(${escapeName(refCol)})`;
      });
      out.push(
        `CREATE TABLE ${escapeName(projectTableName)} (${colDefs.join(', ')}${pk}${fkDefs.join('')});`
      );
      out.push('');
    }
  }

  return out.join('\n').trim();
}

export default applyMapping;
