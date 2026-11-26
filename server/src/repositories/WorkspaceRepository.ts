import { decodeCursor, encodeCursor, getCursorWhere } from '../utils/pagination';
import { SqlWorkspace, SqlWorkspaceInvite } from '../db/sql-models';
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
  isPersonal: boolean;
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
    isPersonal: !!w.isPersonal,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

export const WorkspaceRepository = {
  async findById(id: string): Promise<IWorkspaceRecord | null> {
    const w = await SqlWorkspace.findByPk(id);
    return w ? sqlToRecord(w) : null;
  },

  async findForUser(userId: string, everything = false): Promise<IWorkspaceRecord[]> {
    const all = await SqlWorkspace.findAll();
    return all
      .map(sqlToRecord)
      .filter(w => everything || w.isPublic || w.ownerId === userId || w.members.some(m => m.userId === userId));
  },

  async findPublic(): Promise<IWorkspaceRecord[]> {
    const ws = await SqlWorkspace.findAll({ where: { isPublic: true } });
    return ws.map(sqlToRecord);
  },

  async create(data: { name: string; description?: string; ownerId: string; isPublic?: boolean; isPersonal?: boolean }): Promise<IWorkspaceRecord> {
    const id = uuidv4();
    const members: IWorkspaceMemberRecord[] = [{ userId: data.ownerId, role: 'owner', joinedAt: new Date() }];
    const w = await SqlWorkspace.create({
      id,
      name: data.name,
      description: data.description || '',
      ownerId: data.ownerId,
      members: JSON.stringify(members),
      isPublic: data.isPublic ?? false,
      isPersonal: data.isPersonal ?? false,
    });
    return sqlToRecord(w);
  },

  /** The workspace createPersonalWorkspace made for this user at signup. At
   *  most one should exist, but this returns the earliest if more than one
   *  somehow does, rather than throwing. */
  async findPersonalForUser(userId: string): Promise<IWorkspaceRecord | null> {
    const w = await SqlWorkspace.findOne({ where: { ownerId: userId, isPersonal: true }, order: [['createdAt', 'ASC']] });
    return w ? sqlToRecord(w) : null;
  },

  async update(id: string, data: Partial<{ name: string; description: string; isPublic: boolean; members: IWorkspaceMemberRecord[] }>): Promise<IWorkspaceRecord | null> {
    const patch: any = { ...data };
    if (data.members) patch.members = JSON.stringify(data.members);
    await SqlWorkspace.update(patch, { where: { id } });
    return this.findById(id);
  },

  /** Saves a pending invite, or changes its role if one is already pending for that email. */
  async upsertInvite(workspaceId: string, email: string, role: string, invitedBy: string): Promise<void> {
    const existing = await SqlWorkspaceInvite.findOne({ where: { workspaceId, email } });
    if (existing) await existing.update({ role, invitedBy });
    else await SqlWorkspaceInvite.create({ workspaceId, email, role, invitedBy });
  },

  async listInvites(workspaceId: string): Promise<Array<{ email: string; role: string; invitedAt: Date }>> {
    const invites = await SqlWorkspaceInvite.findAll({ where: { workspaceId }, order: [['createdAt', 'ASC']] });
    return invites.map(i => ({ email: i.email, role: i.role, invitedAt: i.createdAt }));
  },

  async deleteInvite(workspaceId: string, email: string): Promise<boolean> {
    return (await SqlWorkspaceInvite.destroy({ where: { workspaceId, email } })) > 0;
  },

  /** Turns the user's pending invites into memberships; returns the ids of the workspaces joined. */
  async redeemInvites(userId: string, email: string): Promise<string[]> {
    const invites = await SqlWorkspaceInvite.findAll({ where: { email: email.toLowerCase() } });
    const joined: string[] = [];
    for (const inv of invites) {
      // Delete first: only the request that removes the row adds the member, so parallel requests can't add it twice.
      if (!(await SqlWorkspaceInvite.destroy({ where: { id: inv.id } }))) continue;
      const ws = await this.findById(inv.workspaceId);
      if (!ws || ws.members.some(m => String(m.userId) === userId)) continue;
      await this.update(ws.id, { members: [...ws.members, { userId, role: inv.role, joinedAt: new Date(), invitedBy: inv.invitedBy }] });
      joined.push(ws.id);
    }
    return joined;
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
