import mongoose, { Document, Schema } from 'mongoose';

export interface ISharedLink extends Document {
  shortId: string;
  collectionId: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
}

const SharedLinkSchema = new Schema<ISharedLink>(
  {
    shortId: { type: String, required: true, unique: true },
    collectionId: { type: Schema.Types.ObjectId, ref: 'Collection', required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

SharedLinkSchema.index({ shortId: 1 });
SharedLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-delete when expired!

export const SharedLink = mongoose.model<ISharedLink>('SharedLink', SharedLinkSchema);
