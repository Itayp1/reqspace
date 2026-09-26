/**
 * Fork Collection Routes
 *
 * POST /collections/:id/fork
 *   Creates a smart fork of a collection into a target workspace.
 *   Copies all folders and requests, computes MD5 base-hashes for
 *   each item so that auto-sync can detect which items the fork owner
 *   has modified vs which are still at the original state.
 *
 * POST /collections/:id/sync-upstream (internal — called async after upstream saves)
 *   For each item in the source:
 *     - If fork owner has NOT modified it (currentHash == baseHash) → update it
 *     - If fork owner HAS modified it (currentHash != baseHash)     → skip it
 *   New items added upstream → added to fork.
 *   Items deleted upstream:
 *     - Fork owner unmodified → delete from fork
 *     - Fork owner modified  → keep in fork
 */
import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireWorkspaceRole, getUserWorkspaceRole } from '../middleware/rbac';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { FolderRepository } from '../repositories/FolderRepository';
import { RequestRepository } from '../repositories/RequestRepository';
import { SqlCollectionFork, SqlForkItemHash, SqlCollection, SqlFolder, SqlRequest, SqlEnvironment } from '../db/sql-models';
import { emitToWorkspace } from '../socketUtils';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Op } from 'sequelize';

const router = Router();
router.use(authenticate);

// ── Hashing helpers ─────────────────────────────────────────────────────────

/** Compute a stable MD5 hash for the "logical content" of a request.
 *  We hash only fields that represent the API call — not metadata like
 *  name, order, or comments, since the user might legitimately rename
 *  without wanting to "own" the request for sync purposes.
 */
function hashRequest(r: any): string {
  const data = JSON.stringify({
    method: r.method ?? '',
    url: r.url ?? '',
    params: r.params ?? [],
    headers: r.headers ?? [],
    auth: r.auth ?? {},
    body: r.body ?? {},
    preRequestScript: r.preRequestScript ?? '',
    testScript: r.testScript ?? '',
    description: r.description ?? '',
  });
  return createHash('md5').update(data).digest('hex');
}

function hashFolder(f: any): string {
  const data = JSON.stringify({
    name: f.name ?? '',
    preRequestScript: f.preRequestScript ?? '',
    testScript: f.testScript ?? '',
  });
  return createHash('md5').update(data).digest('hex');
}

function hashCollection(c: any): string {
  const data = JSON.stringify({
    name: c.name ?? '',
    variables: c.variables ?? [],
    preRequestScript: c.preRequestScript ?? '',
    testScript: c.testScript ?? '',
  });
  return createHash('md5').update(data).digest('hex');
}

// ── POST /collections/:id/fork ───────────────────────────────────────────────

router.post('/collections/:id/fork', async (req: AuthRequest, res: Response) => {
  try {
    const sourceId = req.params.id;
    const userId = String(req.user!._id);
    const { targetWorkspaceId, name, copyEnvironmentId } = req.body;

    if (!targetWorkspaceId) return res.status(400).json({ message: 'targetWorkspaceId is required' });

    // Verify access to source collection
    const sourceCol = await CollectionRepository.findById(sourceId);
    if (!sourceCol) return res.status(404).json({ message: 'Source collection not found' });

    const sourceRole = await getUserWorkspaceRole(userId, sourceCol.workspaceId);
    if (!sourceRole && !req.user!.isSuperAdmin) {
      return res.status(403).json({ message: 'No access to source collection' });
    }

    // Verify access to target workspace
    const targetRole = await getUserWorkspaceRole(userId, targetWorkspaceId);
    if (!targetRole && !req.user!.isSuperAdmin) {
      return res.status(403).json({ message: 'No access to target workspace' });
    }
    if (targetRole === 'viewer' && !req.user!.isSuperAdmin) {
      return res.status(403).json({ message: 'Editor role required in target workspace' });
    }

    const forkId = uuidv4();
    const now = new Date();

    // 1. Create forked collection
    const colOrder = await CollectionRepository.countByWorkspace(targetWorkspaceId);
    const forkedCol = await CollectionRepository.create({
      workspaceId: targetWorkspaceId,
      name: name || `${sourceCol.name} (Fork)`,
      description: sourceCol.description || '',
      variables: sourceCol.variables || [],
      preRequestScript: sourceCol.preRequestScript || '',
      testScript: sourceCol.testScript || '',
      order: colOrder,
      createdBy: userId,
    });

    const hashEntries: any[] = [];

    // Hash for collection itself
    hashEntries.push({
      id: uuidv4(),
      forkId,
      itemType: 'collection',
      itemId: forkedCol._id,
      sourceItemId: sourceId,
      baseHash: hashCollection(sourceCol),
    });

    // 2. Copy folders
    const sourceFolders = await FolderRepository.findByCollection(sourceId);
    // Map: sourceId → forkedId (for reparenting)
    const folderIdMap = new Map<string, string>();

    // Sort by parentFolderId so parents are created before children
    const sorted = [...sourceFolders].sort((a, b) => {
      if (!a.parentFolderId) return -1;
      if (!b.parentFolderId) return 1;
      return 0;
    });

    for (const sf of sorted) {
      const forkedParentId = sf.parentFolderId ? (folderIdMap.get(sf.parentFolderId) ?? null) : null;
      const forkedFolder = await FolderRepository.create({
        collectionId: forkedCol._id,
        parentFolderId: forkedParentId,
        name: sf.name,
        description: sf.description || '',
        preRequestScript: sf.preRequestScript || '',
        testScript: sf.testScript || '',
        order: sf.order || 0,
      });
      folderIdMap.set(sf._id, forkedFolder._id);

      hashEntries.push({
        id: uuidv4(),
        forkId,
        itemType: 'folder',
        itemId: forkedFolder._id,
        sourceItemId: sf._id,
        baseHash: hashFolder(sf),
      });
    }

    // 3. Copy requests
    const sourceRequests = await RequestRepository.findByCollection(sourceId);
    for (const sr of sourceRequests) {
      const forkedFolderId = sr.folderId ? (folderIdMap.get(sr.folderId) ?? null) : null;
      const forkedReq = await RequestRepository.create({
        collectionId: forkedCol._id,
        folderId: forkedFolderId,
        name: sr.name,
        method: sr.method,
        url: sr.url,
        params: sr.params || [],
        headers: sr.headers || [],
        auth: sr.auth || { type: 'none' },
        body: sr.body || { mode: 'none' },
        preRequestScript: sr.preRequestScript || '',
        testScript: sr.testScript || '',
        description: sr.description || '',
        order: sr.order || 0,
        createdBy: userId,
      });

      hashEntries.push({
        id: uuidv4(),
        forkId,
        itemType: 'request',
        itemId: forkedReq._id,
        sourceItemId: sr._id,
        baseHash: hashRequest(sr),
      });
    }

    // 4. Save fork record
    await SqlCollectionFork.create({
      id: forkId,
      sourceCollectionId: sourceId,
      forkedCollectionId: forkedCol._id,
      forkedByUserId: userId,
      forkedAt: now,
      lastSyncAt: now,
    });

    // 5. Save all hash entries in bulk
    await SqlForkItemHash.bulkCreate(hashEntries);

    // 6. Copy environment if requested
    if (copyEnvironmentId) {
      const sourceEnv = await SqlEnvironment.findByPk(copyEnvironmentId);
      if (sourceEnv) {
        await SqlEnvironment.create({
          id: uuidv4(),
          workspaceId: targetWorkspaceId,
          name: `${sourceEnv.name} (Fork)`,
          variables: sourceEnv.variables,
          createdBy: userId,
        });
      }
    }

    emitToWorkspace(targetWorkspaceId, 'collection:created', forkedCol);
    return res.status(201).json({ fork: { id: forkId, collection: forkedCol } });
  } catch (err) {
    console.error('[fork] error:', err);
    return res.status(500).json({ message: 'Fork failed' });
  }
});

// ── POST /collections/:id/sync-upstream ─────────────────────────────────────
// Called internally (async, no await) whenever source items are updated.
// Also callable explicitly if needed.

export async function syncForksOfCollection(sourceCollectionId: string): Promise<void> {
  try {
    const forks = await SqlCollectionFork.findAll({ where: { sourceCollectionId } });
    if (forks.length === 0) return;

    // Load source data once
    const sourceCol = await CollectionRepository.findById(sourceCollectionId);
    if (!sourceCol) return;
    const sourceFolders = await FolderRepository.findByCollection(sourceCollectionId);
    const sourceRequests = await RequestRepository.findByCollection(sourceCollectionId);

    for (const forkRow of forks) {
      const forkId = forkRow.id;
      const forkedColId = forkRow.forkedCollectionId;

      // Load all hash entries for this fork
      const hashes = await SqlForkItemHash.findAll({ where: { forkId } });
      const hashBySourceId = new Map<string, typeof hashes[0]>();
      for (const h of hashes) hashBySourceId.set(h.sourceItemId, h);

      // Load forked collection
      const forkedCol = await CollectionRepository.findById(forkedColId);
      if (!forkedCol) continue;

      const forkedFolders = await FolderRepository.findByCollection(forkedColId);
      const forkedRequests = await RequestRepository.findByCollection(forkedColId);

      const forkedFolderBySourceId = new Map<string, any>();
      const forkedRequestBySourceId = new Map<string, any>();
      for (const h of hashes) {
        if (h.itemType === 'folder') {
          const ff = forkedFolders.find(f => f._id === h.itemId);
          if (ff) forkedFolderBySourceId.set(h.sourceItemId, ff);
        }
        if (h.itemType === 'request') {
          const fr = forkedRequests.find(r => r._id === h.itemId);
          if (fr) forkedRequestBySourceId.set(h.sourceItemId, fr);
        }
      }

      const seenSourceFolders = new Set<string>();
      const seenSourceRequests = new Set<string>();

      // Sync collection-level fields
      const colHashEntry = hashes.find(h => h.itemType === 'collection' && h.sourceItemId === sourceCollectionId);
      if (colHashEntry) {
        const currentForkedColHash = hashCollection(forkedCol);
        const newSourceHash = hashCollection(sourceCol);
        if (currentForkedColHash === colHashEntry.baseHash && newSourceHash !== colHashEntry.baseHash) {
          // Fork owner hasn't changed collection vars/scripts — update
          await CollectionRepository.update(forkedColId, {
            variables: sourceCol.variables || [],
            preRequestScript: sourceCol.preRequestScript || '',
            testScript: sourceCol.testScript || '',
          });
          await SqlForkItemHash.update({ baseHash: newSourceHash }, { where: { id: colHashEntry.id } });
        }
      }

      // Sync folders
      for (const sf of sourceFolders) {
        seenSourceFolders.add(sf._id);
        const hashEntry = hashBySourceId.get(sf._id);
        const forkedFolder = forkedFolderBySourceId.get(sf._id);
        const newSourceHash = hashFolder(sf);

        if (!forkedFolder) {
          // New folder added in source → add to fork
          const newFolder = await FolderRepository.create({
            collectionId: forkedColId,
            parentFolderId: null, // simplified: root level for new folders
            name: sf.name,
            description: sf.description || '',
            preRequestScript: sf.preRequestScript || '',
            testScript: sf.testScript || '',
            order: sf.order || 0,
          });
          await SqlForkItemHash.create({
            id: uuidv4(),
            forkId,
            itemType: 'folder',
            itemId: newFolder._id,
            sourceItemId: sf._id,
            baseHash: newSourceHash,
          });
        } else if (hashEntry) {
          const currentForkedHash = hashFolder(forkedFolder);
          if (currentForkedHash === hashEntry.baseHash && newSourceHash !== hashEntry.baseHash) {
            // Unchanged in fork, changed in source → update
            await FolderRepository.update(forkedFolder._id, {
              name: sf.name,
              preRequestScript: sf.preRequestScript || '',
              testScript: sf.testScript || '',
            });
            await SqlForkItemHash.update({ baseHash: newSourceHash }, { where: { id: hashEntry.id } });
          }
          // else: fork owner modified → skip
        }
      }

      // Sync requests
      for (const sr of sourceRequests) {
        seenSourceRequests.add(sr._id);
        const hashEntry = hashBySourceId.get(sr._id);
        const forkedReq = forkedRequestBySourceId.get(sr._id);
        const newSourceHash = hashRequest(sr);

        if (!forkedReq) {
          // New request added in source → add to fork
          const newReq = await RequestRepository.create({
            collectionId: forkedColId,
            folderId: null,
            name: sr.name,
            method: sr.method,
            url: sr.url,
            params: sr.params || [],
            headers: sr.headers || [],
            auth: sr.auth || { type: 'none' },
            body: sr.body || { mode: 'none' },
            preRequestScript: sr.preRequestScript || '',
            testScript: sr.testScript || '',
            description: sr.description || '',
            order: sr.order || 0,
            createdBy: forkRow.forkedByUserId,
          });
          await SqlForkItemHash.create({
            id: uuidv4(),
            forkId,
            itemType: 'request',
            itemId: newReq._id,
            sourceItemId: sr._id,
            baseHash: newSourceHash,
          });
        } else if (hashEntry) {
          const currentForkedHash = hashRequest(forkedReq);
          if (currentForkedHash === hashEntry.baseHash && newSourceHash !== hashEntry.baseHash) {
            // Unchanged in fork, changed in source → update
            await RequestRepository.update(forkedReq._id, {
              method: sr.method,
              url: sr.url,
              params: sr.params || [],
              headers: sr.headers || [],
              auth: sr.auth || { type: 'none' },
              body: sr.body || { mode: 'none' },
              preRequestScript: sr.preRequestScript || '',
              testScript: sr.testScript || '',
              description: sr.description || '',
            });
            await SqlForkItemHash.update({ baseHash: newSourceHash }, { where: { id: hashEntry.id } });
          }
          // else: fork owner modified → skip
        }
      }

      // Handle deletions: items removed from source
      for (const hashEntry of hashes) {
        if (hashEntry.itemType === 'folder' && !seenSourceFolders.has(hashEntry.sourceItemId)) {
          const forkedFolder = forkedFolders.find(f => f._id === hashEntry.itemId);
          if (forkedFolder) {
            const currentHash = hashFolder(forkedFolder);
            if (currentHash === hashEntry.baseHash) {
              // Unmodified → delete from fork
              await FolderRepository.delete(forkedFolder._id);
              await SqlForkItemHash.destroy({ where: { id: hashEntry.id } });
            }
            // Modified → keep
          }
        }
        if (hashEntry.itemType === 'request' && !seenSourceRequests.has(hashEntry.sourceItemId)) {
          const forkedReq = forkedRequests.find(r => r._id === hashEntry.itemId);
          if (forkedReq) {
            const currentHash = hashRequest(forkedReq);
            if (currentHash === hashEntry.baseHash) {
              // Unmodified → delete from fork
              await RequestRepository.delete(forkedReq._id);
              await SqlForkItemHash.destroy({ where: { id: hashEntry.id } });
            }
            // Modified → keep
          }
        }
      }

      // Update lastSyncAt
      await SqlCollectionFork.update({ lastSyncAt: new Date() }, { where: { id: forkId } });

      // Notify fork workspace
      emitToWorkspace(forkedCol.workspaceId, 'collection:fork-synced', { collectionId: forkedColId });
    }
  } catch (err) {
    console.error('[fork sync] error:', err);
  }
}

// Explicit sync endpoint (admin/debug)
router.post('/collections/:id/sync-upstream', async (req: AuthRequest, res: Response) => {
  const sourceId = req.params.id;
  const sourceCol = await CollectionRepository.findById(sourceId);
  if (!sourceCol) return res.status(404).json({ message: 'Collection not found' });
  // Only source workspace editor or superadmin can trigger manually
  if (!req.user!.isSuperAdmin) {
    const role = await getUserWorkspaceRole(String(req.user!._id), sourceCol.workspaceId);
    if (!role || role === 'viewer') return res.status(403).json({ message: 'Editor role required' });
  }
  // Fire async — do not block response
  syncForksOfCollection(sourceId).catch(() => {});
  return res.json({ message: 'Sync triggered' });
});

export default router;
