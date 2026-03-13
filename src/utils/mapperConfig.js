/**
 * Build mapping config: table mappings (project → base or "new table")
 * and FK rewrite rules (user/user_id → URDD).
 */

const URDD_TABLE = 'user_roles_designations_department';
const URDD_COLUMN = 'user_role_designation_department_id';

function normalizeStrict(s) {
  return (s || '').toLowerCase().replace(/_/g, '').trim();
}

/**
 * Only suggest mapping for same name or incredibly similar (normalized equality).
 * No forced mapping for loosely similar names.
 */
function incrediblySimilar(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const na = normalizeStrict(a);
  const nb = normalizeStrict(b);
  if (na === nb) return true;
  if (na.replace(/s$/, '') === nb.replace(/s$/, '')) return true;
  return false;
}

function isUserReference(refTable, refColumn) {
  const t = (refTable || '').toLowerCase();
  const c = (refColumn || '').toLowerCase();
  return (
    t === 'users' ||
    t === 'user' ||
    c === 'user_id' ||
    c === 'users_id'
  );
}

/**
 * @param {{ name: string, columns: any[], foreignKeys: any[] }[]} baseTables
 * @param {{ name: string, columns: any[], foreignKeys: any[] }[]} projectTables
 */
export function buildMappingConfig(baseTables, projectTables) {
  const baseNames = new Set((baseTables || []).map((t) => t.name));
  const tableMappings = {};
  const fkRewrites = [];

  for (const pt of projectTables || []) {
    const pName = pt.name;
    if (baseNames.has(pName)) {
      tableMappings[pName] = pName;
      continue;
    }
    let bestBase = null;
    for (const bt of baseTables || []) {
      if (incrediblySimilar(pName, bt.name)) {
        bestBase = bt.name;
        break;
      }
    }
    tableMappings[pName] = bestBase; // null = "new table"; only set if same or incredibly similar
  }

  for (const pt of projectTables || []) {
    for (const fk of pt.foreignKeys || []) {
      if (isUserReference(fk.refTable, fk.refColumn)) {
        fkRewrites.push({
          sourceTable: pt.name,
          sourceColumn: fk.column,
          targetTable: URDD_TABLE,
          targetColumn: URDD_COLUMN,
        });
      }
    }
  }

  return {
    tableMappings,
    fkRewrites,
  };
}

export function getUrddTarget() {
  return { table: URDD_TABLE, column: URDD_COLUMN };
}

export default buildMappingConfig;
