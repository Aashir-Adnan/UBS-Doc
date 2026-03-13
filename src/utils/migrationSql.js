/**
 * Generate migration_sql table and procedures that translate changes from
 * the original project DB to the new (mapped) DB. All generated SQL is
 * stored in the migration_sql table for later execution on the new DB.
 */

function escapeName(n) {
  return '`' + String(n).replace(/`/g, '``') + '`';
}

/**
 * CREATE TABLE migration_sql - stores pending SQL to run on the new DB.
 */
export function createMigrationSqlTable() {
  return `
-- Table to store migration SQL (translates old project DB ops to new mapped DB)
CREATE TABLE IF NOT EXISTS ${escapeName('migration_sql')} (
  ${escapeName('id')} INT AUTO_INCREMENT PRIMARY KEY,
  ${escapeName('created_at')} TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ${escapeName('operation_type')} ENUM('INSERT','UPDATE','DELETE','ALTER_TABLE_ADD','ALTER_TABLE_DROP','CREATE_TABLE','DROP_TABLE') NOT NULL,
  ${escapeName('old_table')} VARCHAR(255) DEFAULT NULL,
  ${escapeName('new_table')} VARCHAR(255) DEFAULT NULL,
  ${escapeName('sql_text')} TEXT NOT NULL COMMENT 'SQL to execute on the new/mapped database',
  ${escapeName('status')} ENUM('pending','executed','failed') DEFAULT 'pending',
  ${escapeName('executed_at')} TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`.trim();
}

/**
 * Generate trigger/procedure logic for a single table mapping.
 * When INSERT/UPDATE/DELETE happens on old_table, we produce the equivalent
 * SQL for new_table and store it in migration_sql.
 *
 * @param {string} oldTable - Project (old) table name
 * @param {string} newTable - Mapped (new) table name - base table or same as old
 * @param {string[]} columns - Column names (same on both sides for 1:1 mapping)
 * @param {string} primaryKey - PK column name for WHERE in UPDATE/DELETE
 */
export function generateMigrationTriggers(oldTable, newTable, columns, primaryKey) {
  const cols = columns || [];
  const pk = primaryKey || 'id';
  const colList = cols.map(escapeName).join(', ');
  const newTableEsc = escapeName(newTable);
  const migrationTable = 'migration_sql';

  const out = [];

  out.push(`-- Migration: ${oldTable} -> ${newTable}`);
  out.push(`-- Run these on the OLD (project) DB so that changes are recorded in ${migrationTable}.`);
  out.push('');

  out.push(`-- On INSERT into ${oldTable}: record INSERT for new DB`);
  out.push(`DELIMITER $$`);
  out.push(`DROP TRIGGER IF EXISTS ${escapeName('trg_mig_ins_' + oldTable)}$$`);
  out.push(`CREATE TRIGGER ${escapeName('trg_mig_ins_' + oldTable)}`);
  out.push(`AFTER INSERT ON ${escapeName(oldTable)} FOR EACH ROW`);
  out.push(`BEGIN`);
  const valList = cols.map((c) => `QUOTE(NEW.${escapeName(c)})`).join(", ',' , ");
  out.push(`  INSERT INTO ${escapeName(migrationTable)} (operation_type, old_table, new_table, sql_text, status)`);
  out.push(`  VALUES ('INSERT', '${oldTable.replace(/'/g, "''")}', '${newTable.replace(/'/g, "''")}',`);
  out.push(`    CONCAT('INSERT INTO ${newTableEsc} (${colList}) VALUES (', ${valList}, ')'), 'pending');`);
  out.push(`END$$`);
  out.push(`DELIMITER ;`);
  out.push('');

  out.push(`-- On UPDATE on ${oldTable}: record UPDATE for new DB`);
  out.push(`DELIMITER $$`);
  out.push(`DROP TRIGGER IF EXISTS ${escapeName('trg_mig_upd_' + oldTable)}$$`);
  out.push(`CREATE TRIGGER ${escapeName('trg_mig_upd_' + oldTable)}`);
  out.push(`AFTER UPDATE ON ${escapeName(oldTable)} FOR EACH ROW`);
  out.push(`BEGIN`);
  const setClause = cols
    .filter((c) => c !== pk)
    .map((c) => `CONCAT('${escapeName(c)}', '=', QUOTE(NEW.${escapeName(c)}))`)
    .join(", ', ', ");
  const concatUpdate =
    setClause.length > 0
      ? `CONCAT('UPDATE ${newTableEsc} SET ', ${setClause}, ' WHERE ${escapeName(pk)}=', QUOTE(OLD.${escapeName(pk)}))`
      : `CONCAT('UPDATE ${newTableEsc} SET ${escapeName(pk)}=', QUOTE(NEW.${escapeName(pk)}), ' WHERE ${escapeName(pk)}=', QUOTE(OLD.${escapeName(pk)}))`;
  out.push(`  INSERT INTO ${escapeName(migrationTable)} (operation_type, old_table, new_table, sql_text, status)`);
  out.push(`  VALUES ('UPDATE', '${oldTable.replace(/'/g, "''")}', '${newTable.replace(/'/g, "''")}',`);
  out.push(`    ${concatUpdate}, 'pending');`);
  out.push(`END$$`);
  out.push(`DELIMITER ;`);
  out.push('');

  out.push(`-- On DELETE from ${oldTable}: record DELETE for new DB`);
  out.push(`DELIMITER $$`);
  out.push(`DROP TRIGGER IF EXISTS ${escapeName('trg_mig_del_' + oldTable)}$$`);
  out.push(`CREATE TRIGGER ${escapeName('trg_mig_del_' + oldTable)}`);
  out.push(`AFTER DELETE ON ${escapeName(oldTable)} FOR EACH ROW`);
  out.push(`BEGIN`);
  out.push(`  INSERT INTO ${escapeName(migrationTable)} (operation_type, old_table, new_table, sql_text, status)`);
  out.push(`  VALUES ('DELETE', '${oldTable.replace(/'/g, "''")}', '${newTable.replace(/'/g, "''")}',`);
  out.push(`    CONCAT('DELETE FROM ${newTableEsc} WHERE ${escapeName(pk)}=', OLD.${escapeName(pk)}), 'pending');`);
  out.push(`END$$`);
  out.push(`DELIMITER ;`);
  out.push('');

  return out.join('\n');
}

/**
 * Generate full migration SQL: migration_sql table + triggers for each mapped table.
 * DDL migrations (add/drop column, create/drop table) are recorded as rows when
 * the user performs those actions; we output comment blocks for how to record them.
 *
 * @param {{ name: string, columns: any[], primaryKey: string[] }[]} projectTables
 * @param {Record<string, string|null>} tableMappings - project table -> base table or null
 */
export function generateMigrationSql(projectTables, tableMappings = {}) {
  const out = [];
  out.push('-- ========== MIGRATION_SQL TABLE (create on both old and new DB if triggers run on old) ==========');
  out.push(createMigrationSqlTable());
  out.push('');

  out.push('-- ========== TRIGGERS (install on OLD project DB) ==========');
  out.push('-- Each trigger writes the translated SQL into migration_sql. Run sql_text on the new DB to sync.');
  out.push('');

  for (const pt of projectTables || []) {
    const newTable = tableMappings[pt.name] || pt.name;
    const columns = (pt.columns || []).map((c) => c.name);
    const pk = (pt.primaryKey && pt.primaryKey[0]) || 'id';
    if (columns.length === 0) continue;
    out.push(generateMigrationTriggers(pt.name, newTable, columns, pk));
  }

  out.push('-- ========== DDL MIGRATIONS ==========');
  out.push('-- When you ADD COLUMN / DROP TABLE on the mapper, run the generated ALTER/CREATE/DROP');
  out.push('-- and also insert a row into migration_sql so the new DB can replay:');
  out.push('-- INSERT INTO migration_sql (operation_type, old_table, new_table, sql_text, status)');
  out.push('-- VALUES (\'ALTER_TABLE_ADD\', \'old_t\', \'new_t\', \'ALTER TABLE new_t ADD COLUMN ...\', \'pending\');');
  out.push('');

  return out.join('\n').trim();
}

export default generateMigrationSql;
