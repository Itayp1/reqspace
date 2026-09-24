import { ICollectionRecord } from '../repositories/CollectionRepository';
import { IFolderRecord } from '../repositories/FolderRepository';
import { IRequestRecord } from '../repositories/RequestRepository';

const SCHEMA = 'https://schema.getreqSpace.com/json/collection/v2.1.0/collection.json';

export function toReqspaceV21(collection: ICollectionRecord, folders: IFolderRecord[], requests: IRequestRecord[]) {
  const buildItems = (parentFolderId: string | null): any[] => {
    const items: any[] = [];
    for (const folder of folders.filter((f) => (f.parentFolderId || null) === parentFolderId)) {
      items.push({ name: folder.name, item: buildItems(folder._id) });
    }
    for (const req of requests.filter((r) => (r.folderId || null) === parentFolderId)) {
      const header = (req.headers || []).filter((h: any) => h.key).map((h: any) => ({
        key: h.key, value: h.value || '', ...(h.enabled === false ? { disabled: true } : {}),
      }));
      let body: any;
      if (req.body && req.body.mode && req.body.mode !== 'none') {
        body = { mode: req.body.mode, raw: req.body.raw };
      }
      const item: any = {
        name: req.name,
        request: { method: req.method || 'GET', url: req.url || '', header, body, auth: req.auth },
      };
      const events = [];
      if (req.preRequestScript) events.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: req.preRequestScript.split('\n') } });
      if (req.testScript) events.push({ listen: 'test', script: { type: 'text/javascript', exec: req.testScript.split('\n') } });
      if (events.length) item.event = events;
      items.push(item);
    }
    return items;
  };

  const doc: any = {
    info: { name: collection.name, schema: SCHEMA, description: collection.description || '' },
    item: buildItems(null),
  };
  if (collection.variables?.length) doc.variable = collection.variables;
  const events = [];
  if (collection.preRequestScript) events.push({ listen: 'prerequest', script: { exec: collection.preRequestScript.split('\n') } });
  if (collection.testScript) events.push({ listen: 'test', script: { exec: collection.testScript.split('\n') } });
  if (events.length) doc.event = events;
  return doc;
}

function scriptText(event: any[] | undefined, listen: string): string {
  const found = (event || []).find((e) => e.listen === listen);
  const exec = found?.script?.exec;
  if (Array.isArray(exec)) return exec.join('\n');
  return typeof exec === 'string' ? exec : '';
}

export interface ImportPlan {
  name: string;
  description?: string;
  variables?: any[];
  preRequestScript?: string;
  testScript?: string;
  folders: Array<{ tempId: string; name: string; parentTempId: string | null }>;
  requests: Array<{ name: string; method: string; url: string; headers: any[]; body: any; auth: any; folderTempId: string | null; preRequestScript: string; testScript: string }>;
}

export function parseReqspaceV21(doc: any): ImportPlan {
  let n = 0;
  const folders: ImportPlan['folders'] = [];
  const requests: ImportPlan['requests'] = [];
  const walk = (items: any[], parentTempId: string | null) => {
    for (const item of items || []) {
      if (Array.isArray(item.item)) {
        const tempId = `f${n++}`;
        folders.push({ tempId, name: item.name || 'Folder', parentTempId });
        walk(item.item, tempId);
      } else if (item.request) {
        const req = item.request;
        const rawUrl = typeof req.url === 'string' ? req.url : (req.url?.raw || '');
        requests.push({
          name: item.name || 'Request',
          method: req.method || 'GET',
          url: rawUrl,
          headers: (req.header || []).map((h: any) => ({ key: h.key, value: h.value, enabled: !h.disabled })),
          body: req.body?.mode ? { mode: req.body.mode, raw: req.body.raw || '' } : { mode: 'none' },
          auth: req.auth || { type: 'none' },
          folderTempId: parentTempId,
          preRequestScript: scriptText(item.event, 'prerequest'),
          testScript: scriptText(item.event, 'test'),
        });
      }
    }
  };
  walk(doc.item || [], null);
  return {
    name: doc.info?.name || 'Imported collection',
    description: doc.info?.description || '',
    variables: doc.variable || [],
    preRequestScript: scriptText(doc.event, 'prerequest'),
    testScript: scriptText(doc.event, 'test'),
    folders,
    requests,
  };
}
