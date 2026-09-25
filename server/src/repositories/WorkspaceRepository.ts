import { decodeCursor, encodeCursor, getCursorWhere } from '../utils/pagination';
import { SqlWorkspace } from '../db/sql-models';
import { v4 as uuidv4 } from 'uuid';

export interface IWorkspaceMemberRecord {
  userId: string;
  role: string;
  joinedAt: Date;
  invitedBy?: string;
}

export interface IWorkspaceRecord {
  _id: string;
  id: string;
  name: string;
  description: string;
  ownerId: string;
  members: IWorkspaceMemberRecord[];
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  myRole?: string;
}

function sqlToRecord(w: SqlWorkspace): IWorkspaceRecord {
  const members: IWorkspaceMemberRecord[] = typeof w.members === 'string' ? JSON.parse(w.members) : w.members;
  return {
    _id: w.id,
    id: w.id,
    name: w.name,
    description: w.description,
    ownerId: w.ownerId,
    members,
    isPublic: w.isPublic,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

export const WorkspaceRepository = {
  async findById(id: string): Promise<IWorkspaceRecord | null> {
    const w = await SqlWorkspace.findByPk(id);
    return w ? sqlToRecord(w) : null;
  },

  async findForUser(userId: string): Promise<IWorkspaceRecord[]> {
    const all = await SqlWorkspace.findAll();
    return all
      .map(sqlToRecord)
      .filter(w => w.ownerId === userId || w.members.some(m => m.userId === userId));
  },

  async findPublic(): Promise<IWorkspaceRecord[]> {
    const ws = await SqlWorkspace.findAll({ where: { isPublic: true } });
    return ws.map(sqlToRecord);
  },

  async create(data: { name: string; description?: string; ownerId: string; isPublic?: boolean }): Promise<IWorkspaceRecord> {
    const id = uuidv4();
    const members: IWorkspaceMemberRecord[] = [{ userId: data.ownerId, role: 'owner', joinedAt: new Date() }];
    const w = await SqlWorkspace.create({
      id,
      name: data.name,
      description: data.description || '',
      ownerId: data.ownerId,
      members: JSON.stringify(members),
      isPublic: data.isPublic ?? false,
    });
    return sqlToRecord(w);
  },

  async update(id: string, data: Partial<{ name: string; description: string; isPublic: boolean; members: IWorkspaceMemberRecord[] }>): Promise<IWorkspaceRecord | null> {
    const patch: any = { ...data };
    if (data.members) patch.members = JSON.stringify(data.members);
    await SqlWorkspace.update(patch, { where: { id } });
    return this.findById(id);
  },

  async delete(id: string): Promise<void> {
    await SqlWorkspace.destroy({ where: { id } });
  },

  async list(options?: { limit?: number, cursor?: string }): Promise<{ items: IWorkspaceRecord[], nextCursor: string | null }> {
    const limit = (options && options.limit && options.limit <= 200) ? options.limit : 200;
    const cursorObj = decodeCursor(options?.cursor);
    const cursorWhere = getCursorWhere(cursorObj, 'createdAt', true); // DESC
    
    const workspaces = await SqlWorkspace.findAll({ 
      where: cursorWhere,
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: limit + 1
    });

    let nextCursor = null;
    if (workspaces.length > limit) {
      workspaces.pop();
      const lastItem = workspaces[workspaces.length - 1];
      nextCursor = encodeCursor(lastItem.createdAt, lastItem.id);
    }

    return { items: workspaces.map(sqlToRecord), nextCursor };
  },
};
