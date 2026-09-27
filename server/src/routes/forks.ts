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
 *
 * Fork-of-fork sync is intentionally one-hop, not transitive. Forking a fork
 * works fine (it creates its own independent collection_forks row, pointing at
 * the fork as its own source), but doSyncForksOfCollection only walks direct
 * children (`where: { sourceCollectionId }`) — an edit to the original source
 * of a A→B→C chain updates B but never reaches C on its own. This is a
 * deliberate product decision, not a gap: a fork is a one-time-ish detachment
 * point, and re-forking is the intended way to pull in further upstream
 * changes. Don't add recursive/cascading sync without revisiting that
 * decision first.
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { requireWorkspaceRole, getUserWorkspaceRole } from '../middleware/rbac';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { FolderRepository } from '../repositories/FolderRepository';
import { RequestRepository } from '../repositories/RequestRepository';
import { WorkspaceRepository } from '../repositories/WorkspaceRepository';
import { SqlCollectionFork, SqlForkItemHash, SqlEnvironment } from '../db/sql-models';
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
// `order` is intentionally excluded from every hash* function below (and never
// synced either) — it's workspace-local UI arrangement, not content owned by
// either side of a fork. Don't add it back in.
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
  // `description` is hashed (unlike `name`): it reads as documentation the
  // fork owner would want to keep in their own words once they've written it,
  // and un-hashing it turned out to make an upstream description-only change
  // silently never sync (the gate below never trips if nothing hashed
  // changed) — see the description-sync test in fork.test.ts.
  const data = JSON.stringify({
    name: f.name ?? '',
    description: f.description ?? '',
    preRequestScript: f.preRequestScript ?? '',
    testScript: f.testScript ?? '',
  });
  return createHash('md5').update(data).digest('hex');
}

/** Orders folders so every parent appears before its children, at any depth
 *  (a plain "root vs non-root" split only handles 2 levels — a grandchild
 *  processed before its parent would resolve to a missing parent mapping and
 *  silently get reparented to root). Used both when copying a whole tree at
 *  fork time and when reparenting newly-added folders during sync. */
function sortFoldersByDepth<T extends { _id: string; parentFolderId: string | null }>(folders: T[]): T[] {
  const byId = new Map(folders.map(f => [f._id, f] as const));
  const visited = new Set<string>();
  const result: T[] = [];
  function visit(f: T) {
    if (visited.has(f._id)) return;
    visited.add(f._id);
    if (f.parentFolderId) {
      const parent = byId.get(f.parentFolderId);
      if (parent) visit(parent);
    }
    result.push(f);
  }
  for (const f of folders) visit(f);
  return result;
}

function hashCollection(c: any): string {
  // NOTE: `name` is intentionally excluded — the fork is always created with a
  // different name (e.g. "X (Fork)"), so including it would make baseHash never
  // match and permanently disable sync of variables/scripts. Same reasoning as
  // hashRequest excluding `name`.
  // `description` IS hashed, same as hashFolder/hashRequest — see hashFolder's
  // comment for why un-hashing it doesn't actually work.
  const data = JSON.stringify({
    description: c.description ?? '',
    variables: c.variables ?? [],
    preRequestScript: c.preRequestScript ?? '',
    testScript: c.testScript ?? '',
  });
  return createHash('md5').update(data).digest('hex');
}

// ── POST /collections/:id/fork ───────────────────────────────────────────────

const forkSchema = z.object({
  targetWorkspaceId: z.string(),
  name: z.string().optional(),
  copyEnvironmentId: z.string().optional(),
  copyVariables: z.boolean().optional(),
});

router.post('/collections/:id/fork', validate(forkSchema), async (req: AuthRequest, res: Response) => {
  try {
    const sourceId = req.params.id;
    const userId = String(req.user!._id);
    const { targetWorkspaceId, name, copyEnvironmentId, copyVariables } = req.body;
    const shouldCopyVariables = copyVariables !== false;

    if (!targetWorkspaceId) return res.status(400).json({ message: 'targetWorkspaceId is required' });

    // Verify access to source collection
    const sourceCol = await CollectionRepository.findById(sourceId);
    if (!sourceCol) return res.status(404).json({ message: 'Source collection not found' });

    const sourceRole = await getUserWorkspaceRole(userId, sourceCol.workspaceId);
    if (!sourceRole && !req.user!.isSuperAdmin) {
      return res.status(403).json({ message: 'No access to source collection' });
    }

    // Forking is restricted to "shared workspace → the fork owner's own
    // personal workspace". Anywhere else quickly becomes untrackable — there'd
    // be no single, predictable place a user's forks live, and no way to tell
    // a fork's source workspace is meant to be "the shared original" vs. just
    // another arbitrary copy. This is a product rule, not an access-control
    // check, so it applies even to superadmins.
    const sourceWorkspace = await WorkspaceRepository.findById(sourceCol.workspaceId);
    if (sourceWorkspace?.isPersonal) {
      return res.status(400).json({ message: 'Cannot fork a collection that is already in a personal workspace' });
    }
    const targetWorkspace = await WorkspaceRepository.findById(targetWorkspaceId);
    if (!targetWorkspace || !targetWorkspace.isPersonal || targetWorkspace.ownerId !== userId) {
      return res.status(400).json({ message: 'You can only fork into your own personal workspace' });
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
    // baseHash must reflect what we actually wrote below, not sourceCol — when
    // copyVariables is false the two diverge (empty vs source's variables),
    // and hashing the wrong one would make every subsequent variable sync
    // think the fork owner had "modified" variables they never even copied.
    const forkedColData = {
      workspaceId: targetWorkspaceId,
      name: name || `${sourceCol.name} (Fork)`,
      description: sourceCol.description || '',
      variables: shouldCopyVariables ? (sourceCol.variables || []) : [],
      preRequestScript: sourceCol.preRequestScript || '',
      testScript: sourceCol.testScript || '',
      order: colOrder,
      createdBy: userId,
    };
    const forkedCol = await CollectionRepository.create(forkedColData);

    const hashEntries: any[] = [];

    // Hash for collection itself
    hashEntries.push({
      id: uuidv4(),
      forkId,
      itemType: 'collection',
      itemId: forkedCol._id,
      sourceItemId: sourceId,
      baseHash: hashCollection(forkedColData),
    });

    // 2. Copy folders
    const sourceFolders = await FolderRepository.findByCollection(sourceId);
    // Map: sourceId → forkedId (for reparenting)
    const folderIdMap = new Map<string, string>();

    // Sort so parents are created before children, at any depth
    const sorted = sortFoldersByDepth(sourceFolders);

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
      // IDOR guard: only copy an environment the caller can actually see — it
      // must belong to the source collection's workspace (the one they were
      // just checked against above), not an arbitrary workspace they can name.
      if (sourceEnv && sourceEnv.workspaceId === sourceCol.workspaceId) {
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

// Guards against concurrent syncs of the same source collection. Without this,
// two rapid upstream saves both read the same hash rows, both see an item as
// "missing in fork", and both create it — duplicating folders/requests in
// every fork. This serializes runs per sourceCollectionId within this process
// and coalesces any syncs requested while one is already running into a single
// extra pass afterwards, so a burst of saves settles on one consistent result.
// (This is an in-process lock only — it does not cover multiple app instances;
// see fork_item_hashes' unique(forkId, sourceItemId) constraint for a DB-level
// backstop against the same race across processes.)
const syncInFlight = new Map<string, Promise<void>>();
const syncQueued = new Set<string>();

export function syncForksOfCollection(sourceCollectionId: string): Promise<void> {
  const existing = syncInFlight.get(sourceCollectionId);
  if (existing) {
    syncQueued.add(sourceCollectionId);
    return existing;
  }
  const run = (async () => {
    do {
      syncQueued.delete(sourceCollectionId);
      await doSyncForksOfCollection(sourceCollectionId);
    } while (syncQueued.has(sourceCollectionId));
  })().finally(() => {
    syncInFlight.delete(sourceCollectionId);
  });
  syncInFlight.set(sourceCollectionId, run);
  return run;
}

async function doSyncForksOfCollection(sourceCollectionId: string): Promise<void> {
  const forks = await SqlCollectionFork.findAll({ where: { sourceCollectionId } });
  if (forks.length === 0) return;

  // Load source data once. A failure here isn't any one fork's fault, but it
  // still means every fork of this collection just failed to sync — record
  // that on all of them rather than only in server logs.
  let sourceCol, sourceFolders, sourceRequests;
  try {
    sourceCol = await CollectionRepository.findById(sourceCollectionId);
    if (!sourceCol) return;
    sourceFolders = await FolderRepository.findByCollection(sourceCollectionId);
    sourceRequests = await RequestRepository.findByCollection(sourceCollectionId);
  } catch (err) {
    console.error('[fork sync] error loading source data:', err);
    const message = err instanceof Error ? err.message : String(err);
    await SqlCollectionFork.update(
      { lastSyncError: message },
      { where: { id: { [Op.in]: forks.map(f => f.id) } } },
    ).catch(() => {});
    return;
  }

  for (const forkRow of forks) {
    const forkId = forkRow.id;
    const forkedColId = forkRow.forkedCollectionId;
    try {
      // Load all hash entries for this fork
      const hashes = await SqlForkItemHash.findAll({ where: { forkId } });
      const hashBySourceId = new Map<string, typeof hashes[0]>();
      for (const h of hashes) hashBySourceId.set(h.sourceItemId, h);

      // Load forked collection
      const forkedCol = await CollectionRepository.findById(forkedColId);
      if (!forkedCol) continue;

      const forkedFolders = await FolderRepository.findByCollection(forkedColId);
      const forkedRequests = await RequestRepository.findByCollection(forkedColId);

      const forkedFolderById = new Map(forkedFolders.map(f => [f._id, f] as const));
      const forkedRequestById = new Map(forkedRequests.map(r => [r._id, r] as const));
      const forkedFolderBySourceId = new Map<string, any>();
      const forkedRequestBySourceId = new Map<string, any>();
      for (const h of hashes) {
        if (h.itemType === 'folder') {
          const ff = forkedFolderById.get(h.itemId);
          if (ff) forkedFolderBySourceId.set(h.sourceItemId, ff);
        }
        if (h.itemType === 'request') {
          const fr = forkedRequestById.get(h.itemId);
          if (fr) forkedRequestBySourceId.set(h.sourceItemId, fr);
        }
      }

      // Maps source folder id → forked folder id, seeded from existing forked
      // folders and extended as new ones are created below, so a new folder
      // added upstream lands under its correct (already-mapped) parent, and a
      // new request added upstream lands in its correct folder — instead of
      // always being flattened to collection root.
      const folderIdBySourceId = new Map<string, string>();
      for (const [sourceId, ff] of forkedFolderBySourceId) folderIdBySourceId.set(sourceId, ff._id);

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
            description: sourceCol.description || '',
            variables: sourceCol.variables || [],
            preRequestScript: sourceCol.preRequestScript || '',
            testScript: sourceCol.testScript || '',
          });
          await SqlForkItemHash.update({ baseHash: newSourceHash }, { where: { id: colHashEntry.id } });
        }
      }

      // Sync folders. Sorted by depth so a new folder's parent (if it's also
      // new this sync) is created — and added to folderIdBySourceId — before
      // the child is processed.
      for (const sf of sortFoldersByDepth(sourceFolders)) {
        seenSourceFolders.add(sf._id);
        const hashEntry = hashBySourceId.get(sf._id);
        const forkedFolder = forkedFolderBySourceId.get(sf._id);
        const newSourceHash = hashFolder(sf);

        if (!forkedFolder) {
          // New folder added in source → add to fork, under the mapped parent
          // (or root if the parent isn't tracked, e.g. it predates this fix)
          const mappedParentId = sf.parentFolderId ? (folderIdBySourceId.get(sf.parentFolderId) ?? null) : null;
          const newFolder = await FolderRepository.create({
            collectionId: forkedColId,
            parentFolderId: mappedParentId,
            name: sf.name,
            description: sf.description || '',
            preRequestScript: sf.preRequestScript || '',
            testScript: sf.testScript || '',
            order: sf.order || 0,
          });
          folderIdBySourceId.set(sf._id, newFolder._id);
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
              description: sf.description || '',
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
          // New request added in source → add to fork, in its mapped folder
          const mappedFolderId = sr.folderId ? (folderIdBySourceId.get(sr.folderId) ?? null) : null;
          const newReq = await RequestRepository.create({
            collectionId: forkedColId,
            folderId: mappedFolderId,
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
          const forkedFolder = forkedFolderById.get(hashEntry.itemId);
          if (forkedFolder) {
            const currentHash = hashFolder(forkedFolder);
            if (currentHash === hashEntry.baseHash) {
              // Unmodified → delete from fork, mirroring the cascade the real
              // DELETE /folders/:id route performs (direct child folders +
              // requests), so sync doesn't leave orphaned children behind.
              const childFolderIds = forkedFolders.filter(f => f.parentFolderId === forkedFolder._id).map(f => f._id);
              const childRequestIds = forkedRequests.filter(r => r.folderId === forkedFolder._id).map(r => r._id);
              await FolderRepository.deleteByParent(forkedFolder._id);
              await RequestRepository.deleteByFolder(forkedFolder._id);
              await FolderRepository.delete(forkedFolder._id);
              await SqlForkItemHash.destroy({
                where: { itemId: { [Op.in]: [forkedFolder._id, ...childFolderIds, ...childRequestIds] } },
              });
            }
            // Modified → keep
          }
        }
        if (hashEntry.itemType === 'request' && !seenSourceRequests.has(hashEntry.sourceItemId)) {
          const forkedReq = forkedRequestById.get(hashEntry.itemId);
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

      // Update lastSyncAt and clear any previously-recorded failure
      await SqlCollectionFork.update({ lastSyncAt: new Date(), lastSyncError: null }, { where: { id: forkId } });

      // Notify fork workspace
      emitToWorkspace(forkedCol.workspaceId, 'collection:fork-synced', { collectionId: forkedColId });
    } catch (err) {
      // Caught per-fork (not around the whole loop) so one broken fork
      // doesn't stop the rest of this source's forks from syncing, and so the
      // failure is visible somewhere other than server logs (GET
      // /collections/:id/fork-status surfaces this field).
      console.error('[fork sync] error syncing fork', forkId, err);
      const message = err instanceof Error ? err.message : String(err);
      await SqlCollectionFork.update({ lastSyncError: message }, { where: { id: forkId } }).catch(() => {});
    }
  }
}

const syncSchema = z.object({});

// Explicit sync endpoint (admin/debug)
router.post('/collections/:id/sync-upstream', validate(syncSchema), async (req: AuthRequest, res: Response) => {
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

// Tells the UI whether this collection is a fork (and of what), or has forks
// of its own — needed so ForkModal's sync promise isn't just an unverifiable
// claim, and so a deleted/orphaned fork can be surfaced.
router.get('/collections/:id/fork-status', async (req: AuthRequest, res: Response) => {
  const collectionId = req.params.id;
  const col = await CollectionRepository.findById(collectionId);
  if (!col) return res.status(404).json({ message: 'Collection not found' });
  if (!req.user!.isSuperAdmin) {
    const role = await getUserWorkspaceRole(String(req.user!._id), col.workspaceId);
    if (!role) return res.status(403).json({ message: 'No access to this collection' });
  }
  const [asFork, asSource] = await Promise.all([
    SqlCollectionFork.findOne({ where: { forkedCollectionId: collectionId } }),
    SqlCollectionFork.findAll({ where: { sourceCollectionId: collectionId } }),
  ]);
  return res.json({
    isFork: !!asFork,
    sourceCollectionId: asFork?.sourceCollectionId ?? null,
    lastSyncAt: asFork?.lastSyncAt ?? null,
    lastSyncError: asFork?.lastSyncError ?? null,
    forkCount: asSource.length,
  });
});

// Detaches this collection from its upstream source without touching the
// collection or its contents — lets a fork owner "graduate" their fork into a
// fully independent collection. Deliberately not called from the
// collection-delete path (cleanupForkRecordsForCollection below already
// handles that case, where the collection itself is going away too).
router.delete('/collections/:id/fork', async (req: AuthRequest, res: Response) => {
  const collectionId = req.params.id;
  const forkRow = await SqlCollectionFork.findOne({ where: { forkedCollectionId: collectionId } });
  if (!forkRow) return res.status(404).json({ message: 'This collection is not a fork' });

  if (!req.user!.isSuperAdmin) {
    const col = await CollectionRepository.findById(collectionId);
    if (!col) return res.status(404).json({ message: 'Collection not found' });
    const isForkOwner = forkRow.forkedByUserId === String(req.user!._id);
    if (!isForkOwner) {
      const role = await getUserWorkspaceRole(String(req.user!._id), col.workspaceId);
      if (!role || role === 'viewer') return res.status(403).json({ message: 'Editor role required' });
    }
  }

  await SqlForkItemHash.destroy({ where: { forkId: forkRow.id } });
  await SqlCollectionFork.destroy({ where: { id: forkRow.id } });
  return res.json({ message: 'Fork detached' });
});

// Called when a collection is deleted (either side of a fork relationship) so
// collection_forks / fork_item_hashes don't accumulate rows pointing at
// collections that no longer exist — doSyncForksOfCollection would otherwise
// keep loading them (and skipping, via the forkedCol null-check) forever.
export async function cleanupForkRecordsForCollection(collectionId: string): Promise<void> {
  const asSource = await SqlCollectionFork.findAll({ where: { sourceCollectionId: collectionId } });
  const asForked = await SqlCollectionFork.findOne({ where: { forkedCollectionId: collectionId } });
  const forkIds = [...asSource.map(f => f.id), ...(asForked ? [asForked.id] : [])];
  if (forkIds.length > 0) {
    await SqlForkItemHash.destroy({ where: { forkId: { [Op.in]: forkIds } } });
  }
  await SqlCollectionFork.destroy({
    where: { [Op.or]: [{ sourceCollectionId: collectionId }, { forkedCollectionId: collectionId }] },
  });
}

export default router;
