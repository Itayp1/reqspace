import { QueryInterface, DataTypes } from 'sequelize';
import { getSequelize } from '../sequelize';

/**
 * Re-runs generic non-destructive schema reconciliation (like 003).
 * Adds columns declared on models that were added after older migrations ran,
 * notably:
 *  - requests.settings (TEXT, defaultValue '{}')
 *  - folders.roles (TEXT, defaultValue '[]')
 *  - history.responseSizeBytes (INTEGER, defaultValue 0)
 */
export async function up({ context: qi }: { context: QueryInterface }) {
  const sequelize = getSequelize();

  for (const model of Object.values(sequelize.models)) {
    const tableName = model.getTableName() as string;

    let existingColumns: Record<string, unknown>;
    try {
      existingColumns = await qi.describeTable(tableName);
    } catch {
      continue;
    }

    for (const [attrName, attr] of Object.entries(model.rawAttributes)) {
      const columnName = (attr.field as string) || attrName;
      if (existingColumns[columnName]) continue;
      if (attr.primaryKey) continue; // never add a PK column after the fact

      try {
        await qi.addColumn(tableName, columnName, {
          type: attr.type,
          allowNull: true,
          defaultValue: (attr as any).defaultValue,
        });
        console.log(`  + backfilled ${tableName}.${columnName}`);
      } catch (e: any) {
        if (!/already exists|duplicate column/i.test(e?.message ?? '')) throw e;
      }
    }
  }

  // Populate safe default values for existing rows
  const q = (name: string) => qi.quoteIdentifier(name);
  try {
    await qi.sequelize.query(`UPDATE ${q('requests')} SET ${q('settings')} = '{}' WHERE ${q('settings')} IS NULL`);
  } catch {}
  try {
    await qi.sequelize.query(`UPDATE ${q('folders')} SET ${q('roles')} = '[]' WHERE ${q('roles')} IS NULL`);
  } catch {}
  try {
    await qi.sequelize.query(`UPDATE ${q('history')} SET ${q('responseSizeBytes')} = 0 WHERE ${q('responseSizeBytes')} IS NULL`);
  } catch {}
}

export async function down() {
  // Irreversible by design: non-destructive backfill
}
