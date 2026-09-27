import { QueryInterface, DataTypes, QueryTypes } from 'sequelize';

// Backs the fork restriction (routes/forks.ts): forking is only allowed from
// a shared workspace into the fork owner's own personal workspace. Personal
// workspaces previously had no reliable marker — only a `description` string
// convention (see createPersonalWorkspace in middleware/auth.ts) that a user
// could freely overwrite via PUT /workspaces/:id. This column is the real,
// non-user-editable signal.
export async function up({ context: qi }: { context: QueryInterface }) {
  try {
    await qi.addColumn('workspaces', 'isPersonal', {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    });
    console.log('  + added workspaces.isPersonal');
  } catch (e: any) {
    if (!/duplicate column|already exists/i.test(e?.message ?? '')) throw e;
    console.log('  ~ workspaces.isPersonal already exists, skipping');
  }

  // Best-effort backfill for existing databases: a workspace created by
  // createPersonalWorkspace always has this exact description and, at
  // creation time, exactly one member (its owner). A workspace matching both
  // is overwhelmingly likely to be a personal workspace that just hasn't been
  // shared with anyone since. This can't be 100% certain retroactively (the
  // description is editable, and a personal workspace could since have grown
  // members via invite) — it only needs to be right for the common case;
  // newly created personal workspaces are marked correctly going forward
  // regardless of this backfill.
  const sequelize = (qi as any).sequelize;
  const candidates: { id: string; members: string }[] = await sequelize.query(
    `SELECT id, members FROM workspaces WHERE description = 'Personal workspace' AND isPersonal = false`,
    { type: QueryTypes.SELECT },
  );
  let backfilled = 0;
  for (const row of candidates) {
    let memberCount = 0;
    try { memberCount = (JSON.parse(row.members) || []).length; } catch {}
    if (memberCount === 1) {
      await qi.bulkUpdate('workspaces', { isPersonal: true }, { id: row.id });
      backfilled++;
    }
  }
  if (backfilled) console.log(`  ~ backfilled isPersonal=true for ${backfilled} workspace(s)`);
}

export async function down({ context: qi }: { context: QueryInterface }) {
  try { await qi.removeColumn('workspaces', 'isPersonal'); } catch (e) {}
}
