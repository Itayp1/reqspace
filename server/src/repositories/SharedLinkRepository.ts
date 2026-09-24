import { isMongo } from '../db/connect';
import { SharedLink } from '../models/SharedLink';
import { SqlSharedLink } from '../db/sql-models';
import { v4 as uuidv4 } from 'uuid';

export interface ISharedLinkRecord {
  _id: string; id: string;
  shortId: string;
  collectionId: string;
  workspaceId: string;
  createdBy: string;
  expiresAt: Date;
  createdAt: Date;
}

function sqlToRecord(s: SqlSharedLink): ISharedLinkRecord {
  return {
    _id: s.id, id: s.id, shortId: s.token, collectionId: s.collectionId,
    workspaceId: s.workspaceId, createdBy: s.createdBy,
    expiresAt: s.expiresAt || new Date(0), createdAt: s.createdAt,
  };
}

function mongoToRecord(s: any): ISharedLinkRecord {
  return {
    _id: s._id.toString(), id: s._id.toString(), shortId: s.shortId,
    collectionId: s.collectionId?.toString(), workspaceId: s.workspaceId?.toString(),
    createdBy: s.createdBy?.toString(), expiresAt: s.expiresAt, createdAt: s.createdAt,
  };
}

export const SharedLinkRepository = {
  async findByShortId(shortId: string): Promise<ISharedLinkRecord | null> {
    if (isMongo()) {
      const s = await SharedLink.findOne({ shortId }).lean();
      return s ? mongoToRecord(s) : null;
    }
    const s = await SqlSharedLink.findOne({ where: { token: shortId } });
    return s ? sqlToRecord(s) : null;
  },

  async create(data: {
    shortId: string; collectionId: string; workspaceId: string; createdBy: string; expiresAt: Date;
  }): Promise<ISharedLinkRecord> {
    if (isMongo()) {
      return mongoToRecord(await SharedLink.create(data));
    }
    return sqlToRecord(await SqlSharedLink.create({
      id: uuidv4(),
      token: data.shortId,
      collectionId: data.collectionId,
      workspaceId: data.workspaceId,
      createdBy: data.createdBy,
      expiresAt: data.expiresAt,
    }));
  },
};
