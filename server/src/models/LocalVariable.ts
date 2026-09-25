import mongoose, { Document, Schema } from 'mongoose';

export interface ILocalVariable extends Document {
  workspaceId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  variables: {
    key: string;
    value: string;
    enabled: boolean;
    type?: 'default' | 'secret';
  }[];
}

const LocalVariableSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    variables: [
      {
        key: { type: String, required: true },
        value: { type: String, default: '' },
        enabled: { type: Boolean, default: true },
        type: { type: String, enum: ['default', 'secret'], default: 'default' },
      },
    ],
  },
  { timestamps: true }
);

LocalVariableSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export default mongoose.model<ILocalVariable>('LocalVariable', LocalVariableSchema);
