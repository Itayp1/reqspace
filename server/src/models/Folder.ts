import mongoose, { Document, Schema } from 'mongoose';

export interface IFolder extends Document {
  collectionId: mongoose.Types.ObjectId;
  parentFolderId: mongoose.Types.ObjectId | null;
  name: string;
  description?: string;
  preRequestScript?: string;
  testScript?: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const FolderSchema = new Schema<IFolder>(
  {
    collectionId: { type: Schema.Types.ObjectId, ref: 'Collection', required: true },
    parentFolderId: { type: Schema.Types.ObjectId, ref: 'Folder', default: null },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    preRequestScript: { type: String, default: '' },
    testScript: { type: String, default: '' },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

FolderSchema.index({ collectionId: 1 });
FolderSchema.index({ parentFolderId: 1 });

export const Folder = mongoose.model<IFolder>('Folder', FolderSchema);
