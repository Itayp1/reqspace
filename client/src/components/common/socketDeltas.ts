export function upsert<T extends { _id: string }>(list: T[], item: T): T[] {
  const index = list.findIndex(entry => entry._id === item._id);
  if (index === -1) return [...list, item];
  const next = list.slice();
  next[index] = { ...list[index], ...item };
  return next;
}

export function descendantFolderIds(folders: Array<{ _id: string; parentFolderId: string | null }>, rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentFolderId && ids.has(folder.parentFolderId) && !ids.has(folder._id)) {
        ids.add(folder._id);
        grew = true;
      }
    }
  }
  return ids;
}

export function applyOrder<T extends { _id: string; order: number }>(list: T[], items: Array<{ id: string; order: number }>): T[] {
  const rank = new Map(items.map(item => [item.id, item.order]));
  return list.map(entry => rank.has(entry._id) ? { ...entry, order: rank.get(entry._id)! } : entry);
}
