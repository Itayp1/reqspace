import { Op, fn, col } from 'sequelize';
import {
  SqlUser,
  SqlCollection,
  SqlFolder,
  SqlRequest,
  SqlEnvironment,
  SqlGlobalEnvironment,
  SqlHistory,
  SqlLocalVariable,
  SqlUserProfileVariable,
  SqlSharedLink,
  SqlCollectionFork,
  SqlForkItemHash,
  SqlWorkspace,
} from '../db/sql-models';

/**
 * Deletes that have to reach every descendant row. The per-table repositories
 * only ever deleted one level, so removing a folder left the requests of its
 * subfolders behind (they kept showing up in share links, forks and the
 * runner), and removing a workspace left all of its folders, requests and
 * environments in the database with no way to reach them.
 */

/** Every folder id in the subtree rooted at `rootFolderId`, root included. */
async function folderSubtreeIds(rootFolderId: string): Promise<string[]> {
  const root = await SqlFolder.findByPk(rootFolderId, { attributes: ['id', 'collectionId'], raw: true });
  if (!root) return [];
  const all = await SqlFolder.findAll({
    where: { collectionId: (root as any).collectionId },
    attributes: ['id', 'parentFolderId'],
    raw: true,
  }) as Array<{ id: string; parentFolderId: string | null }>;
  const ids: string[] = [];
  const queue = [rootFolderId];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    for (const f of all) if (f.parentFolderId === id) queue.push(f.id);
  }
  return ids;
}

async function cleanupForkRows(collectionIds: string[]): Promise<void> {
  if (!collectionIds.length) return;
  const forks = await SqlCollectionFork.findAll({
    where: { [Op.or]: [{ sourceCollectionId: { [Op.in]: collectionIds } }, { forkedCollectionId: { [Op.in]: collectionIds } }] },
    attributes: ['id'],
    raw: true,
  }) as Array<{ id: string }>;
  const forkIds = forks.map(f => f.id);
  if (forkIds.length) {
    await SqlForkItemHash.destroy({ where: { forkId: { [Op.in]: forkIds } } });
    await SqlCollectionFork.destroy({ where: { id: { [Op.in]: forkIds } } });
  }
}

export const CascadeRepository = {
  folderSubtreeIds,

  /** Removes a folder, every nested folder, and every request inside any of them. Returns the removed folder ids. */
  async deleteFolderTree(folderId: string): Promise<string[]> {
    const ids = await folderSubtreeIds(folderId);
    if (!ids.length) return [];
    await SqlRequest.destroy({ where: { folderId: { [Op.in]: ids } } });
    await SqlFolder.destroy({ where: { id: { [Op.in]: ids } } });
    return ids;
  },

  /** Removes a collection with its folders, requests, share links and fork bookkeeping. */
  async deleteCollectionTree(collectionId: string): Promise<void> {
    await SqlRequest.destroy({ where: { collectionId } });
    await SqlFolder.destroy({ where: { collectionId } });
    await SqlSharedLink.destroy({ where: { collectionId } });
    await cleanupForkRows([collectionId]);
    await SqlCollection.destroy({ where: { id: collectionId } });
  },

  /** Removes a workspace and everything that belongs to it. */
  async deleteWorkspaceTree(workspaceId: string): Promise<void> {
    const collections = await SqlCollection.findAll({ where: { workspaceId }, attributes: ['id'], raw: true }) as Array<{ id: string }>;
    const collectionIds = collections.map(c => c.id);
    if (collectionIds.length) {
      await SqlRequest.destroy({ where: { collectionId: { [Op.in]: collectionIds } } });
      await SqlFolder.destroy({ where: { collectionId: { [Op.in]: collectionIds } } });
      await cleanupForkRows(collectionIds);
    }
    await SqlSharedLink.destroy({ where: { workspaceId } });
    await SqlCollection.destroy({ where: { workspaceId } });
    await SqlEnvironment.destroy({ where: { workspaceId } });
    await SqlGlobalEnvironment.destroy({ where: { workspaceId } });
    await SqlLocalVariable.destroy({ where: { workspaceId } });
    // History rows count against each user's quota, so give the bytes back
    // before the rows go.
    const usage = await SqlHistory.findAll({
      where: { workspaceId },
      attributes: ['userId', [fn('SUM', col('responseSizeBytes')), 'bytes']],
      group: ['userId'],
      raw: true,
    }) as unknown as Array<{ userId: string; bytes: number | string | null }>;
    for (const u of usage) {
      const bytes = Number(u.bytes) || 0;
      if (!bytes) continue;
      const user = await SqlUser.findByPk(u.userId, { attributes: ['id', 'historyUsedBytes'] });
      if (user) await SqlUser.update({ historyUsedBytes: Math.max(0, Number(user.historyUsedBytes) - bytes) }, { where: { id: u.userId } });
    }
    await SqlHistory.destroy({ where: { workspaceId } });
    await SqlWorkspace.destroy({ where: { id: workspaceId } });
  },

  /**
   * Removes a user account. Their personal workspace goes with them; shared
   * workspaces they own are handed to `heirId` (the admin doing the delete) so
   * the other members keep their data; every other membership is dropped.
   */
  async deleteUserTree(userId: string, heirId: string): Promise<{ workspacesDeleted: number; workspacesTransferred: number }> {
    let workspacesDeleted = 0;
    let workspacesTransferred = 0;
    const all = await SqlWorkspace.findAll();
    for (const w of all) {
      const members: Array<{ userId: string; role: string; joinedAt?: string; invitedBy?: string }> =
        typeof w.members === 'string' ? JSON.parse(w.members || '[]') : (w.members as any) || [];
      const isOwner = w.ownerId === userId;
      const isMember = members.some(m => String(m.userId) === userId);
      if (!isOwner && !isMember) continue;

      if (isOwner && w.isPersonal) {
        await this.deleteWorkspaceTree(w.id);
        workspacesDeleted++;
        continue;
      }

      let next = members.filter(m => String(m.userId) !== userId);
      const patch: Record<string, unknown> = {};
      if (isOwner) {
        patch.ownerId = heirId;
        const heir = next.find(m => String(m.userId) === heirId);
        if (heir) heir.role = 'owner';
        else next = [...next, { userId: heirId, role: 'owner', joinedAt: new Date().toISOString(), invitedBy: heirId }];
        workspacesTransferred++;
      }
      patch.members = JSON.stringify(next);
      await SqlWorkspace.update(patch, { where: { id: w.id } });
    }
    await SqlHistory.destroy({ where: { userId } });
    await SqlLocalVariable.destroy({ where: { userId } });
    await SqlUserProfileVariable.destroy({ where: { userId } });
    await SqlUser.destroy({ where: { id: userId } });
    return { workspacesDeleted, workspacesTransferred };
  },
};
