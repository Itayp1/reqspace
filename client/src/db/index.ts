import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { Workspace } from '../store/authStore';
import type { Collection, Folder, ApiRequest } from '../store/collectionStore';
import type { Environment } from '../store/environmentStore';

export class ReqSpaceDB extends Dexie {
  workspaces!: Table<Workspace, string>;
  collections!: Table<Collection, string>;
  folders!: Table<Folder, string>;
  requests!: Table<ApiRequest, string>;
  environments!: Table<Environment, string>;

  constructor() {
    super('ReqSpaceWebDB');
    this.version(1).stores({
      workspaces: '_id, name',
      collections: '_id, workspaceId, name',
      folders: '_id, collectionId, parentFolderId, name',
      requests: '_id, collectionId, folderId, name',
      environments: '_id, workspaceId, name'
    });
  }
}

export const db = new ReqSpaceDB();
