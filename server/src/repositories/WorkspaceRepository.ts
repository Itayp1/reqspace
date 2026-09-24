import { isMongo } from '../db/connect';
import { Workspace } from '../models/Workspace';
import { SqlWorkspace } from '../db/sql-models';
import { v4 as uuidv4 } from 'uuid';
import { invalidate } from '../cache';

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

function mongoToRecord(w: any): IWorkspaceRecord {
  return {
    _id: w._id.toString(),
    id: w._id.toString(),
    name: w.name,
    description: w.description,
    ownerId: w.ownerId?.toString(),
    members: (w.members || []).map((m: any) => ({
      userId: m.userId?.toString(),
      role: m.role,
      joinedAt: m.joinedAt,
      invitedBy: m.invitedBy?.toString(),
    })),
    isPublic: w.isPublic,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

export const WorkspaceRepository = {
  async findById(id: string): Promise<IWorkspaceRecord | null> {
    if (isMongo()) {
      const w = await Workspace.findById(id).lean();
      return w ? mongoToRecord(w) : null;
    }
    const w = await SqlWorkspace.findByPk(id);
    return w ? sqlToRecord(w) : null;
  },

  async findForUser(userId: string): Promise<IWorkspaceRecord[]> {
    if (isMongo()) {
      const ws = await Workspace.find({
        $or: [{ ownerId: userId }, { 'members.userId': userId }],
      }).lean();
      return ws.map(mongoToRecord);
    }
    const all = await SqlWorkspace.findAll();
    return all
      .map(sqlToRecord)
      .filter(w => w.ownerId === userId || w.members.some(m => m.userId === userId));
  },

  async findPublic(): Promise<IWorkspaceRecord[]> {
    if (isMongo()) {
      const ws = await Workspace.find({ isPublic: true }).lean();
      return ws.map(mongoToRecord);
    }
    const ws = await SqlWorkspace.findAll({ where: { isPublic: true } });
    return ws.map(sqlToRecord);
  },

  async create(data: { name: string; description?: string; ownerId: string; isPublic?: boolean }): Promise<IWorkspaceRecord> {
    if (isMongo()) {
      const w = await Workspace.create({
        ...data,
        members: [{ userId: data.ownerId, role: 'owner', joinedAt: new Date() }],
      });
      return mongoToRecord(w);
    }
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
    if (isMongo()) {
      const w = await Workspace.findByIdAndUpdate(id, data, { new: true }).lean();
      invalidate(`role:${id}:`);
      return w ? mongoToRecord(w) : null;
    }
    const patch: any = { ...data };
    if (data.members) patch.members = JSON.stringify(data.members);
    await SqlWorkspace.update(patch, { where: { id } });
    invalidate(`role:${id}:`);
    return this.findById(id);
  },

  async delete(id: string): Promise<void> {
    invalidate(`role:${id}:`);
    if (isMongo()) { await Workspace.findByIdAndDelete(id); return; }
    await SqlWorkspace.destroy({ where: { id } });
  },

  async list(): Promise<IWorkspaceRecord[]> {
    if (isMongo()) {
      return (await Workspace.find().lean()).map(mongoToRecord);
    }
    return (await SqlWorkspace.findAll()).map(sqlToRecord);
  },
};
