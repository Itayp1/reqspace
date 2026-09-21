import mongoose, { Document, Schema } from 'mongoose';

export interface ICollectionVariable {
  key: string;
  value: string;
  enabled: boolean;
}

export interface ICollection extends Document {
  workspaceId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  variables: ICollectionVariable[];
  preRequestScript?: string;
  testScript?: string;
  order: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CollectionVariableSchema = new Schema<ICollectionVariable>(
  {
    key: { type: String, required: true },
    value: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const CollectionSchema = new Schema<ICollection>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    variables: { type: [CollectionVariableSchema], default: [] },
    preRequestScript: { type: String, default: '' },
    testScript: { type: String, default: '' },
    order: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

CollectionSchema.index({ workspaceId: 1, order: 1 });

export const Collection = mongoose.model<ICollection>('Collection', CollectionSchema);
