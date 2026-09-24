import { isMongo } from '../db/connect';
import { SharedLink } from '../models/SharedLink';
import { SqlSharedLink } from '../db/sql-models';
import { v4 as uuidv4 } from 'uuid';

export interface ISharedLinkRecord {
  _id: string;
  id: string;
  shortId: string;
  collectionId: string;
  workspaceId: string;
  createdBy: string;
  expiresAt: Date;
  createdAt: Date;
}

function mongoToRecord(l: any): ISharedLinkRecord {
  return {
    _id: l._id.toString(), id: l._id.toString(), shortId: l.shortId,
    collectionId: l.collectionId?.toString(), workspaceId: l.workspaceId?.toString(),
    createdBy: l.createdBy?.toString(), expiresAt: l.expiresAt, createdAt: l.createdAt,
  };
}

function sqlToRecord(l: SqlSharedLink, workspaceId = ''): ISharedLinkRecord {
  return {
    _id: l.id, id: l.id, shortId: l.token, collectionId: l.collectionId,
    workspaceId, createdBy: l.createdBy, expiresAt: l.expiresAt || new Date(0), createdAt: l.createdAt,
  };
}

export const SharedLinkRepository = {
  async findByShortId(shortId: string): Promise<ISharedLinkRecord | null> {
    if (isMongo()) {
      const l = await SharedLink.findOne({ shortId }).lean();
      return l ? mongoToRecord(l) : null;
    }
    const l = await SqlSharedLink.findOne({ where: { token: shortId } });
    return l ? sqlToRecord(l) : null;
  },

  async create(data: { shortId: string; collectionId: string; workspaceId: string; createdBy: string; expiresAt: Date }): Promise<ISharedLinkRecord> {
    if (isMongo()) return mongoToRecord(await SharedLink.create(data));
    const row = await SqlSharedLink.create({
      id: uuidv4(),
      collectionId: data.collectionId,
      token: data.shortId,
      createdBy: data.createdBy,
      expiresAt: data.expiresAt,
    });
    return sqlToRecord(row, data.workspaceId);
  },
};
