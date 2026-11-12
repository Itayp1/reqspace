import { QueryInterface } from 'sequelize';
import { getSequelize } from '../sequelize';

// Generic, non-destructive schema reconciliation. `sq.sync({})` in production
// (CR#18) creates missing tables but never adds a column to one that already
// exists, so a table created from an older version of a model — like this
// deployment's pre-existing `users` table, which predates the `settings`
// column — is permanently missing it. 001/002 backfill specific known gaps
// by name; this backfills *any* gap generically: for every registered
// model, diff its declared columns against the live table's actual columns
// and ADD whichever are missing. Never alters or drops an existing column —
// this is the safe subset of what `sync({ alter: true })` would do, and it's
// idempotent (skips columns that already exist).
export async function up({ context: qi }: { context: QueryInterface }) {
  const sequelize = getSequelize();

  for (const model of Object.values(sequelize.models)) {
    const tableName = model.getTableName() as string;

    let existingColumns: Record<string, unknown>;
    try {
      existingColumns = await qi.describeTable(tableName);
    } catch {
      // Table doesn't exist yet — sync() creates it fully with every column,
      // so there's nothing to backfill.
      continue;
    }

    for (const [attrName, attr] of Object.entries(model.rawAttributes)) {
      const columnName = (attr.field as string) || attrName;
      if (existingColumns[columnName]) continue;
      if (attr.primaryKey) continue; // never add a PK column after the fact

      try {
        await qi.addColumn(tableName, columnName, {
          type: attr.type,
          // Never force NOT NULL onto rows that predate the column — there's
          // no value to backfill them with. The model still enforces it for
          // every new row the app writes from here on.
          allowNull: true,
        });
        console.log(`  + backfilled ${tableName}.${columnName}`);
      } catch (e: any) {
        if (!/already exists|duplicate column/i.test(e?.message ?? '')) throw e;
      }
    }
  }
}

export async function down() {
  // Irreversible by design: this migration doesn't track which columns it
  // added on a given database vs. which already existed there.
}
