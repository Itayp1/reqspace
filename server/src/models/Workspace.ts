import mongoose, { Document, Schema } from 'mongoose';
import { UserRole } from './User';

export interface IWorkspaceMember {
  userId: mongoose.Types.ObjectId;
  role: UserRole;
  joinedAt: Date;
  invitedBy?: mongoose.Types.ObjectId;
}

export interface IWorkspace extends Document {
  name: string;
  description?: string;
  ownerId: mongoose.Types.ObjectId;
  members: IWorkspaceMember[];
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceMemberSchema = new Schema<IWorkspaceMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
      type: String,
      enum: ['viewer', 'editor', 'owner'],
      required: true,
    },
    joinedAt: { type: Date, default: Date.now },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [WorkspaceMemberSchema], default: [] },
    isPublic: { type: Boolean, default: false },
  },
  { timestamps: true }
);

WorkspaceSchema.index({ ownerId: 1 });
WorkspaceSchema.index({ 'members.userId': 1 });

export const Workspace = mongoose.model<IWorkspace>('Workspace', WorkspaceSchema);
